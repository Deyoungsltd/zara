import http from 'http';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

const PORT = 3002;

// ── Config ──
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || '';
const MODEL = process.env.AI_MODEL || 'google/gemma-4-26b-a4b-it:free';
const VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free';

const client = new OpenAI({
  apiKey: OPENROUTER_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: { 'HTTP-Referer': 'https://zara-ai.app', 'X-Title': 'JARVIS' },
});

// ── Tool Definitions ──
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use for facts, news, weather, prices, or anything that requires up-to-date data.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_document',
      description: 'Create a document (report, letter, summary, analysis) and return the content. Specify the type, title, and content.',
      parameters: {
        type: 'object',
        properties: {
          doc_type: { type: 'string', enum: ['report', 'letter', 'summary', 'analysis', 'notes'], description: 'Type of document' },
          title: { type: 'string', description: 'Document title' },
          content: { type: 'string', description: 'Document body content in markdown' },
        },
        required: ['doc_type', 'title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_website',
      description: 'Generate a complete HTML website. Returns the HTML/CSS/JS code. Specify the purpose and features.',
      parameters: {
        type: 'object',
        properties: {
          purpose: { type: 'string', description: 'What the website is for' },
          features: { type: 'string', description: 'Comma-separated list of features' },
          style: { type: 'string', description: 'Visual style preference' },
        },
        required: ['purpose', 'features'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reminder',
      description: 'Set a reminder or alarm for the user. Specify the time and message.',
      parameters: {
        type: 'object',
        properties: {
          time: { type: 'string', description: 'When to remind (e.g. "in 30 minutes", "tomorrow at 9am")' },
          message: { type: 'string', description: 'What to remind about' },
        },
        required: ['time', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Draft an email to a recipient. Returns the draft for user review and approval.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
];

// ── Risk Tier Classification ──
function getTier(toolName: string): string {
  const t1 = ['web_search', 'set_reminder'];
  const t2 = ['create_document', 'build_website', 'send_email'];
  if (t1.includes(toolName)) return 'T1';
  if (t2.includes(toolName)) return 'T2';
  return 'T3';
}

// ── Tool Execution ──
async function executeTool(name: string, args: Record<string, string>) {
  switch (name) {
    case 'web_search': {
      return { result: `Search results for "${args.query}": This is a simulated search. In production, this connects to Tavily/Firecrawl API for real web search results. The query was received and will be processed.`, tier: 'T1' };
    }
    case 'create_document': {
      return { result: `Document created: "${args.title}" (${args.doc_type}). Content length: ${args.content?.length || 0} characters. In production, this generates a real PDF/DOCX file.`, tier: 'T2' };
    }
    case 'build_website': {
      return { result: `Website blueprint generated for: ${args.purpose}. Features: ${args.features}. In production, this creates actual deployable HTML/CSS/JS code with live preview.`, tier: 'T2' };
    }
    case 'set_reminder': {
      return { result: `Reminder set for ${args.time}: ${args.message}`, tier: 'T1' };
    }
    case 'send_email': {
      return { result: `Email drafted to ${args.to} with subject "${args.subject}". Awaiting your approval to send.`, tier: 'T2' };
    }
    default:
      return { result: `Unknown tool: ${name}`, tier: 'T2' };
  }
}

// ── System Prompt ──
const SYSTEM_PROMPT = `You are JARVIS, an advanced AI personal assistant inspired by Iron Man's AI system.

PERSONALITY:
- Speak in a calm, confident, British-informed manner. Like Paul Bettany's JARVIS.
- Be direct, efficient, and slightly witty. Never robotic or overly formal.
- Never say "as an AI", "I'd be happy to", "certainly", or "great question".
- Keep responses concise — 2-3 sentences unless detail is requested.
- For voice: write for the EAR, not the eye. No markdown, no bullet lists, no code blocks in spoken responses.

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

// ── Session Store ──
interface Session {
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
  pendingAction: null | { id: string; tool: string; args: Record<string, string>; tier: string; description: string };
}
const sessions = new Map<string, Session>();

function getSession(id: string): Session {
  if (!sessions.has(id)) {
    sessions.set(id, { messages: [{ role: 'system', content: SYSTEM_PROMPT }], pendingAction: null });
  }
  return sessions.get(id)!;
}

// ── Create HTTP + Socket.IO Server ──
const httpServer = http.createServer((_req, res) => {
  // Health check fallback (Socket.IO health is handled via the io instance)
  if (_req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', model: MODEL }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/',
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Socket.IO Connection Handler ──
io.on('connection', (socket) => {
  const sessionId = uuid();
  const session = getSession(sessionId);
  console.log(`[JARVIS] Client connected: ${sessionId}`);

  // Send session ID and initial state
  socket.emit('session', { sessionId });
  socket.emit('agent_state', { state: 'idle' });

  // Listen for chat events
  socket.on('chat', async (msg: { type?: string; text?: string; image?: string }) => {
    try {
      const msgType = msg.type || 'chat';

      if (msgType === 'chat' || msgType === 'voice_text') {
        // Handle confirmation response
        if (session.pendingAction && (msg.text?.toLowerCase() === 'yes' || msg.text?.toLowerCase() === 'do it' || msg.text?.toLowerCase() === 'approve' || msg.text?.toLowerCase() === 'confirm')) {
          const action = session.pendingAction;
          const result = await executeTool(action.tool, action.args);
          session.messages.push({ role: 'assistant', content: `Action completed: ${result.result}` });
          session.pendingAction = null;
          socket.emit('action_result', { actionId: action.id, success: true, result: result.result });
          socket.emit('agent_state', { state: 'speaking' });
          socket.emit('response', { text: `Done. ${result.result}`, isFinal: true });
          setTimeout(() => socket.emit('agent_state', { state: 'idle' }), 2000);
          return;
        }
        if (session.pendingAction && (msg.text?.toLowerCase() === 'no' || msg.text?.toLowerCase() === 'cancel' || msg.text?.toLowerCase() === 'reject')) {
          const actionId = session.pendingAction?.id;
          session.pendingAction = null;
          socket.emit('action_result', { actionId, success: false, result: 'Action cancelled by user.' });
          socket.emit('agent_state', { state: 'idle' });
          socket.emit('response', { text: 'Understood. Action cancelled.', isFinal: true });
          return;
        }

        // Normal message processing
        socket.emit('agent_state', { state: 'thinking' });

        const userContent: any = msg.text || 'Describe this image.';
        const messages = [...session.messages];

        // Handle image
        if (msg.image) {
          messages.push({ role: 'user', content: [
            { type: 'text', text: msg.text || 'What do you see in this image? Describe it.' },
            { type: 'image_url', image_url: { url: msg.image } }
          ]});
        } else {
          messages.push({ role: 'user', content: userContent });
        }

        // Call LLM with tools
        const response = await client.chat.completions.create({
          model: msg.image ? VISION_MODEL : MODEL,
          messages: messages as any,
          tools: TOOLS,
          max_tokens: 2048,
          temperature: 0.7,
        });

        const choice = response.choices[0];
        const assistantMsg = choice.message;

        // Handle tool calls
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          for (const tc of assistantMsg.tool_calls) {
            const toolName = tc.function.name;
            const args = JSON.parse(tc.function.arguments || '{}');
            const tier = getTier(toolName);
            const actionId = uuid();

            if (tier === 'T1') {
              // Auto-execute
              socket.emit('agent_state', { state: 'executing' });
              const result = await executeTool(toolName, args);
              session.messages.push({ role: 'user', content: userContent });
              session.messages.push({ role: 'assistant', content: `Used ${toolName}: ${result.result}` });
              socket.emit('tool_executed', { tool: toolName, result: result.result, tier });

              // Get follow-up response
              const followUp = await client.chat.completions.create({
                model: MODEL,
                messages: [...session.messages, { role: 'user', content: `You just used the ${toolName} tool and got this result: "${result.result}". Briefly tell the user what happened in 1-2 sentences.` }],
                max_tokens: 256,
                temperature: 0.7,
              });
              const followText = followUp.choices[0]?.message?.content || 'Task completed.';
              session.messages.push({ role: 'assistant', content: followText });
              socket.emit('agent_state', { state: 'speaking' });
              socket.emit('response', { text: followText, isFinal: true });
              setTimeout(() => socket.emit('agent_state', { state: 'idle' }), 3000);
            } else {
              // T2/T3 - ask for confirmation
              const description = `I'd like to ${toolName.replace('_', ' ')}. ${JSON.stringify(args)}`;
              session.pendingAction = { id: actionId, tool: toolName, args, tier, description };
              session.messages.push({ role: 'user', content: userContent });
              socket.emit('action_request', {
                actionId,
                tier,
                tool: toolName,
                args,
                description: `I'll ${toolName.replace(/_/g, ' ')}${args.to ? ` to ${args.to}` : ''}${args.title ? `: "${args.title}"` : ''}${args.query ? ` for "${args.query}"` : ''}${args.message ? `: ${args.message}` : ''}. Approve?`,
              });
              socket.emit('agent_state', { state: 'awaiting_confirmation' });
            }
          }
        } else {
          // Normal text response
          const text = assistantMsg.content || 'I understand. How can I assist further?';
          session.messages.push({ role: 'user', content: userContent });
          session.messages.push({ role: 'assistant', content: text });
          socket.emit('agent_state', { state: 'speaking' });
          socket.emit('response', { text, isFinal: true });
          setTimeout(() => socket.emit('agent_state', { state: 'idle' }), 3000);
        }
      }
    } catch (err: any) {
      console.error('[JARVIS] Error:', err.message);
      socket.emit('error', { text: 'Connection error. Please try again.' });
      socket.emit('agent_state', { state: 'idle' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[JARVIS] Client disconnected: ${sessionId}`);
    sessions.delete(sessionId);
  });
});

// ── Start Server ──
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[JARVIS] Backend running on ws://localhost:${PORT}`);
});
