// Atmosphere -- the per-section "mood/biome": the enclosing sky dome, the distance fog, and the warm
// key+rim lights, ALL of which cross-fade to a palette that matches the active dashboard tab (see
// SECTION_SKY in theme.ts). The island, fox, and props never move -- only the *background* behind
// them shifts -- so each panel reads against its own vibe (cozy gold for Skills, dreamy violet for
// Create, electric cyan for Agent, fresh green for Activity) while still feeling like one
// continuous world. This replaces the old static <Skydome> + inline lights/fog in Scene.
//
// HOW the cross-fade works (and why this shape): the sky is the same tiny 8x256 canvas-gradient
// texture as before -- sRGB, tone-mapping off -- so the on-screen colors match the CSS hex EXACTLY,
// with none of the color-management guesswork a raw GLSL gradient would invite. Each frame WHILE a
// transition is in flight we lerp a set of Color objects toward the target palette, repaint that
// little canvas from them, and copy the same colors onto the fog + the two directional lights. Once
// converged we flip a dirty flag off and stop repainting, so the per-frame cost (a trivial gradient
// fill + a ~2KB texture re-upload) only exists during the ~0.5s tab change, not forever.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, CanvasTexture, Color, SRGBColorSpace } from 'three';
import type { DirectionalLight, Fog } from 'three';
import { useDashboardStore, type DashSection } from '../store/dashboardStore';
import { SECTION_SKY, theme } from '../theme';

type PaletteColors = {
  top: Color;
  mid: Color;
  horizon: Color;
  fog: Color;
  key: Color;
  rim: Color;
};

export function Atmosphere() {
  const section = useDashboardStore((s) => s.section);

  // The sky texture + the canvas/ctx we repaint into, created once for the component's life.
  const sky = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { ctx, texture };
  }, []);

  // Parse each section's hex palette into Color objects ONCE, so the per-frame lerp never re-parses
  // strings. Keyed by section so a tab switch is just a different lerp target.
  const targets = useMemo(() => {
    const out = {} as Record<DashSection, PaletteColors>;
    (Object.keys(SECTION_SKY) as DashSection[]).forEach((k) => {
      const p = SECTION_SKY[k];
      out[k] = {
        top: new Color(p.top),
        mid: new Color(p.mid),
        horizon: new Color(p.horizon),
        fog: new Color(p.fog),
        key: new Color(p.key),
        rim: new Color(p.rim),
      };
    });
    return out;
  }, []);

  // The animated "current" colors, mutated in place each frame. Lazy-initialized from whatever
  // section is active at mount (so the world starts already on-palette -- no fade-in from black).
  const curRef = useRef<PaletteColors | null>(null);
  if (curRef.current === null) {
    const t = targets[section] ?? targets.skills;
    curRef.current = {
      top: t.top.clone(),
      mid: t.mid.clone(),
      horizon: t.horizon.clone(),
      fog: t.fog.clone(),
      key: t.key.clone(),
      rim: t.rim.clone(),
    };
  }
  const cur = curRef.current;

  const fogRef = useRef<Fog>(null);
  const keyRef = useRef<DirectionalLight>(null);
  const rimRef = useRef<DirectionalLight>(null);

  const lastSection = useRef<DashSection>(section);
  const dirty = useRef(true); // paint at least once on mount

  const repaint = () => {
    const { ctx, texture } = sky;
    if (!ctx) return;
    // CanvasTexture is flipY=true, so canvas-top (y=0) maps to the sphere's TOP pole. Same stops as
    // the original static dome: zenith -> gold band -> horizon, pinned through the bottom pole.
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, cur.top.getStyle());
    g.addColorStop(0.5, cur.mid.getStyle());
    g.addColorStop(0.82, cur.horizon.getStyle());
    g.addColorStop(1, cur.horizon.getStyle());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    texture.needsUpdate = true;
  };

  useFrame((_, dt) => {
    // A tab change re-arms the transition.
    if (section !== lastSection.current) {
      lastSection.current = section;
      dirty.current = true;
    }
    if (!dirty.current) return; // settled -> zero per-frame work

    const t = targets[section] ?? targets.skills;
    // Frame-rate-independent ease: reaches the target in ~0.5s regardless of fps.
    const a = 1 - Math.exp(-dt * 7);
    cur.top.lerp(t.top, a);
    cur.mid.lerp(t.mid, a);
    cur.horizon.lerp(t.horizon, a);
    cur.fog.lerp(t.fog, a);
    cur.key.lerp(t.key, a);
    cur.rim.lerp(t.rim, a);

    // Converged? (tiny summed channel delta) -> snap exact, repaint once more, then go idle.
    const delta =
      Math.abs(cur.horizon.r - t.horizon.r) +
      Math.abs(cur.horizon.g - t.horizon.g) +
      Math.abs(cur.horizon.b - t.horizon.b) +
      Math.abs(cur.top.r - t.top.r) +
      Math.abs(cur.mid.g - t.mid.g) +
      Math.abs(cur.fog.b - t.fog.b);
    if (delta < 0.005) {
      cur.top.copy(t.top);
      cur.mid.copy(t.mid);
      cur.horizon.copy(t.horizon);
      cur.fog.copy(t.fog);
      cur.key.copy(t.key);
      cur.rim.copy(t.rim);
      dirty.current = false;
    }

    repaint();
    fogRef.current?.color.copy(cur.fog);
    keyRef.current?.color.copy(cur.key);
    rimRef.current?.color.copy(cur.rim);
  });

  return (
    <>
      {/* Distance haze, color-matched to the active sky so the horizon melts correctly in every mood.
          near/far (18/44) match the old Scene fog -- subject stays crisp, only the far edge fades. */}
      <fog ref={fogRef} attach="fog" args={[SECTION_SKY[section].fog, 18, 44]} />

      {/* The enclosing sky dome: every camera ray hits it, so the world is never see-through. Unlit +
          fog-exempt so the gradient stays clean; depthWrite off so nothing z-fights against it. */}
      <mesh renderOrder={-1}>
        <sphereGeometry args={[45, 32, 24]} />
        <meshBasicMaterial map={sky.texture} side={BackSide} toneMapped={false} fog={false} depthWrite={false} />
      </mesh>

      {/* Constant warm fill keeps the fox nicely lit in every biome; the MOOD comes from the sky
          gradient + fog + the key/rim tint above. */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={[theme.light.skyFill, theme.light.groundBounce, 0.75]} />
      <directionalLight ref={keyRef} position={[6, 8, 4]} intensity={1.45} color={theme.light.key} />
      <directionalLight ref={rimRef} position={[-5, 3, -5]} intensity={0.5} color={theme.light.rim} />
    </>
  );
}
