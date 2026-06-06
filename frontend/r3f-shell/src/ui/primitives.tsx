// primitives.tsx -- the small set of shared, dark-glass UI atoms the dashboard panels are built
// from: a spring Toggle, a Chip, a lifted Card, and a SectionLabel. Centralizing them keeps every
// panel visually consistent (one place owns the dark-glass look + the motion feel) and keeps the
// panel files focused on content/layout rather than re-deriving styles. All styling pulls from the
// shared theme.ui.* tokens so the chrome stays locked to the dark violet-glass palette of the shell.
//
// Craft notes: the look here is deliberately NOT "flat card + 1px line". Each Card is a real piece
// of smoked glass -- a soft top-down fill gradient, a hairline top highlight (the light catching the
// rim) and a layered shadow -- so the chrome reads intentional and tactile on the very first paint
// instead of templated. Public prop names + exports are stable; the panels import these by name.
import type { ReactNode, CSSProperties } from 'react';
import { motion } from 'motion/react';
import { theme, FONT, SHADOW } from '../theme';

const SPRING = { type: 'spring' as const, stiffness: 520, damping: 30 };

// One shared glass recipe so every Card/tile lifts off the dark stage the same way: a faint
// top-to-bottom fill (lighter at the crown, where overhead light would land) plus an inset 1px
// top highlight that traces the rim. Used as the Card background; callers can still override.
const GLASS_FILL = 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.012) 46%, rgba(0,0,0,0.10) 100%)';
const GLASS_FILL_ACTIVE = `linear-gradient(180deg, ${theme.ui.accentSoft} 0%, rgba(167,139,250,0.05) 60%, rgba(0,0,0,0.06) 100%)`;
const RIM_HIGHLIGHT = 'inset 0 1px 0 rgba(255,255,255,0.07)';

/** A chunky, friendly on/off switch with a spring-sliding knob. */
export function Toggle({
  on,
  onToggle,
  accent = theme.ui.accent,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  accent?: string;
  label?: string;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      style={{
        width: 46,
        height: 27,
        flex: '0 0 auto',
        borderRadius: 999,
        border: `1px solid ${on ? 'transparent' : theme.ui.line}`,
        cursor: 'pointer',
        padding: 3,
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        alignItems: 'center',
        background: on ? `linear-gradient(180deg, ${accent}, ${theme.ui.accentDeep})` : theme.ui.chipBg,
        transition: 'background 200ms ease, border-color 200ms ease',
        boxShadow: on
          ? `inset 0 1px 3px ${theme.ui.accentDeep}66, 0 2px 8px ${accent}44`
          : 'inset 0 1px 3px rgba(0,0,0,0.35)',
      }}
    >
      <motion.span
        layout
        transition={SPRING}
        style={{
          width: 21,
          height: 21,
          borderRadius: 999,
          background: 'linear-gradient(180deg, #ffffff, #ece8f5)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}
      />
    </button>
  );
}

/** A small rounded tag/pill. `tone` tints it violet (accent) or teal; default is neutral glass. */
export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'teal' }) {
  const palette =
    tone === 'accent'
      ? { bg: theme.ui.accentSoft, fg: theme.ui.accent, bd: `${theme.ui.accent}3a` }
      : tone === 'teal'
        ? { bg: theme.ui.tealSoft, fg: theme.ui.teal, bd: `${theme.ui.teal}3a` }
        : { bg: theme.ui.chipBg, fg: theme.ui.inkSoft, bd: theme.ui.line };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: FONT.body,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: 0.3,
        lineHeight: 1,
        padding: '3px 9px',
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/**
 * A lifted parchment card with a gentle hover rise + optional entrance animation. `index` staggers
 * the entrance when many cards mount together (the skills/plugins lists). `onClick`/`active` make it
 * usable as a selectable tile too.
 */
export function Card({
  children,
  index = 0,
  onClick,
  active = false,
  style,
}: {
  children: ReactNode;
  index?: number;
  onClick?: () => void;
  active?: boolean;
  style?: CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.32), type: 'spring', stiffness: 320, damping: 26 }}
      whileHover={onClick ? { y: -3, boxShadow: SHADOW.cardHover } : undefined}
      onClick={onClick}
      style={{
        // Smoked-glass slab: solid base so text stays crisp, then a faint top-down sheen + rim
        // highlight layered over it. The base color first, the gradient on top of that fill.
        backgroundColor: theme.ui.panelSolid,
        backgroundImage: active ? GLASS_FILL_ACTIVE : GLASS_FILL,
        border: `1.5px solid ${active ? theme.ui.accent : theme.ui.line}`,
        borderRadius: 18,
        padding: 14,
        boxShadow: active ? `${SHADOW.cardHover}, ${RIM_HIGHLIGHT}` : `${SHADOW.card}, ${RIM_HIGHLIGHT}`,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

/** A friendly, rounded button. `primary` = violet CTA, `teal` = secondary, `ghost` = quiet. */
export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  full = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'teal' | 'ghost';
  disabled?: boolean;
  full?: boolean;
}) {
  const palette =
    variant === 'teal'
      ? {
          backgroundImage: `linear-gradient(180deg, ${theme.ui.teal}, #0fb6d6)`,
          color: '#04222a',
          border: '1px solid transparent',
          boxShadow: `0 6px 16px ${theme.ui.teal}4d, ${RIM_HIGHLIGHT}`,
        }
      : variant === 'ghost'
        ? {
            backgroundImage: GLASS_FILL,
            color: theme.ui.inkSoft,
            border: `1px solid ${theme.ui.line}`,
            boxShadow: RIM_HIGHLIGHT,
          }
        : {
            backgroundImage: `linear-gradient(180deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
            color: '#ffffff',
            border: '1px solid transparent',
            boxShadow: `0 6px 16px ${theme.ui.accent}4d, ${RIM_HIGHLIGHT}`,
          };
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT.display,
        fontWeight: 800,
        fontSize: 14,
        backgroundColor: theme.ui.panelSolid,
        borderRadius: 12,
        padding: '9px 16px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: full ? '100%' : undefined,
        transition: 'opacity 160ms ease',
        ...palette,
      }}
    >
      {children}
    </motion.button>
  );
}

/** A small uppercase-ish section label with a warm accent tick + a hairline that runs to the edge. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        fontFamily: FONT.display,
        fontSize: 11.5,
        fontWeight: 800,
        color: theme.ui.inkSoft,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
        margin: '4px 2px 10px',
      }}
    >
      <span
        style={{
          width: 16,
          height: 4,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${theme.ui.accent}, ${theme.ui.teal})`,
        }}
      />
      {children}
      <span style={{ flex: 1, height: 1, background: theme.ui.lineSoft }} />
    </div>
  );
}
