"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, Sphere, Stars } from "@react-three/drei";
import * as THREE from "three";

function PlasmaCore({ active, listening, busy }) {
  const core = useRef(null);
  const glow = useRef(null);
  const shell = useRef(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const energy = active ? (listening ? 1.35 : busy ? 1.2 : 1) : 0.25;

    if (core.current) {
      core.current.rotation.y = t * 0.35 * energy;
      core.current.rotation.z = Math.sin(t * 0.4) * 0.08;
      const s = 1 + Math.sin(t * 2.2) * 0.04 * energy;
      core.current.scale.setScalar(active ? s : 0.85);
      core.current.material.emissiveIntensity = active
        ? 1.8 + Math.sin(t * 3) * 0.5 * energy
        : 0.15;
    }

    if (glow.current) {
      glow.current.material.opacity = active
        ? 0.35 + Math.sin(t * 2) * 0.08
        : 0.06;
      glow.current.scale.setScalar(active ? 1.4 + Math.sin(t * 1.5) * 0.08 : 1.1);
    }

    if (shell.current) {
      shell.current.rotation.y = -t * 0.15;
    }
  });

  return (
    <group>
      {/* Soft outer glow */}
      <Sphere ref={glow} args={[1.15, 32, 32]}>
        <meshBasicMaterial
          color={active ? "#ff2a2a" : "#3a1010"}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </Sphere>

      {/* Glass shell */}
      <Sphere ref={shell} args={[0.95, 48, 48]}>
        <meshPhysicalMaterial
          color="#1a0505"
          metalness={0.2}
          roughness={0.15}
          transmission={active ? 0.35 : 0.05}
          thickness={0.6}
          transparent
          opacity={0.85}
          emissive={active ? "#5a0000" : "#100000"}
          emissiveIntensity={active ? 0.4 : 0.05}
        />
      </Sphere>

      {/* Hot fusion core */}
      <Sphere ref={core} args={[0.42, 48, 48]}>
        <meshStandardMaterial
          color={active ? "#ff5533" : "#2a0a0a"}
          emissive={active ? "#ff2200" : "#1a0505"}
          emissiveIntensity={active ? 2 : 0.1}
          metalness={0.3}
          roughness={0.35}
        />
      </Sphere>

      {/* Inner bright kernel */}
      <Sphere args={[0.18, 32, 32]}>
        <meshBasicMaterial color={active ? "#fff0e8" : "#3a1515"} />
      </Sphere>
    </group>
  );
}

function EnergyRing({
  radius,
  tube = 0.025,
  speed = 1,
  tilt = [0, 0, 0],
  reverse = false,
  active,
  delay = 0,
}) {
  const ref = useRef(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime + delay;
    const dir = reverse ? -1 : 1;
    if (active) {
      ref.current.rotation.z = t * speed * dir;
      ref.current.rotation.x = tilt[0] + Math.sin(t * 0.2) * 0.05;
      ref.current.rotation.y = tilt[1] + Math.cos(t * 0.15) * 0.04;
    }
  });

  return (
    <mesh ref={ref} rotation={tilt}>
      <torusGeometry args={[radius, active ? tube : tube * 0.6, 16, 100]} />
      <meshStandardMaterial
        color={active ? "#ff3333" : "#2a1212"}
        emissive={active ? "#ff1515" : "#100505"}
        emissiveIntensity={active ? 1.4 : 0.08}
        metalness={0.7}
        roughness={0.25}
        transparent
        opacity={active ? 0.95 : 0.35}
      />
    </mesh>
  );
}

function Sparks({ active, count = 40 }) {
  const ref = useRef(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 0.5 + Math.random() * 1.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (!ref.current || !active) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.08;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
  });

  if (!active) return null;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#ff6644"
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export default function FusionCore({
  active = false,
  listening = false,
  busy = false,
}) {
  return (
    <Float speed={active ? 1.2 : 0.4} rotationIntensity={0.15} floatIntensity={0.25}>
      <group>
        <PlasmaCore active={active} listening={listening} busy={busy} />

        {/* 4 rings — different 3D planes */}
        <EnergyRing
          radius={1.35}
          tube={0.03}
          speed={0.55}
          tilt={[Math.PI / 2.2, 0.2, 0]}
          active={active}
        />
        <EnergyRing
          radius={1.55}
          tube={0.028}
          speed={0.4}
          tilt={[0.3, Math.PI / 2.3, 0.1]}
          reverse
          active={active}
          delay={1}
        />
        <EnergyRing
          radius={1.75}
          tube={0.026}
          speed={0.3}
          tilt={[-0.6, 0.4, Math.PI / 2.5]}
          active={active}
          delay={2}
        />
        <EnergyRing
          radius={1.95}
          tube={0.024}
          speed={0.22}
          tilt={[0.5, -0.7, 0.3]}
          reverse
          active={active}
          delay={3}
        />

        <Sparks active={active} count={listening ? 60 : 36} />

        {/* Dim star field */}
        <Stars
          radius={40}
          depth={30}
          count={active ? 800 : 300}
          factor={2}
          saturation={0}
          fade
          speed={0.3}
        />
      </group>
    </Float>
  );
}