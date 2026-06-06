// SkillsPanel -- the "skill shelf": every skill Crash can use, each a gradient card with an emoji
// badge, a plain-language blurb, a prominent level chip + topic chips, and a chunky click on/off
// switch. Reads/writes the live dashboardStore catalog, so toggles persist while the app runs. It
// also folds in skills the user saved through the engine (dashboardStore.savedSkills) -- those carry
// a teal "Yours" flag and sort to the top -- so the shelf grows as you teach Crash new things. A
// search box and a row of level filters keep it easy to find one skill among many. This is one of the
// three core dashboard sections the design calls "the most critical" surface.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Trash2 } from "lucide-react";
import { useDashboardStore } from "../../store/dashboardStore";
import { useBasketStore } from "../../store/basketStore";
import { Card, Toggle, Chip, SectionLabel } from "../../ui/primitives";
import { theme, FONT } from "../../theme";
import type { SkillItem } from "../../data/catalog";
import { CATEGORY_SINGULAR, type MarketListing } from "../../data/marketplace";
import { TestRunModal } from "./TestRunModal";
// EVERY skill card -- seed catalog and user-created alike -- wears the playing-card WebGL dot-reveal
// gradient (a 21st.dev component) as its hover backdrop over an always-on per-hue CSS gradient, so the
// whole shelf reads as a collection of distinct, living cards rather than a list of flat rows. We pull
// in only the reveal effect (not the full 9/16 trading-card shape, which is far too tall for here).
import { CanvasRevealEffect } from "../ui/playing-card";

// A small, quiet "take this off my shelf" button that sits beside the on/off Toggle. It is muted at
// rest on purpose (faint ink, no fill) so it never competes with the Toggle or reads as an easy
// misclick; on hover OR keyboard focus it clearly turns danger-red (theme.ui.bad) and reveals a
// "Remove" word, so a non-technical user can see it deletes before committing. One click removes --
// no modal -- which the live hover/focus affordance + the explicit aria-label keep clear and honest.
function RemoveButton({
  onRemove,
  label,
}: {
  onRemove: () => void;
  label: string;
}) {
  const [hot, setHot] = useState(false); // hovered or focused -> show the danger styling + word
  return (
    <button
      type="button"
      onClick={onRemove}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      aria-label={label}
      title={label}
      style={{
        flex: "0 0 auto",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 27, // line up with the Toggle's height so the two controls share a baseline
        padding: hot ? "0 10px" : "0 7px",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: FONT.body,
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: 0.2,
        // Resting: faint ink on transparent glass -- nearly invisible so it's plainly secondary to
        // the Toggle. Hot: soft red wash + red ink + a red rim, so "this deletes" reads at a glance.
        color: hot ? theme.ui.bad : theme.ui.inkFaint,
        background: hot ? `${theme.ui.bad}1f` : "transparent",
        border: `1px solid ${hot ? `${theme.ui.bad}55` : theme.ui.line}`,
        outline: "none",
        boxShadow: hot ? `0 0 0 3px ${theme.ui.bad}14` : "none",
        transition:
          "color 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, padding 160ms ease",
      }}
    >
      <Trash2 size={14} aria-hidden />
      {/* The word only appears once the control is hot, so the resting state stays a quiet icon but
          the intent is unmistakable the moment a user reaches for it. aria-hidden: the button's own
          aria-label already names the full action for screen readers. */}
      {hot && (
        <span aria-hidden style={{ lineHeight: 1 }}>
          Remove
        </span>
      )}
    </button>
  );
}

// Per-level accent so the level chip + the icon badge tint agree, and the three tiers read as a
// gentle progression at a glance rather than three identical pills. Pulls straight from theme.ui.
const LEVEL_ACCENT: Record<SkillItem["level"], string> = {
  starter: theme.ui.teal,
  core: theme.ui.accent,
  pro: theme.ui.warn,
};

const LEVEL_TONE: Record<SkillItem["level"], "teal" | "accent" | "neutral"> = {
  starter: "teal",
  core: "accent",
  pro: "neutral",
};

// A shelf entry is a catalog SkillItem plus a flag for whether the user saved it via the engine.
// Keeping the flag alongside (rather than baked into SkillItem) leaves the catalog type untouched.
interface ShelfSkill {
  skill: SkillItem;
  yours: boolean;
}

type LevelFilter = "all" | SkillItem["level"];
const LEVEL_FILTERS: LevelFilter[] = ["all", "starter", "core", "pro"];

// A quiet chip-style button used for the level filter row. Looks like a Chip, acts like a toggle:
// the active one fills with the accent, the rest stay neutral glass.
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: 1,
        fontFamily: FONT.body,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.2,
        padding: "6px 10px",
        borderRadius: 9,
        cursor: "pointer",
        textTransform: "capitalize",
        // Segmented-control feel: only the active segment fills (with the accent gradient + a rim
        // highlight); the rest stay transparent so the dark inset track reads as the shared groove.
        // NOTE: use the single `background` shorthand (a gradient is a valid value) -- mixing the
        // `background` shorthand with the `backgroundImage` longhand in one inline-style object lets
        // React drop both, which rendered the active segment as bare white earlier.
        background: active
          ? `linear-gradient(180deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`
          : "transparent",
        color: active ? "#ffffff" : theme.ui.inkSoft,
        border: "1px solid transparent",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.18)" : "none",
        transition:
          "background 160ms ease, color 160ms ease, box-shadow 160ms ease",
      }}
    >
      {children}
    </button>
  );
}

// --- Per-skill gradient helpers ----------------------------------------------------------------
// Each skill earns its OWN gradient hue so the shelf reads as a collection of distinct, hand-earned
// cards rather than N copies of one card. We derive the hue deterministically from the skill id (a
// tiny FNV-ish string hash -> 0..360) so the same skill keeps the same color across renders/sessions,
// with no extra state to store.
function hueFromId(id: string): number {
  let h = 2166136261; // FNV offset basis -- a cheap, well-spread string hash; no crypto needed here
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime; Math.imul keeps it a 32-bit int multiply
  }
  return Math.abs(h) % 360;
}

// Convert an HSL triple to an RGB triple in 0..255, for the WebGL reveal (its `colors` prop wants
// RGB 0-255, not CSS hsl()). Kept local + dependency-free so this file owns its whole color story.
function hslToRgb(h: number, s: number, l: number): number[] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// A skill card -- the SINGLE card type the whole shelf is built from. Same data + controls for every
// skill (icon, name, level chip, an optional teal "Yours" chip, blurb, tags, the click on/off switch,
// the quiet Remove button), dressed as a "card with a dynamic gradient background" using the
// playing-card reveal aesthetic (a 21st.dev component). Each card draws its OWN hue from the skill id
// (see hueFromId) so the shelf reads as a set of distinct, living cards rather than identical rows.
// `yours` decides exactly one thing: whether the teal "Yours" chip shows -- user-saved skills get it,
// seed-catalog skills don't -- so the two shelves stay distinguishable even though they share chrome.
// `index` staggers the entrance so a long list slides in top-to-bottom instead of all at once.
function SkillCard({
  skill,
  yours,
  index,
}: {
  skill: SkillItem;
  yours: boolean;
  index: number;
}) {
  const toggleSkill = useDashboardStore((s) => s.toggleSkill);
  const removeSkill = useDashboardStore((s) => s.removeSkill);
  const accent = LEVEL_ACCENT[skill.level];
  // The hover flag is all we need to gate the live WebGL reveal context on (mount on enter, unmount
  // on leave) -- no ref required.
  const [isHovered, setIsHovered] = useState(false);

  const hue = hueFromId(skill.id);
  // Two related stops drawn from the per-skill hue: a brighter lead + a deeper trail. Both the CSS
  // gradient (always on) and the WebGL reveal (hover only) are built from these, so the static and
  // animated layers always agree in color.
  const cssLead = `hsla(${hue}, 85%, 64%, 0.40)`;
  const cssTrail = `hsla(${(hue + 28) % 360}, 80%, 50%, 0.26)`;
  const glowRim = `hsla(${hue}, 90%, 66%, 0.55)`;
  // The reveal dots want RGB triples 0-255; reuse the same hue so the animated layer matches the CSS.
  const revealColors = [
    hslToRgb(hue, 0.85, 0.6),
    hslToRgb((hue + 28) % 360, 0.8, 0.52),
  ];

  return (
    <motion.div
      // Entrance: a quick fade (opacity) + a staggered spring slide (y). Opacity is owned by motion
      // here -- NOT inline style -- because the card ALSO dims to 0.66 when the skill is off, and a
      // value set in both `animate` and `style` fights itself (motion wins). Folding the off-dim into
      // `animate` lets motion animate between 1 and 0.66 cleanly. We give opacity its OWN transition
      // (no delay) so the stagger delay applies only to the slide-in -- otherwise turning a skill off
      // would visibly lag by up to 0.32s for cards lower in the list.
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: skill.enabled ? 1 : 0.66, y: 0 }}
      transition={{
        y: {
          delay: Math.min(index * 0.04, 0.32),
          type: "spring",
          stiffness: 320,
          damping: 26,
        },
        opacity: { duration: 0.2 },
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: "relative",
        marginBottom: 10,
        borderRadius: 18,
        padding: 14,
        // Dark base so the white/light ink and chips stay legible; the per-hue gradient sits over it
        // at low alpha (see the gradient layer below), tinting the card without washing out the text.
        backgroundColor: "#0b0a14",
        // A glowing, per-hue border -- the "living card" tell that's always on (no WebGL needed), so
        // even before hover every card looks unmistakably richer than a flat row.
        border: `1.5px solid ${glowRim}`,
        boxShadow: `0 6px 16px rgba(8,6,18,0.45), 0 0 18px -6px ${glowRim}, inset 0 1px 0 rgba(255,255,255,0.07)`,
        overflow: "hidden",
      }}
    >
      {/* ALWAYS-ON CSS gradient backdrop: a radial highlight + a linear body, both in the card's own
          hue at low alpha over the dark base. pointerEvents:none so it never blocks the controls. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          zIndex: 0,
          background: `radial-gradient(120% 130% at 12% 0%, ${cssLead} 0%, transparent 58%), linear-gradient(135deg, ${cssTrail} 0%, transparent 72%)`,
        }}
      />
      {/* DYNAMIC reveal -- mounted ONLY while hovered. Each CanvasRevealEffect is a live WebGL
          context, and browsers cap concurrent contexts (~8-16); one per card rendered at once would
          exhaust the pool and turn cards black. Hover-gating guarantees at most ONE live reveal
          context at a time (we mount on enter, unmount on leave) -- which is exactly what makes it
          safe to give EVERY card (6 seed + N saved) the gradient treatment. replaceBackground=false
          lets the always-on CSS gradient show through before/after the hover. pointerEvents:none +
          behind content (zIndex 0) so it's purely decorative and never intercepts the Toggle/Remove. */}
      {isHovered && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            zIndex: 0,
            overflow: "hidden",
          }}
        >
          <CanvasRevealEffect
            animationSpeed={4.5}
            colors={revealColors}
            dotSize={3}
            replaceBackground={false}
          />
        </div>
      )}

      {/* Content layer sits ABOVE both gradient layers (zIndex 1). */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        {/* Icon badge tints to the skill's level accent when on, so the shelf reads as a graded set
            of abilities; off skills fall back to neutral glass. */}
        <span
          style={{
            flex: "0 0 auto",
            width: 44,
            height: 44,
            borderRadius: 13,
            display: "grid",
            placeItems: "center",
            fontSize: 23,
            background: skill.enabled
              ? `linear-gradient(180deg, ${accent}22, ${accent}0d)`
              : theme.ui.chipBg,
            border: `1px solid ${skill.enabled ? `${accent}40` : theme.ui.line}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {skill.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + level chip share the top line so the level reads as a property of the name. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: FONT.display,
                fontWeight: 800,
                fontSize: 15.5,
                color: theme.ui.ink,
                lineHeight: 1.2,
              }}
            >
              {skill.name}
            </span>
            <Chip tone={LEVEL_TONE[skill.level]}>{skill.level}</Chip>
            {/* The teal "Yours" chip is the ONLY thing that distinguishes a saved skill from a seed
                one now that both share the gradient-card chrome -- so it's conditional on `yours`. */}
            {yours && <Chip tone="teal">Yours</Chip>}
          </div>
          <div
            style={{
              fontFamily: FONT.body,
              fontSize: 12.5,
              lineHeight: 1.45,
              color: theme.ui.inkSoft,
              marginBottom: skill.tags.length > 0 ? 9 : 0,
            }}
          >
            {skill.blurb}
          </div>
          {skill.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {skill.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          )}
        </div>
        {/* Right-edge controls: the primary click on/off switch on top, the quiet Remove affordance
            beneath. They live in the zIndex:1 content layer above the gradient/reveal (which are both
            pointerEvents:none), so the decorative layers never block them. Stacking (rather than
            side-by-side) keeps Remove from crowding the switch and makes "off vs gone" read as two
            separate choices. */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          <Toggle
            on={skill.enabled}
            onToggle={() => toggleSkill(skill.id)}
            accent={accent}
            label={`Turn ${skill.name} ${skill.enabled ? "off" : "on"}`}
          />
          <RemoveButton
            onRemove={() => removeSkill(skill.id)}
            label={`Remove ${skill.name} from your shelf`}
          />
        </div>
      </div>
    </motion.div>
  );
}

// BasketShelf -- the staging callout pinned to the top of the skill shelf. It is the OTHER end of the
// marketplace's "Review in Skills ->" button: clicking that switches to this panel, and this is what
// greets the user. It is framed as "staged, not wired" on purpose -- these are capabilities the user
// quick-added while browsing, but nothing here is connected to the engine or has spent anything (the
// x402 metering still lives only in the engine, so the basket is honest by construction). Reads the
// SAME useBasketStore the marketplace writes to, so the two views can never disagree; returns null
// when empty so the shelf stays uncluttered before the user has browsed.
function BasketShelf() {
  const items = useBasketStore((s) => s.items);
  const remove = useBasketStore((s) => s.remove);
  const clear = useBasketStore((s) => s.clear);
  // Which basket item is currently being test-run (null = modal closed). Drives <TestRunModal> below.
  const [testItem, setTestItem] = useState<MarketListing | null>(null);
  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "relative",
        marginBottom: 16,
        borderRadius: 16,
        padding: 14,
        // Accent-washed glass so the basket reads as a distinct staging area, clearly set apart from
        // the per-hue SkillCards below it rather than looking like one more skill.
        background: theme.ui.accentSoft,
        border: `1.5px solid ${theme.ui.accent}55`,
        boxShadow: `0 8px 22px -10px ${theme.ui.accent}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>
          🧺
        </span>
        <span
          style={{
            fontFamily: FONT.display,
            fontWeight: 800,
            fontSize: 15,
            color: theme.ui.ink,
          }}
        >
          From the marketplace
        </span>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            borderRadius: 999,
            background: theme.ui.accent,
            color: "#0b0a14",
            fontFamily: FONT.body,
            fontWeight: 900,
            fontSize: 11,
          }}
        >
          {items.length}
        </span>
        <button
          onClick={clear}
          style={{
            marginLeft: "auto",
            fontFamily: FONT.body,
            fontSize: 11.5,
            fontWeight: 800,
            color: theme.ui.inkSoft,
            background: "transparent",
            border: `1px solid ${theme.ui.line}`,
            borderRadius: 999,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>

      {/* Plain-language, honest framing -- says out loud that nothing is connected or charged yet, so
          a non-technical user is never misled into thinking the basket spent money. */}
      <div
        style={{
          fontFamily: FONT.body,
          fontSize: 12,
          lineHeight: 1.45,
          color: theme.ui.inkSoft,
          marginBottom: 11,
        }}
      >
        Picked while browsing -- nothing's connected or charged yet. It's just what you'd like Crash to
        be able to do.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "8px 10px",
              borderRadius: 11,
              background: "rgba(11,10,20,0.45)",
              border: `1px solid ${theme.ui.line}`,
            }}
          >
            <span style={{ fontSize: 17, flex: "0 0 auto" }} aria-hidden>
              {it.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 800,
                  fontSize: 13.5,
                  color: theme.ui.ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {it.name}
              </div>
              {/* The honest metering label rides along from the listing (e.g. "Pay-per-call",
                  "~0.05 USDC / run") so the basket shows HOW each capability is priced without
                  implying a charge has happened. */}
              <div style={{ fontFamily: FONT.body, fontSize: 11, color: theme.ui.inkFaint }}>
                {it.price}
              </div>
            </div>
            {/* Test <category> -- the live demo trigger. Opens TestRunModal, which runs this listing for
                real on marketplace-server: it plans, pays for and runs a web search over x402 (or a real
                key-auth search when no wallet is funded), then synthesizes a brief with a live model --
                streamed step by step with the real cost and citations, falling back to canned only offline. */}
            <button
              onClick={() => setTestItem(it)}
              aria-label={`Test ${it.name}`}
              title={`Test ${CATEGORY_SINGULAR[it.category]}`}
              style={{
                flex: "0 0 auto",
                fontFamily: FONT.body,
                fontSize: 11.5,
                fontWeight: 800,
                padding: "5px 11px",
                borderRadius: 999,
                border: "none",
                background: theme.ui.accent,
                color: "#0b0a14",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Test {CATEGORY_SINGULAR[it.category]}
            </button>
            <button
              onClick={() => remove(it.id)}
              aria-label={`Remove ${it.name} from your basket`}
              title={`Remove ${it.name}`}
              style={{
                flex: "0 0 auto",
                width: 24,
                height: 24,
                borderRadius: 999,
                border: `1px solid ${theme.ui.line}`,
                background: "transparent",
                color: theme.ui.inkSoft,
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1,
                display: "grid",
                placeItems: "center",
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <TestRunModal listing={testItem} onClose={() => setTestItem(null)} />
    </div>
  );
}

export function SkillsPanel() {
  const skills = useDashboardStore((s) => s.skills);
  const savedSkills = useDashboardStore((s) => s.savedSkills);

  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [searchFocus, setSearchFocus] = useState(false);

  // One unified shelf: user-saved skills first (so a freshly taught skill lands at the top), then
  // the seed catalog. Each carries its `yours` flag for the badge + so search treats them the same.
  const shelf = useMemo<ShelfSkill[]>(
    () => [
      ...savedSkills.map((skill) => ({ skill, yours: true })),
      ...skills.map((skill) => ({ skill, yours: false })),
    ],
    [savedSkills, skills],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shelf.filter(({ skill }) => {
      if (level !== "all" && skill.level !== level) return false;
      if (!q) return true;
      const haystack =
        `${skill.name} ${skill.blurb} ${skill.tags.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [shelf, query, level]);

  // Split the filtered result into the two intentional shelves the design calls for: "Yours" (saved
  // skills, kept visually distinct with its own teal-labeled header) and the seed catalog. Keeping
  // the split here -- rather than one flat list -- is what makes the saved-skills section read as a
  // deliberate place on the shelf instead of a few cards that happen to float to the top.
  const yoursList = filtered.filter((s) => s.yours);
  const catalogList = filtered.filter((s) => !s.yours);
  const onCount = skills.filter((s) => s.enabled).length;
  const totalCount = skills.length + savedSkills.length;

  return (
    <div>
      {/* Hero header -- gives the shelf identity on first paint: a title + a live "on / total" pill,
          so the surface reads as a curated set of abilities before any card is even scanned. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 17,
              color: theme.ui.ink,
              lineHeight: 1.15,
            }}
          >
            Your skill shelf
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 12, color: theme.ui.inkSoft }}>
            Turn abilities on, or teach Crash a new one.
          </div>
        </div>
        <span
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "baseline",
            gap: 3,
            padding: "5px 11px",
            borderRadius: 999,
            background: theme.ui.accentSoft,
            border: `1px solid ${theme.ui.accent}3a`,
            fontFamily: FONT.display,
            fontWeight: 800,
            color: theme.ui.accent,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ fontSize: 15 }}>{onCount}</span>
          <span style={{ fontSize: 11, color: theme.ui.inkSoft }}>/ {totalCount} on</span>
        </span>
      </div>

      {/* Skills basket -- what the user quick-added from the marketplace. Sits between the shelf's
          identity and the browse/search controls, so "Review in Skills ->" lands somewhere that
          immediately shows the staged picks. Self-hides when empty. */}
      <BasketShelf />

      {/* Search -- dark-glass: translucent fill, ink text, hairline border. No light backgrounds.
          Focus lifts the border to the accent + a soft ring so the field feels live, not inert. */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 14,
            opacity: searchFocus ? 1 : 0.7,
            pointerEvents: "none",
            transition: "opacity 160ms ease",
          }}
        >
          🔍
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          placeholder="Search skills"
          aria-label="Search skills"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 34px 10px 34px",
            fontFamily: FONT.body,
            fontSize: 14,
            color: theme.ui.ink,
            background: theme.ui.chipBg,
            border: `1.5px solid ${searchFocus ? `${theme.ui.accent}88` : theme.ui.line}`,
            borderRadius: 12,
            outline: "none",
            boxShadow: searchFocus ? `0 0 0 3px ${theme.ui.accent}1f` : "none",
            transition: "border-color 160ms ease, box-shadow 160ms ease",
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: theme.ui.chipBg,
              color: theme.ui.inkSoft,
              fontSize: 13,
              lineHeight: 1,
              display: "grid",
              placeItems: "center",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Level filter row -- a segmented toggle rail (matches the Skill Creator's method picker), so
          the two core surfaces share one control idiom. "All" resets. */}
      <div
        style={{
          display: "flex",
          gap: 5,
          padding: 4,
          marginBottom: 16,
          borderRadius: 12,
          background: "rgba(0,0,0,0.22)",
          border: `1px solid ${theme.ui.line}`,
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        {LEVEL_FILTERS.map((lf) => (
          <FilterChip
            key={lf}
            active={level === lf}
            onClick={() => setLevel(lf)}
          >
            {lf}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card index={0} style={{ textAlign: "center", padding: "28px 18px" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🗒️</div>
          <div
            style={{
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 15,
              color: theme.ui.ink,
              marginBottom: 4,
            }}
          >
            No skills match
          </div>
          <div
            style={{
              fontFamily: FONT.body,
              fontSize: 13,
              color: theme.ui.inkSoft,
            }}
          >
            Try a different word or pick a different level.
          </div>
        </Card>
      ) : (
        <>
          {/* "Yours" -- the user's saved skills get their own labeled section so the shelf clearly
              grows as you teach Crash. Only shown when at least one saved skill survives the filter.
              They render through the SAME SkillCard as the catalog now; passing yours={true} is what
              lights up the teal "Yours" chip that sets them apart. */}
          {yoursList.length > 0 && (
            <>
              <SectionLabel>Yours · {yoursList.length}</SectionLabel>
              {yoursList.map(({ skill }, i) => (
                <SkillCard key={skill.id} skill={skill} yours index={i} />
              ))}
            </>
          )}
          {/* The seed catalog. Its header only appears when there are catalog cards to head; when a
              filter leaves only saved skills, we don't print an empty "0" section. Seed cards are the
              same gradient SkillCard, just without the "Yours" chip (yours={false}). */}
          {catalogList.length > 0 && (
            <>
              <SectionLabel>
                {yoursList.length > 0 ? "Starter shelf" : "All skills"} ·{" "}
                {catalogList.length}
              </SectionLabel>
              {catalogList.map(({ skill }, i) => (
                <SkillCard key={skill.id} skill={skill} yours={false} index={i} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
