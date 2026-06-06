// Glow -- a cheap, dependency-free fake-bloom: a camera-facing billboard plane painted with a soft
// radial gradient and drawn ADDITIVELY, so it reads as a warm halo of light around the lantern and
// behind the mascot (a gentle hero "spotlight"). We use this instead of a real postprocessing Bloom
// pass on purpose: @react-three/postprocessing 2.19.x targets R3F v8 / React 18 / three <0.185 and
// is incompatible with this shell's R3F v9 / React 19 / three 0.160 stack (confirmed by pnpm's peer
// report). Additive blending means the gradient's black edge contributes nothing, so the halo melts
// cleanly into the scene with no hard rectangle.
import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, CanvasTexture } from 'three';

function useRadialTexture(color: string) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, color); // bright core
      g.addColorStop(0.35, color);
      g.addColorStop(1, '#000000'); // -> additive zero at the edge
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    return new CanvasTexture(c);
  }, [color]);
}

export function Glow({
  position,
  color,
  size = 2,
  opacity = 0.6,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
  opacity?: number;
}) {
  const tex = useRadialTexture(color);
  return (
    <Billboard position={position}>
      <mesh>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          map={tex}
          transparent
          opacity={opacity}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
}
