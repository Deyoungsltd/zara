// Voice Lock & Biometric Security System for ZARA

export type SecurityLevel = 'none' | 'voice' | 'biometric' | 'both';

const SECURITY_KEY = 'zara-security-level';
const VERIFIED_KEY = 'zara-verified-until';
const VERIFICATION_DURATION = 30 * 60 * 1000; // 30 minutes

export function getSecurityLevel(): SecurityLevel {
  if (typeof window === 'undefined') return 'none';
  try {
    return (localStorage.getItem(SECURITY_KEY) as SecurityLevel) || 'none';
  } catch { return 'none'; }
}

export function setSecurityLevel(level: SecurityLevel): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SECURITY_KEY, level); } catch { /* */ }
}

export function isVerified(): boolean {
  if (typeof window === 'undefined') return false;
  const level = getSecurityLevel();
  if (level === 'none') return true;
  try {
    const until = localStorage.getItem(VERIFIED_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch { return false; }
}

export function markVerified(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(VERIFIED_KEY, String(Date.now() + VERIFICATION_DURATION)); } catch { /* */ }
}

export async function verifyWithBiometric(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('credentials' in navigator)) return false;
  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        allowCredentials: [],
        userVerification: 'required',
      },
    });
    if (result) { markVerified(); return true; }
    return false;
  } catch { return false; }
}

export async function verifyWithVoice(): Promise<boolean> {
  return new Promise((resolve) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { resolve(false); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';
    let resolved = false;
    const done = (val: boolean) => { if (!resolved) { resolved = true; try { rec.stop(); } catch { /* */ } resolve(val); } };
    
    rec.onresult = (ev: any) => {
      const text = ev.results[0][0].transcript.toLowerCase().trim();
      if (text.includes('zara verify') || text.includes('confirm identity') || text.includes('i am here')) {
        markVerified(); done(true);
      } else {
        done(false);
      }
    };
    rec.onerror = () => done(false);
    rec.onend = () => done(false);
    
    setTimeout(() => done(false), 10000);
    try { rec.start(); } catch { done(false); }
  });
}

export function requireVerification(): boolean {
  const level = getSecurityLevel();
  if (level === 'none') return false;
  return !isVerified();
}