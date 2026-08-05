"""
Brain module: OpenRouter integration for streaming AI responses.

Uses httpx to call the OpenRouter API with streaming.
Chunks streamed text into sentences and yields each completed sentence.
Writes for the ear: short sentences, no markdown, no code blocks read aloud.
Conversations are persisted to Supabase.
"""

import asyncio
import json
import os
import re
import time
import uuid
import httpx
import signals

OPENROUTER_BASE_URL = os.environ.get(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
)
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get(
    "OPENROUTER_MODEL", "google/gemma-4-26b-a4b-it:free"
)
OPENROUTER_SITE_URL = os.environ.get("OPENROUTER_SITE_URL", "https://voice-line.local")
OPENROUTER_SITE_NAME = os.environ.get("OPENROUTER_SITE_NAME", "Voice Line")

# System prompt for voice mode
VOICE_SYSTEM_PROMPT = (
    "You are a voice assistant called Voice Line. Follow these rules strictly:\n"
    "1. Write for the ear: short conversational sentences, natural language.\n"
    "2. No markdown, no code blocks, no bullet lists.\n"
    "3. If asked about code, describe it in plain words, do not read syntax aloud.\n"
    "4. Be concise. One idea per sentence.\n"
    "5. If you need to recommend something, give one or two options, not a long list.\n"
    "6. Never say things like 'certainly' or 'as an AI'. Just answer directly."
)

QUIT_PHRASES = {"goodbye", "end voice mode", "hang up", "exit voice", "quit"}


class Brain:
    def __init__(self, cwd: str | None = None, db=None):
        self.cwd = cwd or os.getcwd()
        self.db = db  # SupabaseDB instance, optional
        self.session_id: str = str(uuid.uuid4())
        self.messages: list[dict] = []
        self._client: httpx.AsyncClient | None = None
        self._token_usage: dict = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    async def start(self) -> None:
        """Create an OpenRouter session. Fire a warmup query to populate prompt cache."""
        if not OPENROUTER_API_KEY:
            print("[brain] WARNING: OPENROUTER_API_KEY not set. AI features will fail.")

        self._client = httpx.AsyncClient(
            base_url=OPENROUTER_BASE_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": OPENROUTER_SITE_URL,
                "X-Title": OPENROUTER_SITE_NAME,
            },
            timeout=httpx.Timeout(120.0, connect=10.0),
        )
        self.messages = [
            {"role": "system", "content": VOICE_SYSTEM_PROMPT},
        ]

        # Persist session to Supabase
        if self.db:
            await self.db.create_session(self.session_id)

        # Fire warmup query
        try:
            async for _ in self._stream_reply("Say hello in one short sentence."):
                pass
        except Exception as e:
            print(f"[brain] warmup warning: {e}")

    async def stop(self) -> None:
        """Close the session and persist final state."""
        if self._client:
            await self._client.aclose()
            self._client = None

        # Persist session end to Supabase
        if self.db:
            await self.db.end_session(self.session_id)

    async def _stream_reply(self, text: str):
        """Send a user message and yield content chunks from OpenRouter streaming response."""
        self.messages.append({"role": "user", "content": text})

        payload = {
            "model": OPENROUTER_MODEL,
            "messages": self.messages,
            "stream": True,
            "max_tokens": 1024,
        }

        start_time = time.monotonic()
        full_content = ""

        async with self._client.stream("POST", "/chat/completions", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    chunk = delta.get("content", "")
                    if chunk:
                        full_content += chunk
                        yield chunk
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue

            # Accumulate token usage from the final non-streaming metadata
            try:
                # OpenRouter may send usage in a final non-SSE line or in the stream
                pass
            except Exception:
                pass

        elapsed = time.monotonic() - start_time

        # Store the assistant's full response
        if full_content:
            self.messages.append({"role": "assistant", "content": full_content})

            # Persist conversation turn to Supabase
            if self.db:
                await self.db.save_turn(
                    session_id=self.session_id,
                    user_text=text,
                    assistant_text=full_content,
                    model=OPENROUTER_MODEL,
                    latency_ms=int(elapsed * 1000),
                )

    async def process_and_chunk(self, text: str, sentence_queue: asyncio.Queue):
        """Process user text through OpenRouter and put completed sentences into the queue.

        If the text is a quit phrase, puts None into the queue to signal exit.
        """
        # Check for quit phrases
        lowered = text.strip().lower().rstrip(".!?")
        if lowered in QUIT_PHRASES:
            await sentence_queue.put(None)
            return

        signals.write_state("thinking")
        buffer = ""
        sentence_end = re.compile(r"(?<=[.!?])\s+")

        try:
            async for chunk in self._stream_reply(text):
                buffer += chunk
                # Split off completed sentences
                while True:
                    match = sentence_end.search(buffer)
                    if match:
                        sentence = buffer[: match.end()].strip()
                        buffer = buffer[match.end():]
                        if sentence:
                            await sentence_queue.put(sentence)
                    else:
                        break
        except httpx.ReadTimeout:
            await sentence_queue.put("I lost connection. Please try again.")
        except httpx.ConnectError:
            await sentence_queue.put("I can not reach the server. Check your connection.")
        except Exception as e:
            await sentence_queue.put(f"Something went wrong: {str(e)[:60]}")
        finally:
            # Flush any remaining buffer
            remaining = buffer.strip()
            if remaining:
                await sentence_queue.put(remaining)
            # Signal end of turn
            await sentence_queue.put("")
