import { motion, AnimatePresence } from "motion/react";
import { Spotlight } from "./ui/spotlight";
import { useDashboardStore } from "../store/dashboardStore";
import { SECTION_BACKDROP } from "../theme";

// HeroBackdrop -- the full-bleed dark stage that sits BEHIND everything. It occupies the exact same
// fixed/inset-0 box the old <Canvas> did, so the dashboard chrome (TopBar / LeftRail / DashboardPanel
// / PromptBar) and the center Marketplace keep floating above it with no stacking changes.
//
// This used to host the full-bleed interactive Crash robot as the centerpiece. The robot now lives
// ONLY on the login stage (CrashLogin) -- the dashboard has no on-screen robot, and the center stage
// belongs to the Marketplace. So HeroBackdrop is now PURELY an ambient environment:
// switching Skills -> Create -> Agent -> Activity cross-fades the frame into a distinct, recognizable
// PLACE -- a cozy sunrise, outer space, an electric energy field, a sunlit horizon. Each area paints a
// deep saturated `cfg.base` across the FULL frame plus three strong colored radial blooms
// (cfg.glowA/glowB/glowC). The bases stay dark + saturated on purpose so the floating glass chrome and
// the marketplace cards (light text) keep their contrast everywhere; the brightness lives in the
// colored glows. All of this is pure CSS gradients -- the only motion is the section cross-fade plus
// ONE slow drifting highlight layer, no per-frame JS.

export function HeroBackdrop() {
  const section = useDashboardStore((s) => s.section);
  const cfg = SECTION_BACKDROP[section];

  return (
    <div
      // Inline fixed/inset mirrors the old <Canvas> positioning exactly; bg-background is the dark
      // pre-paint fallback so there's never a white flash before the Spline scene streams in.
      style={{ position: "fixed", inset: 0 }}
      className="overflow-hidden bg-background"
    >
      {/* Per-section ENVIRONMENT, BEHIND the robot. Each section's layer cross-fades in/out via
          AnimatePresence keyed on the section id, so moving between tabs dissolves between places
          rather than hard-cutting. The deep saturated `cfg.base` fills the entire frame, then three
          strong colored radial blooms (glowA upper-left signature, glowB lower-right accent, glowC a
          brighter highlight) plus a soft linear sweep build a recognizable scene. Alphas are high
          enough (~0.3-0.5) that the area is unmistakable, while the dark base keeps the glass chrome
          legible. The whole frame color animates too (not just opacity) so switching areas visibly
          repaints the world. */}
      <AnimatePresence>
        <motion.div
          key={section}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, backgroundColor: cfg.base }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: cfg.base,
            backgroundImage: [
              // Signature bloom, upper-left: the area's defining color, strong and wide.
              `radial-gradient(120% 95% at 20% 6%, ${cfg.glowA}5c 0%, ${cfg.glowA}1f 34%, transparent 62%)`,
              // Accent bloom, lower-right: the second hue grounds the opposite corner.
              `radial-gradient(120% 100% at 84% 100%, ${cfg.glowB}4a 0%, ${cfg.glowB}17 36%, transparent 64%)`,
              // Highlight bloom, top-center: a brighter pop that gives the scene depth/horizon.
              `radial-gradient(95% 70% at 58% 0%, ${cfg.glowC}3a 0%, transparent 52%)`,
              // Soft diagonal sweep low in the frame to tie the two corner blooms together.
              `linear-gradient(160deg, ${cfg.glowA}10 0%, transparent 40%, ${cfg.glowB}14 100%)`,
            ].join(", "),
          }}
        />
      </AnimatePresence>

      {/* ONE slow drifting highlight layer, shared across sections (re-tinted per area via glowC). It
          pans a faint soft bloom across the frame on a long loop so each environment subtly "breathes"
          -- a moving sun glint on the beach, a slow nebula drift in space -- without any per-frame JS
          (a single CSS-transform animation driven by motion). pointer-events-none so it never blocks
          drags onto Crash. Kept very low alpha so it adds life, not noise, and never hurts contrast. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={false}
        animate={{ x: ["-8%", "8%", "-8%"], y: ["-4%", "5%", "-4%"] }}
        transition={{ duration: 26, ease: "easeInOut", repeat: Infinity }}
        style={{
          backgroundImage: `radial-gradient(45% 40% at 50% 38%, ${cfg.glowC}1c 0%, transparent 70%)`,
        }}
      />

      {/* Spotlight cone, re-tinted per area. Remounting on section change (key) lets the cone re-run
          its sweep-in animation and pick up the new fill, so each area gets its own raked light. */}
      <Spotlight key={`spot-${section}`} className="-top-40 left-0 md:-top-20 md:left-60" fill={cfg.tint} />

      {/* A faint section-tinted edge bloom over the stage: a soft vignette of the current area's color
          that frames the center (transparent core) without washing it out. Cross-fades with the section. */}
      <AnimatePresence>
        <motion.div
          key={`veil-${section}`}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(135% 120% at 50% 60%, transparent 38%, ${cfg.glowB}22 100%)`,
          }}
        />
      </AnimatePresence>

      {/* Soft bottom-up vignette: darkens the lower third so the PromptBar stays readable over the
          stage. pointer-events-none so it never blocks clicks on the marketplace below. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/70 to-transparent" />
    </div>
  );
}
