// Long-Term Memory System for ZARA AI Assistant
// Uses localStorage to persist conversation history and user preferences.
// No external dependencies — browser-only module.

// ─── Types ────────────────────────────────────────────────────────────

export interface MemoryMessage {
  role: string;
  text: string;
  timestamp?: number;
}

export interface Conversation {
  id: string;
  date: number;
  messages: MemoryMessage[];
}

// ─── Constants ────────────────────────────────────────────────────────

const CONVERSATIONS_KEY = 'zara-conversations';
const PREFERENCES_KEY = 'zara-prefs';
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const MAX_CONTEXT_LENGTH = 500;

// ─── Helpers ──────────────────────────────────────────────────────────

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__zara_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ─── Conversation History ─────────────────────────────────────────────

/**
 * Appends messages to the current (most recent) conversation in localStorage.
 * If no conversation exists or the most recent one exceeds the message limit,
 * a new conversation is created.
 *
 * @param messages — array of { role, text, timestamp } messages to save
 */
export function saveConversation(messages: Array<{ role: string; text: string; timestamp: number }>): void {
  if (!isLocalStorageAvailable()) return;

  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    const conversations: Conversation[] = raw ? (JSON.parse(raw) as Conversation[]) : [];

    // Try to append to the most recent conversation if it was created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    let current = conversations[0];

    if (!current || current.date < todayStart || current.messages.length >= MAX_MESSAGES_PER_CONVERSATION) {
      // Start a new conversation
      current = {
        id: generateId(),
        date: Date.now(),
        messages: [],
      };
      conversations.unshift(current);
    }

    // Append messages (respecting the per-conversation cap)
    const remaining = MAX_MESSAGES_PER_CONVERSATION - current.messages.length;
    const toAdd = messages.slice(0, remaining);
    current.messages.push(...toAdd);
    current.date = Date.now(); // update timestamp

    // Trim to max conversations
    const trimmed = conversations.slice(0, MAX_CONVERSATIONS);

    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(trimmed));
  } catch {
    // Silently fail — localStorage could be full
  }
}

/**
 * Loads all saved conversations from localStorage.
 *
 * @returns array of conversations, each with id, date, and messages
 */
export function loadConversations(): Conversation[] {
  if (!isLocalStorageAvailable()) return [];

  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

/**
 * Simple keyword search through all saved conversations.
 * Splits the query into words and returns any message that contains
 * ALL of the query words (case-insensitive).
 *
 * @param query — search string
 * @returns matching messages with their conversation date
 */
export function searchMemory(query: string): Array<{ role: string; text: string; date: number }> {
  const conversations = loadConversations();
  const results: Array<{ role: string; text: string; date: number }> = [];

  if (!query.trim()) return results;

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  for (const conversation of conversations) {
    for (const msg of conversation.messages) {
      const lower = msg.text.toLowerCase();
      // All query words must be present in the message
      const matches = queryWords.every((word) => lower.includes(word));
      if (matches) {
        results.push({
          role: msg.role,
          text: msg.text,
          date: conversation.date,
        });
      }
    }
  }

  return results;
}

// ─── User Preferences ────────────────────────────────────────────────

/**
 * Saves a user preference to localStorage.
 *
 * @param key   — preference key
 * @param value — preference value (string)
 */
export function savePreference(key: string, value: string): void {
  if (!isLocalStorageAvailable()) return;

  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    const prefs: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    prefs[key] = value;
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Silently fail
  }
}

/**
 * Loads a user preference from localStorage.
 *
 * @param key          — preference key
 * @param defaultValue — optional fallback value (not stored, just returned if missing)
 * @returns the preference value, defaultValue, or null
 */
export function loadPreference(key: string, defaultValue?: string): string | null {
  if (!isLocalStorageAvailable()) return defaultValue ?? null;

  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    const prefs: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return prefs[key] ?? defaultValue ?? null;
  } catch {
    return defaultValue ?? null;
  }
}

// ─── Memory Clearing ─────────────────────────────────────────────────

/**
 * Deletes all saved conversation history and preferences.
 */
export function clearAllMemory(): void {
  if (!isLocalStorageAvailable()) return;

  try {
    window.localStorage.removeItem(CONVERSATIONS_KEY);
    window.localStorage.removeItem(PREFERENCES_KEY);
  } catch {
    // Silently fail
  }
}

// ─── Context Building ────────────────────────────────────────────────

/**
 * Builds a concise summary string from saved memory for injection into
 * the AI system prompt. Extracts:
 *   - The user's name (if mentioned in recent messages)
 *   - User preferences
 *   - Recent conversation topics
 *
 * Kept under 500 characters.
 *
 * @returns a string summarizing key memory facts
 */
export function getMemoryContext(): string {
  const conversations = loadConversations();
  const prefs: Record<string, string> = (() => {
    if (!isLocalStorageAvailable()) return {};
    try {
      const raw = window.localStorage.getItem(PREFERENCES_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  })();

  const parts: string[] = [];

  // 1. Extract user name from recent messages
  const userName = extractUserName(conversations);
  if (userName) {
    parts.push(`User's name is ${userName}.`);
  }

  // 2. Include preferences
  const prefEntries = Object.entries(prefs);
  if (prefEntries.length > 0) {
    const prefStr = prefEntries
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    parts.push(`User preferences: ${prefStr}.`);
  }

  // 3. Recent topics (from last 3 conversations, up to 3 messages each)
  const recentConversations = conversations.slice(0, 3);
  const topics: string[] = [];
  for (const conv of recentConversations) {
    // Take the first user message from each conversation as a topic hint
    const userMsg = conv.messages.find((m) => m.role === 'user');
    if (userMsg) {
      const snippet = userMsg.text.length > 60
        ? userMsg.text.substring(0, 60) + '...'
        : userMsg.text;
      topics.push(snippet);
    }
  }
  if (topics.length > 0) {
    parts.push(`Recent topics: ${topics.join(' | ')}`);
  }

  const context = parts.join(' ');

  // Truncate to max length
  if (context.length > MAX_CONTEXT_LENGTH) {
    return context.substring(0, MAX_CONTEXT_LENGTH - 3) + '...';
  }

  return context;
}

// ─── Internal: Name Extraction ────────────────────────────────────────

/**
 * Heuristically extracts the user's name from conversation history.
 * Looks for patterns like "my name is X", "I'm X", "call me X" in user messages.
 */
function extractUserName(conversations: Conversation[]): string | null {
  const patterns = [
    /my name is (\w+)/i,
    /i['']m (\w+)/i,
    /call me (\w+)/i,
    /i am (\w+)/i,
  ];

  // Search from most recent conversations first
  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== 'user') continue;

      for (const pattern of patterns) {
        const match = pattern.exec(msg.text);
        if (match && match[1]) {
          // Filter out common false positives
          const name = match[1];
          const lower = name.toLowerCase();
          const falsePositives = [
            'a', 'an', 'the', 'not', 'so', 'do', 'in', 'on', 'at',
            'to', 'go', 'ok', 'good', 'fine', 'well', 'sure', 'just',
            'here', 'there', 'doing', 'having', 'looking', 'using',
          ];
          if (!falsePositives.includes(lower) && name.length > 1) {
            return name;
          }
        }
      }
    }
  }

  return null;
}
