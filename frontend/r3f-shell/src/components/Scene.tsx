import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sparkles, ContactShadows } from '@react-three/drei';
import { useDialogStore } from '../store/dialogStore';
import { DialogBubble } from './DialogBubble';
import { FoxMascot } from './FoxMascot';
import { Village } from './Village';
import { Atmosphere } from './Atmosphere';
import { SectionIcons } from './SectionIcons';
import { Glow } from './Glow';
import { Effects } from './Effects';
import { theme, SKY_CSS } from '../theme';

const FLOOR_Y = -0.9;

// The fox's spoken lines, cycled on each tap. Tapping the mascot now makes Crash *talk* (a read-only
// speech bubble) and points you at the prompt bar, instead of opening an input on the fox -- all
// typing moved to the bottom PromptBar. Module-level index so it advances across renders.
const FOX_GREETS = [
  "Hi! I'm Crash. 🦊",
  'Ask me anything in the bar below! ✨',
  'Pick a skill from my shelf →',
  'Wanna learn something cool?',
];
let greetIdx = 0;

export function Scene() {
  const setOpen = useDialogStore((s) => s.setOpen);
  const setPrompt = useDialogStore((s) => s.setPrompt);
  const sayHello = () => {
    setPrompt(FOX_GREETS[greetIdx % FOX_GREETS.length]);
    setOpen(true);
    greetIdx += 1;
  };

  return (
    <Canvas
      camera={{ position: [4.6, 2.7, 5.2], fov: 46 }}
      // Render at up to 2x device pixels: this is the main "clarity" lever -- it supersamples
      // geometry edges so the world reads smooth/crisp instead of soft and boxy. Capped at 2 so a
      // 4K external monitor doesn't quadruple the fragment cost.
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        // Warm pre-paint fallback: shows for the split second before WebGL initializes, so the first
        // frame is already golden, never a black flash. Once the Skydome renders it covers this.
        background: SKY_CSS,
      }}
    >
      {/* Sky dome + distance fog + warm key/rim lights -- all of which CROSS-FADE to a palette that
          matches the active dashboard tab (cozy gold / dreamy violet / electric cyan / fresh green).
          The island + fox below stay put; only this background atmosphere changes. The clarity work
          (fog near-plane 18, warm fill) lives inside it now. */}
      <Atmosphere />

      {/* Procedural world: the solid island, village, props + the upright fox mascot. */}
      <Village />
      {/* Floating thematic stickers that name the active panel (books / palette / plug / trophy),
          cross-fading in lockstep with the ground biome + sky. */}
      <SectionIcons />
      <FoxMascot onClick={sayHello} />
      <DialogBubble />

      {/* A soft contact shadow grounds the fox + buildings on the grass (cheap -- no shadow maps). */}
      <ContactShadows position={[0, FLOOR_Y + 0.02, 0]} scale={15} blur={2.6} opacity={0.42} far={5} color="#3a2414" />

      {/* A soft hero backdrop halo behind the fox -- this one stays, because the fox is NOT emissive
          so the real Bloom pass can't create it. The old lantern/window halo sprites are gone: those
          props are emissive (emissiveIntensity > 1), so the Bloom pass blooms them for real now. */}
      <Glow position={[0, 0.7, -0.4]} color="#ffdca0" size={4.4} opacity={0.18} />

      {/* Drifting warm fireflies/motes for life + sparkle (two tones of warm gold). */}
      <Sparkles count={55} scale={[11, 5, 11]} position={[0, 1.6, 0]} size={3} speed={0.3} color={theme.glow.fireflyWarm} />
      <Sparkles count={28} scale={[8, 3.5, 8]} position={[0, 0.9, 0]} size={2} speed={0.22} color={theme.glow.fireflyGold} />

      {/* Clamped "diorama" controls: gentle orbit, but you CANNOT pan away or dip below the horizon
          to peek under the island, and zoom is bounded -- it stays a contained stage, not a free-fly
          open world. */}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3.8}
        maxDistance={8.5}
        minPolarAngle={0.65}
        maxPolarAngle={Math.PI / 2.15}
        target={[0.2, 0.5, 0]}
      />

      {/* Post-processing: the real Bloom + Vignette pass. MUST be the last child of the Canvas so it
          wraps the fully-rendered scene as the final output stage. */}
      <Effects />
    </Canvas>
  );
}
