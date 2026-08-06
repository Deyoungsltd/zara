# Work Log

## 2025-01-XX — Major 3D Holographic Face Upgrade (jarvis-face.tsx)

**Scope:** Rewrite of the ZARA AI assistant holographic face from 873 → 1412 lines.

### Changes Made (12 features, all implemented):

1. **Detailed circuitry (22 new traces)** — Expanded from 11 to 33 PCB-style traces. All paths stored in shared `CIRCUIT_PATHS` constant for reuse.

2. **Junction nodes** — Added 32 small glowing dots at circuit intersections/corners via `JunctionNodes` component using `pointsMaterial`.

3. **Circuit energy pulse** — New `CircuitEnergyPulse` component uses `lineSegments` + custom vertex/fragment shader with `aProgress` attribute. Energy travels along all 33 circuit paths as a bright traveling pulse using `fract(aProgress - uTime * 0.1)`.

4. **Better eye design** — Added: second inner iris ring (r=0.035), 6 radial aperture lines per eye, eye halo glow rings behind each eye (`leftEyeHalo`/`rightEyeHalo` at r=0.3/0.17), and `EyeHaloGlow` component with soft radial shader glow.

5. **Thinking pulse on eyes** — `EyeGlow` shader now accepts `uThinkingPulse` uniform that modulates point size and brightness at 3Hz when state is 'thinking'. `EyeHaloGlow` also pulses.

6. **Idle eye look-around** — New `_eye` module-level state tracks `currentX/Y` and `lastMouseMove`. When mouse is still for 2+ seconds, eyes drift via dual-frequency sinusoidal pattern. Smooth lerp (0.015 idle / 0.08 tracking) prevents jarring transitions.

7. **Expression changes** — Eyebrow Y offset via refs: +0.04 when thinking (raise), -0.015 when listening (furrow). Mouth upper lip gets quadratic smile curve at corners when idle.

8. **Hexagonal grid background** — `HexGridBackground` component generates a flat-top hex wireframe grid spanning ±8 units at z=-2.5, rendered as `lineSegments` at opacity 0.035.

9. **Face plate mesh** — `FacePlateMesh` component uses `computeHeadOutline()` to build a `THREE.Shape` → `ShapeGeometry`, rendered with additive blending at opacity 0.03 for solid holographic projection feel.

10. **Nasolabial lines** — Curved lines from nose base (±0.06, -0.16) to mouth corners (±0.22, -0.38) with sinusoidal curvature, at 0.25 opacity.

11. **Chin definition** — Subtle curved line at y≈-0.74 with squared-corner profile, at 0.2 opacity.

12. **Temple details** — Small triangular decorative line groups (3 lines each) at both temples around (±1.08, 0.22).

13. **HUD data readouts** — `HudDataReadouts` component: 10 thin plane rectangles distributed around the outer HUD ring area, slowly co-rotating with the ring at 0.1 rad/s.

14. **Third HUD ring** — Added inner ring at radius 1.65, tilt (0.5, -0.15), 36 ticks, 2 arcs, speed 0.08, opacity 0.12.

15. **Energy waves** — `EnergyWaves` component: 4 concentric ring meshes that continuously pulse outward (phase-offset cycle), expanding 0.8→3.6 scale with quadratic opacity fade-out.

16. **Audio reactivity** — `JarvisScene` subscribes to `audioLevel` and applies `1 + audioLevel * 0.025` scale to the head group, creating a subtle breathing pulse during speech.

### Preserved:
- All original component names and functionality
- Module-level shared state pattern (`_mouse`, `_blink`, extended with `_eye`)
- Eye tracking, blinking, mouth sync, state colors, head tilt/sway/Float/Bloom
- Same imports: `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `three`
- Same store interface: `agentState`, `mouthOpen`, `audioLevel`
- Particle count: 2100 (1500+500+100), under 3000 limit
- Default export `JarvisFace()`
- All shader code inline
- No new dependencies

### Bloom adjustment:
- Intensity 0.7→0.8, luminanceThreshold 0.2→0.15 for richer glow with the new detail elements.

## 2026-08-06 — Backchanneling + Enhanced Audio Visualizer + Sound Effects

**Scope:** Added backchanneling system, enhanced audio visualizer, memory context injection, and new sound effects.

### Changes Made (4 features):

1. **Backchanneling system (page.tsx)** — New `useEffect` in `Home` component that subscribes to `agentState` via `useJarvisStore.subscribe`. When state transitions to `'listening'`, starts a recurring timer (4–7s random interval) that speaks a random affirmation phrase ('I see', 'right', 'yes', 'go on', 'mm-hmm', 'understood', 'continue') using `speechSynthesis` at volume 0.3, rate 1.3, pitch 1.1. A subtle click sound plays before each backchannel. The agentState stays `'listening'` — backchannels do not trigger `'speaking'`. Timer and subscription are cleaned up on unmount or when state leaves `'listening'`. Stored in `backchannelTimerRef`.

2. **Enhanced Audio Visualizer (page.tsx)** — Bars increased from 32→48. Canvas resolution increased to 384×64. Added glow effect per bar (`shadowBlur: 6`, `shadowColor` matching bar color). Added center line (thin white line at 50% height, 10% opacity). Added reflection effect: bars mirrored below the center line at 30% opacity with a fade-out gradient. Bars now grow upward and downward from center.

3. **Memory context injection (page.tsx)** — In `sendToJarvis()`, before the API call, `getMemoryContext()` is called. If context exists, two synthetic messages are unshifted to `apiMessages`: an assistant acknowledgment and a user message wrapping the memory context.

4. **New sound effects (audio-system.ts)** — Added three new `SoundProfile` entries:
   - `success`: 523→1047Hz sine sweep, 0.2s, volume 0.3
   - `notification`: 880Hz + 1100Hz (0.12s delay) two-note sine chime, volume 0.2
   - `backchannel`: 300→350Hz sine, 0.08s, volume 0.15
   Updated `playSoundEffect` type union to include all three. Special two-note handler added for `notification`.

## 2025-01-XX — Screen Capture + Google Calendar API Integration

**Scope:** Added screen capture button to chat input bar, created calendar API route, and integrated calendar as a JARVIS tool.

### Changes Made (3 features):

1. **Screen Capture Button (page.tsx)** — Added `Monitor` icon import from lucide-react. Added a new screen capture button in the ChatInput toolbar, placed after the Camera button. The `handleScreenCapture` callback uses `navigator.mediaDevices.getDisplayMedia({ video: true })` to capture the screen, creates an offscreen video element, plays the stream for 200ms, draws a single frame to an offscreen canvas, stops all stream tracks, converts to base64 data URL, and sends it to `sendToJarvis('What do you see in this screenshot?', base64)`. Gracefully handles user cancellation.

2. **Calendar API Route (api/calendar/route.ts)** — Created new Next.js API route with GET/POST/DELETE handlers. In-memory event store (Array with id, title, date, time, description, created). GET supports optional `date` filter (YYYY-MM-DD). POST validates title/date required, defaults time to 09:00. DELETE requires event ID via query param, returns 404 if not found.

3. **Calendar JARVIS Tool (api/jarvis/route.ts)** — Added `manage_calendar` tool definition to TOOLS array with actions: create, view, delete. Added `'manage_calendar'` to T1 tier (auto-executes without approval). Added `case 'manage_calendar'` in `executeTool` with three sub-handlers: create (POST), view (GET with date filter), delete (DELETE with event ID). Updated SYSTEM_PROMPT to mention calendar capabilities.

## 2025-01-XX — PWA Install Prompt + Enhanced Service Worker + Voice Lock / Biometric Security

**Scope:** Added PWA install prompt UI, enhanced service worker with push notifications, and voice lock/biometric security system.

### Changes Made (5 features):

1. **PWA Install Prompt (page.tsx)** — Added `installPrompt` state to `Home` component. Added `beforeinstallprompt` event listener in the main `useEffect` that captures and stores the deferred prompt event. Added `handleInstallClick` callback that calls `(installPrompt as any).prompt()` and clears the state. Passed `installPrompt` and `onInstallClick` as props to `StatusBar`.

2. **Install Button in StatusBar (page.tsx)** — Added `Download` icon import from lucide-react. `StatusBar` component now accepts `installPrompt` and `onInstallClick` props. When `installPrompt` is not null, renders a cyan-tinted download button with tooltip "Install ZARA as an app". Button is conditionally rendered only when the install prompt is available.

3. **Enhanced Service Worker (public/sw.js)** — Rewrote with cache version bump to `zara-v3`. Pre-caches 4 assets: `/`, `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png`. Implements three-tier caching strategy: cache-first for static assets (JS, CSS, images, fonts), network-first for API calls with offline fallback (503), stale-while-revalidate for HTML pages. Added push notification handler (`push` event) that shows notifications with title, body, icon, badge, vibration pattern, and tag. Added `notificationclick` handler that focuses existing window or opens new one.

4. **Voice Lock / Biometric Security System (src/lib/security.ts)** — Created new module exporting: `SecurityLevel` type (`'none' | 'voice' | 'biometric' | 'both'`), `getSecurityLevel()` / `setSecurityLevel()` for localStorage persistence, `isVerified()` / `markVerified()` with 30-minute verification duration, `verifyWithBiometric()` using WebAuthn `navigator.credentials.get()` with userVerification required, `verifyWithVoice()` using Web Speech API listening for passphrase phrases ("zara verify", "confirm identity", "i am here") with 10-second timeout, and `requireVerification()` guard that checks if current session needs re-verification.

5. **Security Integration in UI (page.tsx)** — (a) `PendingActionCard` now checks `requireVerification()` before confirming actions. If verification required, shows spinner with "Verifying..." text, attempts biometric then voice verification based on security level, shows red error on failure with `playSoundEffect('error')`. (b) `StatusBar` security toggle button cycles through none → biometric → voice → both → none on click. Icon changes: `LockOpen` (none), `Lock` (biometric), `Mic` (voice), `ShieldCheck` (both). Active security levels shown with amber styling. Tooltip displays current security mode. `Home` component manages `securityLevel` state synced with localStorage via `getSecurityLevel`/`setSecurityLevel`.
