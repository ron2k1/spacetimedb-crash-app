// Ground -- the SOLID grassy island, now a per-tab BIOME. It is the driver for the whole ground
// recolor: a single useFrame lerps the shared `biome` colors (biome.ts) toward the active section's
// SECTION_GROUND palette, copies them onto the island's three materials, and -- because <Ground> is
// mounted first in <Village> -- leaves `biome` freshly updated for the trees/bushes to copy this same
// frame. So switching tabs cross-fades the entire ground (cap + soil + foliage) as one continuous
// place, in lockstep with the sky cross-fade in <Atmosphere>.
//
// Geometry is unchanged from the old inline island: a raised disc with REAL thickness (grass cap on
// FLOOR_Y, warm soil sides, a tapered underside cone) so it never reads as a thin floating wafer. The
// camera is clamped in Scene.tsx so you can't peek under it.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color } from 'three';
import type { MeshStandardMaterial } from 'three';
import { useDashboardStore, type DashSection } from '../store/dashboardStore';
import { SECTION_GROUND } from '../theme';
import { biome } from '../biome';

const FLOOR_Y = -0.9; // the grass surface; matches the fox's foot plane

type GroundColors = { grass: Color; grassDark: Color; soil: Color; soilDark: Color };

export function Ground() {
  const section = useDashboardStore((s) => s.section);

  // Parse the four section ground palettes into Color objects once (never re-parse hex per frame).
  const targets = useMemo(() => {
    const out = {} as Record<DashSection, GroundColors>;
    (Object.keys(SECTION_GROUND) as DashSection[]).forEach((k) => {
      const p = SECTION_GROUND[k];
      out[k] = {
        grass: new Color(p.grass),
        grassDark: new Color(p.grassDark),
        soil: new Color(p.soil),
        soilDark: new Color(p.soilDark),
      };
    });
    return out;
  }, []);

  const grassRef = useRef<MeshStandardMaterial>(null); // the big visible top cap
  const soilRef = useRef<MeshStandardMaterial>(null); // side wall
  const coneRef = useRef<MeshStandardMaterial>(null); // tapered underside
  const lastSection = useRef<DashSection>(section);

  useFrame((_, dt) => {
    // A tab change re-arms the whole-biome transition (Ground + trees + bushes share `biome.dirty`).
    if (section !== lastSection.current) {
      lastSection.current = section;
      biome.dirty = true;
    }
    if (!biome.dirty) return; // settled -> zero per-frame work for the entire ground

    const t = targets[section] ?? targets.skills;
    // Frame-rate-independent ease: reaches the target in ~0.5s regardless of fps (same curve as the
    // sky cross-fade, so ground and sky arrive together).
    const a = 1 - Math.exp(-dt * 7);
    biome.grass.lerp(t.grass, a);
    biome.grassDark.lerp(t.grassDark, a);
    biome.soil.lerp(t.soil, a);
    biome.soilDark.lerp(t.soilDark, a);

    // Converged? (tiny summed channel delta across the two dominant colors) -> snap exact, then idle.
    const delta =
      Math.abs(biome.grass.r - t.grass.r) +
      Math.abs(biome.grass.g - t.grass.g) +
      Math.abs(biome.grass.b - t.grass.b) +
      Math.abs(biome.soil.r - t.soil.r) +
      Math.abs(biome.soilDark.g - t.soilDark.g);
    if (delta < 0.005) {
      biome.grass.copy(t.grass);
      biome.grassDark.copy(t.grassDark);
      biome.soil.copy(t.soil);
      biome.soilDark.copy(t.soilDark);
      biome.dirty = false;
    }

    grassRef.current?.color.copy(biome.grass);
    soilRef.current?.color.copy(biome.soil);
    coneRef.current?.color.copy(biome.soilDark);
  });

  return (
    <group>
      {/* soil side wall: top radius (6.2) > bottom (5.0) gives a gentle plateau */}
      <mesh position={[0, FLOOR_Y - 0.8, 0]}>
        <cylinderGeometry args={[6.2, 5.0, 1.6, 56]} />
        <meshStandardMaterial ref={soilRef} color={SECTION_GROUND.skills.soil} roughness={1} />
      </mesh>
      {/* tapered underside cone rounds off the base */}
      <mesh position={[0, FLOOR_Y - 2.6, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[5.0, 2.4, 56]} />
        <meshStandardMaterial ref={coneRef} color={SECTION_GROUND.skills.soilDark} roughness={1} />
      </mesh>
      {/* grass cap on top (slightly above the soil top face to avoid z-fighting) */}
      <mesh position={[0, FLOOR_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6.2, 56]} />
        <meshStandardMaterial ref={grassRef} color={SECTION_GROUND.skills.grass} roughness={0.95} />
      </mesh>
    </group>
  );
}
