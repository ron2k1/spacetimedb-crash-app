// biome.ts -- the LIVE, frame-animated ground colors for the active dashboard tab.
//
// Why a module-level singleton (and not React state): the island cap, the soil sides, the tree
// foliage, and the bushes ALL belong to the same ground biome and must move together when you switch
// tabs. Driving that through React state would re-render every prop 60x/sec during the transition.
// Instead, <Ground> owns ONE useFrame that lerps these Color objects in place toward the active
// section's palette (SECTION_GROUND in theme.ts); every other surface just copies the same live
// Colors onto its material each frame. Zero re-renders, one source of truth, perfectly in sync.
//
// `dirty` is the cost gate: it is true only while a tab-change transition is in flight (~0.5s). Once
// the colors settle, <Ground> flips it off and every consumer's per-frame copy early-returns, so a
// world sitting on one tab costs nothing.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color } from 'three';
import type { MeshStandardMaterial } from 'three';
import { SECTION_GROUND } from './theme';

export const biome = {
  grass: new Color(SECTION_GROUND.skills.grass),
  grassDark: new Color(SECTION_GROUND.skills.grassDark),
  soil: new Color(SECTION_GROUND.skills.soil),
  soilDark: new Color(SECTION_GROUND.skills.soilDark),
  // True while a transition is animating; <Ground> sets it on a tab change and clears it once settled.
  dirty: true,
};

export type BiomeKey = 'grass' | 'grassDark' | 'soil' | 'soilDark';

// Bind a standard-material ref to one biome color. While `biome.dirty`, copy the live color onto the
// material each frame (3 float writes -- trivial); once settled, early-return for free. Consumers run
// AFTER <Ground>'s driver in the same frame (Ground is mounted first), so they read freshly-lerped
// values, never a frame behind.
export function useBiomeColor(key: BiomeKey) {
  const ref = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (!biome.dirty) return;
    ref.current?.color.copy(biome[key]);
  });
  return ref;
}
