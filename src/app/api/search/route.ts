import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, max_results = 5 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query string is required' }, { status: 400 });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'TAVILY_API_KEY is not configured' }, { status: 500 });
    }

    const tavilyResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(Math.max(max_results, 1), 10),
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!tavilyResponse.ok) {
      const errorText = await tavilyResponse.text();
      console.error('[Tavily API Error]', tavilyResponse.status, errorText);
      return NextResponse.json(
        { error: `Tavily API error: ${tavilyResponse.status}` },
        { status: tavilyResponse.status },
      );
    }

    const data = await tavilyResponse.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Search API]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
