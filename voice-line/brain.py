"""
Brain module: Z.ai integration for streaming AI responses.

Uses httpx to call the Z.ai API with streaming.
Chunks streamed text into sentences and yields each completed sentence.
Writes for the ear: short sentences, no markdown, no code blocks read aloud.
"""

import asyncio
import re
import os
import httpx
import signals

ZAI_BASE_URL = os.environ.get("ZAI_BASE_URL", "https://api.z.ai/v1")
ZAI_API_KEY = os.environ.get("ZAI_API_KEY", "")

# System prompt for voice mode
VOICE_SYSTEM_PROMPT = (
    "You are a voice assistant. Follow these rules strictly:\n"
    "1. Write for the ear: short conversational sentences, natural language.\n"
    "2. No markdown, no code blocks, no bullet lists.\n"
    "3. If asked about code, describe it in plain words, do not read syntax aloud.\n"
    "4. Be concise. One idea per sentence.\n"
    "5. If you need to recommend something, give one or two options, not a long list.\n"
    "6. Never say things like 'certainly' or 'as an AI'. Just answer directly."
)

QUIT_PHRASES = {"goodbye", "end voice mode", "hang up", "exit voice", "quit"}


class Brain:
    def __init__(self, cwd: str | None = None):
        self.cwd = cwd or os.getcwd()
        self.session_id: str | None = None
        self.messages: list[dict] = []
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        """Create a warm Z.ai session. Fire a warmup query to populate prompt cache."""
        self._client = httpx.AsyncClient(
            base_url=ZAI_BASE_URL,
            headers={
                "Authorization": f"Bearer {ZAI_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(120.0, connect=10.0),
        )
        self.messages = [
            {"role": "system", "content": VOICE_SYSTEM_PROMPT},
        ]
        # Fire warmup query
        try:
            async for _ in self._stream_reply("Say hello in one short sentence."):
                pass
        except Exception as e:
            print(f"[brain] warmup warning: {e}")

    async def stop(self) -> None:
        """Close the session."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _stream_reply(self, text: str):
        """Send a user message and yield content chunks from Z.ai streaming response."""
        self.messages.append({"role": "user", "content": text})

        payload = {
            "model": "default",
            "messages": self.messages,
            "stream": True,
            "max_tokens": 1024,
        }

        async with self._client.stream("POST", "/chat/completions", json=payload) as resp:
            resp.raise_for_status()
            full_content = ""
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    import json
                    data = json.loads(data_str)
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    chunk = delta.get("content", "")
                    if chunk:
                        full_content += chunk
                        yield chunk
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue

            # Store the assistant's full response
            if full_content:
                self.messages.append({"role": "assistant", "content": full_content})

    async def process_and_chunk(self, text: str, sentence_queue: asyncio.Queue):
        """Process user text through Z.ai and put completed sentences into the queue.
        
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
