// FoxMascot -- an upright, Crash-STYLE bandicoot-ified fox guide, built entirely from low-poly
// primitives. It is OUR OWN geometry + an original character (no Activision IP, no third-party
// model license), so it stays CC0-clean while landing the playful platformer-mascot energy.
//
// Design (locked with the operator): keep the orange fox fur, but push the head toward bandicoot
// (rounder muzzle, a spiky hair tuft, a small stub tail); chunky cartoon proportions (big head,
// big hands/feet, short legs); a cheeky smirk (big close-set eyes, asymmetric brows, tilted
// half-smile); a teal t-shirt with a "Crash" wordmark; denim shorts. Idle bob/sway + tail wag via
// useFrame -- no skeletal rig. Clicking it opens the DialogBubble (same contract as before).
//
// NOTE (cross-renderer divergence): the Unity client still renders the quadruped Khronos fox via
// glTFast. This mascot intentionally diverges per the operator's visual direction; reconciled
// deliberately later, not silently.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture } from 'three';
import type { Group } from 'three';

// Warm storybook palette + the new outfit colors.
const FUR = '#e3793a';
const CREAM = '#f6e7d2';
const DARK = '#2b1d16';
const WHITE = '#fbf7f0'; // eye whites
const HAND = '#f0dcc0'; // tan cartoon hands
const SHIRT = '#15b3ad'; // teal tee
const SHORTS = '#3f5a82'; // denim shorts

// Build the "Crash" chest wordmark once: draw it to a 2D canvas (our own lettering, browser font),
// then hand the canvas to a CanvasTexture. Synchronous + offline-safe -- no font fetch, no Suspense.
function useWordmarkTexture(text: string) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.font = 'italic 900 76px "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#0c5e5c'; // dark-teal outline so white text pops on the teal tee
      ctx.strokeText(text, c.width / 2, c.height / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, c.width / 2, c.height / 2);
    }
    const tex = new CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }, [text]);
}

export function FoxMascot({ onClick }: { onClick?: () => void }) {
  const root = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const wordmark = useWordmarkTexture('Crash');

  // Floor is y = -0.9; we model with feet at local y = 0 and offset down to it, then add a springy
  // idle bob (a touch livelier than a calm fox -- this is a bouncy platformer mascot). Base facing
  // +PI/4 turns it toward the [3,3,3] camera for a 3/4 hero view.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.position.y = -0.9 + Math.abs(Math.sin(t * 1.7)) * 0.06;
      root.current.rotation.y = Math.PI / 4 + Math.sin(t * 0.7) * 0.06;
    }
    if (tail.current) {
      tail.current.rotation.z = Math.sin(t * 3.0) * 0.18;
    }
  });

  const hoverOn = () => {
    document.body.style.cursor = 'pointer';
  };
  const hoverOff = () => {
    document.body.style.cursor = 'default';
  };

  return (
    <group
      ref={root}
      position={[0, -0.9, 0]}
      rotation={[0, Math.PI / 4, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerOver={hoverOn}
      onPointerOut={hoverOff}
    >
      {/* big dark cartoon feet (extend forward) */}
      {[-0.2, 0.2].map((x) => (
        <RoundedBox key={x} args={[0.34, 0.2, 0.52]} radius={0.09} smoothness={5} position={[x, 0.1, 0.12]}>
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </RoundedBox>
      ))}

      {/* short fur legs */}
      {[-0.2, 0.2].map((x) => (
        <RoundedBox key={x} args={[0.26, 0.5, 0.3]} radius={0.12} smoothness={5} position={[x, 0.46, 0]}>
          <meshStandardMaterial color={FUR} roughness={0.7} />
        </RoundedBox>
      ))}

      {/* denim shorts over the hips / upper legs */}
      <RoundedBox args={[0.76, 0.44, 0.5]} radius={0.16} smoothness={5} position={[0, 0.82, 0]}>
        <meshStandardMaterial color={SHORTS} roughness={0.85} />
      </RoundedBox>

      {/* teal t-shirt torso (small, under the big head) */}
      <RoundedBox args={[0.74, 0.58, 0.46]} radius={0.16} smoothness={5} position={[0, 1.22, 0]}>
        <meshStandardMaterial color={SHIRT} roughness={0.75} />
      </RoundedBox>
      {/* short teal sleeves at the shoulders */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.22, 0.24, 0.42]} radius={0.1} smoothness={5} position={[s * 0.44, 1.42, 0]}>
          <meshStandardMaterial color={SHIRT} roughness={0.75} />
        </RoundedBox>
      ))}
      {/* "Crash" wordmark on the chest -- unlit so it stays crisp under the warm scene lights */}
      <mesh position={[0, 1.24, 0.235]}>
        <planeGeometry args={[0.54, 0.27]} />
        <meshBasicMaterial map={wordmark} transparent toneMapped={false} depthWrite={false} />
      </mesh>

      {/* arms (fur, from under the sleeves) + big tan cartoon hands */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.48, 1.3, 0.02]} rotation={[0, 0, s * -0.16]}>
          <RoundedBox args={[0.18, 0.42, 0.2]} radius={0.08} smoothness={5} position={[0, -0.06, 0]}>
            <meshStandardMaterial color={FUR} roughness={0.7} />
          </RoundedBox>
          <RoundedBox args={[0.26, 0.26, 0.26]} radius={0.12} smoothness={5} position={[0, -0.36, 0.02]}>
            <meshStandardMaterial color={HAND} roughness={0.7} />
          </RoundedBox>
        </group>
      ))}

      {/* BIG head (chunky cartoon) */}
      <group position={[0, 1.9, 0]}>
        <RoundedBox args={[0.72, 0.64, 0.6]} radius={0.18} smoothness={6}>
          <meshStandardMaterial color={FUR} roughness={0.7} />
        </RoundedBox>

        {/* rounder bandicoot muzzle (sphere, slightly squashed) + dark nose */}
        <mesh position={[0, -0.09, 0.3]} scale={[1.15, 0.82, 1.05]}>
          <sphereGeometry args={[0.2, 20, 20]} />
          <meshStandardMaterial color={CREAM} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.05, 0.52]}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshStandardMaterial color={DARK} roughness={0.45} />
        </mesh>
        {/* tilted half-smile = cheeky smirk */}
        <RoundedBox args={[0.22, 0.04, 0.03]} radius={0.008} smoothness={4} position={[0.04, -0.21, 0.49]} rotation={[0, 0, -0.3]}>
          <meshStandardMaterial color={DARK} roughness={0.5} />
        </RoundedBox>

        {/* big close-set eyes (tall whites + small pupils) */}
        {[-0.13, 0.13].map((x) => (
          <mesh key={x} position={[x, 0.14, 0.3]} scale={[0.9, 1.25, 0.7]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color={WHITE} roughness={0.4} />
          </mesh>
        ))}
        {[-0.12, 0.14].map((x) => (
          <mesh key={x} position={[x, 0.13, 0.42]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color={DARK} roughness={0.35} />
          </mesh>
        ))}
        {/* asymmetric brows: left raised + flat, right angled down-out = cheeky/skeptical */}
        <RoundedBox args={[0.19, 0.05, 0.05]} radius={0.012} smoothness={4} position={[-0.14, 0.36, 0.31]} rotation={[0, 0, 0.08]}>
          <meshStandardMaterial color={DARK} roughness={0.5} />
        </RoundedBox>
        <RoundedBox args={[0.19, 0.05, 0.05]} radius={0.012} smoothness={4} position={[0.14, 0.31, 0.31]} rotation={[0, 0, -0.32]}>
          <meshStandardMaterial color={DARK} roughness={0.5} />
        </RoundedBox>

        {/* rounded upright ears with cream inners */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.3, 0.34, -0.04]} rotation={[0, 0, s * -0.15]}>
            <mesh>
              <coneGeometry args={[0.13, 0.32, 14]} />
              <meshStandardMaterial color={FUR} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0, 0.06]} scale={0.55}>
              <coneGeometry args={[0.13, 0.32, 14]} />
              <meshStandardMaterial color={CREAM} roughness={0.6} />
            </mesh>
          </group>
        ))}

        {/* spiky bandicoot hair tuft: three orange cones fanned up between the ears */}
        <mesh position={[0, 0.42, 0.05]}>
          <coneGeometry args={[0.1, 0.4, 8]} />
          <meshStandardMaterial color={FUR} roughness={0.7} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.15, 0.38, 0.02]} rotation={[0, 0, s * -0.45]}>
            <coneGeometry args={[0.085, 0.34, 8]} />
            <meshStandardMaterial color={FUR} roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* small stub tail (smaller than the old bushy one); wags via useFrame */}
      <group ref={tail} position={[0, 0.7, -0.3]} rotation={[-1.2, 0, 0]}>
        <mesh position={[0, 0.16, 0]}>
          <coneGeometry args={[0.13, 0.36, 12]} />
          <meshStandardMaterial color={FUR} roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <coneGeometry args={[0.07, 0.16, 12]} />
          <meshStandardMaterial color={CREAM} roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}
