'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useJarvisStore } from '@/lib/jarvis-store';
import type { AgentState } from '@/lib/jarvis-store';

/* ═══════════════════════════════════════════════════════════════
   CINEMATIC JARVIS FUI FACE
   Inspired by the Iron Man HUD / Stark Industries FUI
   ═══════════════════════════════════════════════════════════════ */

const STATE_COLORS: Record<AgentState, { primary: string; secondary: string; glow: string; dim: string }> = {
  idle:       { primary: '#00d4ff', secondary: '#0088aa', glow: 'rgba(0,212,255,0.35)',  dim: 'rgba(0,212,255,0.08)' },
  listening:  { primary: '#f59e0b', secondary: '#b45309', glow: 'rgba(245,158,11,0.4)',   dim: 'rgba(245,158,11,0.1)' },
  thinking:   { primary: '#a78bfa', secondary: '#7c3aed', glow: 'rgba(167,139,250,0.4)',  dim: 'rgba(167,139,250,0.1)' },
  speaking:   { primary: '#34d399', secondary: '#059669', glow: 'rgba(52,211,153,0.4)',   dim: 'rgba(52,211,153,0.1)' },
  executing:  { primary: '#f97316', secondary: '#c2410c', glow: 'rgba(249,115,22,0.4)',   dim: 'rgba(249,115,22,0.1)' },
  error:      { primary: '#f87171', secondary: '#b91c1c', glow: 'rgba(248,113,113,0.4)',  dim: 'rgba(248,113,113,0.1)' },
};

export default function JarvisFace() {
  const { agentState, mouthOpen } = useJarvisStore();
  const [time, setTime] = useState('00:00:00');
  const [blink, setBlink] = useState(false);
  const c = STATE_COLORS[agentState];

  // Clock
  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().split(' ')[0]);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Blink every 3-5s
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(id);
  }, []);

  // Random data values
  const dataValues = useMemo(() => ({
    sysLoad: (30 + Math.random() * 40).toFixed(1),
    neuralNet: (85 + Math.random() * 14).toFixed(1),
    responseTime: (12 + Math.random() * 30).toFixed(0),
    memoryUsage: (42 + Math.random() * 30).toFixed(1),
  }), []);

  const isSpeaking = agentState === 'speaking';
  const isListening = agentState === 'listening';
  const isThinking = agentState === 'thinking';
  const coreScale = isSpeaking ? 1 + mouthOpen * 0.15 : isListening ? 1.08 : 1;
  const coreOpacity = isThinking ? 0.6 + Math.sin(Date.now() / 200) * 0.3 : 1;

  return (
    <div className="jarvis-face-container relative h-full w-full overflow-hidden select-none">
      {/* Background grid */}
      <div className="jarvis-bg-grid absolute inset-0 z-0" />
      <div className="jarvis-bg-vignette absolute inset-0 z-0" />

      {/* Ambient glow behind core */}
      <div
        className="absolute left-1/2 top-[45%] z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-1000"
        style={{
          width: '50%', height: '50%',
          background: `radial-gradient(ellipse, ${c.glow} 0%, transparent 70%)`,
          filter: 'blur(40px)',
          opacity: isSpeaking ? 0.8 : 0.5,
        }}
      />

      {/* Main SVG HUD */}
      <svg
        viewBox="0 0 500 500"
        className="jarvis-svg absolute left-1/2 top-[45%] z-[2] h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2"
      >
        <defs>
          {/* Core glow gradient */}
          <radialGradient id="coreGrad">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="30%" stopColor={c.primary} stopOpacity="0.8" />
            <stop offset="70%" stopColor={c.secondary} stopOpacity="0.3" />
            <stop offset="100%" stopColor={c.secondary} stopOpacity="0" />
          </radialGradient>

          {/* Ring glow filter */}
          <filter id="ringGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="strongGlow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Clip for scan line */}
          <clipPath id="circleClip">
            <circle cx="250" cy="230" r="190" />
          </clipPath>
        </defs>

        {/* ═══ OUTER HUD RINGS ═══ */}

        {/* Outermost dashed ring */}
        <circle cx="250" cy="230" r="220" fill="none" stroke={c.primary} strokeWidth="0.3" opacity="0.2"
          strokeDasharray="4 8" className="jarvis-ring-slow" />

        {/* Outer data ring with tick marks */}
        <g opacity="0.25" className="jarvis-ring-reverse">
          <circle cx="250" cy="230" r="195" fill="none" stroke={c.primary} strokeWidth="0.5" strokeDasharray="1 14" />
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2;
            const len = i % 6 === 0 ? 10 : i % 3 === 0 ? 6 : 3;
            const x1 = 250 + Math.cos(a) * 190, y1 = 230 + Math.sin(a) * 190;
            const x2 = 250 + Math.cos(a) * (190 - len), y2 = 230 + Math.sin(a) * (190 - len);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.primary} strokeWidth={i % 6 === 0 ? 0.8 : 0.3} />;
          })}
        </g>

        {/* Arc segments — top left */}
        <path d="M 120 120 A 170 170 0 0 1 250 60" fill="none" stroke={c.primary} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"
          filter="url(#ringGlow)" className="jarvis-ring-slow" />
        {/* Arc segments — bottom right */}
        <path d="M 380 340 A 170 170 0 0 1 250 400" fill="none" stroke={c.primary} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"
          filter="url(#ringGlow)" className="jarvis-ring-reverse" />

        {/* ═══ IRIS MECHANISM ═══ */}

        {/* Outer iris ring */}
        <circle cx="250" cy="230" r="140" fill="none" stroke={c.primary} strokeWidth="1" opacity="0.4" filter="url(#ringGlow)"
          className="jarvis-ring-slow" />

        {/* Iris shutter blades */}
        <g className="jarvis-iris" style={{ transformOrigin: '250px 230px' }}>
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * 360;
            const openAngle = isListening ? 25 : isSpeaking ? 15 : blink ? 2 : 8;
            const x1 = 250 + Math.cos(((angle - openAngle) * Math.PI) / 180) * 55;
            const y1 = 230 + Math.sin(((angle - openAngle) * Math.PI) / 180) * 55;
            const x2 = 250 + Math.cos(((angle + openAngle) * Math.PI) / 180) * 130;
            const y2 = 230 + Math.sin(((angle + openAngle) * Math.PI) / 180) * 130;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={c.primary} strokeWidth={1.2} opacity={0.5} strokeLinecap="round"
                filter="url(#ringGlow)" />
            );
          })}
        </g>

        {/* Inner iris ring */}
        <circle cx="250" cy="230" r="90" fill="none" stroke={c.primary} strokeWidth="0.8" opacity="0.35"
          className="jarvis-ring-reverse" />
        <circle cx="250" cy="230" r="60" fill="none" stroke={c.primary} strokeWidth="0.5" opacity="0.25"
          className="jarvis-ring-fast" />

        {/* ═══ CORE / EYE ═══ */}

        {/* Core glow backdrop */}
        <circle cx="250" cy="230" r="50" fill={c.primary} opacity="0.15" filter="url(#softGlow)"
          style={{ transition: 'r 0.3s' }} />

        {/* Core bright center */}
        <g style={{
          transform: `scale(${coreScale})`,
          transformOrigin: '250px 230px',
          opacity: coreOpacity,
          transition: 'transform 0.15s ease-out, opacity 0.2s',
        }}>
          <circle cx="250" cy="230" r="30" fill="url(#coreGrad)" filter="url(#strongGlow)" />
          <circle cx="250" cy="230" r="12" fill="white" opacity="0.9" filter="url(#strongGlow)" />
          <circle cx="250" cy="230" r="5" fill="white" />
        </g>

        {/* Speaking mouth bar */}
        {isSpeaking && (
          <rect x="225" y="280" width={40 + mouthOpen * 20} height={2 + mouthOpen * 4} rx="1"
            fill={c.primary} opacity="0.7" filter="url(#ringGlow)"
            style={{ transition: 'width 0.1s, height 0.1s' }} />
        )}

        {/* ═══ DATA READOUTS ═══ */}
        <g className="jarvis-data" opacity="0.5">
          {/* Left data column */}
          <text x="40" y="100" fill={c.primary} fontSize="7" fontFamily="'Courier New', monospace" letterSpacing="2">STARK INDUSTRIES</text>
          <text x="40" y="115" fill={c.primary} fontSize="5" fontFamily="'Courier New', monospace" opacity="0.6">SECURE TERMINAL v4.1</text>

          <text x="40" y="150" fill={c.primary} fontSize="6" fontFamily="'Courier New', monospace" opacity="0.4">SYS.LOAD</text>
          <text x="40" y="162" fill={c.primary} fontSize="10" fontFamily="'Courier New', monospace" fontWeight="bold">{dataValues.sysLoad}%</text>

          <text x="40" y="190" fill={c.primary} fontSize="6" fontFamily="'Courier New', monospace" opacity="0.4">NEURAL.NET</text>
          <text x="40" y="202" fill={c.primary} fontSize="10" fontFamily="'Courier New', monospace" fontWeight="bold">{dataValues.neuralNet}%</text>

          <text x="40" y="230" fill={c.primary} fontSize="6" fontFamily="'Courier New', monospace" opacity="0.4">RESPONSE</text>
          <text x="40" y="242" fill={c.primary} fontSize="10" fontFamily="'Courier New', monospace" fontWeight="bold">{dataValues.responseTime}ms</text>

          {/* Right data column */}
          <text x="350" y="100" fill={c.primary} fontSize="6" fontFamily="'Courier New', monospace" opacity="0.4">MEM.ALLOC</text>
          <text x="350" y="112" fill={c.primary} fontSize="10" fontFamily="'Courier New', monospace" fontWeight="bold">{dataValues.memoryUsage}%</text>

          <text x="350" y="140" fill={c.primary} fontSize="6" fontFamily="'Courier New', monospace" opacity="0.4">UPTIME</text>
          <text x="350" y="152" fill={c.primary} fontSize="10" fontFamily="'Courier New', monospace" fontWeight="bold">99.97%</text>

          {/* Arc gauge — top right */}
          <path d="M 390 80 A 40 40 0 0 1 430 120" fill="none" stroke={c.dim} strokeWidth="3" strokeLinecap="round" />
          <path d="M 390 80 A 40 40 0 0 1 425 115" fill="none" stroke={c.primary} strokeWidth="3" strokeLinecap="round" filter="url(#ringGlow)" />
          <text x="400" y="112" fill={c.primary} fontSize="9" fontFamily="'Courier New', monospace" fontWeight="bold">{time.slice(0, 5)}</text>

          {/* Arc gauge — bottom left */}
          <path d="M 70 380 A 35 35 0 0 1 140 380" fill="none" stroke={c.dim} strokeWidth="3" strokeLinecap="round" />
          <path d="M 75 380 A 30 30 0 0 1 130 380" fill="none" stroke={c.primary} strokeWidth="3" strokeLinecap="round" filter="url(#ringGlow)" opacity="0.6" />
        </g>

        {/* Status label */}
        <text x="250" y="340" textAnchor="middle" fill={c.primary} fontSize="8" fontFamily="'Courier New', monospace"
          letterSpacing="4" opacity="0.6" className="uppercase">{agentState}</text>

        {/* Bottom branding */}
        <text x="250" y="470" textAnchor="middle" fill={c.primary} fontSize="10" fontFamily="'Courier New', monospace"
          letterSpacing="6" opacity="0.25">Z.A.R.A.</text>

        {/* Scan line */}
        <rect x="60" y="0" width="380" height="1.5" fill={c.primary} opacity="0.06"
          clipPath="url(#circleClip)" className="jarvis-scanline" />

        {/* Horizontal crosshairs */}
        <line x1="250" y1="40" x2="250" y2="80" stroke={c.primary} strokeWidth="0.3" opacity="0.15" />
        <line x1="250" y1="380" x2="250" y2="420" stroke={c.primary} strokeWidth="0.3" opacity="0.15" />
        <line x1="60" y1="230" x2="100" y2="230" stroke={c.primary} strokeWidth="0.3" opacity="0.15" />
        <line x1="400" y1="230" x2="440" y2="230" stroke={c.primary} strokeWidth="0.3" opacity="0.15" />
      </svg>

      {/* ═══ INLINE STYLES & ANIMATIONS ═══ */}
      <style jsx global>{`
        .jarvis-face-container {
          background: #050508;
        }
        .jarvis-bg-grid {
          background-image:
            linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px);
          background-size: 30px 30px;
        }
        .jarvis-bg-vignette {
          background: radial-gradient(ellipse at 50% 45%, transparent 30%, #050508 80%);
        }
        @keyframes jarvis-rotate-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes jarvis-rotate-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes jarvis-rotate-fast {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes jarvis-scan {
          0% { transform: translateY(-250px); }
          100% { transform: translateY(250px); }
        }
        @keyframes jarvis-iris-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes jarvis-data-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
        }
        .jarvis-ring-slow {
 animation: jarvis-rotate-slow 30s linear infinite;
          transform-origin: 250px 230px;
        }
        .jarvis-ring-reverse {
          animation: jarvis-rotate-reverse 25s linear infinite;
          transform-origin: 250px 230px;
        }
        .jarvis-ring-fast {
          animation: jarvis-rotate-fast 8s linear infinite;
          transform-origin: 250px 230px;
        }
        .jarvis-scanline {
          animation: jarvis-scan 5s linear infinite;
        }
        .jarvis-iris {
          animation: jarvis-iris-rotate 12s linear infinite;
        }
        .jarvis-data {
          animation: jarvis-data-pulse 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
