import { NextRequest, NextResponse } from 'next/server';

// Calendar events stored in-memory (in production, use Google Calendar API)
const events: Array<{ id: string; title: string; date: string; time: string; description?: string; created: string }> = [];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // YYYY-MM-DD format
    let filtered = events;
    if (date) {
      filtered = events.filter(e => e.date.startsWith(date));
    }
    return NextResponse.json({ events: filtered });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, date, time, description } = body;

    if (!title || !date) {
      return NextResponse.json({ error: 'Title and date are required' }, { status: 400 });
    }

    const event = {
      id: crypto.randomUUID(),
      title,
      date,
      time: time || '09:00',
      description: description || '',
      created: new Date().toISOString(),
    };
    events.push(event);

    return NextResponse.json({
      success: true,
      event: { id: event.id, title: event.title, date: event.date, time: event.time },
      message: `Calendar event created: ${title} on ${date} at ${time || '09:00'}`
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }
    const idx = events.findIndex(e => e.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    events.splice(idx, 1);
    return NextResponse.json({ success: true, message: 'Event deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
