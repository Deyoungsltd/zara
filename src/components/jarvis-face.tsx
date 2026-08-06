'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useJarvisStore } from '@/lib/jarvis-store';
import type { AgentState } from '@/lib/jarvis-store';

/* ================================================================
   MODULE-LEVEL SHARED STATE (eye tracking, blink, idle look-around)
   ================================================================ */

const _mouse = { x: 0, y: 0 };
const _blink = {
  scale: 1,
  timer: 0,
  nextBlink: 3 + Math.random() * 2,
  active: false,
  elapsed: 0,
};
const _eye = {
  currentX: 0,
  currentY: 0,
  lastMouseMove: 0,
};

/* ================================================================
   HELPERS
   ================================================================ */

function ellipsePoints(
  cx: number, cy: number, rx: number, ry: number, n: number,
  startAngle = 0, endAngle = Math.PI * 2,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0]);
  }
  return pts;
}

function getStateColors(state: AgentState) {
  const base = {
    eye: '#00e8ff',
    mouth: '#00ffdd',
    hudRing: '#00d4ff',
    glow: '#00d4ff',
    circuitry: '#00a8c8',
    scanLine: '#00e8ff',
    particle: '#00d4ff',
    dataStream: '#00e8ff',
    innerGlow: '#00d4ff',
  };
  switch (state) {
    case 'listening':
      return { ...base, eye: '#ffb347', mouth: '#ffb347', scanLine: '#ffb347', dataStream: '#ffb347' };
    case 'thinking':
      return {
        ...base,
        eye: '#d0ffff',
        mouth: '#e0fcff',
        glow: '#d0ffff',
        hudRing: '#b0e8ff',
        scanLine: '#d0ffff',
        dataStream: '#d0ffff',
        particle: '#b0e8ff',
        innerGlow: '#d0ffff',
      };
    case 'speaking':
      return { ...base, mouth: '#00ffaa', scanLine: '#00ffaa', dataStream: '#00ffaa' };
    case 'executing':
      return {
        ...base,
        hudRing: '#a855f7',
        circuitry: '#7c3aed',
        scanLine: '#a855f7',
        glow: '#a855f7',
        dataStream: '#a855f7',
        particle: '#a855f7',
        innerGlow: '#a855f7',
      };
    default:
      return base;
  }
}

function computeHeadOutline(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    let r = 1.3;
    const y = Math.sin(a);
    if (y < 0) r += y * 0.25;
    if (Math.abs(Math.cos(a)) < 0.9) r += 0.06;
    if (y > 0.7) r += 0.04;
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 1.15, 0]);
  }
  return pts;
}

/* ================================================================
   CIRCUIT PATHS – 33 PCB-style traces (shared data)
   ================================================================ */

const CIRCUIT_PATHS: [number, number, number][][] = [
  /* ── Original 11 ─────────────────────────────────────────────── */
  // 1. Left temple → left cheekbone
  [[-1.05,0.15,0.01],[-0.85,0.15,0.01],[-0.85,-0.1,0.01],[-0.7,-0.1,0.01],[-0.7,-0.35,0.01],[-0.52,-0.35,0.01]],
  // 2. Right temple → right cheekbone
  [[1.05,0.15,0.01],[0.85,0.15,0.01],[0.85,-0.1,0.01],[0.7,-0.1,0.01],[0.7,-0.35,0.01],[0.52,-0.35,0.01]],
  // 3. Left forehead horizontal
  [[-0.88,0.68,0.01],[-0.55,0.72,0.01],[-0.25,0.68,0.01],[0.05,0.72,0.01]],
  // 4. Right forehead horizontal
  [[0.88,0.68,0.01],[0.55,0.72,0.01],[0.25,0.68,0.01],[-0.05,0.72,0.01]],
  // 5. Left cheek contour
  [[-0.62,-0.05,0.01],[-0.75,-0.15,0.01],[-0.82,-0.32,0.01],[-0.76,-0.5,0.01],[-0.58,-0.66,0.01]],
  // 6. Right cheek contour
  [[0.62,-0.05,0.01],[0.75,-0.15,0.01],[0.82,-0.32,0.01],[0.76,-0.5,0.01],[0.58,-0.66,0.01]],
  // 7. Center forehead vertical
  [[0,0.95,0.01],[0,0.78,0.01],[0,0.55,0.01]],
  // 8. Left temple → jaw
  [[-1.0,0.02,0.01],[-0.92,0.02,0.01],[-0.92,-0.4,0.01],[-0.82,-0.4,0.01],[-0.82,-0.72,0.01]],
  // 9. Right temple → jaw
  [[1.0,0.02,0.01],[0.92,0.02,0.01],[0.92,-0.4,0.01],[0.82,-0.4,0.01],[0.82,-0.72,0.01]],
  // 10. Nose bridge → left cheek
  [[-0.04,-0.02,0.02],[-0.15,-0.1,0.02],[-0.28,-0.1,0.02],[-0.32,-0.22,0.02]],
  // 11. Nose bridge → right cheek
  [[0.04,-0.02,0.02],[0.15,-0.1,0.02],[0.28,-0.1,0.02],[0.32,-0.22,0.02]],

  /* ── New 22 traces ───────────────────────────────────────────── */
  // 12. Forehead left vertical rise
  [[-0.55,0.72,0.01],[-0.55,0.85,0.01],[-0.55,0.92,0.01]],
  // 13. Forehead right vertical rise
  [[0.55,0.72,0.01],[0.55,0.85,0.01],[0.55,0.92,0.01]],
  // 14. Left eyebrow → forehead trace
  [[-0.58,0.44,0.02],[-0.58,0.52,0.01],[-0.45,0.6,0.01],[-0.25,0.68,0.01]],
  // 15. Right eyebrow → forehead trace
  [[0.58,0.44,0.02],[0.58,0.52,0.01],[0.45,0.6,0.01],[0.25,0.68,0.01]],
  // 16. Left cheek inner parallel
  [[-0.52,0.0,0.01],[-0.62,-0.12,0.01],[-0.68,-0.28,0.01],[-0.62,-0.45,0.01],[-0.48,-0.58,0.01]],
  // 17. Right cheek inner parallel
  [[0.52,0.0,0.01],[0.62,-0.12,0.01],[0.68,-0.28,0.01],[0.62,-0.45,0.01],[0.48,-0.58,0.01]],
  // 18. Left jaw branch → chin
  [[-0.82,-0.4,0.01],[-0.7,-0.5,0.01],[-0.5,-0.6,0.01],[-0.3,-0.68,0.01]],
  // 19. Right jaw branch → chin
  [[0.82,-0.4,0.01],[0.7,-0.5,0.01],[0.5,-0.6,0.01],[0.3,-0.68,0.01]],
  // 20. Left temple upper decorative
  [[-1.05,0.15,0.01],[-1.1,0.25,0.01],[-1.05,0.35,0.01],[-0.95,0.42,0.01]],
  // 21. Right temple upper decorative
  [[1.05,0.15,0.01],[1.1,0.25,0.01],[1.05,0.35,0.01],[0.95,0.42,0.01]],
  // 22. Forehead center-left branch
  [[-0.25,0.68,0.01],[-0.25,0.58,0.01],[-0.2,0.5,0.01]],
  // 23. Forehead center-right branch
  [[0.25,0.68,0.01],[0.25,0.58,0.01],[0.2,0.5,0.01]],
  // 24. Center lower vertical
  [[0,0.55,0.01],[0,0.42,0.02],[0,0.3,0.02]],
  // 25. Left sideburn trace
  [[-1.0,0.02,0.01],[-1.05,-0.1,0.01],[-1.0,-0.22,0.01],[-0.95,-0.35,0.01]],
  // 26. Right sideburn trace
  [[1.0,0.02,0.01],[1.05,-0.1,0.01],[1.0,-0.22,0.01],[0.95,-0.35,0.01]],
  // 27. Left eye orbital detail
  [[-0.6,0.25,0.015],[-0.6,0.32,0.015],[-0.5,0.38,0.015],[-0.38,0.4,0.015]],
  // 28. Right eye orbital detail
  [[0.6,0.25,0.015],[0.6,0.32,0.015],[0.5,0.38,0.015],[0.38,0.4,0.015]],
  // 29. Chin horizontal connect
  [[-0.3,-0.68,0.01],[-0.1,-0.72,0.01],[0.1,-0.72,0.01],[0.3,-0.68,0.01]],
  // 30. Left mouth corner → jaw
  [[-0.22,-0.4,0.02],[-0.35,-0.45,0.02],[-0.45,-0.55,0.02]],
  // 31. Right mouth corner → jaw
  [[0.22,-0.4,0.02],[0.35,-0.45,0.02],[0.45,-0.55,0.02]],
  // 32. Left forehead T-junction
  [[-0.88,0.68,0.01],[-0.88,0.55,0.01],[-0.82,0.45,0.01]],
  // 33. Right forehead T-junction
  [[0.88,0.68,0.01],[0.88,0.55,0.01],[0.82,0.45,0.01]],
];

const CIRCUIT_WIDTHS = [
  0.6, 0.6, 0.5, 0.5, 0.7, 0.7, 0.5, 0.5, 0.5, 0.6, 0.6,
  0.4, 0.4, 0.5, 0.5, 0.5, 0.5, 0.4, 0.4, 0.5, 0.5,
  0.4, 0.4, 0.4, 0.5, 0.5, 0.3, 0.3, 0.4, 0.4, 0.4, 0.4, 0.4,
];

/* Junction nodes at circuit intersections / corners */
const JUNCTION_NODES: [number, number, number][] = [
  [-1.05,0.15,0.01],[1.05,0.15,0.01],
  [-0.85,0.15,0.01],[0.85,0.15,0.01],
  [-0.85,-0.1,0.01],[0.85,-0.1,0.01],
  [-0.7,-0.1,0.01],[0.7,-0.1,0.01],
  [-0.7,-0.35,0.01],[0.7,-0.35,0.01],
  [-0.25,0.68,0.01],[0.25,0.68,0.01],
  [-0.05,0.72,0.01],
  [0,0.95,0.01],[0,0.78,0.01],[0,0.55,0.01],
  [-0.92,0.02,0.01],[0.92,0.02,0.01],
  [-0.92,-0.4,0.01],[0.92,-0.4,0.01],
  [-0.82,-0.4,0.01],[0.82,-0.4,0.01],
  [-0.55,0.72,0.01],[0.55,0.72,0.01],
  [-0.58,0.44,0.01],[0.58,0.44,0.01],
  [-0.3,-0.68,0.01],[0.3,-0.68,0.01],
  [-1.1,0.25,0.01],[1.1,0.25,0.01],
  [-0.88,0.68,0.01],[0.88,0.68,0.01],
  [-1.0,0.02,0.01],[1.0,0.02,0.01],
  [-0.6,0.25,0.015],[0.6,0.25,0.015],
];

/* ================================================================
   CIRCUITRY LINES – 33 circuit-board traces with junction nodes
   ================================================================ */

function CircuitryLines({ opacity, color }: { opacity: number; color: string }) {
  return (
    <group>
      {CIRCUIT_PATHS.map((path, i) => (
        <Line key={i} points={path} color={color} lineWidth={CIRCUIT_WIDTHS[i] || 0.5} transparent opacity={opacity * 0.2} />
      ))}
      {/* Junction nodes */}
      <JunctionNodes opacity={opacity} color={color} />
    </group>
  );
}

/* ================================================================
   JUNCTION NODES – Small dots at circuit intersections
   ================================================================ */

function JunctionNodes({ opacity, color }: { opacity: number; color: string }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(JUNCTION_NODES.flat(), 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial
        size={0.025}
        color={color}
        transparent
        opacity={opacity * 0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ================================================================
   CIRCUIT ENERGY PULSE – Traveling energy along circuit paths (shader)
   ================================================================ */

function CircuitEnergyPulse() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const colorObj = useMemo(() => new THREE.Color(), []);

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const progress: number[] = [];

    for (const path of CIRCUIT_PATHS) {
      if (path.length < 2) continue;
      // Cumulative distances
      const dists: number[] = [0];
      for (let i = 1; i < path.length; i++) {
        const dx = path[i][0] - path[i - 1][0];
        const dy = path[i][1] - path[i - 1][1];
        const dz = path[i][2] - path[i - 1][2];
        dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz));
      }
      const totalLen = dists[dists.length - 1] || 1;
      // Create line segments
      for (let i = 0; i < path.length - 1; i++) {
        positions.push(path[i][0], path[i][1], path[i][2]);
        progress.push(dists[i] / totalLen);
        positions.push(path[i + 1][0], path[i + 1][1], path[i + 1][2]);
        progress.push(dists[i + 1] / totalLen);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aProgress', new THREE.Float32BufferAttribute(progress, 1));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    const state = useJarvisStore.getState().agentState;
    const c = getStateColors(state).circuitry;
    colorObj.set(c);
    matRef.current.uniforms.uColor.value = colorObj;
  });

  return (
    <lineSegments geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={{
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#00a8c8') },
        }}
        vertexShader={`
          attribute float aProgress;
          uniform float uTime;
          varying float vPulse;
          void main() {
            float wave = fract(aProgress - uTime * 0.1);
            float pulse = pow(max(0.0, 1.0 - abs(wave - 0.5) * 4.0), 6.0);
            vPulse = pulse;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vPulse;
          void main() {
            vec3 c = uColor * (1.0 + vPulse * 3.0);
            float alpha = vPulse * 0.7;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(c, alpha);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

/* ================================================================
   SCAN LINE – Horizontal holographic sweep
   ================================================================ */

function ScanLine({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = Math.sin(clock.getElapsedTime() * 0.5) * 1.2;
    }
  });
  return (
    <mesh ref={ref}>
      <planeGeometry args={[2.6, 0.01]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ================================================================
   HEXAGONAL GRID BACKGROUND – Subtle sci-fi wireframe
   ================================================================ */

function HexGridBackground() {
  const geo = useMemo(() => {
    const positions: number[] = [];
    const size = 8;
    const hexR = 0.35;
    const sqrt3 = Math.sqrt(3);
    const cols = Math.ceil(size / (hexR * 1.5));
    const rows = Math.ceil(size / (hexR * sqrt3));

    for (let col = -cols; col <= cols; col++) {
      for (let row = -rows; row <= rows; row++) {
        const cx = col * hexR * 1.5;
        const cy = row * hexR * sqrt3 + (Math.abs(col) % 2 === 1 ? hexR * sqrt3 * 0.5 : 0);
        if (Math.abs(cx) > size || Math.abs(cy) > size) continue;
        for (let k = 0; k < 6; k++) {
          const a1 = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const a2 = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 6;
          positions.push(
            cx + Math.cos(a1) * hexR, cy + Math.sin(a1) * hexR, -2.5,
            cx + Math.cos(a2) * hexR, cy + Math.sin(a2) * hexR, -2.5,
          );
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#00d4ff" transparent opacity={0.035} depthWrite={false} />
    </lineSegments>
  );
}

/* ================================================================
   FACE PLATE MESH – Semi-transparent holographic projection fill
   ================================================================ */

function FacePlateMesh({ color }: { color: string }) {
  const geo = useMemo(() => {
    const outline = computeHeadOutline();
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) {
      shape.lineTo(outline[i][0], outline[i][1]);
    }
    return new THREE.ShapeGeometry(shape);
  }, []);

  return (
    <mesh geometry={geo} position={[0, 0, -0.01]}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.03}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ================================================================
   HEAD WIREFRAME – Face with eye tracking, blinking, expressions,
   nasolabial lines, chin, temples, state colors
   ================================================================ */

function HeadWireframe() {
  const mouthOpen = useJarvisStore((s) => s.mouthOpen);
  const agentState = useJarvisStore((s) => s.agentState);

  /* ── Mouse tracking (module-level shared) ───────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      _mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      _mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      _eye.lastMouseMove = performance.now();
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  /* ── Refs ───────────────────────────────────────────────────── */
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const leftIrisRef = useRef<THREE.Group>(null);
  const rightIrisRef = useRef<THREE.Group>(null);
  const leftBrowRef = useRef<THREE.Group>(null);
  const rightBrowRef = useRef<THREE.Group>(null);

  /* ── Blink + eye tracking + idle look-around in useFrame ────── */
  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    // Blink logic
    if (_blink.active) {
      _blink.elapsed += delta;
      if (_blink.elapsed < 0.075) {
        _blink.scale = 0.05;
      } else {
        _blink.scale = 1;
        _blink.active = false;
        _blink.elapsed = 0;
        _blink.timer = 0;
        _blink.nextBlink = 3 + Math.random() * 2;
      }
    } else {
      _blink.timer += delta;
      if (_blink.timer >= _blink.nextBlink) {
        _blink.active = true;
        _blink.elapsed = 0;
        _blink.scale = 0.05;
      }
    }

    const bScale = _blink.scale;

    // Idle look-around: sinusoidal drift when mouse is still
    const isIdle = performance.now() - _eye.lastMouseMove > 2000;
    let targetX: number, targetY: number;
    if (isIdle) {
      targetX = Math.sin(t * 0.3) * 0.025 + Math.sin(t * 0.17 + 2.0) * 0.012;
      targetY = Math.sin(t * 0.2 + 1.5) * 0.015 + Math.cos(t * 0.13 + 0.7) * 0.008;
    } else {
      targetX = _mouse.x * 0.04;
      targetY = _mouse.y * 0.04;
    }
    const lerp = isIdle ? 0.015 : 0.08;
    _eye.currentX += (targetX - _eye.currentX) * lerp;
    _eye.currentY += (targetY - _eye.currentY) * lerp;

    if (leftEyeRef.current) leftEyeRef.current.scale.y = bScale;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = bScale;
    if (leftIrisRef.current) { leftIrisRef.current.position.x = _eye.currentX; leftIrisRef.current.position.y = _eye.currentY; }
    if (rightIrisRef.current) { rightIrisRef.current.position.x = _eye.currentX; rightIrisRef.current.position.y = _eye.currentY; }

    // Expression: eyebrow Y offset
    const browOffset = agentState === 'thinking' ? 0.04 : agentState === 'listening' ? -0.015 : 0;
    if (leftBrowRef.current) leftBrowRef.current.position.y = browOffset;
    if (rightBrowRef.current) rightBrowRef.current.position.y = browOffset;
  });

  /* ── State-reactive colors ─────────────────────────────────── */
  const colors = useMemo(() => getStateColors(agentState), [agentState]);
  const baseOpacity = agentState === 'idle' ? 0.6 : agentState === 'thinking' ? 0.8 : 1.0;

  /* ── Geometries ────────────────────────────────────────────── */
  const headOutline = useMemo(() => computeHeadOutline(), []);

  // Eyes
  const leftEye = useMemo(() => ellipsePoints(-0.38, 0.25, 0.22, 0.1, 32), []);
  const rightEye = useMemo(() => ellipsePoints(0.38, 0.25, 0.22, 0.1, 32), []);
  const leftIris = useMemo(() => ellipsePoints(-0.38, 0.25, 0.09, 0.09, 24), []);
  const rightIris = useMemo(() => ellipsePoints(0.38, 0.25, 0.09, 0.09, 24), []);
  // Second inner iris ring
  const leftIrisInner = useMemo(() => ellipsePoints(-0.38, 0.25, 0.035, 0.035, 18), []);
  const rightIrisInner = useMemo(() => ellipsePoints(0.38, 0.25, 0.035, 0.035, 18), []);
  // Eye halo (larger, faint glow circle)
  const leftEyeHalo = useMemo(() => ellipsePoints(-0.38, 0.25, 0.3, 0.17, 32), []);
  const rightEyeHalo = useMemo(() => ellipsePoints(0.38, 0.25, 0.3, 0.17, 32), []);
  // Iris radial lines (camera aperture)
  const irisRadials = useMemo(() => {
    const lines: { pts: [number, number, number][] }[] = [];
    const count = 6;
    for (const cx of [-0.38, 0.38]) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        lines.push({
          pts: [
            [cx + Math.cos(a) * 0.015, 0.25 + Math.sin(a) * 0.015, 0.04],
            [cx + Math.cos(a) * 0.075, 0.25 + Math.sin(a) * 0.075, 0.04],
          ],
        });
      }
    }
    return lines;
  }, []);

  // Nose
  const noseBridge = useMemo(() => [[0, 0.42, 0.02], [0, 0.02, 0.05]] as [number, number, number][], []);
  const noseLeft = useMemo(() => [[0, 0.02, 0.05], [-0.1, -0.12, 0.03], [0, -0.16, 0.03]] as [number, number, number][], []);
  const noseRight = useMemo(() => [[0, 0.02, 0.05], [0.1, -0.12, 0.03], [0, -0.16, 0.03]] as [number, number, number][], []);

  // Mouth with idle smile
  const mouthUpper = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const t2 = i / 20;
      const x = (t2 - 0.5) * 2 * 0.25;
      const cornerFactor = Math.pow(Math.abs(t2 - 0.5) * 2, 2);
      const smileCurve = agentState === 'idle' ? cornerFactor * 0.018 : 0;
      const curve = -Math.abs(t2 - 0.5) * 2 * 0.04 + smileCurve;
      pts.push([x, -0.45 + curve, 0.03]);
    }
    return pts;
  }, [mouthOpen, agentState]);

  const mouthLower = useMemo(() => {
    const mo = mouthOpen * 0.1;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const t2 = i / 20;
      const x = (t2 - 0.5) * 2 * 0.25;
      const curve = Math.abs(t2 - 0.5) * 2 * 0.05 + mo;
      pts.push([x, -0.45 + curve, 0.03]);
    }
    return pts;
  }, [mouthOpen]);

  // Eyebrows (same shape, offset applied via ref for expressions)
  const leftBrow = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t2 = i / 16;
      pts.push([-0.58 + t2 * 0.4, 0.44 + Math.sin(t2 * Math.PI) * 0.07, 0.02]);
    }
    return pts;
  }, []);
  const rightBrow = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t2 = i / 16;
      pts.push([0.58 - t2 * 0.4, 0.44 + Math.sin(t2 * Math.PI) * 0.07, 0.02]);
    }
    return pts;
  }, []);

  // Jaw line
  const jawLine = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 30; i++) {
      const t2 = i / 30;
      const a = Math.PI * 0.6 + t2 * Math.PI * 0.8;
      let r = 1.32;
      const y = Math.sin(a);
      if (y < 0) r += y * 0.3;
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 1.15, -0.03]);
    }
    return pts;
  }, []);

  // Nasolabial lines (nose to mouth corners)
  const nasolabialLeft = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t2 = i / 8;
      const x = -0.06 - t2 * 0.16;
      const y = -0.16 - t2 * 0.22;
      const curve = -Math.sin(t2 * Math.PI) * 0.02;
      pts.push([x, y + curve, 0.025]);
    }
    return pts;
  }, []);
  const nasolabialRight = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t2 = i / 8;
      const x = 0.06 + t2 * 0.16;
      const y = -0.16 - t2 * 0.22;
      const curve = -Math.sin(t2 * Math.PI) * 0.02;
      pts.push([x, y + curve, 0.025]);
    }
    return pts;
  }, []);

  // Chin definition line
  const chinLine = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const t2 = i / 10;
      const x = (t2 - 0.5) * 2 * 0.22;
      const y = -0.74 + Math.pow(Math.abs(t2 - 0.5) * 2, 1.8) * 0.05;
      pts.push([x, y, 0.02]);
    }
    return pts;
  }, []);

  // Temple decorative elements
  const leftTempleDetail = useMemo(() => [
    [[-1.08, 0.18, 0.01], [-1.12, 0.22, 0.01]] as [number, number, number][],
    [[-1.12, 0.22, 0.01], [-1.08, 0.26, 0.01]] as [number, number, number][],
    [[-1.08, 0.26, 0.01], [-1.04, 0.22, 0.01]] as [number, number, number][],
  ], []);
  const rightTempleDetail = useMemo(() => [
    [[1.08, 0.18, 0.01], [1.12, 0.22, 0.01]] as [number, number, number][],
    [[1.12, 0.22, 0.01], [1.08, 0.26, 0.01]] as [number, number, number][],
    [[1.08, 0.26, 0.01], [1.04, 0.22, 0.01]] as [number, number, number][],
  ], []);

  return (
    <group>
      {/* Face plate mesh (solid holographic fill) */}
      <FacePlateMesh color={colors.glow} />

      {/* Head outline */}
      <Line points={headOutline} color={colors.circuitry} lineWidth={1.2} transparent opacity={baseOpacity * 0.5} />
      <Line points={jawLine} color={colors.circuitry} lineWidth={1} transparent opacity={baseOpacity * 0.4} />

      {/* ── Left Eye (blink + tracking) ────────────────────── */}
      <group ref={leftEyeRef}>
        {/* Eye halo (outer glow) */}
        <Line points={leftEyeHalo} color={colors.eye} lineWidth={1} transparent opacity={baseOpacity * 0.12} />
        {/* Eye outline */}
        <Line points={leftEye} color={colors.eye} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
        <group ref={leftIrisRef}>
          {/* Iris ring */}
          <Line points={leftIris} color={colors.eye} lineWidth={1.5} transparent opacity={baseOpacity} />
          {/* Inner iris ring */}
          <Line points={leftIrisInner} color={colors.eye} lineWidth={1} transparent opacity={baseOpacity * 0.7} />
          {/* Aperture radial lines */}
          {irisRadials.slice(0, 6).map((line, i) => (
            <Line key={`lr${i}`} points={line.pts} color={colors.eye} lineWidth={0.8} transparent opacity={baseOpacity * 0.5} />
          ))}
        </group>
      </group>

      {/* ── Right Eye (blink + tracking) ───────────────────── */}
      <group ref={rightEyeRef}>
        <Line points={rightEyeHalo} color={colors.eye} lineWidth={1} transparent opacity={baseOpacity * 0.12} />
        <Line points={rightEye} color={colors.eye} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
        <group ref={rightIrisRef}>
          <Line points={rightIris} color={colors.eye} lineWidth={1.5} transparent opacity={baseOpacity} />
          <Line points={rightIrisInner} color={colors.eye} lineWidth={1} transparent opacity={baseOpacity * 0.7} />
          {irisRadials.slice(6, 12).map((line, i) => (
            <Line key={`rr${i}`} points={line.pts} color={colors.eye} lineWidth={0.8} transparent opacity={baseOpacity * 0.5} />
          ))}
        </group>
      </group>

      {/* Nose */}
      <Line points={noseBridge} color={colors.eye} lineWidth={1.5} transparent opacity={baseOpacity * 0.7} />
      <Line points={noseLeft} color={colors.eye} lineWidth={1.2} transparent opacity={baseOpacity * 0.6} />
      <Line points={noseRight} color={colors.eye} lineWidth={1.2} transparent opacity={baseOpacity * 0.6} />

      {/* Mouth */}
      <Line points={mouthUpper} color={colors.mouth} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
      <Line points={mouthLower} color={colors.mouth} lineWidth={2} transparent opacity={baseOpacity * 0.9} />

      {/* Eyebrows (with expression offset via ref) */}
      <group ref={leftBrowRef}>
        <Line points={leftBrow} color={colors.eye} lineWidth={2.5} transparent opacity={baseOpacity * 0.85} />
      </group>
      <group ref={rightBrowRef}>
        <Line points={rightBrow} color={colors.eye} lineWidth={2.5} transparent opacity={baseOpacity * 0.85} />
      </group>

      {/* Nasolabial lines (laugh lines) */}
      <Line points={nasolabialLeft} color={colors.eye} lineWidth={0.8} transparent opacity={baseOpacity * 0.25} />
      <Line points={nasolabialRight} color={colors.eye} lineWidth={0.8} transparent opacity={baseOpacity * 0.25} />

      {/* Chin definition */}
      <Line points={chinLine} color={colors.eye} lineWidth={0.7} transparent opacity={baseOpacity * 0.2} />

      {/* Temple decorative elements */}
      {leftTempleDetail.map((pts, i) => (
        <Line key={`lt${i}`} points={pts} color={colors.eye} lineWidth={0.8} transparent opacity={baseOpacity * 0.35} />
      ))}
      {rightTempleDetail.map((pts, i) => (
        <Line key={`rt${i}`} points={pts} color={colors.eye} lineWidth={0.8} transparent opacity={baseOpacity * 0.35} />
      ))}

      {/* ── Circuitry Lines (33 traces + junction nodes) ────── */}
      <CircuitryLines opacity={baseOpacity} color={colors.circuitry} />

      {/* ── Scan Line ──────────────────────────────────────── */}
      <ScanLine color={colors.scanLine} />
    </group>
  );
}

/* ================================================================
   EYE GLOW – Bright pupil dots with blink, tracking, thinking pulse
   ================================================================ */

function EyeGlow() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [[-0.38, 0.25, 0.06], [0.38, 0.25, 0.06]].flat(), 3,
    ));
    return g;
  }, []);

  const colorObj = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const t = clock.getElapsedTime();
    matRef.current.uniforms.uTime.value = t;
    const state = useJarvisStore.getState().agentState;
    colorObj.set(getStateColors(state).eye);
    matRef.current.uniforms.uColor.value = colorObj;
    matRef.current.uniforms.uBlink.value = _blink.scale;
    matRef.current.uniforms.uMouseX.value = _eye.currentX;
    matRef.current.uniforms.uMouseY.value = _eye.currentY;
    // Thinking pulse
    const thinkingPulse = state === 'thinking' ? 1.0 + 0.4 * Math.sin(t * 3.0) : 1.0;
    matRef.current.uniforms.uThinkingPulse.value = thinkingPulse;
  });

  return (
    <points geometry={geo}>
      <shaderMaterial
        ref={matRef}
        uniforms={{
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#00e8ff') },
          uBlink: { value: 1 },
          uMouseX: { value: 0 },
          uMouseY: { value: 0 },
          uThinkingPulse: { value: 1 },
        }}
        vertexShader={`
          uniform float uTime;
          uniform float uMouseX;
          uniform float uMouseY;
          uniform float uThinkingPulse;
          varying float vPulse;
          void main() {
            vec3 p = position;
            p.x += uMouseX;
            p.y += uMouseY;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (8.0 + 2.0 * (uThinkingPulse - 1.0)) * (200.0 / -mv.z);
            vPulse = uThinkingPulse;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uBlink;
          varying float vPulse;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float g = 1.0 - smoothstep(0.0, 0.5, d);
            vec3 c = mix(uColor * 0.7, vec3(1.0), pow(g, 2.5));
            c *= (0.85 + 0.15 * vPulse);
            gl_FragColor = vec4(c, g * 0.9 * uBlink);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ================================================================
   EYE HALO GLOW – Soft radial glow behind each eye
   ================================================================ */

function EyeHaloGlow() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [[-0.38, 0.25, 0.02], [0.38, 0.25, 0.02]].flat(), 3,
    ));
    return g;
  }, []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    const state = useJarvisStore.getState().agentState;
    colorObj.set(getStateColors(state).eye);
    matRef.current.uniforms.uColor.value = colorObj;
    matRef.current.uniforms.uBlink.value = _blink.scale;
    const tp = state === 'thinking' ? 1.0 + 0.3 * Math.sin(clock.getElapsedTime() * 3.0) : 1.0;
    matRef.current.uniforms.uPulse.value = tp;
  });

  return (
    <points geometry={geo}>
      <shaderMaterial
        ref={matRef}
        uniforms={{
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#00e8ff') },
          uBlink: { value: 1 },
          uPulse: { value: 1 },
        }}
        vertexShader={`
          uniform float uTime;
          uniform float uPulse;
          uniform float uBlink;
          varying float vBlink;
          varying float vPulse;
          void main() {
            vec3 p = position;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (40.0 * uPulse) * (200.0 / -mv.z);
            vBlink = uBlink;
            vPulse = uPulse;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vBlink;
          varying float vPulse;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float g = pow(1.0 - d * 2.0, 3.0);
            gl_FragColor = vec4(uColor, g * 0.06 * vBlink * vPulse);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ================================================================
   PARTICLE CLOUD – Holographic particles around head (state color)
   ================================================================ */

function ParticleCloud() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const colorObj = useMemo(() => new THREE.Color(), []);

  const { geometry, uniforms } = useMemo(() => {
    const count = 1500;
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.35 + Math.random() * 0.5;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 1.15;
      pos[i * 3 + 2] = Math.cos(phi) * r * 0.7;
      sz[i] = Math.random() * 1.5 + 0.3;
      rnd[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    geo.setAttribute('aRandom', new THREE.Float32BufferAttribute(rnd, 1));
    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#00d4ff') },
      },
    };
  }, []);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    const state = useJarvisStore.getState().agentState;
    colorObj.set(getStateColors(state).particle);
    matRef.current.uniforms.uColor.value = colorObj;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          attribute float aSize;
          attribute float aRandom;
          varying float vA;
          void main() {
            vec3 p = position + 0.03 * sin(uTime * 0.5 + aRandom * 6.28) * normalize(position);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = max(0.5, aSize * (120.0 / -mv.z));
            vA = 0.12 + 0.08 * sin(uTime + aRandom * 6.28);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float g = pow(1.0 - d * 2.0, 2.0);
            gl_FragColor = vec4(uColor, g * vA);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ================================================================
   BACKGROUND PARTICLES – 500 particles with star-like & rotation
   ================================================================ */

function BackgroundParticles() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  const { geometry, uniforms } = useMemo(() => {
    const count = 500;
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const rnd = new Float32Array(count);
    const star = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      const isStar = i < 100;
      sz[i] = isStar ? Math.random() * 3 + 2.0 : Math.random() * 2 + 0.5;
      rnd[i] = Math.random();
      star[i] = isStar ? 1.0 : 0.0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    geo.setAttribute('aRandom', new THREE.Float32BufferAttribute(rnd, 1));
    geo.setAttribute('aStar', new THREE.Float32BufferAttribute(star, 1));
    return { geometry: geo, uniforms: { uTime: { value: 0 } } };
  }, []);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.015;
      groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.008) * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={`
            uniform float uTime;
            attribute float aSize;
            attribute float aRandom;
            attribute float aStar;
            varying float vA;
            varying float vStar;
            void main() {
              vec3 p = position;
              p.y += sin(uTime * 0.3 + aRandom * 6.28) * 0.4;
              p.x += cos(uTime * 0.2 + aRandom * 3.14) * 0.3;
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_Position = projectionMatrix * mv;
              float size = aSize * (1.0 + aStar * 0.5);
              gl_PointSize = max(0.5, size * (80.0 / -mv.z));
              float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + aStar * 3.0) + aRandom * 6.28);
              vA = (0.15 + 0.15 * sin(uTime * 0.8 + aRandom * 6.28)) * (0.6 + aStar * 0.8) * twinkle;
              vStar = aStar;
            }
          `}
          fragmentShader={`
            varying float vA;
            varying float vStar;
            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float g = pow(1.0 - d * 2.0, 2.0);
              float core = 1.0 - smoothstep(0.0, 0.12 + (1.0 - vStar) * 0.15, d);
              vec3 col = mix(vec3(0.0, 0.83, 1.0), vec3(0.85, 0.95, 1.0), core * vStar);
              gl_FragColor = vec4(col, g * vA * 0.3);
            }
          `}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

/* ================================================================
   DATA STREAM PARTICLES – 100 upward-flowing particles along HUD ring
   ================================================================ */

function DataStreamParticles() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const colorObj = useMemo(() => new THREE.Color(), []);

  const { geometry, uniforms } = useMemo(() => {
    const count = 100;
    const dummyPos = new Float32Array(count * 3);
    const angles = new Float32Array(count);
    const phases = new Float32Array(count);
    const randoms = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      angles[i] = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      phases[i] = Math.random();
      randoms[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(dummyPos, 3));
    geo.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 1));
    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#00e8ff') },
      },
    };
  }, []);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    const state = useJarvisStore.getState().agentState;
    colorObj.set(getStateColors(state).dataStream);
    matRef.current.uniforms.uColor.value = colorObj;
  });

  return (
    <group rotation={[0.12, 0, 0.04]}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={`
            uniform float uTime;
            attribute float aAngle;
            attribute float aPhase;
            attribute float aRandom;
            varying float vAlpha;
            void main() {
              float radius = 1.85;
              float speed = 0.18 + aRandom * 0.12;
              float cycleLen = 3.5;
              float t = mod(aPhase + uTime * speed / cycleLen, 1.0);

              float y = t * 3.0 - 1.5;
              float x = cos(aAngle) * radius;
              float z = sin(aAngle) * radius;

              vAlpha = (1.0 - t) * 0.55;
              vAlpha *= 0.5 + 0.5 * sin(uTime * 2.5 + aRandom * 6.28);

              vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
              gl_Position = projectionMatrix * mv;
              gl_PointSize = max(1.0, (1.5 + aRandom * 1.2) * (100.0 / -mv.z));
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float g = 1.0 - d * 2.0;
              gl_FragColor = vec4(uColor, g * g * vAlpha);
            }
          `}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

/* ================================================================
   HUD RING – Rotating HUD ring with ticks and arcs (state color)
   ================================================================ */

function HudRing({
  radius, tiltX, tiltZ, tickCount, majorEvery, speed, opacity, arcs,
}: {
  radius: number; tiltX: number; tiltZ: number; tickCount: number; majorEvery: number; speed: number; opacity: number;
  arcs?: { start: number; end: number; segments: number }[];
}) {
  const ref = useRef<THREE.Group>(null);
  const agentState = useJarvisStore((s) => s.agentState);
  const ringColor = getStateColors(agentState).hudRing;
  const speedMult = agentState === 'thinking' ? 2.5 : 1;

  const { tickGeo, arcGeos } = useMemo(() => {
    const tp: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * Math.PI * 2;
      const len = i % majorEvery === 0 ? 0.16 : 0.07;
      const inner = radius - len / 2;
      const outer = radius + len / 2;
      tp.push(Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a) * outer, 0, Math.sin(a) * outer);
    }
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    const aGeos: THREE.BufferGeometry[] = [];
    if (arcs) arcs.forEach((arc) => {
      const ap: number[] = [];
      const step = (arc.end - arc.start) / arc.segments;
      for (let j = 0; j < arc.segments; j++) {
        const a1 = arc.start + step * j;
        const a2 = arc.start + step * (j + 1);
        ap.push(Math.cos(a1) * radius, 0, Math.sin(a1) * radius, Math.cos(a2) * radius, 0, Math.sin(a2) * radius);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
      aGeos.push(g);
    });
    return { tickGeo: tGeo, arcGeos: aGeos };
  }, [radius, tickCount, majorEvery, arcs]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * speed * speedMult;
  });

  return (
    <group ref={ref} rotation={[tiltX, 0, tiltZ]}>
      <lineSegments geometry={tickGeo}>
        <lineBasicMaterial color={ringColor} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {arcGeos.map((g, i) => (
        <lineSegments key={i} geometry={g}>
          <lineBasicMaterial color={ringColor} transparent opacity={opacity * 0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.005, radius + 0.005, 128]} />
        <meshBasicMaterial color={ringColor} transparent opacity={opacity * 0.2} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ================================================================
   HUD DATA READOUTS – Simulated data rectangles near HUD rings
   ================================================================ */

function HudDataReadouts() {
  const groupRef = useRef<THREE.Group>(null);
  const agentState = useJarvisStore((s) => s.agentState);
  const readoutColor = getStateColors(agentState).hudRing;

  const readouts = useMemo(() => {
    const items: { position: [number, number, number]; scale: [number, number]; opacity: number }[] = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.3;
      const r = 2.05 + (i % 3) * 0.08;
      const yOff = Math.sin(i * 2.1) * 0.2;
      items.push({
        position: [Math.cos(angle) * r, yOff, Math.sin(angle) * r],
        scale: [0.06 + (i % 4) * 0.02, 0.012 + (i % 3) * 0.005],
        opacity: 0.15 + (i % 3) * 0.05,
      });
    }
    return items;
  }, []);

  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.rotation.y = clock.getElapsedTime() * 0.1;
  });

  return (
    <group ref={groupRef} rotation={[0.12, 0, 0.04]}>
      {readouts.map((r, i) => (
        <mesh key={i} position={r.position}>
          <planeGeometry args={r.scale} />
          <meshBasicMaterial color={readoutColor} transparent opacity={r.opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ================================================================
   ENERGY WAVES – Concentric rings pulsing outward from face
   ================================================================ */

function EnergyWaves() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const colorObj = useMemo(() => new THREE.Color(), []);
  const count = 4;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const state = useJarvisStore.getState().agentState;
    colorObj.set(getStateColors(state).glow);
    for (let i = 0; i < count; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const phase = ((t * 0.12 + i / count) % 1);
      const s = 0.8 + phase * 2.8;
      mesh.scale.set(s, s, 1);
      (mesh.material as THREE.MeshBasicMaterial).color.copy(colorObj);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - phase, 2.5) * 0.055;
    }
  });

  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el; }}>
          <ringGeometry args={[0.98, 1.01, 64]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ================================================================
   INNER GLOW – Atmospheric glow spheres (primary + larger faint)
   ================================================================ */

function InnerGlow() {
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);
  const colorObj = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref1.current) ref1.current.scale.setScalar(0.9 + 0.08 * Math.sin(t * 1.5));
    if (ref2.current) ref2.current.scale.setScalar(0.92 + 0.06 * Math.sin(t * 1.2 + 1.0));
    const state = useJarvisStore.getState().agentState;
    colorObj.set(getStateColors(state).innerGlow);
    if (ref1.current) (ref1.current.material as THREE.MeshBasicMaterial).color.copy(colorObj);
    if (ref2.current) (ref2.current.material as THREE.MeshBasicMaterial).color.copy(colorObj);
  });

  return (
    <group>
      <mesh ref={ref1}>
        <sphereGeometry args={[1.15, 32, 32]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.012} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ref2}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.006} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ================================================================
   MAIN SCENE – Composition with head tilt, audio reactivity
   ================================================================ */

function JarvisScene() {
  const headRef = useRef<THREE.Group>(null);
  const baseAngleRef = useRef(0);
  const audioLevel = useJarvisStore((s) => s.audioLevel);

  useFrame((state, delta) => {
    if (!headRef.current) return;
    const { agentState } = useJarvisStore.getState();
    const t = state.clock.getElapsedTime();

    // Base Y rotation speed (faster when thinking)
    let ySpeed = agentState === 'thinking' ? 0.25 : agentState === 'speaking' ? 0.08 : 0.05;
    baseAngleRef.current += delta * ySpeed;

    // Y oscillation (side-to-side sway when speaking)
    let yOscillation = 0;
    if (agentState === 'speaking') {
      yOscillation = 0.06 * Math.sin(t * 1.8);
    }

    // X rotation (subtle idle oscillation + forward lean when listening)
    let xRot = 0.01 * Math.sin(t * 0.5);
    if (agentState === 'listening') {
      xRot += 0.03;
    }

    // Z rotation (head tilt when thinking)
    let zRot = 0;
    if (agentState === 'thinking') {
      zRot = 0.03 * Math.sin(t * 1.2);
    }

    headRef.current.rotation.y = baseAngleRef.current + yOscillation;
    headRef.current.rotation.x = xRot;
    headRef.current.rotation.z = zRot;

    // Audio reactivity – subtle scale pulse
    const audioScale = 1 + audioLevel * 0.025;
    headRef.current.scale.setScalar(audioScale);
  });

  return (
    <>
      <HexGridBackground />
      <Float speed={1.5} rotationIntensity={0} floatIntensity={0.08}>
        <group ref={headRef}>
          <EnergyWaves />
          <InnerGlow />
          <HeadWireframe />
          <EyeGlow />
          <EyeHaloGlow />
          <CircuitEnergyPulse />
          <ParticleCloud />
          <DataStreamParticles />
          <HudRing
            radius={1.85} tiltX={0.12} tiltZ={0.04} tickCount={72} majorEvery={6} speed={0.1} opacity={0.3}
            arcs={[
              { start: 0.2, end: 0.8, segments: 20 },
              { start: 2.4, end: 3.0, segments: 16 },
              { start: 4.2, end: 4.7, segments: 12 },
            ]}
          />
          <HudRing
            radius={2.05} tiltX={1.0} tiltZ={0.25} tickCount={48} majorEvery={4} speed={-0.06} opacity={0.15}
          />
          {/* Third HUD ring with different tilt */}
          <HudRing
            radius={1.65} tiltX={0.5} tiltZ={-0.15} tickCount={36} majorEvery={3} speed={0.08} opacity={0.12}
            arcs={[{ start: 0.5, end: 1.5, segments: 15 }, { start: 3.5, end: 4.2, segments: 10 }]}
          />
          <HudDataReadouts />
        </group>
      </Float>
      <BackgroundParticles />
      <EffectComposer>
        <Bloom intensity={0.8} luminanceThreshold={0.15} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>
    </>
  );
}

/* ================================================================
   EXPORT
   ================================================================ */

export default function JarvisFace() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 38 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
      >
        <JarvisScene />
      </Canvas>
    </div>
  );
}
