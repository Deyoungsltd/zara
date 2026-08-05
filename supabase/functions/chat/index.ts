import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VOICE_SYSTEM_PROMPT = `
You are a voice assistant called Voice Line. Follow these rules strictly:
1. Write for the ear: short conversational sentences, natural language.
2. No markdown, no code blocks, no bullet lists.
3. If asked about code, describe it in plain words, do not read syntax aloud.
4. Be concise. One idea per sentence.
5. If you need to recommend something, give one or two options, not a long list.
6. Never say things like 'certainly' or 'as an AI'. Just answer directly.
`;

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, sb-access-token",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { messages, model, stream } = await req.json();

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY secret not set. Run: supabase secrets set OPENROUTER_API_KEY=sk-or-v1-..." }), {
        status: 500,
      });
    }

    const systemMsg = { role: "system", content: VOICE_SYSTEM_PROMPT };
    const allMessages = [systemMsg, ...messages];

    const payload: Record<string, unknown> = {
      model: model || "google/gemma-4-26b-a4b-it:free",
      messages: allMessages,
      max_tokens: 1024,
    };

    if (stream) {
      payload.stream = true;
    }

    const orResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://voice-line.local",
        "X-Title": "Voice Line Mobile",
      },
      body: JSON.stringify(payload),
    });

    if (!orResp.ok) {
      const errBody = await orResp.text();
      return new Response(
        JSON.stringify({ error: `OpenRouter ${orResp.status}: ${errBody}` }),
        { status: orResp.status }
      );
    }

    if (stream) {
      // Pipe SSE stream through
      return new Response(orResp.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Non-streaming: return JSON
    const data = await orResp.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
