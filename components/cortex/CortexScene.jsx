"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import FusionCore from "./FusionCore";

export default function CortexScene({
  active = {unlocked},
  listening = {listening},
  busy = {busy},
}) {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <color attach="background" args={["#000000"]} />

        <ambientLight intensity={active ? 0.25 : 0.08} />
        <pointLight
          position={[0, 0, 2]}
          intensity={active ? 2.2 : 0.3}
          color="#ff2222"
          distance={12}
        />
        <pointLight
          position={[3, 2, -2]}
          intensity={active ? 0.6 : 0.1}
          color="#ff6666"
        />
        <pointLight position={[-3, -1, 2]} intensity={0.3} color="#440000" />

        <FusionCore active={active} listening={listening} busy={busy} />

        <EffectComposer>
          <Bloom
            intensity={active ? 1.35 : 0.25}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}