import { create } from 'zustand';

export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'awaiting_confirmation' | 'executing';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  image?: string;
  timestamp: number;
}

export interface PendingAction {
  actionId: string;
  tier: string;
  tool: string;
  args: Record<string, string>;
  description: string;
}

export interface ToolExecution {
  tool: string;
  result: string;
  tier: string;
}

interface JarvisState {
  agentState: AgentState;
  messages: ChatMessage[];
  pendingAction: PendingAction | null;
  lastToolExec: ToolExecution | null;
  transcript: string; // live STT interim
  sessionId: string | null;
  connected: boolean;
  mouthOpen: number; // 0-1 for face animation
  audioLevel: number; // 0-1 for face reactivity

  setAgentState: (s: AgentState) => void;
  addMessage: (msg: ChatMessage) => void;
  setPendingAction: (a: PendingAction | null) => void;
  setLastToolExec: (t: ToolExecution | null) => void;
  setTranscript: (t: string) => void;
  setSessionId: (id: string) => void;
  setConnected: (c: boolean) => void;
  setMouthOpen: (v: number) => void;
  setAudioLevel: (v: number) => void;
}

export const useJarvisStore = create<JarvisState>((set) => ({
  agentState: 'idle',
  messages: [],
  pendingAction: null,
  lastToolExec: null,
  transcript: '',
  sessionId: null,
  connected: false,
  mouthOpen: 0,
  audioLevel: 0,

  setAgentState: (s) => set({ agentState: s }),
  addMessage: (msg) => set((st) => ({ messages: [...st.messages, msg] })),
  setPendingAction: (a) => set({ pendingAction: a }),
  setLastToolExec: (t) => set({ lastToolExec: t }),
  setTranscript: (t) => set({ transcript: t }),
  setSessionId: (id) => set({ sessionId: id }),
  setConnected: (c) => set({ connected: c }),
  setMouthOpen: (v) => set({ mouthOpen: v }),
  setAudioLevel: (v) => set({ audioLevel: v }),
}));
