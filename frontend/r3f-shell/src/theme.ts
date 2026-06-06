// theme.ts -- the single source of truth for Crash's warm "cozy kids virtual-world" palette,
// shared by the 3D scene (skydome, ground, lights, fireflies) AND the 2D HTML chrome/panels.
// Centralizing the tokens keeps the renderer and the UI visually coherent: change a value here and
// both the WebGL world and the dashboard move together. This deliberately retires the old
// violet/outer-space palette in favor of a bright, warm, golden-hour storybook look -- the warm,
// friendly, approachable energy the design calls for.

import type { DashSection } from './store/dashboardStore';

export const theme = {
  // ---------- 3D world ----------
  // A warm sunset-leaning sky: a touch of soft daytime blue up high so it never reads flat,
  // melting down through gold into an amber horizon glow.
  sky: {
    top: '#a9d4ec', // zenith -- soft warm daytime blue
    mid: '#ffdca6', // warm gold band
    horizon: '#ffc081', // amber glow where the world meets the sky
  },
  // A solid grassy island, not a void: friendly storybook green on top, warm earth on the sides.
  ground: {
    grass: '#7cc36a',
    grassDark: '#5fa552',
    soil: '#9c6b43',
    soilDark: '#73492c',
    stone: '#c9b89a', // path stepping-stones
  },
  light: {
    key: '#fff0d6', // warm sun key
    skyFill: '#bfe0f2', // cool sky bounce from above (hemisphere top)
    groundBounce: '#ffce8f', // warm bounce from the ground (hemisphere bottom)
    rim: '#ffaf6b', // warm back-rim
  },
  glow: {
    window: '#ffcf8f',
    fireflyWarm: '#ffe3a8',
    fireflyGold: '#ffd070',
  },
  // ---------- 2D UI chrome / panels ----------
  // Dark premium "glass over the Spline stage" palette: smoked near-black violet panels with bright
  // lavender-white ink, a vivid violet primary (echoing Crash's purple glow + the hero Spotlight)
  // and a cyan secondary for contrast pops. Translucent panel fills let the interactive robot
  // backdrop read THROUGH the chrome, so the dashboard feels mounted in the dark scene, not pasted on.
  ui: {
    panel: 'rgba(18, 16, 30, 0.78)',
    panelSolid: '#14121f',
    panelGlass: 'rgba(18, 16, 30, 0.62)',
    ink: '#f4f1fb', // near-white, faint violet tint -- primary text on dark
    inkSoft: '#b9b2cc', // muted lavender-grey -- secondary text
    inkFaint: '#7e7794', // tertiary / placeholder
    line: 'rgba(255,255,255,0.10)',
    lineSoft: 'rgba(255,255,255,0.055)',
    accent: '#a78bfa', // primary CTA / progress -- violet-400, matches the Spotlight fill
    accentDeep: '#7c3aed',
    accentSoft: 'rgba(167,139,250,0.16)',
    teal: '#22d3ee', // secondary -- cyan-400, reads bright against the dark violet
    tealSoft: 'rgba(34,211,238,0.14)',
    good: '#4ade80',
    warn: '#fbbf24',
    bad: '#f87171',
    chipBg: 'rgba(255,255,255,0.06)',
    cardBg: 'rgba(255,255,255,0.045)',
  },
} as const;

// CSS-ready pre-paint sky gradient (used as the canvas style background so the very first paint,
// before WebGL initializes, is already warm instead of a black flash).
export const SKY_CSS = `linear-gradient(180deg, ${theme.sky.top} 0%, ${theme.sky.mid} 56%, ${theme.sky.horizon} 100%)`;

// ---------- Per-tab background "mood/biome" ----------
// Each dashboard section gets its OWN sky+fog+light palette, and <Atmosphere> cross-fades the 3D
// background toward it whenever you switch tabs. The island + fox + props stay put -- only the
// atmosphere behind them changes -- so every panel reads against a vibe that matches what the tab is
// FOR, while still feeling like one continuous world:
//   skills   -> cozy golden-hour "home base" (the warm base palette)
//   creator  -> dreamy imagination dusk (periwinkle -> lavender -> soft pink)
//   agent    -> bright electric energy (vivid sky-blue -> cyan -> pale aqua)
//   activity -> fresh "growing / in progress" green (aqua-blue -> mint -> pale lime)
// `top/mid/horizon` paint the sky-dome gradient; `fog` tints the distance haze; `key/rim` re-tint the
// two directional lights so the lighting agrees with the sky instead of fighting it.
export type SkyPalette = {
  top: string;
  mid: string;
  horizon: string;
  fog: string;
  key: string;
  rim: string;
};

export const SECTION_SKY: Record<DashSection, SkyPalette> = {
  skills: { top: '#a9d4ec', mid: '#ffdca6', horizon: '#ffc081', fog: '#ffc081', key: '#fff0d6', rim: '#ffaf6b' },
  creator: { top: '#8d9bff', mid: '#c6a7ff', horizon: '#ffc2e8', fog: '#e9bce0', key: '#ffe6f3', rim: '#c98cff' },
  agent: { top: '#3aa0ff', mid: '#79d6ff', horizon: '#c2f3ee', fog: '#b4eeea', key: '#eafdff', rim: '#5fd6ff' },
  // connections -> "switchboard at dusk": twilight indigo into electric violet with a warm amber
  // horizon glow, like accounts powering on. Harder/more electric than creator's soft pink cosmos.
  connections: { top: '#5b4a9e', mid: '#9c7bff', horizon: '#ffcf8a', fog: '#c9a9e0', key: '#fff0d6', rim: '#b58cff' },
  activity: { top: '#86c9e6', mid: '#bdeaa6', horizon: '#ecf7c4', fog: '#cfeebc', key: '#f3ffe2', rim: '#8fd98a' },
  // technical -> calm cool "night console" dusk: deep steel-blue sky into a faint cyan horizon, so the
  // read-only CLI mirror reads against a quieter, more technical sky than the warm/pastel panels.
  technical: { top: '#3a4a66', mid: '#5e7796', horizon: '#9fc6d8', fog: '#7e9bb0', key: '#dfeaf5', rim: '#6f93b3' },
};

// ---------- Per-tab GROUND "biome" ----------
// The companion to SECTION_SKY: the *island itself* (grass cap + soil sides + underside) recolors per
// tab too, so the panels don't all share one green hill. <Ground> lerps toward these, and the trees +
// bushes follow the same live colors (see biome.ts), so the whole biome shifts as ONE place rather
// than a green world with a recolored sky. Each ground is hue-distinct so the four panels never blur
// together, while staying inside the warm "kids virtual-world" register:
//   skills   -> warm storybook MEADOW green   (the cozy home-base biome)
//   creator  -> dreamy LAVENDER/violet meadow  (imagination, matches the violet sky)
//   agent    -> electric TEAL/cyan energy field (local agents, matches the cyan sky)
//   activity -> fresh LIME "new growth" green   (progress / sprouting, yellower than skills so the
//               two green biomes still read as different places)
export type GroundPalette = {
  grass: string; // the big visible top cap (and tree-top foliage)
  grassDark: string; // lower foliage + bushes
  soil: string; // the island's side wall
  soilDark: string; // tapered underside + tree trunks
};

export const SECTION_GROUND: Record<DashSection, GroundPalette> = {
  skills: { grass: '#7cc36a', grassDark: '#5fa552', soil: '#9c6b43', soilDark: '#73492c' },
  creator: { grass: '#b39ae6', grassDark: '#9477d4', soil: '#6a52a6', soilDark: '#4a3a7d' },
  agent: { grass: '#46c5bf', grassDark: '#2fa6a2', soil: '#2c7d86', soilDark: '#1e5a64' },
  // connections -> periwinkle/indigo "circuit field": cool blue-violet meadow over deep indigo soil,
  // a wired place distinct from creator's pink-lavender and agent's teal.
  connections: { grass: '#7d8bd9', grassDark: '#5f6dba', soil: '#3a4480', soilDark: '#272d57' },
  activity: { grass: '#9ad94f', grassDark: '#79bd3a', soil: '#7e6f36', soilDark: '#574a24' },
  // technical -> cool slate "circuit-board" biome: muted steel-green cap over deep blue-grey soil, so
  // the island reads as the quiet, technical place behind the CLI mirror (distinct from the lime activity).
  technical: { grass: '#5f8a86', grassDark: '#476b68', soil: '#37495e', soilDark: '#243343' },
};

// ---------- Per-tab 2D HTML BACKDROP "area" ----------
// The HeroBackdrop keeps ONE Spline robot (Crash), but the ambient environment AROUND it is a fully
// distinct, recognizable PLACE per dashboard section -- a cozy living room, outer space, an energy
// field, a sunlit beach -- cross-faded with motion as the section changes. Each area carries its own
// FULL palette: a deep saturated `base` that fills the whole frame, plus three bright colored blooms
// (`glowA`/`glowB`/`glowC`) layered as strong radial gradients, and a `tint` for the Spotlight cone.
// These are hand-tuned per area (NOT derived from the retired SECTION_SKY) so each environment is
// unmistakable. The bases stay DARK and saturated on purpose: the floating glass chrome + the Crash
// speech bubble carry white/light text, so the frame must never wash out to a bright/pastel color or
// that text loses contrast. We push saturation and brightness into the colored glows instead, which
// bloom over the dark base and read as a real "scene" rather than a faint edge tint.
//   skills   -> "Home base"         : cozy warm sunrise / living-room (deep plum + amber + rose)
//   creator  -> "Imagination space" : outer space / cosmos (near-black indigo + violet + nebula)
//   agent    -> "Agent lab"         : electric power (dark teal + cyan + lime)
//   activity -> "Fresh meadow"      : bright outdoors / beach horizon (deep teal-blue + sky + sand)
// All colors are 6-digit hex so HeroBackdrop can append a 2-digit alpha suffix (`${cfg.glowA}66`) and
// still produce valid 8-digit hex. `label` is a short human name for the area (debugging / captions).
export type BackdropConfig = {
  base: string; // full-frame base/background color (deep + saturated, dark enough for white text)
  glowA: string; // primary bloom (upper-left), the area's signature hue
  glowB: string; // secondary bloom (lower-right / opposite), the area's accent hue
  glowC: string; // tertiary bloom (mid/top), a brighter highlight that gives the scene depth
  tint: string; // Spotlight cone fill for this area
  label: string;
};

// Each area is its own place. Bases are deep + saturated (legible white text on glass over them); the
// three glows are bright and colorful so the frame reads as a distinct ENVIRONMENT, not an edge tint.
export const SECTION_BACKDROP: Record<DashSection, BackdropConfig> = {
  // Cozy warm sunrise / living-room: deep warm plum, amber sun + soft rose, a warm gold highlight.
  skills: { base: '#1a1016', glowA: '#ff9e64', glowB: '#ff7eb6', glowC: '#ffc78a', tint: '#ff9e64', label: 'Home base' },
  // Outer space / cosmos: near-black indigo, violet + nebula magenta, a cool starlight-blue highlight.
  creator: { base: '#070612', glowA: '#7c5cff', glowB: '#c264ff', glowC: '#3b82f6', tint: '#7c5cff', label: 'Imagination space' },
  // Electric power field: dark teal, electric cyan + lime-green, a bright aqua highlight.
  agent: { base: '#04161a', glowA: '#22d3ee', glowB: '#34d399', glowC: '#67e8f9', tint: '#22d3ee', label: 'Agent lab' },
  // connections -> "Switchboard": deep indigo-black control room, brand-violet signature bloom + a
  // warm amber spark (keys powering on) + a cyan data highlight. The amber glowB makes it unmistakable.
  connections: { base: '#0a0820', glowA: '#a78bfa', glowB: '#fbbf24', glowC: '#22d3ee', tint: '#a78bfa', label: 'Switchboard' },
  // Bright outdoors / beach horizon: deep teal-blue, sky blue + warm sand-gold, a sea-green highlight.
  activity: { base: '#06182a', glowA: '#38bdf8', glowB: '#fcd34d', glowC: '#5eead4', tint: '#38bdf8', label: 'Fresh meadow' },
  // Technical "night console": near-black steel base, cool cyan + slate-blue blooms, a faint steel
  // highlight. Stays dark + low-saturation so the monospace CLI mirror on the glass reads cleanly.
  technical: { base: '#0a1018', glowA: '#38bdf8', glowB: '#64748b', glowC: '#7dd3fc', tint: '#38bdf8', label: 'Night console' },
};

// Friendly, rounded type for the "kids virtual-world" chrome. Baloo 2 / Nunito are loaded via a
// <link> in index.html; if they're unavailable (offline), the stack degrades to the rounded-ish
// system UI fonts so nothing ever falls back to a hard serif. Display = headings/wordmark, body =
// everything else.
export const FONT = {
  display: "'Baloo 2', 'Nunito', system-ui, 'Segoe UI', -apple-system, sans-serif",
  body: "'Nunito', system-ui, 'Segoe UI', -apple-system, sans-serif",
} as const;

// Deep, soft, layered shadows for the dark theme -- near-black with a faint violet cast (not warm
// cocoa) so the glass panels lift cleanly off the dark Spline stage instead of muddying into it.
export const SHADOW = {
  card: '0 6px 16px rgba(8,6,18,0.45)',
  cardHover: '0 16px 34px rgba(8,6,18,0.62)',
  panel: '0 20px 60px rgba(6,4,14,0.66)',
  prompt: '0 16px 44px rgba(6,4,14,0.72)',
  rail: '0 10px 30px rgba(6,4,14,0.55)',
} as const;

// A couple of soft warm gradients reused across the chrome (panel header wash, prompt glow).
export const GRADIENT = {
  panelHead: `linear-gradient(135deg, ${theme.ui.accentSoft}, ${theme.ui.tealSoft})`,
  promptGlow: `radial-gradient(120% 140% at 50% 0%, ${theme.ui.accentSoft} 0%, transparent 60%)`,
} as const;
