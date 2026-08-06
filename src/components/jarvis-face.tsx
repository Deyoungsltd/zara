'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { useJarvisStore } from '@/lib/jarvis-store';
import type { AgentState } from '@/lib/jarvis-store';

/* ═══════════════════════════════════════════════════════════════
   CSS/SVG JARVIS FACE — works on all devices including mobile
   ═══════════════════════════════════════════════════════════════ */

function getStateColors(state: AgentState) {
  const map: Record<AgentState, { eye: string; ring: string; glow: string; mouth: string }> = {
    idle:       { eye: '#00e8ff', ring: '#00d4ff', glow: 'rgba(0,212,255,0.15)', mouth: '#00ffdd' },
    listening:  { eye: '#f59e0b', ring: '#f59e0b', glow: 'rgba(245,158,11,0.2)',  mouth: '#fbbf24' },
    thinking:   { eye: '#a78bfa', ring: '#8b5cf6', glow: 'rgba(139,92,246,0.2)',  mouth: '#a78bfa' },
    speaking:   { eye: '#34d399', ring: '#10b981', glow: 'rgba(16,185,129,0.2)',  mouth: '#34d399' },
    executing:  { eye: '#f97316', ring: '#ea580c', glow: 'rgba(234,88,12,0.2)',   mouth: '#fb923c' },
    error:      { eye: '#f87171', ring: '#ef4444', glow: 'rgba(239,68,68,0.2)',   mouth: '#f87171' },
  };
  return map[state];
}

export default function JarvisFace() {
  const { agentState, mouthOpen } = useJarvisStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [blink, setBlink] = useState(false);
  const colors = getStateColors(agentState);

  // Blink every 3-5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Particles
  const particles = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      duration: 3 + Math.random() * 4,
      delay: Math.random() * 3,
    }));
  }, []);

  const mouthHeight = Math.max(2, mouthOpen * 12);
  const eyeScaleY = blink ? 0.1 : 1;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Center glow */}
      <div
        className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-700"
        style={{
          width: '60%',
          height: '50%',
          background: `radial-gradient(ellipse, ${colors.glow} 0%, transparent 70%)`,
          filter: 'blur(30px)',
        }}
      />

      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: colors.eye,
            opacity: 0.3,
            animation: `jarvis-float ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}

      {/* Main SVG Face */}
      <svg
        viewBox="0 0 400 400"
        className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2"
        style={{ filter: `drop-shadow(0 0 20px ${colors.glow})` }}
      >
        <defs>
          <radialGradient id="eyeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.eye} stopOpacity="1" />
            <stop offset="60%" stopColor={colors.eye} stopOpacity="0.6" />
            <stop offset="100%" stopColor={colors.eye} stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="strongGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer HUD ring */}
        <circle
          cx="200" cy="200" r="180"
          fill="none"
          stroke={colors.ring}
          strokeWidth="0.5"
          opacity="0.3"
          strokeDasharray="8 12"
        />
        <circle
          cx="200" cy="200" r="165"
          fill="none"
          stroke={colors.ring}
          strokeWidth="0.3"
          opacity="0.15"
          strokeDasharray="3 20"
          className="origin-center"
          style={{ animation: 'jarvis-rotate 20s linear infinite' }}
        />

        {/* Inner arc segments */}
        <path
          d="M 80 200 A 120 120 0 0 1 200 80"
          fill="none"
          stroke={colors.eye}
          strokeWidth="1"
          opacity="0.2"
          strokeLinecap="round"
          className="origin-center"
          style={{ animation: 'jarvis-rotate 15s linear infinite reverse' }}
        />
        <path
          d="M 320 200 A 120 120 0 0 1 200 320"
          fill="none"
          stroke={colors.eye}
          strokeWidth="1"
          opacity="0.2"
          strokeLinecap="round"
          className="origin-center"
          style={{ animation: 'jarvis-rotate 18s linear infinite' }}
        />

        {/* Cross-hair lines */}
        <line x1="200" y1="60" x2="200" y2="100" stroke={colors.eye} strokeWidth="0.3" opacity="0.15" />
        <line x1="200" y1="300" x2="200" y2="340" stroke={colors.eye} strokeWidth="0.3" opacity="0.15" />
        <line x1="60" y1="200" x2="100" y2="200" stroke={colors.eye} strokeWidth="0.3" opacity="0.15" />
        <line x1="300" y1="200" x2="340" y2="200" stroke={colors.eye} strokeWidth="0.3" opacity="0.15" />

        {/* Eyes */}
        <g filter="url(#strongGlow)" style={{ transform: `scale(1, ${eyeScaleY})`, transformOrigin: '200px 175px', transition: 'transform 0.1s' }}>
          {/* Left eye */}
          <ellipse cx="160" cy="175" rx="28" ry="14" fill="url(#eyeGrad)" />
          <ellipse cx="160" cy="175" rx="18" ry="9" fill={colors.eye} opacity="0.9" />
          <ellipse cx="160" cy="175" rx="8" ry="8" fill="white" opacity="0.9" />
          <ellipse cx="162" cy="173" rx="3" ry="3" fill="white" />

          {/* Right eye */}
          <ellipse cx="240" cy="175" rx="28" ry="14" fill="url(#eyeGrad)" />
          <ellipse cx="240" cy="175" rx="18" ry="9" fill={colors.eye} opacity="0.9" />
          <ellipse cx="240" cy="175" rx="8" ry="8" fill="white" opacity="0.9" />
          <ellipse cx="242" cy="173" rx="3" ry="3" fill="white" />
        </g>

        {/* Eye connecting arc */}
        <path
          d="M 165 165 Q 200 145 235 165"
          fill="none"
          stroke={colors.eye}
          strokeWidth="0.8"
          opacity="0.3"
        />

        {/* Mouth */}
        <g filter="url(#glow)">
          <rect
            x="175"
            y="225"
            width="50"
            height={mouthHeight}
            rx="2"
            fill={colors.mouth}
            opacity="0.8"
            style={{ transition: 'height 0.1s ease-out' }}
          />
          {/* Mouth horizontal lines */}
          {agentState === 'speaking' && (
            <>
              <line x1="178" y1="228" x2="222" y2="228" stroke={colors.mouth} strokeWidth="0.5" opacity="0.4" />
              <line x1="180" y1="231" x2="220" y2="231" stroke={colors.mouth} strokeWidth="0.5" opacity="0.3" />
            </>
          )}
        </g>

        {/* Side data indicators */}
        <g opacity="0.2" className="origin-center" style={{ animation: 'jarvis-rotate 30s linear infinite' }}>
          <text x="70" y="140" fill={colors.eye} fontSize="8" fontFamily="monospace">SYS.OK</text>
          <text x="300" y="270" fill={colors.eye} fontSize="8" fontFamily="monospace">V2.1</text>
        </g>

        {/* Scan line effect */}
        <rect
          x="0" y="0" width="400" height="2"
          fill={colors.eye}
          opacity="0.08"
          className="origin-center"
          style={{ animation: 'jarvis-scanline 4s linear infinite' }}
        />
      </svg>

      {/* State label */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div
          className="rounded-full border px-3 py-1 text-[9px] font-medium tracking-[0.2em] uppercase backdrop-blur-md transition-all duration-500"
          style={{
            borderColor: `${colors.eye}33`,
            backgroundColor: `${colors.eye}15`,
            color: colors.eye,
            fontFamily: 'var(--font-orbitron), monospace',
          }}
        >
          {agentState}
        </div>
      </div>

      {/* Inline keyframes */}
      <style jsx>{`
        @keyframes jarvis-float {
          0% { transform: translateY(0) translateX(0); opacity: 0.1; }
          100% { transform: translateY(-20px) translateX(10px); opacity: 0.4; }
        }
        @keyframes jarvis-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes jarvis-scanline {
          0% { transform: translateY(-200px); }
          100% { transform: translateY(200px); }
        }
      `}</style>
    </div>
  );
}
