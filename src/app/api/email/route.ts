import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, body: emailBody } = body;

    if (!to || typeof to !== 'string') {
      return NextResponse.json({ error: 'Recipient email (to) is required' }, { status: 400 });
    }
    if (!subject || typeof subject !== 'string') {
      return NextResponse.json({ error: 'Email subject is required' }, { status: 400 });
    }
    if (!emailBody || typeof emailBody !== 'string') {
      return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500 });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'JARVIS <onboarding@resend.dev>',
        to,
        subject,
        html: emailBody,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => null);
      console.error('[Resend API Error]', resendResponse.status, errorData);
      return NextResponse.json(
        { error: `Resend API error: ${resendResponse.status}`, details: errorData },
        { status: resendResponse.status },
      );
    }

    const data = await resendResponse.json();
    return NextResponse.json({ success: true, message_id: data.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email API]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
