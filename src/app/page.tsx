'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useJarvisStore } from '@/lib/jarvis-store';
import type { ChatMessage, AgentState, PendingAction, ToolExecution } from '@/lib/jarvis-store';
import JarvisFace from '@/components/jarvis-face';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Mic,
  MicOff,
  Send,
  Loader2,
  Zap,
  ShieldAlert,
  Wifi,
  WifiOff,
  Check,
  X,
  MessageSquare,
  Sparkles,
  Terminal,
  Activity,
  Circle,
  Volume2,
  Camera,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   STATE CONFIGURATION
   ═══════════════════════════════════════════════════════════════ */

const STATE_CONFIG: Record<
  AgentState,
  { label: string; dotColor: string; icon: React.ReactNode; animate: boolean }
> = {
  idle: {
    label: 'Online',
    dotColor: 'bg-cyan-400',
    icon: <Circle className="size-3" />,
    animate: false,
  },
  listening: {
    label: 'Listening',
    dotColor: 'bg-rose-400',
    icon: <Mic className="size-3" />,
    animate: true,
  },
  thinking: {
    label: 'Processing',
    dotColor: 'bg-amber-400',
    icon: <Activity className="size-3" />,
    animate: true,
  },
  speaking: {
    label: 'Speaking',
    dotColor: 'bg-emerald-400',
    icon: <Sparkles className="size-3" />,
    animate: true,
  },
  awaiting_confirmation: {
    label: 'Awaiting Confirmation',
    dotColor: 'bg-orange-400',
    icon: <ShieldAlert className="size-3" />,
    animate: false,
  },
  executing: {
    label: 'Executing',
    dotColor: 'bg-violet-400',
    icon: <Terminal className="size-3" />,
    animate: true,
  },
};

const SUGGESTIONS = [
  'What capabilities do you have?',
  'Show me today\'s schedule',
  'Analyze the latest data',
  'Run a system diagnostic',
  'What\'s the weather outside?',
  'Play some ambient music',
];

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}


/* ═══════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════ */

function StatusBar() {
  const { agentState, connected } = useJarvisStore();
  const cfg = STATE_CONFIG[agentState];

  return (
    <header className="relative z-20 flex h-14 items-center justify-between border-b border-white/[0.06] px-4 md:px-6">
      {/* Branding */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Sparkles className="size-4 text-cyan-400" />
          </div>
          <h1 className="text-sm font-semibold tracking-[0.25em] text-white/90 uppercase">
            J.A.R.V.I.S.
          </h1>
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3">
        {/* Agent state badge */}
        <AnimatePresence mode="wait">
          <motion.div
            key={agentState}
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5 border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80',
                agentState === 'listening' && 'border-rose-500/30 bg-rose-500/10 text-rose-300',
                agentState === 'thinking' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                agentState === 'speaking' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                agentState === 'executing' && 'border-violet-500/30 bg-violet-500/10 text-violet-300',
                agentState === 'awaiting_confirmation' && 'border-orange-500/30 bg-orange-500/10 text-orange-300',
              )}
            >
              <span className={cn('inline-block size-1.5 rounded-full', cfg.dotColor, cfg.animate && 'animate-pulse')} />
              {cfg.icon}
              {cfg.label}
            </Badge>
          </motion.div>
        </AnimatePresence>

        {/* Connection status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-full border transition-colors',
                connected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/10 bg-white/5 text-white/30',
              )}
            >
              {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {connected ? 'Connected' : 'Disconnected'}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FACE PANEL
   ═══════════════════════════════════════════════════════════════ */

function FacePanel() {
  const { agentState, transcript } = useJarvisStore();

  return (
    <div className="relative h-[30vh] min-h-[220px] w-full md:h-full md:w-[42%] lg:w-[40%] shrink-0">
      {/* Ambient glow behind the face */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <div
          className={cn(
            'h-[60%] w-[60%] rounded-full blur-3xl transition-colors duration-700',
            agentState === 'listening' && 'bg-rose-500/[0.07]',
            agentState === 'thinking' && 'bg-amber-500/[0.08]',
            agentState === 'speaking' && 'bg-emerald-500/[0.07]',
            (agentState === 'idle' || agentState === 'executing' || agentState === 'awaiting_confirmation') &&
              'bg-cyan-500/[0.06]',
          )}
        />
      </div>

      {/* Scanline overlay for cinematic feel */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.08) 2px, rgba(255,255,255,0.08) 4px)',
        }}
      />

      {/* 3D Face */}
      <div className="relative z-[1] h-full w-full">
        <JarvisFace />
      </div>

      {/* Transcript overlay — shown during listening */}
      <AnimatePresence>
        {agentState === 'listening' && transcript && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-6 left-1/2 z-10 w-[85%] max-w-sm -translate-x-1/2"
          >
            <div className="rounded-xl border border-rose-500/20 bg-rose-950/40 px-4 py-3 text-center backdrop-blur-md">
              <p className="text-sm text-rose-200/90 leading-relaxed">
                &ldquo;{transcript}&rdquo;
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* State text overlay — shown during thinking/speaking */}
      <AnimatePresence>
        {agentState === 'thinking' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
          >
            <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-950/40 px-4 py-2 backdrop-blur-md">
              <Loader2 className="size-3.5 animate-spin text-amber-400" />
              <span className="text-xs font-medium text-amber-300/90">Processing your request...</span>
            </div>
          </motion.div>
        )}
        {agentState === 'speaking' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
          >
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-4 py-2 backdrop-blur-md">
              <Volume2 className="size-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300/90">Speaking...</span>
            </div>
          </motion.div>
        )}
        {agentState === 'executing' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
          >
            <div className="flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-950/40 px-4 py-2 backdrop-blur-md">
              <Terminal className="size-3.5 text-violet-400" />
              <span className="text-xs font-medium text-violet-300/90">Executing command...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MESSAGE BUBBLE
   ═══════════════════════════════════════════════════════════════ */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex justify-center px-4"
      >
        <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-3 py-1.5">
          <p className="text-[11px] font-medium text-amber-400/70">{message.text}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn('flex gap-2.5 px-4', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border',
          isUser
            ? 'border-cyan-500/25 bg-cyan-500/10'
            : 'border-white/10 bg-white/5',
        )}
      >
        {isUser ? (
          <MessageSquare className="size-3.5 text-cyan-400" />
        ) : (
          <Sparkles className="size-3.5 text-cyan-400" />
        )}
      </div>

      {/* Bubble */}
      <div className={cn('max-w-[80%] md:max-w-[75%]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl border px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'rounded-br-md border-cyan-500/15 bg-cyan-500/[0.08] text-cyan-50'
              : 'rounded-bl-md border-white/[0.08] bg-white/[0.04] text-white/85',
          )}
        >
          {message.image && (
            <img
              src={message.image}
              alt="User uploaded"
              className="mb-2 max-h-48 rounded-lg object-contain"
            />
          )}
          {message.text}
        </div>
        <span className="mt-1 px-1 text-[10px] font-mono text-white/20">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOOL EXECUTION CARD
   ═══════════════════════════════════════════════════════════════ */

function ToolExecutionCard({ exec }: { exec: ToolExecution }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4"
    >
      <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="size-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-400">Tool Executed</span>
          <Badge variant="outline" className="ml-auto border-white/10 bg-white/5 text-[10px] text-white/50">
            {exec.tier}
          </Badge>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Terminal className="size-3 text-white/30" />
            <span className="text-xs font-mono text-emerald-300/80">{exec.tool}</span>
          </div>
          <pre className="rounded-lg bg-black/30 px-3 py-2 text-xs font-mono text-white/60 overflow-x-auto max-h-32 overflow-y-auto">
            {exec.result}
          </pre>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PENDING ACTION CARD
   ═══════════════════════════════════════════════════════════════ */

function PendingActionCard({ action }: { action: PendingAction }) {
  const { setPendingAction } = useJarvisStore();

  const handleConfirm = useCallback(() => {
    setPendingAction(null);
    sendToJarvis('approved');
  }, [setPendingAction]);

  const handleDeny = useCallback(() => {
    setPendingAction(null);
    sendToJarvis('cancelled');
  }, [setPendingAction]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mx-4"
    >
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="size-4 text-orange-400" />
          <span className="text-xs font-semibold text-orange-400">Action Requires Confirmation</span>
          <Badge variant="outline" className="ml-auto border-white/10 bg-white/5 text-[10px] text-white/50">
            Tier {action.tier}
          </Badge>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="size-3 text-white/30" />
            <span className="text-xs font-mono text-orange-300/90">{action.tool}</span>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">{action.description}</p>
          {Object.keys(action.args).length > 0 && (
            <pre className="rounded-lg bg-black/30 px-3 py-2 text-xs font-mono text-white/50 overflow-x-auto">
              {JSON.stringify(action.args, null, 2)}
            </pre>
          )}
        </div>

        <Separator className="bg-orange-500/10 mb-3" />

        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeny}
            className="h-8 gap-1.5 text-white/50 hover:text-rose-300 hover:bg-rose-500/10"
          >
            <X className="size-3.5" />
            Deny
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="h-8 gap-1.5 bg-emerald-600/80 text-white border-0 hover:bg-emerald-600"
          >
            <Check className="size-3.5" />
            Confirm
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WELCOME / SUGGESTIONS
   ═══════════════════════════════════════════════════════════════ */

function WelcomeSuggestions() {
  const handleClick = useCallback(
    (text: string) => {
      sendToJarvis(text);
    },
    [],
  );

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-center mb-10"
      >
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08]">
            <Sparkles className="size-7 text-cyan-400" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-white/90 mb-2">How may I assist you?</h2>
        <p className="text-sm text-white/40 max-w-xs mx-auto leading-relaxed">
          I can help with analysis, scheduling, system operations, and more.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md"
      >
        {SUGGESTIONS.map((suggestion, i) => (
          <motion.button
            key={suggestion}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.05 }}
            onClick={() => handleClick(suggestion)}
            className="group flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-left text-sm text-white/60 transition-all hover:border-cyan-500/20 hover:bg-cyan-500/[0.06] hover:text-cyan-200"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] text-[10px] font-mono text-white/30 group-hover:border-cyan-500/20 group-hover:bg-cyan-500/10 group-hover:text-cyan-400">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="truncate text-xs">{suggestion}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CHAT INPUT BAR
   ═══════════════════════════════════════════════════════════════ */

function ChatInput() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { agentState, setAgentState, setTranscript, addMessage, setPendingAction, setLastToolExec } = useJarvisStore();
  const isListening = agentState === 'listening';
  const isBusy = agentState === 'thinking' || agentState === 'speaking' || agentState === 'executing';
  const canSend = input.trim().length > 0 && !isBusy && !isListening;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const text = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendToJarvis(text);
  }, [canSend, input]);

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      // Stop recognition
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
      setAgentState('idle');
      setTranscript('');
    } else if (!isBusy) {
      // Start STT
      const SpeechRecognitionCtor =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) return;

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += t;
          } else {
            interim += t;
          }
        }
        if (final.trim()) {
          setTranscript('');
          setAgentState('idle');
          try { recognition.stop(); } catch { /* ignore */ }
          recognitionRef.current = null;
          sendToJarvis(final.trim());
        } else {
          setTranscript(interim);
        }
      };

      recognition.onerror = () => {
        setAgentState('idle');
        setTranscript('');
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        // If still in listening state and no final was captured, clean up
        if (useJarvisStore.getState().agentState === 'listening') {
          setAgentState('idle');
          setTranscript('');
          recognitionRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        // Already started or other error
      }
      setAgentState('listening');
    }
  }, [isListening, isBusy, setAgentState, setTranscript]);

  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        sendToJarvis('What do you see?', base64);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-[#080c16]/80 backdrop-blur-xl px-3 py-3 md:px-4 md:py-3.5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageChange}
      />
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        {/* Mic button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isListening ? 'destructive' : 'outline'}
              size="icon"
              onClick={handleMicToggle}
              disabled={isBusy && !isListening}
              className={cn(
                'h-10 w-10 shrink-0 rounded-xl border-white/10 bg-white/5 text-white/60 transition-all hover:text-white hover:bg-white/10',
                isListening &&
                  'border-rose-500/40 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 hover:text-rose-300 animate-pulse',
              )}
            >
              {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isListening ? 'Stop listening' : 'Voice input'}
          </TooltipContent>
        </Tooltip>

        {/* Camera / image button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleImageClick}
              disabled={isBusy}
              className="h-10 w-10 shrink-0 rounded-xl border-white/10 bg-white/5 text-white/60 transition-all hover:text-white hover:bg-white/10"
            >
              <Camera className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Send image
          </TooltipContent>
        </Tooltip>

        {/* Text input */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isBusy
                ? agentState === 'thinking'
                  ? 'JARVIS is processing...'
                  : agentState === 'speaking'
                    ? 'JARVIS is speaking...'
                    : 'Executing command...'
                : 'Ask JARVIS anything...'
            }
            disabled={isBusy || isListening}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none transition-colors',
              'focus:border-cyan-500/25 focus:bg-white/[0.05]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          />
        </div>

        {/* Send button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'h-10 w-10 shrink-0 rounded-xl transition-all',
                canSend
                  ? 'bg-cyan-500/80 text-white border-0 hover:bg-cyan-500 shadow-[0_0_20px_rgba(0,212,255,0.15)]'
                  : 'border border-white/[0.08] bg-white/[0.03] text-white/20',
              )}
            >
              {agentState === 'thinking' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Send message
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Footer hint */}
      <p className="mt-2 text-center text-[10px] text-white/15 font-mono">
        Press <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px]">Enter</kbd> to send{' '}
        · <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px]">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CHAT PANEL
   ═══════════════════════════════════════════════════════════════ */

function ChatPanel() {
  const { messages, pendingAction, lastToolExec } = useJarvisStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages.length, pendingAction, lastToolExec]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#080c16]/60">
      {/* Panel header (subtle) */}
      <div className="flex h-10 shrink-0 items-center border-b border-white/[0.04] px-4">
        <span className="text-[11px] font-medium tracking-wider text-white/25 uppercase">
          Conversation
        </span>
        {hasMessages && (
          <Badge
            variant="outline"
            className="ml-2 h-5 border-white/[0.06] bg-white/[0.03] px-1.5 text-[10px] text-white/30"
          >
            {messages.length}
          </Badge>
        )}
      </div>

      {/* Messages area */}
      <ScrollArea ref={scrollRef} className="flex-1">
        {hasMessages ? (
          <div className="flex flex-col gap-4 py-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Tool execution result */}
            <AnimatePresence>
              {lastToolExec && <ToolExecutionCard exec={lastToolExec} />}
            </AnimatePresence>

            {/* Pending action confirmation */}
            <AnimatePresence>
              {pendingAction && <PendingActionCard action={pendingAction} />}
            </AnimatePresence>
          </div>
        ) : (
          <WelcomeSuggestions />
        )}
      </ScrollArea>

      {/* Input bar */}
      <ChatInput />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TTS UTILITY
   ═══════════════════════════════════════════════════════════════ */

function sendToJarvis(text: string, image?: string) {
  const store = useJarvisStore.getState();
  store.addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    text,
    image: image ? image : undefined,
    timestamp: Date.now(),
  });
  store.setAgentState('thinking');

  const apiMessages = store.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.text }));

  const body: Record<string, any> = { messages: apiMessages };
  if (image) body.image = image;

  fetch('/api/jarvis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        store.addMessage({ id: crypto.randomUUID(), role: 'system', text: `Error: ${data.error}`, timestamp: Date.now() });
        store.setAgentState('idle');
        return;
      }
      if (data.actionRequest) {
        store.setPendingAction({
          actionId: crypto.randomUUID(),
          tier: data.actionRequest.tier || 'T2',
          tool: data.actionRequest.tool || 'unknown',
          args: data.actionRequest.args || {},
          description: data.actionRequest.description || 'Action requested',
        });
        store.setAgentState('awaiting_confirmation');
        return;
      }
      if (data.text) {
        store.addMessage({ id: crypto.randomUUID(), role: 'assistant', text: data.text, timestamp: Date.now() });
        speakTextWithMouthSync(data.text);
      }
      if (data.toolExecutions) {
        data.toolExecutions.forEach((te: any) =>
          store.setLastToolExec({ tool: te.tool, result: te.result, tier: te.tier }),
        );
      }
      store.setAgentState('idle');
    })
    .catch(() => {
      store.addMessage({ id: crypto.randomUUID(), role: 'system', text: 'Connection error. Check your connection.', timestamp: Date.now() });
      store.setAgentState('idle');
    });
}

function speakTextWithMouthSync(text: string) {
  const synth = window.speechSynthesis;
  synth.cancel(); // cancel any ongoing speech

  const store = useJarvisStore.getState();
  store.setAgentState('speaking');

  // Chunk text into pieces < 150 characters at sentence boundaries
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  let buffer = '';
  for (const s of sentences) {
    if ((buffer + s).length > 150 && buffer.trim()) {
      chunks.push(buffer.trim());
      buffer = s;
    } else {
      buffer += s;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  // Mouth animation decay refs
  let mouthDecayTimer: ReturnType<typeof setTimeout> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  // iOS keepalive: pause/resume every 10s to prevent speech from stopping
  keepaliveTimer = setInterval(() => {
    if (synth.speaking) {
      synth.pause();
      setTimeout(() => synth.resume(), 50);
    }
  }, 10000);

  const cleanup = () => {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    if (mouthDecayTimer) clearTimeout(mouthDecayTimer);
    useJarvisStore.getState().setMouthOpen(0);
    useJarvisStore.getState().setAgentState('idle');
  };

  let chunkIdx = 0;

  const speakNextChunk = () => {
    if (chunkIdx >= chunks.length) {
      cleanup();
      return;
    }

    const utt = new SpeechSynthesisUtterance(chunks[chunkIdx]);

    utt.onboundary = () => {
      // Animate mouth on word boundary
      useJarvisStore.getState().setMouthOpen(0.5);
      if (mouthDecayTimer) clearTimeout(mouthDecayTimer);
      mouthDecayTimer = setTimeout(() => {
        useJarvisStore.getState().setMouthOpen(0);
      }, 200);
    };

    utt.onend = () => {
      chunkIdx++;
      speakNextChunk();
    };

    utt.onerror = () => {
      cleanup();
    };

    synth.speak(utt);
  };

  speakNextChunk();
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function Home() {
  useEffect(() => {
    useJarvisStore.getState().setConnected(true);
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050810] text-white">
      <TooltipProvider delayDuration={300}>
        <StatusBar />

        <main className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <FacePanel />
          <div className="hidden md:block w-px bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent" />
          <ChatPanel />
        </main>
      </TooltipProvider>
    </div>
  );
}
