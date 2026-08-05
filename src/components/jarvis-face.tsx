'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useJarvisStore } from '@/lib/jarvis-store';

/* ================================================================
   CURVE GENERATORS
   ================================================================ */

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, n: number, startAngle = 0, endAngle = Math.PI * 2): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0]);
  }
  return pts;
}

/* ================================================================
   HEAD WIREFRAME - Clear line-based facial features
   ================================================================ */

function HeadWireframe() {
  const mouthOpen = useJarvisStore((s) => s.mouthOpen);
  const agentState = useJarvisStore((s) => s.agentState);
  const t = useRef(0);

  useFrame(({ clock }) => { t.current = clock.getElapsedTime(); });

  const baseOpacity = agentState === 'idle' ? 0.6 : agentState === 'thinking' ? 0.8 : 1.0;

  // Head outline
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

  // Eyes
  const leftEye = useMemo(() => ellipsePoints(-0.38, 0.25, 0.22, 0.1, 32), []);
  const rightEye = useMemo(() => ellipsePoints(0.38, 0.25, 0.22, 0.1, 32), []);
  const leftIris = useMemo(() => ellipsePoints(-0.38, 0.25, 0.09, 0.09, 24), []);
  const rightIris = useMemo(() => ellipsePoints(0.38, 0.25, 0.09, 0.09, 24), []);

  // Nose
  const noseBridge = useMemo(() => [[0, 0.42, 0.02], [0, 0.02, 0.05]] as [number, number, number][], []);
  const noseLeft = useMemo(() => [[0, 0.02, 0.05], [-0.1, -0.12, 0.03], [0, -0.16, 0.03]] as [number, number, number][], []);
  const noseRight = useMemo(() => [[0, 0.02, 0.05], [0.1, -0.12, 0.03], [0, -0.16, 0.03]] as [number, number, number][], []);

  // Mouth (reactive to mouthOpen)
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

  // Eyebrows
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

  const dimColor = '#00a8c8';
  const brightColor = '#00e8ff';
  const mouthColor = '#00ffdd';

  return (
    <group>
      {/* Head outline */}
      <Line points={headOutline} color={dimColor} lineWidth={1.2} transparent opacity={baseOpacity * 0.5} />
      <Line points={jawLine} color={dimColor} lineWidth={1} transparent opacity={baseOpacity * 0.4} />
      {/* Eyes */}
      <Line points={leftEye} color={brightColor} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
      <Line points={rightEye} color={brightColor} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
      <Line points={leftIris} color={brightColor} lineWidth={1.5} transparent opacity={baseOpacity} />
      <Line points={rightIris} color={brightColor} lineWidth={1.5} transparent opacity={baseOpacity} />
      {/* Nose */}
      <Line points={noseBridge} color={brightColor} lineWidth={1.5} transparent opacity={baseOpacity * 0.7} />
      <Line points={noseLeft} color={brightColor} lineWidth={1.2} transparent opacity={baseOpacity * 0.6} />
      <Line points={noseRight} color={brightColor} lineWidth={1.2} transparent opacity={baseOpacity * 0.6} />
      {/* Mouth */}
      <Line points={mouthUpper} color={mouthColor} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
      <Line points={mouthLower} color={mouthColor} lineWidth={2} transparent opacity={baseOpacity * 0.9} />
      {/* Eyebrows */}
      <Line points={leftBrow} color={brightColor} lineWidth={2.5} transparent opacity={baseOpacity * 0.85} />
      <Line points={rightBrow} color={brightColor} lineWidth={2.5} transparent opacity={baseOpacity * 0.85} />
    </group>
  );
}

/* ================================================================
   EYE GLOW - Bright pupil dots
   ================================================================ */

function EyeGlow() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([[-0.38, 0.25, 0.06], [0.38, 0.25, 0.06]].flat(), 3));
    return g;
  }, []);

  useFrame(({ clock }) => { if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime(); });

  return (
    <points geometry={geo}>
      <shaderMaterial ref={matRef} uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          uniform float uTime;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = 8.0 * (200.0 / -mv.z);
          }
        `}
        fragmentShader={`
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float g = 1.0 - smoothstep(0.0, 0.5, d);
            vec3 c = mix(vec3(0.0, 0.83, 1.0), vec3(1.0), pow(g, 2.5));
            gl_FragColor = vec4(c, g * 0.9);
          }
        `}
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ================================================================
   PARTICLE CLOUD - Holographic particles around head
   ================================================================ */

function ParticleCloud() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const count = 1500;
    const pos = new Float32Array(count * 3), sz = new Float32Array(count), rnd = new Float32Array(count);
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
    return { geometry: geo, uniforms: { uTime: { value: 0 } } };
  }, []);

  useFrame(({ clock }) => { if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime(); });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={matRef} uniforms={uniforms}
        vertexShader={`
          uniform float uTime; attribute float aSize; attribute float aRandom; varying float vA;
          void main() {
            vec3 p = position + 0.03 * sin(uTime * 0.5 + aRandom * 6.28) * normalize(position);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = max(0.5, aSize * (120.0 / -mv.z));
            vA = 0.12 + 0.08 * sin(uTime + aRandom * 6.28);
          }
        `}
        fragmentShader={`
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float g = pow(1.0 - d * 2.0, 2.0);
            gl_FragColor = vec4(0.0, 0.83, 1.0, g * vA);
          }
        `}
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ================================================================
   BACKGROUND PARTICLES
   ================================================================ */

function BackgroundParticles() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const count = 250;
    const pos = new Float32Array(count * 3), sz = new Float32Array(count), rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
      sz[i] = Math.random() * 2 + 0.5;
      rnd[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    geo.setAttribute('aRandom', new THREE.Float32BufferAttribute(rnd, 1));
    return { geometry: geo, uniforms: { uTime: { value: 0 } } };
  }, []);

  useFrame(({ clock }) => { if (matRef.current) matRef.current.uniforms.uTime.value = clock.getElapsedTime(); });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={matRef} uniforms={uniforms}
        vertexShader={`
          uniform float uTime; attribute float aSize; attribute float aRandom; varying float vA;
          void main() {
            vec3 p = position;
            p.y += sin(uTime * 0.3 + aRandom * 6.28) * 0.4;
            p.x += cos(uTime * 0.2 + aRandom * 3.14) * 0.3;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = max(0.5, aSize * (80.0 / -mv.z));
            vA = 0.12 + 0.12 * sin(uTime * 0.8 + aRandom * 6.28);
          }
        `}
        fragmentShader={`
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float g = pow(1.0 - d * 2.0, 2.0);
            gl_FragColor = vec4(0.0, 0.83, 1.0, g * vA * 0.25);
          }
        `}
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ================================================================
   HUD RING
   ================================================================ */

function HudRing({ radius, tiltX, tiltZ, tickCount, majorEvery, speed, opacity, arcs }: {
  radius: number; tiltX: number; tiltZ: number; tickCount: number; majorEvery: number; speed: number; opacity: number;
  arcs?: { start: number; end: number; segments: number }[];
}) {
  const ref = useRef<THREE.Group>(null);
  const { tickGeo, arcGeos } = useMemo(() => {
    const tp: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * Math.PI * 2;
      const len = i % majorEvery === 0 ? 0.16 : 0.07;
      const inner = radius - len / 2, outer = radius + len / 2;
      tp.push(Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a) * outer, 0, Math.sin(a) * outer);
    }
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    const aGeos: THREE.BufferGeometry[] = [];
    if (arcs) arcs.forEach(arc => {
      const ap: number[] = [];
      const step = (arc.end - arc.start) / arc.segments;
      for (let j = 0; j < arc.segments; j++) {
        const a1 = arc.start + step * j, a2 = arc.start + step * (j + 1);
        ap.push(Math.cos(a1) * radius, 0, Math.sin(a1) * radius, Math.cos(a2) * radius, 0, Math.sin(a2) * radius);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
      aGeos.push(g);
    });
    return { tickGeo: tGeo, arcGeos: aGeos };
  }, [radius, tickCount, majorEvery, arcs]);

  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * speed; });

  return (
    <group ref={ref} rotation={[tiltX, 0, tiltZ]}>
      <lineSegments geometry={tickGeo}>
        <lineBasicMaterial color="#00d4ff" transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {arcGeos.map((g, i) => (
        <lineSegments key={i} geometry={g}>
          <lineBasicMaterial color="#00d4ff" transparent opacity={opacity * 0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.005, radius + 0.005, 128]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={opacity * 0.2} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ================================================================
   INNER GLOW
   ================================================================ */

function InnerGlow() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.scale.setScalar(0.9 + 0.08 * Math.sin(clock.getElapsedTime() * 1.5)); });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1.15, 32, 32]} />
      <meshBasicMaterial color="#00d4ff" transparent opacity={0.012} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

/* ================================================================
   MAIN SCENE
   ================================================================ */

function JarvisScene() {
  const headRef = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!headRef.current) return;
    const { agentState } = useJarvisStore.getState();
    const t = state.clock.getElapsedTime();
    let ySpeed = agentState === 'thinking' ? 0.25 : agentState === 'speaking' ? 0.08 : 0.05;
    headRef.current.rotation.y += delta * ySpeed;
    headRef.current.rotation.x = 0.01 * Math.sin(t * 0.5);
  });

  return (
    <>
      <Float speed={1.5} rotationIntensity={0} floatIntensity={0.08}>
        <group ref={headRef}>
          <InnerGlow />
          <HeadWireframe />
          <EyeGlow />
          <ParticleCloud />
          <HudRing radius={1.85} tiltX={0.12} tiltZ={0.04} tickCount={72} majorEvery={6} speed={0.1} opacity={0.3}
            arcs={[{ start: 0.2, end: 0.8, segments: 20 }, { start: 2.4, end: 3.0, segments: 16 }, { start: 4.2, end: 4.7, segments: 12 }]} />
          <HudRing radius={2.05} tiltX={1.0} tiltZ={0.25} tickCount={48} majorEvery={4} speed={-0.06} opacity={0.15} />
        </group>
      </Float>
      <BackgroundParticles />
      <EffectComposer>
        <Bloom intensity={0.5} luminanceThreshold={0.3} luminanceSmoothing={0.9} mipmapBlur />
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
      <Canvas camera={{ position: [0, 0, 4.5], fov: 38 }} gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }} dpr={[1, 2]} style={{ background: 'transparent' }}>
        <JarvisScene />
      </Canvas>
    </div>
  );
}
