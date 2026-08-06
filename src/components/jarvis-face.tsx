'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useJarvisStore } from '@/lib/jarvis-store';
import type { AgentState } from '@/lib/jarvis-store';

/* ================================================================
   MODULE-LEVEL SHARED STATE (eye tracking & blink)
   ================================================================ */

const _mouse = { x: 0, y: 0 };
const _blink = {
  scale: 1,
  timer: 0,
  nextBlink: 3 + Math.random() * 2,
  active: false,
  elapsed: 0,
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

/* ================================================================
   CIRCUITRY LINES – 11 circuit-board-style decorative traces
   ================================================================ */

function CircuitryLines({ opacity, color }: { opacity: number; color: string }) {
  const lines = useMemo(() => {
    const paths: { pts: [number, number, number][]; width: number }[] = [
      // 1. Left temple → left cheekbone (angular trace)
      {
        pts: [[-1.05, 0.15, 0.01], [-0.85, 0.15, 0.01], [-0.85, -0.1, 0.01], [-0.7, -0.1, 0.01], [-0.7, -0.35, 0.01], [-0.52, -0.35, 0.01]],
        width: 0.6,
      },
      // 2. Right temple → right cheekbone
      {
        pts: [[1.05, 0.15, 0.01], [0.85, 0.15, 0.01], [0.85, -0.1, 0.01], [0.7, -0.1, 0.01], [0.7, -0.35, 0.01], [0.52, -0.35, 0.01]],
        width: 0.6,
      },
      // 3. Left forehead horizontal trace
      {
        pts: [[-0.88, 0.68, 0.01], [-0.55, 0.72, 0.01], [-0.25, 0.68, 0.01], [0.05, 0.72, 0.01]],
        width: 0.5,
      },
      // 4. Right forehead horizontal trace
      {
        pts: [[0.88, 0.68, 0.01], [0.55, 0.72, 0.01], [0.25, 0.68, 0.01], [-0.05, 0.72, 0.01]],
        width: 0.5,
      },
      // 5. Left cheek contour
      {
        pts: [[-0.62, -0.05, 0.01], [-0.75, -0.15, 0.01], [-0.82, -0.32, 0.01], [-0.76, -0.5, 0.01], [-0.58, -0.66, 0.01]],
        width: 0.7,
      },
      // 6. Right cheek contour
      {
        pts: [[0.62, -0.05, 0.01], [0.75, -0.15, 0.01], [0.82, -0.32, 0.01], [0.76, -0.5, 0.01], [0.58, -0.66, 0.01]],
        width: 0.7,
      },
      // 7. Center forehead vertical
      {
        pts: [[0, 0.95, 0.01], [0, 0.78, 0.01], [0, 0.55, 0.01]],
        width: 0.5,
      },
      // 8. Left temple → jaw
      {
        pts: [[-1.0, 0.02, 0.01], [-0.92, 0.02, 0.01], [-0.92, -0.4, 0.01], [-0.82, -0.4, 0.01], [-0.82, -0.72, 0.01]],
        width: 0.5,
      },
      // 9. Right temple → jaw
      {
        pts: [[1.0, 0.02, 0.01], [0.92, 0.02, 0.01], [0.92, -0.4, 0.01], [0.82, -0.4, 0.01], [0.82, -0.72, 0.01]],
        width: 0.5,
      },
      // 10. Nose bridge → left cheek diagonal
      {
        pts: [[-0.04, -0.02, 0.02], [-0.15, -0.1, 0.02], [-0.28, -0.1, 0.02], [-0.32, -0.22, 0.02]],
        width: 0.6,
      },
      // 11. Nose bridge → right cheek diagonal
      {
        pts: [[0.04, -0.02, 0.02], [0.15, -0.1, 0.02], [0.28, -0.1, 0.02], [0.32, -0.22, 0.02]],
        width: 0.6,
      },
    ];
    return paths;
  }, []);

  return (
    <group>
      {lines.map((line, i) => (
        <Line key={i} points={line.pts} color={color} lineWidth={line.width} transparent opacity={opacity * 0.2} />
      ))}
    </group>
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
   HEAD WIREFRAME – Face with eye tracking, blinking, state colors
   ================================================================ */

function HeadWireframe() {
  const mouthOpen = useJarvisStore((s) => s.mouthOpen);
  const agentState = useJarvisStore((s) => s.agentState);

  /* ── Mouse tracking (module-level shared) ───────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      _mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      _mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  /* ── Refs ───────────────────────────────────────────────────── */
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const leftIrisRef = useRef<THREE.Group>(null);
  const rightIrisRef = useRef<THREE.Group>(null);

  /* ── Blink + eye tracking in useFrame ──────────────────────── */
  useFrame((_, delta) => {
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
    const mx = _mouse.x * 0.04;
    const my = _mouse.y * 0.04;

    if (leftEyeRef.current) leftEyeRef.current.scale.y = bScale;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = bScale;
    if (leftIrisRef.current) { leftIrisRef.current.position.x = mx; leftIrisRef.current.position.y = my; }
    if (rightIrisRef.current) { rightIrisRef.current.position.x = mx; rightIrisRef.current.position.y = my; }
  });

  /* ── State-reactive colors ─────────────────────────────────── */
  const colors = useMemo(() => getStateColors(agentState), [agentState]);
  const baseOpacity = agentState === 'idle' ? 0.6 : agentState === 'thinking' ? 0.8 : 1.0;

  /* ── Geometries ────────────────────────────────────────────── */
  const headOutline = useMemo(() => {
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
  }, []);

  const leftEye = useMemo(() => ellipsePoints(-0.38, 0.25, 0.22, 0.1, 32), []);
  const rightEye = useMemo(() => ellipsePoints(0.38, 0.25, 0.22, 0.1, 32), []);
  const leftIris = useMemo(() => ellipsePoints(-0.38, 0.25, 0.09, 0.09, 24), []);
  const rightIris = useMemo(() => ellipsePoints(0.38, 0.25, 0.09, 0.09, 24), []);

  const noseBridge = useMemo(() => [[0, 0.42, 0.02], [0, 0.02, 0.05]] as [number, number, number][], []);
  const noseLeft = useMemo(() => [[0, 0.02, 0.05], [-0.1, -0.12, 0.03], [0, -0.16, 0.03]] as [number, number, number][], []);
  const noseRight = useMemo(() => [[0, 0.02, 0.05], [0.1, -0.12, 0.03], [0, -0.16, 0.03]] as [number, number, number][], []);

  const mouthUpper = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const t2 = i / 20;
      const x = (t2 - 0.5) * 2 * 0.25;
      const curve = -Math.abs(t2 - 0.5) * 2 * 0.04;
      pts.push([x, -0.45 + curve, 0.03]);
    }
    return pts;
  }, []);

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

  return (
    <group>
      {/* Head outline */}
      <Line points={headOutline} color={colors.circuitry} lineWidth={1.2} transparent opacity={baseOpacity * 0.5} />
      <Line points={jawLine} color={colors.circuitry} lineWidth={1} transparent opacity={baseOpacity * 0.4} />

      {/* ── Left Eye (blink + tracking) ────────────────────── */}
      <group ref={leftEyeRef}>
        <Line points={leftEye} color={colors.eye} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
        <group ref={leftIrisRef}>
          <Line points={leftIris} color={colors.eye} lineWidth={1.5} transparent opacity={baseOpacity} />
        </group>
      </group>

      {/* ── Right Eye (blink + tracking) ───────────────────── */}
      <group ref={rightEyeRef}>
        <Line points={rightEye} color={colors.eye} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
        <group ref={rightIrisRef}>
          <Line points={rightIris} color={colors.eye} lineWidth={1.5} transparent opacity={baseOpacity} />
        </group>
      </group>

      {/* Nose */}
      <Line points={noseBridge} color={colors.eye} lineWidth={1.5} transparent opacity={baseOpacity * 0.7} />
      <Line points={noseLeft} color={colors.eye} lineWidth={1.2} transparent opacity={baseOpacity * 0.6} />
      <Line points={noseRight} color={colors.eye} lineWidth={1.2} transparent opacity={baseOpacity * 0.6} />

      {/* Mouth */}
      <Line points={mouthUpper} color={colors.mouth} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
      <Line points={mouthLower} color={colors.mouth} lineWidth={2} transparent opacity={baseOpacity * 0.9} />

      {/* Eyebrows */}
      <Line points={leftBrow} color={colors.eye} lineWidth={2.5} transparent opacity={baseOpacity * 0.85} />
      <Line points={rightBrow} color={colors.eye} lineWidth={2.5} transparent opacity={baseOpacity * 0.85} />

      {/* ── Inner Circuitry Lines ──────────────────────────── */}
      <CircuitryLines opacity={baseOpacity} color={colors.circuitry} />

      {/* ── Scan Line ──────────────────────────────────────── */}
      <ScanLine color={colors.scanLine} />
    </group>
  );
}

/* ================================================================
   EYE GLOW – Bright pupil dots with blink & tracking
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
    matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    const state = useJarvisStore.getState().agentState;
    colorObj.set(getStateColors(state).eye);
    matRef.current.uniforms.uColor.value = colorObj;
    matRef.current.uniforms.uBlink.value = _blink.scale;
    matRef.current.uniforms.uMouseX.value = _mouse.x * 0.04;
    matRef.current.uniforms.uMouseY.value = _mouse.y * 0.04;
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
        }}
        vertexShader={`
          uniform float uTime;
          uniform float uMouseX;
          uniform float uMouseY;
          void main() {
            vec3 p = position;
            p.x += uMouseX;
            p.y += uMouseY;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = 8.0 * (200.0 / -mv.z);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uBlink;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float g = 1.0 - smoothstep(0.0, 0.5, d);
            vec3 c = mix(uColor * 0.7, vec3(1.0), pow(g, 2.5));
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
      const isStar = i < 100; // 20% are star-like
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
      {/* Primary inner glow */}
      <mesh ref={ref1}>
        <sphereGeometry args={[1.15, 32, 32]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.012} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Larger atmospheric depth glow */}
      <mesh ref={ref2}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.006} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ================================================================
   MAIN SCENE – Composition with head tilt
   ================================================================ */

function JarvisScene() {
  const headRef = useRef<THREE.Group>(null);
  const baseAngleRef = useRef(0);

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
  });

  return (
    <>
      <Float speed={1.5} rotationIntensity={0} floatIntensity={0.08}>
        <group ref={headRef}>
          <InnerGlow />
          <HeadWireframe />
          <EyeGlow />
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
          <HudRing radius={2.05} tiltX={1.0} tiltZ={0.25} tickCount={48} majorEvery={4} speed={-0.06} opacity={0.15} />
        </group>
      </Float>
      <BackgroundParticles />
      <EffectComposer>
        <Bloom intensity={0.7} luminanceThreshold={0.2} luminanceSmoothing={0.9} mipmapBlur />
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
