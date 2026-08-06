import { NextRequest, NextResponse } from 'next/server';
import { searchMemory, getMemoryContext } from '@/lib/memory';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query string is required' }, { status: 400 });
    }

    const results = searchMemory(query);
    const context = getMemoryContext();

    return NextResponse.json({ results, context });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Memory API]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
