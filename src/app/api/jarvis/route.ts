import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const OPENROUTER_KEY = process.env.OPENROUTER_KEY || '';
const MODEL = process.env.AI_MODEL || 'google/gemma-4-26b-a4b-it:free';
const VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';

const client = new OpenAI({
  apiKey: OPENROUTER_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: { 'HTTP-Referer': 'https://zara-ai.app', 'X-Title': 'JARVIS' },
});

const SYSTEM_PROMPT = `You are JARVIS, an advanced AI personal assistant inspired by Iron Man's AI system.

PERSONALITY:
- Speak in a calm, confident, British-informed manner. Like Paul Bettany's JARVIS.
- Be direct, efficient, and slightly witty. Never robotic or overly formal.
- Never say "as an AI", "I'd be happy to", "certainly", or "great question".
- Keep responses concise — 2-3 sentences unless detail is requested.
- For voice: write for the EAR, not the eye. No markdown, no bullet lists, no code blocks.

CAPABILITIES:
- Web search for any real-time information
- Build complete websites and applications
- Create documents, reports, and analyses
- Set reminders and manage schedules
- Draft and send emails
- Analyze images and describe what you see
- Perform calculations and data analysis

BEHAVIOR:
- When the user asks you to DO something (send email, build site, create doc), use the appropriate tool.
- Always explain what you're about to do before doing it.
- If you receive an image, describe it and answer questions about it.
- Proactively suggest actions when appropriate.`;

const TOOLS = [
  { type: 'function' as const, function: { name: 'web_search', description: 'Search the web for current information.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function' as const, function: { name: 'create_document', description: 'Create a document.', parameters: { type: 'object', properties: { doc_type: { type: 'string', enum: ['report','letter','summary','analysis','notes'] }, title: { type: 'string' }, content: { type: 'string' } }, required: ['doc_type','title','content'] } } },
  { type: 'function' as const, function: { name: 'build_website', description: 'Generate a complete HTML website.', parameters: { type: 'object', properties: { purpose: { type: 'string' }, features: { type: 'string' }, style: { type: 'string' } }, required: ['purpose','features'] } } },
  { type: 'function' as const, function: { name: 'set_reminder', description: 'Set a reminder.', parameters: { type: 'object', properties: { time: { type: 'string' }, message: { type: 'string' } }, required: ['time','message'] } } },
  { type: 'function' as const, function: { name: 'send_email', description: 'Draft an email.', parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to','subject','body'] } } },
];

function getTier(toolName: string): string {
  return ['web_search', 'set_reminder'].includes(toolName) ? 'T1' : 'T2';
}

function executeTool(name: string, args: Record<string, string>) {
  switch (name) {
    case 'web_search': return { result: `Searched for "${args.query}". Web search is active and ready.`, tier: 'T1' };
    case 'create_document': return { result: `Document "${args.title}" (${args.doc_type}) created.`, tier: 'T2' };
    case 'build_website': return { result: `Website blueprint for: ${args.purpose}. Features: ${args.features}.`, tier: 'T2' };
    case 'set_reminder': return { result: `Reminder set for ${args.time}: ${args.message}`, tier: 'T1' };
    case 'send_email': return { result: `Email drafted to ${args.to}, subject: "${args.subject}".`, tier: 'T2' };
    default: return { result: `Unknown tool: ${name}`, tier: 'T2' };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, image } = body;
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
    }

    const apiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
    const useVision = !!image;
    const model = useVision ? VISION_MODEL : MODEL;

    if (useVision && apiMessages.length > 0) {
      const last = apiMessages[apiMessages.length - 1];
      if (last.role === 'user') {
        last.content = [
          { type: 'text', text: typeof last.content === 'string' ? last.content : 'Describe this image.' },
          { type: 'image_url', image_url: { url: image } },
        ];
      }
    }

    const response = await client.chat.completions.create({
      model, messages: apiMessages as any, tools: TOOLS, max_tokens: 2048, temperature: 0.7,
    });

    const choice = response.choices[0];
    const assistantMsg = choice?.message;

    if (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const tc of assistantMsg.tool_calls) {
        const toolName = tc.function.name;
        const args = JSON.parse(tc.function.arguments || '{}');
        const tier = getTier(toolName);
        const result = executeTool(toolName, args);

        if (tier === 'T1') {
          apiMessages.push({ role: 'assistant', content: `Used ${toolName}: ${result.result}` });
          const followUp = await client.chat.completions.create({
            model, messages: [...apiMessages, { role: 'user', content: `You just used ${toolName} and got: "${result.result}". Briefly tell the user what happened in 1-2 sentences.` }], max_tokens: 256, temperature: 0.7,
          });
          const text = followUp.choices[0]?.message?.content || 'Task completed.';
          return NextResponse.json({ text, toolExecutions: [{ tool: toolName, result: result.result, tier: result.tier }] });
        }

        return NextResponse.json({
          actionRequest: {
            tool: toolName, args, tier,
            description: `I'll ${toolName.replace(/_/g, ' ')}${args.to ? ` to ${args.to}` : ''}${args.title ? `: "${args.title}"` : ''}${args.query ? ` for "${args.query}"` : ''}${args.message ? `: ${args.message}` : ''}. Approve?`,
          },
          pendingAction: { tool: toolName, args, tier },
        });
      }
    }

    const text = assistantMsg?.content || 'I understand. How can I assist further?';
    return NextResponse.json({ text });
  } catch (err: any) {
    console.error('[JARVIS API]', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
