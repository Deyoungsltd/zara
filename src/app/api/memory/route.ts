import { NextRequest, NextResponse } from 'next/server';

// Memory is client-side only (localStorage). Server returns empty results.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query string is required' }, { status: 400 });
    }

    // Memory search runs client-side via localStorage.
    // On the server, return empty — the client handles memory lookups.
    return NextResponse.json({ results: [], context: '' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Memory API]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
