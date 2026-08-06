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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Mic, MicOff, Send, Loader2, Zap, ShieldAlert, Wifi, WifiOff,
  Check, X, MessageSquare, Sparkles, Terminal, Activity, Circle,
  Volume2, Camera, Upload, Keyboard, Ear, Save, Trash2, Radio, Monitor,
  Download, Lock, LockOpen, ShieldCheck,
} from 'lucide-react';
import {
  requireVerification, verifyWithBiometric, verifyWithVoice,
  getSecurityLevel, setSecurityLevel, type SecurityLevel,
} from '@/lib/security';
import { WakeWordDetector } from '@/lib/wake-word';
import { playSoundEffect, createAudioAnalyser, getAudioLevel, startBargeInDetection, stopSpeaking, cleanupAudioSystem } from '@/lib/audio-system';
import { saveConversation, getMemoryContext } from '@/lib/memory';

/* ═══════════════════════════════════════════════════════════════
   STATE CONFIGURATION
   ═══════════════════════════════════════════════════════════════ */

const STATE_CONFIG: Record<AgentState, { label: string; dotColor: string; icon: React.ReactNode; animate: boolean }> = {
  idle: { label: 'Online', dotColor: 'bg-cyan-400', icon: <Circle className="size-3" />, animate: false },
  listening: { label: 'Listening', dotColor: 'bg-amber-400', icon: <Ear className="size-3" />, animate: true },
  thinking: { label: 'Processing', dotColor: 'bg-violet-400', icon: <Activity className="size-3" />, animate: true },
  speaking: { label: 'Speaking', dotColor: 'bg-emerald-400', icon: <Volume2 className="size-3" />, animate: true },
  awaiting_confirmation: { label: 'Confirm Action', dotColor: 'bg-orange-400', icon: <ShieldAlert className="size-3" />, animate: true },
  executing: { label: 'Executing', dotColor: 'bg-violet-400', icon: <Terminal className="size-3" />, animate: true },
};

const SUGGESTIONS = [
  'Search the web for latest AI news',
  'What day and time is it?',
  'Set a reminder for 30 minutes',
  'Analyze this image',
  'What can you do?',
  'Search my memory',
];

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/* ═══════════════════════════════════════════════════════════════
   AUDIO VISUALIZER BARS
   ═══════════════════════════════════════════════════════════════ */

function AudioVisualizer({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    const barCount = 48;
    const centerY = canvas!.height / 2;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      // Center line at 10% white opacity
      ctx!.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx!.lineWidth = 0.5;
      ctx!.beginPath();
      ctx!.moveTo(0, centerY);
      ctx!.lineTo(canvas!.width, centerY);
      ctx!.stroke();

      const step = Math.floor(bufLen / barCount);
      const barW = canvas!.width / barCount - 1;
      for (let i = 0; i < barCount; i++) {
        const val = data[i * step] / 255;
        const h = val * centerY * 0.9;
        const x = i * (barW + 1);
        const color = `rgba(0, 232, 255, ${0.3 + val * 0.7})`;
        const gradient = ctx!.createLinearGradient(0, centerY, 0, centerY - h);
        gradient.addColorStop(0, 'rgba(0, 232, 255, 0.1)');
        gradient.addColorStop(1, color);

        // Glow effect
        ctx!.shadowBlur = 6;
        ctx!.shadowColor = color;

        ctx!.fillStyle = gradient;
        ctx!.fillRect(x, centerY - h, barW, h);

        // Reflection below center line at 30% opacity
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = 0.3;
        const reflGradient = ctx!.createLinearGradient(0, centerY, 0, centerY + h);
        reflGradient.addColorStop(0, 'rgba(0, 232, 255, 0.1)');
        reflGradient.addColorStop(1, 'rgba(0, 232, 255, 0)');
        ctx!.fillStyle = reflGradient;
        ctx!.fillRect(x, centerY, barW, h);
        ctx!.globalAlpha = 1.0;
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, active]);

  return <canvas ref={canvasRef} width={384} height={64} className={cn('w-full h-10 opacity-0 transition-opacity duration-300', active && 'opacity-100')} />;
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════ */

function StatusBar({ wakeWordActive, onToggleWakeWord, installPrompt, onInstallClick, securityLevel, onCycleSecurity }: {
  wakeWordActive: boolean; onToggleWakeWord: () => void;
  installPrompt: Event | null; onInstallClick: () => void;
  securityLevel: SecurityLevel; onCycleSecurity: () => void;
}) {
  const { agentState, connected } = useJarvisStore();
  const cfg = STATE_CONFIG[agentState];

  const securityIcon = securityLevel === 'none' ? <LockOpen className="size-3" />
    : securityLevel === 'biometric' ? <Lock className="size-3" />
    : securityLevel === 'voice' ? <Mic className="size-3" />
    : <ShieldCheck className="size-3" />;

  const securityLabel = securityLevel === 'none' ? 'No security'
    : securityLevel === 'biometric' ? 'Biometric lock'
    : securityLevel === 'voice' ? 'Voice lock'
    : 'Full security (voice + biometric)';

  return (
    <header className="relative z-20 flex h-12 items-center justify-between border-b border-white/[0.06] px-4 md:px-6 bg-[#060a14]/80 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Sparkles className="size-3.5 text-cyan-400" />
          </div>
          <h1 className="text-xs font-bold tracking-[0.3em] text-white/90 uppercase" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>
            Z.A.R.A.
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Security toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="icon" onClick={onCycleSecurity}
              className={cn('h-7 w-7 rounded-lg',
                securityLevel === 'none' ? 'text-white/30' : 'text-amber-400 bg-amber-500/10',
              )}
            >
              {securityIcon}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{securityLabel} — click to change</TooltipContent>
        </Tooltip>

        {/* PWA install button */}
        {installPrompt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon" onClick={onInstallClick}
                className="h-7 w-7 rounded-lg text-cyan-400 bg-cyan-500/10"
              >
                <Download className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Install ZARA as an app</TooltipContent>
          </Tooltip>
        )}

        {/* Wake word toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="icon" onClick={onToggleWakeWord}
              className={cn('h-7 w-7 rounded-lg', wakeWordActive && 'text-amber-400 bg-amber-500/10')}
            >
              <Radio className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {wakeWordActive ? 'Wake word active — say "Hello Zara"' : 'Enable wake word'}
          </TooltipContent>
        </Tooltip>

        <AnimatePresence mode="wait">
          <motion.div
            key={agentState}
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <Badge variant="outline" className={cn(
              'gap-1.5 border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-medium text-white/80',
              agentState === 'listening' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              agentState === 'thinking' && 'border-violet-500/30 bg-violet-500/10 text-violet-300',
              agentState === 'speaking' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
            )} style={{ fontFamily: 'var(--font-orbitron), monospace' }}>
              <span className={cn('inline-block size-1.5 rounded-full', cfg.dotColor, cfg.animate && 'animate-pulse')} />
              {cfg.label}
            </Badge>
          </motion.div>
        </AnimatePresence>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'flex size-7 items-center justify-center rounded-full border transition-colors',
              connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/30',
            )}>
              {connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{connected ? 'Connected' : 'Offline'}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FACE PANEL
   ═══════════════════════════════════════════════════════════════ */

function FacePanel({ analyser }: { analyser: AnalyserNode | null }) {
  const { agentState, transcript } = useJarvisStore();

  return (
    <div className="relative h-[24vh] min-h-[180px] w-full md:h-full md:w-[42%] lg:w-[40%] shrink-0">
      {/* Ambient radial gradient background */}
      <div className="absolute inset-0 z-0" style={{
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,40,80,0.3) 0%, rgba(5,8,16,0) 70%)',
      }} />
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 z-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(0,232,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,232,255,0.15) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* 3D Face */}
      <div className="relative z-[1] h-full w-full">
        <JarvisFace />
      </div>

      {/* Audio visualizer */}
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <AudioVisualizer analyser={analyser} active={agentState === 'listening' || agentState === 'speaking'} />
      </div>

      {/* Wake word flash */}
      <AnimatePresence>
        {agentState === 'listening' && transcript && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute bottom-12 left-1/2 z-10 -translate-x-1/2"
          >
            <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-950/50 px-4 py-2 backdrop-blur-md">
              <Ear className="size-3.5 text-amber-400" />
              <span className="text-xs text-amber-300/80 max-w-[200px] truncate" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>
                {transcript}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* State overlays */}
      <AnimatePresence>
        {agentState === 'thinking' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-950/40 px-4 py-2 backdrop-blur-md">
              <Loader2 className="size-3.5 animate-spin text-violet-400" />
              <span className="text-[10px] text-violet-300/90" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>PROCESSING</span>
            </div>
          </motion.div>
        )}
        {agentState === 'speaking' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/40 px-4 py-2 backdrop-blur-md">
              <Volume2 className="size-3.5 text-emerald-400" />
              <span className="text-[10px] text-emerald-300/90" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>SPEAKING</span>
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={cn('mx-4', isSystem && 'mx-4')}
    >
      {isSystem ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/[0.06] border border-red-500/10 px-3 py-2">
          <X className="size-3 text-red-400 shrink-0" />
          <p className="text-xs text-red-300/80">{message.text}</p>
        </div>
      ) : (
        <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
          <div className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md mt-0.5',
            isUser ? 'bg-cyan-500/15 border border-cyan-500/20' : 'bg-white/5 border border-white/10',
          )}>
            {isUser ? <MessageSquare className="size-3 text-cyan-400" /> : <Sparkles className="size-3 text-cyan-400" />}
          </div>
          <div className={cn('max-w-[80%] space-y-1', isUser && 'text-right')}>
            <div className={cn(
              'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'bg-cyan-500/10 border border-cyan-500/15 text-white/90 rounded-tr-md'
                : 'bg-white/[0.04] border border-white/[0.06] text-white/80 rounded-tl-md',
            )}>
              {message.image && (
                <img src={message.image} alt="Uploaded" className="mb-2 max-h-40 rounded-lg object-cover" />
              )}
              {message.text}
            </div>
            <p className="text-[10px] text-white/20 px-1" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>
              {formatTime(message.timestamp)}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOOL EXECUTION CARD
   ═══════════════════════════════════════════════════════════════ */

function ToolExecutionCard({ exec }: { exec: ToolExecution }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="mx-4">
      <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Terminal className="size-3 text-violet-400" />
          <span className="text-[10px] font-mono text-violet-300/80" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>{exec.tool}</span>
          <Badge variant="outline" className="ml-auto border-white/10 bg-white/5 text-[9px] text-white/40">{exec.tier}</Badge>
        </div>
        <p className="text-xs text-white/60 leading-relaxed">{exec.result}</p>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PENDING ACTION CARD
   ═══════════════════════════════════════════════════════════════ */

function PendingActionCard({ action }: { action: PendingAction }) {
  const { setPendingAction } = useJarvisStore();
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const handleConfirm = useCallback(async () => {
    // Security verification check
    if (requireVerification()) {
      setVerifying(true);
      setVerifyError('');
      const level = getSecurityLevel();
      let verified = false;

      if (level === 'biometric' || level === 'both') {
        verified = await verifyWithBiometric();
      }
      if (!verified && (level === 'voice' || level === 'both')) {
        verified = await verifyWithVoice();
      }

      setVerifying(false);
      if (!verified) {
        setVerifyError('Verification failed. Please try again.');
        playSoundEffect('error');
        return;
      }
    }
    setPendingAction(null); sendToJarvis('approved');
  }, [setPendingAction]);
  const handleDeny = useCallback(() => { setPendingAction(null); sendToJarvis('cancelled'); }, [setPendingAction]);

  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="mx-4">
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="size-4 text-orange-400" />
          <span className="text-xs font-semibold text-orange-400">Action Requires Confirmation</span>
          <Badge variant="outline" className="ml-auto border-white/10 bg-white/5 text-[10px] text-white/50">Tier {action.tier}</Badge>
        </div>
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="size-3 text-white/30" />
            <span className="text-xs font-mono text-orange-300/90" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>{action.tool}</span>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">{action.description}</p>
          {Object.keys(action.args).length > 0 && (
            <pre className="rounded-lg bg-black/30 px-3 py-2 text-xs font-mono text-white/50 overflow-x-auto">{JSON.stringify(action.args, null, 2)}</pre>
          )}
        </div>
        {verifyError && (
          <div className="flex items-center gap-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <X className="size-3 text-red-400 shrink-0" />
            <span className="text-xs text-red-300/80">{verifyError}</span>
          </div>
        )}
        <Separator className="bg-orange-500/10 mb-3" />
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={handleDeny} className="h-8 gap-1.5 text-white/50 hover:text-rose-300 hover:bg-rose-500/10">
            <X className="size-3.5" /> Deny
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={verifying} className="h-8 gap-1.5 bg-emerald-600/80 text-white border-0 hover:bg-emerald-600">
            {verifying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {verifying ? 'Verifying...' : 'Confirm'}
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
  const handleClick = useCallback((text: string) => { sendToJarvis(text); }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="text-center mb-10">
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08]">
            <Sparkles className="size-7 text-cyan-400" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-white/90 mb-2" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>How may I assist you?</h2>
        <p className="text-sm text-white/40 max-w-xs mx-auto leading-relaxed">Say <span className="text-amber-400">"Hello Zara"</span> to activate voice, or type below. I can search, code, send emails, and more.</p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }} className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
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
      <p className="mt-6 text-[10px] text-white/20 text-center" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>
        Press <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] mx-0.5">Space</kbd> for voice · <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] mx-0.5">Ctrl+V</kbd> to paste image
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEND TO JARVIS (shared)
   ═══════════════════════════════════════════════════════════════ */

function sendToJarvis(text: string, image?: string) {
  const store = useJarvisStore.getState();
  playSoundEffect('send');
  store.addMessage({ id: crypto.randomUUID(), role: 'user', text, image: image || undefined, timestamp: Date.now() });
  store.setAgentState('thinking');

  const apiMessages = store.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.text }));

  // Inject memory context as system-like messages at the front
  const memCtx = getMemoryContext();
  if (memCtx) {
    apiMessages.unshift({ role: 'user', content: `[Memory context: ${memCtx}]` });
    apiMessages.unshift({ role: 'assistant', content: 'Understood, I will use this context.' });
  }

  const body: Record<string, any> = { messages: apiMessages };
  if (image) body.image = image;

  fetch('/api/jarvis', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        store.addMessage({ id: crypto.randomUUID(), role: 'system', text: `Error: ${data.error}`, timestamp: Date.now() });
        store.setAgentState('idle');
        playSoundEffect('error');
        return;
      }
      if (data.actionRequest) {
        store.setPendingAction({
          actionId: crypto.randomUUID(), tier: data.actionRequest.tier || 'T2',
          tool: data.actionRequest.tool || 'unknown', args: data.actionRequest.args || {},
          description: data.actionRequest.description || 'Action requested',
        });
        store.setAgentState('awaiting_confirmation');
        return;
      }
      if (data.text) {
        store.addMessage({ id: crypto.randomUUID(), role: 'assistant', text: data.text, timestamp: Date.now() });
        playSoundEffect('receive');
        speakTextWithMouthSync(data.text);
      }
      if (data.toolExecutions) {
        data.toolExecutions.forEach((te: any) => store.setLastToolExec({ tool: te.tool, result: te.result, tier: te.tier }));
      }
      // Persist conversation
      const msgs = store.messages.filter(m => m.role === 'user' || m.role === 'assistant');
      saveConversation(msgs.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp })));
    })
    .catch(() => {
      store.addMessage({ id: crypto.randomUUID(), role: 'system', text: 'Connection error. Check your connection.', timestamp: Date.now() });
      store.setAgentState('idle');
      playSoundEffect('error');
    });
}

/* ═══════════════════════════════════════════════════════════════
   CHAT INPUT BAR
   ═══════════════════════════════════════════════════════════════ */

function ChatInput() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { agentState, setAgentState, setTranscript } = useJarvisStore();
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

  // Clipboard paste for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) processImageFile(file);
          return;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isBusy]);

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processImageFile(file);
  }, [isBusy]);

  function processImageFile(file: File) {
    if (isBusy) return;
    const reader = new FileReader();
    reader.onload = () => { const base64 = reader.result as string; sendToJarvis('What do you see in this image?', base64); };
    reader.readAsDataURL(file);
  }

  const handleScreenCapture = useCallback(async () => {
    if (isBusy) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise(r => setTimeout(r, 200));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      const base64 = canvas.toDataURL('image/png');
      sendToJarvis('What do you see in this screenshot?', base64);
    } catch {
      // User cancelled or browser denied
    }
  }, [isBusy]);

  // Cleanup recognition
  useEffect(() => {
    return () => { try { recognitionRef.current?.stop(); } catch { /* */ } };
  }, []);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const text = input.trim(); setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendToJarvis(text);
  }, [canSend, input]);

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch { /* */ }
      recognitionRef.current = null;
      setAgentState('idle'); setTranscript('');
    } else if (!isBusy) {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
      rec.onresult = (ev: any) => {
        let interim = '', final = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) final += t; else interim += t;
        }
        if (final.trim()) {
          setTranscript(''); setAgentState('idle');
          try { rec.stop(); } catch { /* */ }
          recognitionRef.current = null;
          sendToJarvis(final.trim());
        } else { setTranscript(interim); }
      };
      rec.onerror = () => { setAgentState('idle'); setTranscript(''); recognitionRef.current = null; };
      rec.onend = () => {
        if (useJarvisStore.getState().agentState === 'listening') {
          setAgentState('idle'); setTranscript(''); recognitionRef.current = null;
        }
      };
      recognitionRef.current = rec;
      try { rec.start(); } catch { /* */ }
      setAgentState('listening');
    }
  }, [isListening, isBusy, setAgentState, setTranscript]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  return (
    <div
      ref={dropRef}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      className={cn(
        'shrink-0 border-t bg-[#080c16]/80 backdrop-blur-xl px-3 py-3 md:px-4 md:py-3.5 transition-colors',
        isDragging ? 'border-cyan-500/40 bg-cyan-500/[0.04]' : 'border-white/[0.06]',
      )}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center rounded-t-xl border-2 border-dashed border-cyan-500/30 bg-cyan-500/[0.03]"
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="size-6 text-cyan-400" />
              <span className="text-xs text-cyan-300/60" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>DROP IMAGE HERE</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]; if (file) processImageFile(file); e.target.value = '';
      }} />

      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isListening ? 'destructive' : 'outline'} size="icon"
              onClick={handleMicToggle} disabled={isBusy && !isListening}
              data-mic-btn
              className={cn(
                'h-10 w-10 shrink-0 rounded-xl border-white/10 bg-white/5 text-white/60 transition-all hover:text-white hover:bg-white/10',
                isListening && 'border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300 animate-pulse',
              )}
            >
              {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{isListening ? 'Stop' : 'Voice (or press Space)'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isBusy}
              className="h-10 w-10 shrink-0 rounded-xl border-white/10 bg-white/5 text-white/60 transition-all hover:text-white hover:bg-white/10">
              <Camera className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Image</TooltipContent>
        </Tooltip>

        {/* Screen capture — desktop only */}
        <Tooltip className="hidden md:block">
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={handleScreenCapture} disabled={isBusy}
              className="h-10 w-10 shrink-0 rounded-xl border-white/10 bg-white/5 text-white/60 transition-all hover:text-white hover:bg-white/10">
              <Monitor className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Screen capture</TooltipContent>
        </Tooltip>

        <div className="relative flex-1">
          <textarea
            ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isBusy ? (agentState === 'thinking' ? 'ZARA is processing...' : agentState === 'speaking' ? 'ZARA is speaking...' : 'Executing...') : 'Ask ZARA anything...'}
            disabled={isBusy || isListening} rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none transition-colors',
              'focus:border-cyan-500/25 focus:bg-white/[0.05]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon" onClick={handleSend} disabled={!canSend}
              className={cn(
                'h-10 w-10 shrink-0 rounded-xl transition-all',
                canSend ? 'bg-cyan-500/80 text-white border-0 hover:bg-cyan-500 shadow-[0_0_20px_rgba(0,212,255,0.15)]' : 'border border-white/[0.08] bg-white/[0.03] text-white/20',
              )}
            >
              {agentState === 'thinking' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Send</TooltipContent>
        </Tooltip>
      </div>

      {/* Keyboard hints — desktop only */}
      <p className="mt-2 hidden text-center text-[10px] text-white/15 md:block" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>
        <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px]">Enter</kbd> send
        {' · '}<kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px]">Space</kbd> voice
        {' · '}<kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px]">Ctrl+V</kbd> paste image
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

  useEffect(() => {
    if (scrollRef.current) {
      const vp = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (vp) vp.scrollTop = vp.scrollHeight;
    }
  }, [messages.length, pendingAction, lastToolExec]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#080c16]/60">
      <div className="flex h-9 shrink-0 items-center border-b border-white/[0.04] px-4">
        <span className="text-[10px] font-medium tracking-wider text-white/25 uppercase" style={{ fontFamily: 'var(--font-orbitron), monospace' }}>Conversation</span>
        {hasMessages && (
          <Badge variant="outline" className="ml-2 h-4 border-white/[0.06] bg-white/[0.03] px-1.5 text-[9px] text-white/30">
            {messages.length}
          </Badge>
        )}
      </div>
      <ScrollArea ref={scrollRef} className="flex-1">
        {hasMessages ? (
          <div className="flex flex-col gap-4 py-4">
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
            <AnimatePresence>{lastToolExec && <ToolExecutionCard exec={lastToolExec} />}</AnimatePresence>
            <AnimatePresence>{pendingAction && <PendingActionCard action={pendingAction} />}</AnimatePresence>
          </div>
        ) : (
          <WelcomeSuggestions />
        )}
      </ScrollArea>
      <ChatInput />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TTS UTILITY
   ═══════════════════════════════════════════════════════════════ */

function speakTextWithMouthSync(text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();

  const store = useJarvisStore.getState();
  store.setAgentState('speaking');

  const chunks: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  let buffer = '';
  for (const s of sentences) {
    if ((buffer + s).length > 180 && buffer.trim()) { chunks.push(buffer.trim()); buffer = s; } else { buffer += s; }
  }
  if (buffer.trim()) chunks.push(buffer.trim());

  let finished = false;
  let mouthDecay: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (mouthDecay) clearTimeout(mouthDecay);
    try { synth.cancel(); } catch { /* */ }
    useJarvisStore.getState().setMouthOpen(0);
    useJarvisStore.getState().setAgentState('idle');
  };

  let idx = 0;
  const speakNext = () => {
    if (finished || idx >= chunks.length) { cleanup(); return; }
    const utt = new SpeechSynthesisUtterance(chunks[idx]);

    // Pick best available voice
    const voices = synth.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                      voices.find(v => v.lang.startsWith('en') && !v.localService) ||
                      voices.find(v => v.lang.startsWith('en'));
    if (preferred) utt.voice = preferred;
    utt.rate = 1.0;
    utt.pitch = 0.95;

    utt.onboundary = () => {
      useJarvisStore.getState().setMouthOpen(0.5);
      if (mouthDecay) clearTimeout(mouthDecay);
      mouthDecay = setTimeout(() => { useJarvisStore.getState().setMouthOpen(0); }, 180);
    };
    utt.onend = () => { idx++; speakNext(); };
    utt.onerror = (e) => { console.warn('[TTS error]', e); cleanup(); };
    synth.speak(utt);
  };

  // Mobile Chrome bug: speechSynthesis pauses after ~15s.
  // Workaround: briefly pause+resume every 10s to keep it alive.
  const keepalive = setInterval(() => {
    if (finished) { clearInterval(keepalive); return; }
    if (synth.speaking && !synth.paused) {
      synth.pause();
      setTimeout(() => { try { synth.resume(); } catch { /* */ } }, 25);
    }
  }, 10000);

  // Safety timeout: force-stop after 60s total
  const safetyTimeout = setTimeout(() => { cleanup(); clearInterval(keepalive); }, 60000);

  speakNext();
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function Home() {
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [securityLevel, setSecurityLevelState] = useState<SecurityLevel>('none');
  const wakeWordRef = useRef<WakeWordDetector | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bargeInRef = useRef<(() => void) | null>(null);
  const backchannelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PWA install handler
  const handleInstallClick = useCallback(() => {
    if (installPrompt) {
      (installPrompt as any).prompt();
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  // Security level cycle: none -> biometric -> voice -> both -> none
  const cycleSecurity = useCallback(() => {
    const levels: SecurityLevel[] = ['none', 'biometric', 'voice', 'both'];
    const current = getSecurityLevel();
    const next = levels[(levels.indexOf(current) + 1) % levels.length];
    setSecurityLevel(next);
    setSecurityLevelState(next);
  }, []);

  // Initialize connection + audio + PWA
  useEffect(() => {
    useJarvisStore.getState().setConnected(true);

    // Create audio analyser for visualization
    createAudioAnalyser().then(analyser => {
      analyserRef.current = analyser;
    }).catch(() => {});

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // PWA install prompt
    const handleBeforeInstall = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Load voices (needed for TTS selection)
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();

    // Keyboard shortcut: Space to toggle mic (when not in textarea)
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        // Trigger mic toggle via clicking the mic button
        document.querySelector<HTMLButtonElement>('[data-mic-btn]')?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.speechSynthesis.cancel();
      wakeWordRef.current?.destroy();
      bargeInRef.current?.();
      cleanupAudioSystem();
    };
  }, []);

  // Barge-in: stop speaking when user starts talking
  useEffect(() => {
    const { agentState } = useJarvisStore.getState();
    if (agentState === 'speaking' && analyserRef.current) {
      bargeInRef.current = startBargeInDetection(analyserRef.current, () => {
        stopSpeaking();
        playSoundEffect('click');
      });
    }
    return () => { bargeInRef.current?.(); bargeInRef.current = null; };
  });

  // Backchanneling: brief affirmations while user is speaking
  // Disabled on mobile — causes TTS conflicts
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) return;

    const BACKCHANNEL_PHRASES = ['I see', 'right', 'yes', 'go on', 'mm-hmm', 'understood', 'continue'];
    let active = false;

    function scheduleBackchannel() {
      if (backchannelTimerRef.current) clearTimeout(backchannelTimerRef.current);
      const delay = 4000 + Math.random() * 3000; // 4–7 seconds
      backchannelTimerRef.current = setTimeout(() => {
        if (!active) return;
        const state = useJarvisStore.getState().agentState;
        if (state !== 'listening') { active = false; return; }

        const phrase = BACKCHANNEL_PHRASES[Math.floor(Math.random() * BACKCHANNEL_PHRASES.length)];

        // Play subtle click sound before backchannel
        playSoundEffect('click');

        // Speak backchannel at low volume, quick voice — without changing agentState
        const utt = new SpeechSynthesisUtterance(phrase);
        utt.volume = 0.3;
        utt.rate = 1.3;
        utt.pitch = 1.1;
        const voices = speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                          voices.find(v => v.lang.startsWith('en') && !v.localService) ||
                          voices.find(v => v.lang.startsWith('en'));
        if (preferred) utt.voice = preferred;
        speechSynthesis.speak(utt);

        // Schedule next backchannel
        if (active) scheduleBackchannel();
      }, delay);
    }

    function stopBackchannel() {
      active = false;
      if (backchannelTimerRef.current) {
        clearTimeout(backchannelTimerRef.current);
        backchannelTimerRef.current = null;
      }
    }

    // Subscribe to agentState changes
    const unsub = useJarvisStore.subscribe((state, prev) => {
      if (state.agentState === 'listening' && prev.agentState !== 'listening') {
        active = true;
        scheduleBackchannel();
      } else if (state.agentState !== 'listening' && prev.agentState === 'listening') {
        stopBackchannel();
      }
    });

    return () => {
      stopBackchannel();
      unsub();
    };
  }, []);

  // Wake word toggle
  const toggleWakeWord = useCallback(() => {
    if (wakeWordActive) {
      wakeWordRef.current?.destroy();
      wakeWordRef.current = null;
      setWakeWordActive(false);
    } else {
      const detector = new WakeWordDetector();
      detector.start(
        () => {
          // Wake word detected!
          playSoundEffect('wake');
          stopSpeaking(); // Stop any ongoing TTS
          const store = useJarvisStore.getState();
          if (store.agentState !== 'thinking') {
            store.setAgentState('listening');
            // Auto-start STT for 15 seconds of continuous listening
            const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SR) return;
            const rec = new SR();
            rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
            let timeout = setTimeout(() => {
              try { rec.stop(); } catch { /* */ }
              store.setAgentState('idle'); store.setTranscript('');
            }, 15000);
            rec.onresult = (ev: any) => {
              let interim = '', final = '';
              for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const t = ev.results[i][0].transcript;
                if (ev.results[i].isFinal) final += t; else interim += t;
              }
              store.setTranscript(interim);
              if (final.trim()) {
                clearTimeout(timeout);
                store.setTranscript('');
                try { rec.stop(); } catch { /* */ }
                sendToJarvis(final.trim());
              }
            };
            rec.onerror = () => { clearTimeout(timeout); store.setAgentState('idle'); store.setTranscript(''); };
            rec.onend = () => { clearTimeout(timeout); if (store.agentState === 'listening') { store.setAgentState('idle'); store.setTranscript(''); } };
            try { rec.start(); } catch { /* */ }
          }
        },
        (text) => { /* interim transcript available for display */ },
        () => { /* error */ },
      );
      wakeWordRef.current = detector;
      setWakeWordActive(true);
    }
  }, [wakeWordActive]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050810] text-white">
      <TooltipProvider delayDuration={300}>
        <StatusBar wakeWordActive={wakeWordActive} onToggleWakeWord={toggleWakeWord} installPrompt={installPrompt} onInstallClick={handleInstallClick} securityLevel={securityLevel} onCycleSecurity={cycleSecurity} />
        <main className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <FacePanel analyser={analyserRef.current} />
          <div className="hidden md:block w-px bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent" />
          <ChatPanel />
        </main>
      </TooltipProvider>
    </div>
  );
}
