"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const ACTIVATION_DURATION = 15000;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function createPlasmaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uPower: { value: 0.15 },
    },

    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;

        gl_Position =
          projectionMatrix *
          viewMatrix *
          worldPosition;
      }
    `,

    fragmentShader: `
      uniform float uTime;
      uniform float uProgress;
      uniform float uPower;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(.1,.2,.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);

        f = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(
            mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
            f.y
          ),
          mix(
            mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
            f.y
          ),
          f.z
        );
      }

      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;

        for(int i = 0; i < 5; i++) {
          value += noise(p) * amplitude;
          p *= 2.02;
          amplitude *= 0.5;
        }

        return value;
      }

      void main() {
        vec3 n = normalize(vWorldPosition);

        float t = uTime;

        vec3 p = n * 3.8;

        p.x += sin(p.y * 3.0 + t * 1.4) * 0.45;
        p.y += cos(p.z * 3.5 - t * 1.1) * 0.42;
        p.z += sin(p.x * 4.0 + t * 1.7) * 0.38;

        float slow = fbm(p * 1.7 + t * vec3(.18,-.12,.15));
        float fast = fbm(p * 4.0 - t * vec3(.45,.35,-.5));

        float convection =
          sin(
            p.x * 5.0 +
            sin(p.y * 4.0 + t) * 2.0 +
            t * 2.0
          );

        float reaction =
          smoothstep(
            0.52,
            0.92,
            slow * 0.72 + fast * 0.28
          );

        reaction +=
          smoothstep(
            0.75,
            1.0,
            abs(convection)
          ) * 0.35;

        reaction *= (0.45 + uProgress * 0.75);

        float fresnel =
          pow(
            1.0 - max(dot(normalize(-vWorldPosition), vNormal), 0.0),
            2.3
          );

        vec3 darkRed = vec3(0.012, 0.0, 0.0);
        vec3 red = vec3(0.16, 0.002, 0.003);
        vec3 orange = vec3(0.3, 0.018, 0.009);
        vec3 hot = vec3(0.5, 0.055, 0.028);
        vec3 whiteHot = vec3(0.68, 0.16, 0.09);

        vec3 plasma =
          mix(darkRed, red, smoothstep(0.05, 0.45, reaction));

        plasma =
          mix(plasma, orange, smoothstep(0.35, 0.72, reaction));

        plasma =
          mix(plasma, hot, smoothstep(0.65, 0.88, reaction));

        plasma =
          mix(plasma, whiteHot, smoothstep(0.86, 1.0, reaction));

        plasma += fresnel * vec3(0.8, 0.015, 0.005);

        float alpha =
          0.74 +
          reaction * 0.22 +
          fresnel * 0.18;

        alpha *= 0.35 + uPower * 0.7;

        gl_FragColor =
          vec4(plasma * (0.32 + reaction * 0.65), alpha);
      }
    `,

    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

function createRingMaterial(index) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uSeed: { value: index * 1.731 },
    },

    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      uniform float uTime;
      uniform float uEnergy;
      uniform float uSeed;

      varying vec2 vUv;

      float hash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        float wave =
          sin(
            vUv.x * 75.0 +
            uTime * (4.0 + uSeed)
          );

        float wave2 =
          sin(
            vUv.x * 150.0 -
            uTime * 7.0 +
            uSeed * 10.0
          );

        float energy =
          0.72 +
          wave * 0.13 +
          wave2 * 0.08;

        float pulse =
          0.72 +
          0.28 *
          sin(uTime * 3.0 + uSeed);

        vec3 deep =
          vec3(0.15, 0.0, 0.0);

        vec3 red =
          vec3(0.48, 0.006, 0.003);

        vec3 orange =
          vec3(0.5, 0.045, 0.012);

        vec3 color =
          mix(deep, red, energy);

        color =
          mix(color, orange, smoothstep(0.78, 1.0, energy));

        float alpha =
          (0.55 + uEnergy * 0.45) *
          pulse;

        gl_FragColor =
          vec4(
            color * (0.5 + uEnergy * 1.1),
            alpha
          );
      }
    `,

    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function createGlowMaterial(color = new THREE.Color(1, 0.015, 0.005)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: 0.35 },
      uTime: { value: 0 },
    },

    vertexShader: `
      varying vec3 vNormal;

      void main() {
        vNormal = normalize(normalMatrix * normal);

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;

      varying vec3 vNormal;

      void main() {
        float fresnel =
          pow(
            1.0 - abs(vNormal.z),
            2.0
          );

        float pulse =
          0.85 +
          0.15 *
          sin(uTime * 2.0);

        gl_FragColor =
          vec4(
            uColor * pulse,
            fresnel * uOpacity
          );
      }
    `,

    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
}

function createParticleSystem(count, radius, size, seedOffset = 0) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    const theta =
      Math.random() * Math.PI * 2;

    const phi =
      Math.acos(
        2 * Math.random() - 1
      );

    const r =
      radius *
      Math.pow(Math.random(), 0.45);

    positions[i3] =
      r *
      Math.sin(phi) *
      Math.cos(theta);

    positions[i3 + 1] =
      r *
      Math.sin(phi) *
      Math.sin(theta);

    positions[i3 + 2] =
      r *
      Math.cos(phi);

    velocities[i3] =
      (Math.random() - 0.5) * 0.15;

    velocities[i3 + 1] =
      (Math.random() - 0.5) * 0.15;

    velocities[i3 + 2] =
      (Math.random() - 0.5) * 0.15;

    seeds[i] =
      Math.random() * 1000 + seedOffset;
  }

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3
    )
  );

  geometry.setAttribute(
    "aSeed",
    new THREE.BufferAttribute(
      seeds,
      1
    )
  );

  const material =
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: size },
        uOpacity: { value: 0.7 },
      },

      vertexShader: `
        uniform float uTime;
        uniform float uSize;

        attribute float aSeed;

        varying float vSeed;

        void main() {
          vSeed = aSeed;

          vec3 p = position;

          float t =
            uTime * 0.7 +
            aSeed;

          p.x += sin(t * 1.7 + p.y * 3.0) * 0.08;
          p.y += cos(t * 1.3 + p.z * 2.5) * 0.08;
          p.z += sin(t * 1.5 + p.x * 2.0) * 0.08;

          vec4 mvPosition =
            modelViewMatrix *
            vec4(p, 1.0);

          gl_PointSize =
            uSize *
            (160.0 / -mvPosition.z);

          gl_Position =
            projectionMatrix *
            mvPosition;
        }
      `,

      fragmentShader: `
        uniform float uOpacity;

        varying float vSeed;

        void main() {
          vec2 uv =
            gl_PointCoord -
            vec2(0.5);

          float d =
            length(uv);

          float alpha =
            smoothstep(
              0.5,
              0.0,
              d
            );

          vec3 color =
            mix(
              vec3(0.85, 0.02, 0.008),
              vec3(0.75, 0.12, 0.04),
              fract(vSeed)
            );

          gl_FragColor =
            vec4(
              color * 1.15,
              alpha * uOpacity
            );
        }
      `,

      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

  return {
    points: new THREE.Points(
      geometry,
      material
    ),
    geometry,
    material,
  };
}

function getAudioContext(audioCtxRef) {
  if (typeof window === "undefined") return null;

  const Ctx =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!Ctx) return null;

  if (!audioCtxRef.current) {
    audioCtxRef.current = new Ctx();
  }

  if (audioCtxRef.current.state === "suspended") {
    audioCtxRef.current.resume();
  }

  return audioCtxRef.current;
}

// Synthesized cinematic "ring activation" hit — a low sub-bass
// thump layered with a rising metallic shimmer. No external
// audio file needed; each ring gets a slightly different pitch
// so ring 1 -> 4 sound like an escalating power sequence.
function playRingActivationSound(audioCtxRef, ringIndex) {
  const ctx = getAudioContext(audioCtxRef);
  if (!ctx) return;

  const now = ctx.currentTime;

  // Sub-bass thump
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();

  sub.type = "sine";

  const baseFreq = 55 + ringIndex * 10;

  sub.frequency.setValueAtTime(baseFreq * 2.4, now);
  sub.frequency.exponentialRampToValueAtTime(
    baseFreq,
    now + 0.35
  );

  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.exponentialRampToValueAtTime(1.0, now + 0.03);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

  sub.connect(subGain);
  subGain.connect(ctx.destination);

  sub.start(now);
  sub.stop(now + 1.1);

  // Rising metallic shimmer
  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();

  shimmer.type = "triangle";

  const shimmerFreq = 380 + ringIndex * 110;

  shimmer.frequency.setValueAtTime(shimmerFreq * 0.5, now);
  shimmer.frequency.exponentialRampToValueAtTime(
    shimmerFreq,
    now + 0.5
  );

  shimmerGain.gain.setValueAtTime(0.0001, now);
  shimmerGain.gain.exponentialRampToValueAtTime(
    0.5,
    now + 0.08
  );
  shimmerGain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + 1.2
  );

  shimmer.connect(shimmerGain);
  shimmerGain.connect(ctx.destination);

  shimmer.start(now);
  shimmer.stop(now + 1.3);

  // Extra punchy impact layer for more overall loudness/weight
  const impact = ctx.createOscillator();
  const impactGain = ctx.createGain();

  impact.type = "square";

  const impactFreq = 130 + ringIndex * 18;

  impact.frequency.setValueAtTime(impactFreq, now);
  impact.frequency.exponentialRampToValueAtTime(
    impactFreq * 0.6,
    now + 0.25
  );

  impactGain.gain.setValueAtTime(0.0001, now);
  impactGain.gain.exponentialRampToValueAtTime(
    0.35,
    now + 0.02
  );
  impactGain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + 0.5
  );

  impact.connect(impactGain);
  impactGain.connect(ctx.destination);

  impact.start(now);
  impact.stop(now + 0.6);
}

// Picks the deepest-sounding voice the browser has available.
// Browsers vary a lot here — this just biases toward common
// deep/male-labeled voices instead of leaving it to whatever
// the OS defaults to.
function pickDeepVoice() {
  if (
    typeof window === "undefined" ||
    !window.speechSynthesis
  ) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();

  if (!voices || voices.length === 0) return null;

  const preferredNames = [
    "Google UK English Male",
    "Microsoft David",
    "Microsoft Guy",
    "Microsoft Ryan",
    "Daniel",
    "Male",
  ];

  for (const name of preferredNames) {
    const match = voices.find((v) =>
      v.name.includes(name)
    );
    if (match) return match;
  }

  const anyMale = voices.find((v) =>
    /male/i.test(v.name)
  );

  return anyMale || voices[0];
}

// Routes a spoken line through a metallic/robotic filter chain
// (lowpass + waveshaper distortion + slight ring-mod flavor via
// a bandpass) using Web Audio API, layered UNDER the actual
// speech so it reads more "processed comms channel" than a
// plain phone-assistant voice. Browsers don't expose a raw
// audio node for SpeechSynthesis itself, so this plays a
// synthesized metallic "carrier" texture underneath the voice
// rather than filtering the voice directly.
function playMetallicUndertone(audioCtxRef, durationSec) {
  const ctx = getAudioContext(audioCtxRef);
  if (!ctx) return;

  const now = ctx.currentTime;

  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const carrierGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  carrier.type = "sawtooth";
  carrier.frequency.setValueAtTime(90, now);

  modulator.type = "square";
  modulator.frequency.setValueAtTime(38, now);
  modGain.gain.setValueAtTime(30, now);

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(220, now);
  filter.Q.setValueAtTime(4, now);

  carrierGain.gain.setValueAtTime(0.0001, now);
  carrierGain.gain.exponentialRampToValueAtTime(
    0.06,
    now + 0.15
  );
  carrierGain.gain.setValueAtTime(
    0.06,
    now + Math.max(0.2, durationSec - 0.3)
  );
  carrierGain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + durationSec
  );

  carrier.connect(filter);
  filter.connect(carrierGain);
  carrierGain.connect(ctx.destination);

  carrier.start(now);
  modulator.start(now);

  carrier.stop(now + durationSec + 0.1);
  modulator.stop(now + durationSec + 0.1);
}

function speakVillainLine(text, { rate = 0.78, pitch = 0.25 } = {}) {
  if (
    typeof window === "undefined" ||
    !window.speechSynthesis
  ) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);

  const deepVoice = pickDeepVoice();
  if (deepVoice) utterance.voice = deepVoice;

  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = 1;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);

  return utterance;
}
export default function CortexCore({
  phase = 0,
  unlocked = false,
  listening = false,
}) {
  const mountRef = useRef(null);
  const bootTimers = useRef([]);
  const audioCtxRef = useRef(null);

  // CortexCore now drives its own activation timeline internally
  // (15s total), instead of relying on the `phase` prop.
  const [internalPhase, setInternalPhase] = useState(0);

  const phaseRef = useRef(internalPhase);
  const unlockedRef = useRef(unlocked);
  const listeningRef = useRef(listening);

  useEffect(() => {
    phaseRef.current = internalPhase;
  }, [internalPhase]);

  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  /*
   * CORTEX — 15 SECOND CINEMATIC ACTIVATION
   *
   * CortexCore now owns its own phase timeline internally,
   * scaled to a 15s total activation instead of the old 30s.
   */

  useEffect(() => {
    // Clear previous timers safely
    bootTimers.current.forEach((timer) => {
      clearTimeout(timer);
    });

    bootTimers.current = [];

    if (!unlocked) {
      setInternalPhase(0);

      if (
        typeof window !== "undefined" &&
        window.speechSynthesis
      ) {
        window.speechSynthesis.cancel();
      }

      return undefined;
    }

    /*
     * 15-second cinematic activation timeline
     * (old 30s timeline scaled by 0.5).
     *
     * 0s     -> dormant
     * 1.5s   -> core ignition
     * 3.5s   -> fusion acceleration
     * 6.5s   -> first ring
     * 9s     -> second ring
     * 12s    -> third ring
     * 14.5s  -> fourth ring / fully activated
     */

    setInternalPhase(0);

    if (
      typeof window !== "undefined" &&
      window.speechSynthesis
    ) {
      speakVillainLine(
        "Cortex starting. Activation sequence initiated.",
        { rate: 0.78, pitch: 0.25 }
      );

      playMetallicUndertone(audioCtxRef, 3.2);
    }

    const steps = [
      { p: 1, t: 1500 },
      { p: 2, t: 3500 },
      { p: 3, t: 6500 },
      { p: 4, t: 9000 },
      { p: 5, t: 12000 },
      { p: 6, t: 14500 },
    ];

    steps.forEach(({ p, t }) => {
      bootTimers.current.push(
        setTimeout(() => {
          setInternalPhase(p);

          // Phases 3, 4, 5, 6 correspond to rings 1, 2, 3, 4
          // activating — play an escalating cinematic hit for
          // each one.
          if (p >= 3) {
            playRingActivationSound(
              audioCtxRef,
              p - 3
            );
          }

          if (
            p === 6 &&
            typeof window !== "undefined" &&
            window.speechSynthesis
          ) {
            speakVillainLine("CORTEX ACTIVATED.", {
              rate: 0.72,
              pitch: 0.2,
            });

            playMetallicUndertone(audioCtxRef, 2.2);
          }
        }, t)
      );
    });

    return () => {
      bootTimers.current.forEach((timer) => {
        clearTimeout(timer);
      });

      bootTimers.current = [];

      if (
        typeof window !== "undefined" &&
        window.speechSynthesis
      ) {
        window.speechSynthesis.cancel();
      }
    };
  }, [unlocked]);

  /*
   * Keep the component mounted in real 3D space.
   * Three.js animation/rendering should continue independently
   * from the React activation phase.
   */

  useEffect(() => {
    if (!mountRef.current) return undefined;

    let animationFrameId;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Keep refs updated without causing unnecessary React renders.
      const currentPhase = phaseRef.current;
      const currentUnlocked = unlockedRef.current;
      const currentListening = listeningRef.current;

      // Your Three.js animation/update logic goes here.
      //
      // currentPhase:
      // 0 = dormant
      // 1 = core ignition
      // 2 = fusion
      // 3 = ring 1
      // 4 = ring 2
      // 5 = ring 3
      // 6 = ring 4 / full activation
      //
      // currentUnlocked:
      // true/false
      //
      // currentListening:
      // true/false

      void currentPhase;
      void currentUnlocked;
      void currentListening;
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // ------------------------------------------------------------
  // REST OF YOUR EXISTING CORTEX CORE JSX / THREE.JS CODE BELOW
  // ------------------------------------------------------------

  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;

    const scene =
      new THREE.Scene();

    scene.background =
      new THREE.Color(0x000000);

    scene.fog =
      new THREE.FogExp2(
        0x050000,
        0.035
      );

    const camera =
      new THREE.PerspectiveCamera(
        45,
        container.clientWidth /
          container.clientHeight,
        0.1,
        100
      );

    camera.position.set(
      0,
      0.15,
      7.4
    );

    const renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2
      )
    );

    renderer.setSize(
      container.clientWidth,
      container.clientHeight
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 0.65;

    container.appendChild(
      renderer.domElement
    );

    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    // --------------------------------------------------
    // BLOOM POST-PROCESSING (AAA-style glow)
    // --------------------------------------------------

    const composer =
      new EffectComposer(renderer);

    composer.addPass(
      new RenderPass(scene, camera)
    );

    const bloomPass =
      new UnrealBloomPass(
        new THREE.Vector2(
          container.clientWidth,
          container.clientHeight
        ),
        0.45, // strength
        0.4,  // radius
        0.42  // threshold
      );

    composer.addPass(bloomPass);

    // --------------------------------------------------
    // MAIN CORTEX GROUP
    // --------------------------------------------------

    const cortex =
      new THREE.Group();

    scene.add(cortex);

    // --------------------------------------------------
    // LIGHTING
    // --------------------------------------------------

    const redLight =
      new THREE.PointLight(
        0xff1a08,
        0,
        10,
        2
      );

    redLight.position.set(
      0,
      0,
      0
    );

    cortex.add(redLight);

    const orangeLight =
      new THREE.PointLight(
        0xdd2a10,
        0,
        7,
        2
      );

    orangeLight.position.set(
      0.8,
      0.5,
      0.5
    );

    cortex.add(orangeLight);

    // --------------------------------------------------
    // CENTRAL ORB
    // --------------------------------------------------

    const orbGroup =
      new THREE.Group();

    cortex.add(orbGroup);

    const orbGeometry =
      new THREE.SphereGeometry(
        0.4,
        96,
        96
      );

    const plasmaMaterial =
      createPlasmaMaterial();

    const orb =
      new THREE.Mesh(
        orbGeometry,
        plasmaMaterial
      );

    orb.scale.setScalar(0.82);

    orbGroup.add(orb);

    // Inner hot sphere
    const innerGeometry =
      new THREE.SphereGeometry(
        0.34,
        64,
        64
      );

    const innerMaterial =
      new THREE.MeshBasicMaterial({
        color: 0x4a0400,
        transparent: true,
        opacity: 0.3,
        blending:
          THREE.AdditiveBlending,
      });

    const inner =
      new THREE.Mesh(
        innerGeometry,
        innerMaterial
      );

    orbGroup.add(inner);

    // Outer atmospheric glow
    const glowGeometry =
      new THREE.SphereGeometry(
        0.5,
        64,
        64
      );

    const glowMaterial =
      createGlowMaterial();

    const glow =
      new THREE.Mesh(
        glowGeometry,
        glowMaterial
      );

    orbGroup.add(glow);

    // --------------------------------------------------
    // ORB PARTICLES
    // --------------------------------------------------

    const plasmaParticles =
      createParticleSystem(
        900,
        0.7,
        0.32,
        10
      );

    cortex.add(
      plasmaParticles.points
    );

    // --------------------------------------------------
    // ESCAPING ENERGY DROPLETS
    // --------------------------------------------------

    const dropletCount = 28;

    const droplets = [];

    for (
      let i = 0;
      i < dropletCount;
      i++
    ) {
      const geometry =
        new THREE.SphereGeometry(
          0.025 +
            Math.random() * 0.035,
          12,
          12
        );

      const material =
        new THREE.MeshBasicMaterial({
          color:
            Math.random() > 0.25
              ? 0xff3215
              : 0xcc3a10,
          transparent: true,
          opacity: 0,
          blending:
            THREE.AdditiveBlending,
        });

      const drop =
        new THREE.Mesh(
          geometry,
          material
        );

      drop.userData = {
        seed:
          Math.random() * 100,
        angle:
          Math.random() *
          Math.PI *
          2,
        vertical:
          Math.random() * 2 - 1,
        speed:
          0.35 +
          Math.random() * 0.8,
        distance:
          0.7 +
          Math.random() * 1.4,
      };

      cortex.add(drop);
      droplets.push(drop);
    }

    // --------------------------------------------------
    // FOUR TRUE 3D RINGS
    // --------------------------------------------------

    const ringData = [
      {
        radius: 1.55,
        tube: 0.045,
        speed: 2.3,
        phase: 0.0,
        x: 0.6,
        y: 0.2,
        z: 0.0,
        scale: 1.0,
      },
      {
        radius: 1.3,
        tube: 0.058,
        speed: -1.9,
        phase: 1.7,
        x: 1.2,
        y: -0.7,
        z: 0.4,
        scale: 1.0,
      },
      {
        radius: 1.08,
        tube: 0.068,
        speed: 1.5,
        phase: 3.1,
        x: -0.8,
        y: 1.25,
        z: -0.7,
        scale: 1.0,
      },
      {
        radius: 0.88,
        tube: 0.076,
        speed: -1.1,
        phase: 4.8,
        x: 1.55,
        y: 0.65,
        z: 1.15,
        scale: 1.0,
      },
    ];

    const ringGroups = [];

    ringData.forEach(
      (data, index) => {
        const group =
          new THREE.Group();

        group.visible = false;

        group.rotation.set(
          data.x,
          data.y,
          data.z
        );

        cortex.add(group);

        // Black boundary ring — sits just outside the glowing
        // torus, opaque and non-additive, so each ring reads as
        // a distinct object with its own dark edge instead of
        // bleeding into the orb / other rings' glow.
        const borderGeometry =
          new THREE.TorusGeometry(
            data.radius,
            data.tube * 1.45,
            18,
            256
          );

        const borderMaterial =
          new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.92,
            depthWrite: true,
            side: THREE.DoubleSide,
          });

        const border =
          new THREE.Mesh(
            borderGeometry,
            borderMaterial
          );

        group.add(border);

        const geometry =
          new THREE.TorusGeometry(
            data.radius,
            data.tube,
            18,
            256
          );

        const material =
          createRingMaterial(index);

        const ring =
          new THREE.Mesh(
            geometry,
            material
          );

        group.add(ring);

        // Larger transparent energy shell
        const shellGeometry =
          new THREE.TorusGeometry(
            data.radius,
            data.tube * 2.7,
            14,
            256
          );

        const shellMaterial =
          new THREE.MeshBasicMaterial({
            color: 0xff1008,
            transparent: true,
            opacity: 0.055,
            blending:
              THREE.AdditiveBlending,
            depthWrite: false,
          });

        const shell =
          new THREE.Mesh(
            shellGeometry,
            shellMaterial
          );

        group.add(shell);

        // Ring particles
        const particleCount = 180;

        const positions =
          new Float32Array(
            particleCount * 3
          );

        for (
          let p = 0;
          p < particleCount;
          p++
        ) {
          const a =
            (p / particleCount) *
            Math.PI *
            2;

          const radius =
            data.radius +
            (Math.random() - 0.5) *
              data.tube *
              3;

          positions[p * 3] =
            Math.cos(a) * radius;

          positions[p * 3 + 1] =
            Math.sin(a) * radius;

          positions[p * 3 + 2] =
            (Math.random() - 0.5) *
            data.tube *
            5;
        }

        const particleGeometry =
          new THREE.BufferGeometry();

        particleGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            positions,
            3
          )
        );

        const particleMaterial =
          new THREE.PointsMaterial({
            color: 0xcc2a15,
            size:
              0.025 +
              index * 0.004,
            transparent: true,
            opacity: 0.0,
            blending:
              THREE.AdditiveBlending,
            depthWrite: false,
          });

        const ringParticles =
          new THREE.Points(
            particleGeometry,
            particleMaterial
          );

        group.add(
          ringParticles
        );

        ringGroups.push({
          group,
          ring,
          border,
          shell,
          ringParticles,
          material,
          data,
          index,
        });
      }
    );

    // --------------------------------------------------
    // BACKGROUND PARTICLES / ATMOSPHERE
    // --------------------------------------------------

    const ambientParticles =
      createParticleSystem(
        650,
        5.8,
        0.25,
        90
      );

    ambientParticles.material.uniforms.uOpacity.value =
      0.12;

    cortex.add(
      ambientParticles.points
    );

    // --------------------------------------------------
    // ACTIVATION FLASH
    // --------------------------------------------------

    const flashGeometry =
      new THREE.SphereGeometry(
        0.86,
        48,
        48
      );

    const flashMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xff270e,
        transparent: true,
        opacity: 0,
        blending:
          THREE.AdditiveBlending,
      });

    const flash =
      new THREE.Mesh(
        flashGeometry,
        flashMaterial
      );

    cortex.add(flash);

    // --------------------------------------------------
    // ANIMATION
    // --------------------------------------------------

    const clock =
      new THREE.Clock();

    let animationFrame;

    let previousPhase = phaseRef.current;

    let finalPulseStart = -1;

    const animate = () => {
      animationFrame =
        requestAnimationFrame(
          animate
        );

      const elapsed =
        clock.getElapsedTime();

      const currentPhase =
        phaseRef.current;

      const isUnlocked =
        unlockedRef.current;

      const activationProgress =
        isUnlocked
          ? currentPhase >= 6
            ? 1
            : currentPhase / 6
          : 0;

      // ----------------------------------------------
      // TIME
      // ----------------------------------------------

      plasmaMaterial.uniforms.uTime.value =
        elapsed;

      plasmaMaterial.uniforms.uProgress.value =
        activationProgress;

      plasmaMaterial.uniforms.uPower.value =
        0.15 +
        activationProgress * 0.85;

      glowMaterial.uniforms.uTime.value =
        elapsed;

      glowMaterial.uniforms.uOpacity.value =
        0.06 +
        activationProgress * 0.52;

      innerMaterial.opacity =
        0.16 +
        activationProgress * 0.26;

      // ----------------------------------------------
      // CORE MOVEMENT
      // ----------------------------------------------

      const turbulence =
        0.004 +
        activationProgress * 0.016;

      orb.rotation.x +=
        turbulence;

      orb.rotation.y +=
        turbulence * 0.72;

      orb.rotation.z =
        Math.sin(
          elapsed * 0.68
        ) *
        0.12;

      inner.rotation.x =
        elapsed * 0.22;

      inner.rotation.y =
        elapsed * -0.31;

      glow.rotation.y =
        elapsed * 0.08;

      // ----------------------------------------------
      // LIGHT
      // ----------------------------------------------

      const lightPower =
        activationProgress *
        (1.3 +
          Math.sin(
            elapsed * 2.7
          ) *
            0.28);

      redLight.intensity =
        lightPower;

      orangeLight.intensity =
        activationProgress *
        0.55;

      // ----------------------------------------------
      // PLASMA PARTICLES
      // ----------------------------------------------

      plasmaParticles.material.uniforms.uTime.value =
        elapsed;

      plasmaParticles.material.uniforms.uSize.value =
        0.65 +
        activationProgress *
          0.35;

      plasmaParticles.material.uniforms.uOpacity.value =
        0.08 +
        activationProgress *
          0.78;

      ambientParticles.material.uniforms.uTime.value =
        elapsed;

      // ----------------------------------------------
      // ENERGY DROPLETS
      // ----------------------------------------------

      droplets.forEach(
        (drop, index) => {
          const seed =
            drop.userData.seed;

          const cycle =
            (
              elapsed *
                drop.userData.speed *
                0.18 +
              seed
            ) % 1;

          const outward =
            cycle < 0.72
              ? cycle / 0.72
              : (1 - cycle) / 0.28;

          const radius =
            0.66 +
            outward *
              drop.userData.distance;

          const angle =
            drop.userData.angle +
            elapsed *
              (0.45 +
                index * 0.013);

          const y =
            drop.userData.vertical *
            outward *
            0.55;

          drop.position.set(
            Math.cos(angle) *
              radius,
            y,
            Math.sin(angle) *
              radius
          );

          const visibility =
            activationProgress *
            Math.sin(
              cycle *
                Math.PI
            );

          drop.material.opacity =
            Math.max(
              0,
              visibility * 1.15
            );

          const s =
            0.6 +
            Math.sin(
              elapsed * 5 +
                seed
            ) *
              0.25;

          drop.scale.setScalar(
            Math.max(0.25, s)
          );
        }
      );

      // ----------------------------------------------
      // RINGS
      // ----------------------------------------------

      ringGroups.forEach(
        (item) => {
          const {
            group,
            ring,
            ringParticles,
            material,
            data,
            index,
          } = item;

          const requiredPhase =
            index + 3;

          const ringActive =
            currentPhase >=
            requiredPhase;

          if (!ringActive) {
            group.visible = false;
            material.uniforms.uEnergy.value =
              0;

            ringParticles.material.opacity =
              0;

            return;
          }

          group.visible = true;

          const ringProgress =
            clamp01(
              (
                currentPhase -
                (requiredPhase - 1)
              )
            );

          const energy =
            smoothstep(
              0,
              1,
              ringProgress
            );

          material.uniforms.uTime.value =
            elapsed;

          material.uniforms.uEnergy.value =
            energy;

          ringParticles.material.opacity =
            0.25 +
            energy * 0.65;

          // ------------------------------------------
          // TRUE 3D ORIENTATION
          //
          // Every ring uses a DIFFERENT combination
          // of axes and changing sine/cosine motion.
          // ------------------------------------------

          const s =
            data.speed;

          group.rotation.x =
            data.x +
            Math.sin(
              elapsed *
                0.19 *
                s +
                data.phase
            ) *
              1.05;

          group.rotation.y =
            data.y +
            Math.cos(
              elapsed *
                0.23 *
                s +
                data.phase
            ) *
              1.35;

          group.rotation.z =
            data.z +
            Math.sin(
              elapsed *
                0.31 *
                s +
                data.phase
            ) *
              0.95;

          // ------------------------------------------
          // 3D FIELD SWEEP
          // ------------------------------------------

          const scaleWave =
            1 +
            Math.sin(
              elapsed *
                (0.7 +
                  index * 0.13) +
                data.phase
            ) *
              0.035;

          group.scale.set(
            scaleWave,
            scaleWave,
            scaleWave
          );

          // Ring itself has independent spin
          ring.rotation.z +=
            s * 0.008;

          // Particle stream moves around ring
          ringParticles.rotation.z =
            elapsed *
            s *
            0.65;
        }
      );

      // ----------------------------------------------
      // FINAL POWER PHASE
      // ----------------------------------------------

      if (
        currentPhase === 6 &&
        previousPhase !== 6
      ) {
        finalPulseStart =
          elapsed;
      }

      previousPhase =
        currentPhase;

      if (finalPulseStart >= 0) {
        const pulseTime =
          elapsed -
          finalPulseStart;

        const pulse =
          Math.exp(
            -pulseTime * 1.9
          ) *
          Math.sin(
            pulseTime * 15
          );

        flash.scale.setScalar(
          1 +
            Math.max(
              0,
              pulseTime < 1.1
                ? pulse * 0.22
                : 0
            )
        );

        flash.material.opacity =
          pulseTime < 1.1
            ? Math.max(
                0,
                pulse * 0.32
              )
            : 0;
      }

      // ----------------------------------------------
      // CINEMATIC CAMERA
      // ----------------------------------------------

      const cinematicPower =
        activationProgress;

      const cameraOrbit =
        elapsed * 0.045;

      const targetX =
        Math.sin(
          cameraOrbit
        ) *
        0.34 *
        cinematicPower;

      const targetY =
        Math.cos(
          cameraOrbit * 0.8
        ) *
        0.20 *
        cinematicPower;

      camera.position.x +=
        (
          targetX -
          camera.position.x
        ) *
        0.012;

      camera.position.y +=
        (
          targetY -
          camera.position.y
        ) *
        0.012;

      const breathing =
        Math.sin(
          elapsed * 0.12
        );

      const targetZ =
        7.35 -
        activationProgress *
          0.45 +
        breathing * 0.08;

      camera.position.z +=
        (
          targetZ -
          camera.position.z
        ) *
        0.012;

      camera.lookAt(
        0,
        0,
        0
      );

      // ----------------------------------------------
      // LISTENING EFFECT
      // ----------------------------------------------

      if (
        listeningRef.current &&
        currentPhase >= 6
      ) {
        const pulse =
          1 +
          Math.sin(
            elapsed * 4.5
          ) *
            0.025;

        cortex.scale.setScalar(
          pulse
        );
      } else {
        cortex.scale.setScalar(
          1
        );
      }

      composer.render();
    };

    animate();

    // --------------------------------------------------
    // RESIZE
    // --------------------------------------------------

    const handleResize = () => {
      const width =
        container.clientWidth;

      const height =
        container.clientHeight;

      if (
        width <= 0 ||
        height <= 0
      ) {
        return;
      }

      camera.aspect =
        width / height;

      camera.updateProjectionMatrix();

      renderer.setSize(
        width,
        height,
        false
      );

      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          2
        )
      );

      composer.setSize(width, height);
      composer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          2
        )
      );

      bloomPass.setSize(width, height);
    };

    window.addEventListener(
      "resize",
      handleResize
    );

    handleResize();

    return () => {
      cancelAnimationFrame(
        animationFrame
      );

      window.removeEventListener(
        "resize",
        handleResize
      );

      renderer.dispose();
      composer.dispose();

      orbGeometry.dispose();
      plasmaMaterial.dispose();

      innerGeometry.dispose();
      innerMaterial.dispose();

      glowGeometry.dispose();
      glowMaterial.dispose();

      flashGeometry.dispose();
      flashMaterial.dispose();

      plasmaParticles.geometry.dispose();
      plasmaParticles.material.dispose();

      ambientParticles.geometry.dispose();
      ambientParticles.material.dispose();

      ringGroups.forEach(
        (item) => {
          item.ring.geometry.dispose();
          item.ring.material.dispose();

          item.border.geometry.dispose();
          item.border.material.dispose();

          item.shell.geometry.dispose();
          item.shell.material.dispose();

          item.ringParticles.geometry.dispose();
          item.ringParticles.material.dispose();
        }
      );

      droplets.forEach(
        (drop) => {
          drop.geometry.dispose();
          drop.material.dispose();
        }
      );

      if (
        renderer.domElement.parentNode ===
        container
      ) {
        container.removeChild(
          renderer.domElement
        );
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0"
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}