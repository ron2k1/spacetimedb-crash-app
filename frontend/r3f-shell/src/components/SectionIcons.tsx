// SectionIcons -- floating "sticker" icons hovering over the world that CLEARLY say what the active
// panel is for. Color alone (green vs lavender vs teal vs lime) sets the mood, but these glyphs make
// each biome unmistakably the panel it represents:
//   skills   -> books / ABC / lightbulb   (learn)
//   creator  -> palette / sparkle / puzzle (create)
//   agent    -> robot / brain / puzzle     (subagents)
//   activity -> star / trophy / chart      (progress)
//
// All four sets stay mounted; each icon eases its scale+opacity toward visible-if-active, so a tab
// switch cross-fades the icons in lockstep with the ground biome (Ground.tsx) and the sky
// (Atmosphere.tsx). Each glyph is drawn onto a soft white "bubble" via CanvasTexture (same offline,
// no-Suspense pattern as the fox's chest wordmark) so it reads against any biome color, and billboards
// to always face the camera.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Group, MeshBasicMaterial } from 'three';
import { useDashboardStore, type DashSection } from '../store/dashboardStore';

type IconDef = { glyph: string; position: [number, number, number]; size: number; phase: number };

// Three icons per section, placed in the open sky above/left of the fox (the dashboard panel owns the
// right ~30% of the viewport, so we keep the stage's left-back clear airspace). Same slots across all
// sections so they cross-fade in place.
const SECTION_ICONS: Record<DashSection, IconDef[]> = {
  skills: [
    { glyph: '📚', position: [-2.5, 2.15, -0.6], size: 0.9, phase: 0 },
    { glyph: '🔤', position: [-3.4, 1.5, 0.5], size: 0.64, phase: 1.7 },
    { glyph: '💡', position: [-1.7, 2.75, -1.5], size: 0.62, phase: 3.1 },
  ],
  creator: [
    { glyph: '🎨', position: [-2.5, 2.15, -0.6], size: 0.9, phase: 0 },
    { glyph: '✨', position: [-3.4, 1.5, 0.5], size: 0.64, phase: 1.7 },
    { glyph: '🧩', position: [-1.7, 2.75, -1.5], size: 0.62, phase: 3.1 },
  ],
  agent: [
    { glyph: '🤖', position: [-2.5, 2.15, -0.6], size: 0.9, phase: 0 },
    { glyph: '🧠', position: [-3.4, 1.5, 0.5], size: 0.64, phase: 1.7 },
    { glyph: '🧩', position: [-1.7, 2.75, -1.5], size: 0.62, phase: 3.1 },
  ],
  // connections -> bring-your-own-keys: a plug, a key, and a link (plug your own accounts in).
  connections: [
    { glyph: '🔌', position: [-2.5, 2.15, -0.6], size: 0.9, phase: 0 },
    { glyph: '🔑', position: [-3.4, 1.5, 0.5], size: 0.64, phase: 1.7 },
    { glyph: '🔗', position: [-1.7, 2.75, -1.5], size: 0.62, phase: 3.1 },
  ],
  activity: [
    { glyph: '⭐', position: [-2.5, 2.15, -0.6], size: 0.9, phase: 0 },
    { glyph: '🏆', position: [-3.4, 1.5, 0.5], size: 0.64, phase: 1.7 },
    { glyph: '📈', position: [-1.7, 2.75, -1.5], size: 0.62, phase: 3.1 },
  ],
  // technical -> raw CLI mirror: terminal / code / computer (the developer-facing read-only feed)
  technical: [
    { glyph: '🖥️', position: [-2.5, 2.15, -0.6], size: 0.9, phase: 0 },
    { glyph: '⌨️', position: [-3.4, 1.5, 0.5], size: 0.64, phase: 1.7 },
    { glyph: '🧑‍💻', position: [-1.7, 2.75, -1.5], size: 0.62, phase: 3.1 },
  ],
};

// Draw a glyph centered on a soft radial white bubble so it pops against any biome color.
function iconTexture(glyph: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 60, 8, 64, 62, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.96)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.66)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(64, 62, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '72px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 64, 66);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function IconSprite({ def, active }: { def: IconDef; active: boolean }) {
  const tex = useMemo(() => iconTexture(def.glyph), [def.glyph]);
  const group = useRef<Group>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  const vis = useRef(active ? 1 : 0); // 0..1 eased visibility

  useFrame((state, dt) => {
    const target = active ? 1 : 0;
    vis.current += (target - vis.current) * (1 - Math.exp(-dt * 6));
    const v = vis.current;
    if (group.current) {
      const t = state.clock.elapsedTime;
      // gentle bob (phase-offset per icon) so the cluster feels alive, not pinned
      group.current.position.set(
        def.position[0],
        def.position[1] + Math.sin(t * 1.4 + def.phase) * 0.08,
        def.position[2],
      );
      group.current.scale.setScalar(def.size * (0.6 + 0.4 * v)); // pop in from 60%
      group.current.visible = v > 0.01; // fully-faded sets skip drawing
    }
    if (mat.current) mat.current.opacity = v;
  });

  return (
    <Billboard ref={group}>
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={mat}
          map={tex}
          transparent
          opacity={active ? 1 : 0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </Billboard>
  );
}

export function SectionIcons() {
  const section = useDashboardStore((s) => s.section);
  return (
    <>
      {(Object.keys(SECTION_ICONS) as DashSection[]).map((sec) =>
        SECTION_ICONS[sec].map((def, i) => (
          <IconSprite key={`${sec}-${i}`} def={def} active={sec === section} />
        )),
      )}
    </>
  );
}
