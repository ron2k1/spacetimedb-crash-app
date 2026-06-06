// Effects -- the real post-processing pass that replaces the old fake additive "Glow" sprites. An
// <EffectComposer> takes over the final render and applies, in order:
//   1. Bloom   -- samples the genuinely-bright pixels (the emissive windows/lantern at
//                 emissiveIntensity > 1 push values ABOVE 1.0, i.e. HDR) and blooms THEM, so light
//                 reads as physically emitted instead of a flat sprite halo. A high luminanceThreshold
//                 keeps the bright-but-not-emissive sky dome (~0.85 luma) crisp instead of mushing it.
//   2. Vignette -- a gentle warm corner darkening that focuses the eye on the fox + the active biome
//                 and adds the "produced", storybook depth a flat WebGL frame lacks.
//
// We deliberately do NOT add a ToneMapping effect: R3F already sets ACESFilmic tone-mapping on the
// renderer, and stacking a second pass double-maps and washes the warm palette out. Bloom + Vignette
// is the classic, safe combo that survives the three@0.184 / postprocessing@6.39 stack.
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

export function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={0.85}
        luminanceThreshold={0.9}
        luminanceSmoothing={0.25}
        mipmapBlur
        radius={0.72}
      />
      <Vignette offset={0.28} darkness={0.46} />
    </EffectComposer>
  );
}
