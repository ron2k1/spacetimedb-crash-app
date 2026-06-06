// nav-tabs.tsx -- an animated, accessible segmented control. Ported from the 21st.dev "slide-tabs"
// pattern (a pill that follows the pointer) and upgraded for use as a real, controlled FILTER:
//
//   1. It is CONTROLLED ({ value, onChange }) -- the sliding pill RESTS on the selected tab, and only
//      PREVIEWS under whatever you hover, snapping back to the selection on mouse-leave. The original
//      snippet only tracked hover and had no notion of a persistent selection.
//   2. It is a real ARIA `radiogroup` of `radio`s -- the honest role for "pick exactly one" -- with
//      roving tabindex + arrow-key navigation (selection follows focus, the textbook radiogroup UX).
//   3. It is GENERIC over the value union (T extends string), so the marketplace can pass its
//      MarketCategory | "all" filter and keep full type-safety on value/onChange.
//
// Styling is inline-from-theme to match the rest of components/marketplace (dark violet glass), so the
// component carries no Tailwind-class assumptions and reads the same palette as everything around it.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { theme, FONT } from "../../theme";

export interface NavTabItem<T extends string> {
  value: T;
  label: string;
  /** Optional count shown as a small trailing badge (e.g. how many listings match). */
  count?: number;
}

export interface NavTabsProps<T extends string> {
  items: NavTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the radiogroup, e.g. "Filter by category". */
  ariaLabel: string;
  className?: string;
}

interface PillRect {
  left: number;
  width: number;
  ready: boolean;
}

export function NavTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: NavTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // One button ref per value, written via ref callbacks below.
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [hovered, setHovered] = useState<T | null>(null);
  const [pill, setPill] = useState<PillRect>({
    left: 0,
    width: 0,
    ready: false,
  });
  const reduce = useReducedMotion();

  // The tab the pill should currently sit under: hovered wins (preview), else the selection.
  const lit: T = hovered ?? value;
  // Keep the latest "lit" target in a ref so the ResizeObserver can re-measure without re-subscribing.
  const litRef = useRef<T>(lit);
  litRef.current = lit;

  const measureTo = useCallback((v: string) => {
    const el = btnRefs.current[v];
    if (!el) return;
    // offsetLeft/offsetWidth are relative to the position:relative container, which is exactly the
    // coordinate space the absolutely-positioned pill lives in -- so no getBoundingClientRect math.
    setPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
  }, []);

  // Move the pill whenever the lit target changes (selection or hover). useLayoutEffect so the pill is
  // positioned before paint -- no first-frame flash at {0,0}.
  useLayoutEffect(() => {
    measureTo(lit);
  }, [lit, items, measureTo]);

  // Re-measure on container resize (window resize, layout reflow, font load) against the live target.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureTo(litRef.current));
    ro.observe(node);
    return () => ro.disconnect();
  }, [measureTo]);

  const moveFocus = useCallback(
    (dir: 1 | -1 | "first" | "last") => {
      const idx = items.findIndex((it) => it.value === value);
      let next: number;
      if (dir === "first") next = 0;
      else if (dir === "last") next = items.length - 1;
      else next = (idx + dir + items.length) % items.length;
      const target = items[next];
      if (!target) return;
      onChange(target.value); // selection follows focus (standard radiogroup behavior)
      btnRefs.current[target.value]?.focus();
    },
    [items, value, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "Home":
          e.preventDefault();
          moveFocus("first");
          break;
        case "End":
          e.preventDefault();
          moveFocus("last");
          break;
      }
    },
    [moveFocus],
  );

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHovered(null)}
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 4,
        borderRadius: 999,
        border: `1px solid ${theme.ui.line}`,
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* The sliding pill -- behind the labels (zIndex 0). Hidden until first measured. */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{
          left: pill.left,
          width: pill.width,
          opacity: pill.ready ? 1 : 0,
        }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 420, damping: 34 }
        }
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          zIndex: 0,
          borderRadius: 999,
          background: theme.ui.accentSoft,
          border: `1px solid ${theme.ui.accent}55`,
          boxShadow: `0 0 0 1px ${theme.ui.accent}22, 0 6px 18px -8px ${theme.ui.accent}`,
        }}
      />

      {items.map((item) => {
        const active = item.value === value;
        const isLit = item.value === lit;
        return (
          <button
            key={item.value}
            ref={(el) => {
              btnRefs.current[item.value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            // Roving tabindex: only the selected tab is in the tab order; arrows move within the group.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onMouseEnter={() => setHovered(item.value)}
            onFocus={() => setHovered(item.value)}
            onBlur={() => setHovered(null)}
            style={{
              position: "relative",
              zIndex: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              whiteSpace: "nowrap",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "7px 15px",
              borderRadius: 999,
              fontFamily: FONT.display,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 0.2,
              lineHeight: 1,
              color: isLit ? theme.ui.ink : theme.ui.inkSoft,
              transition: "color 0.18s ease",
            }}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span
                aria-hidden
                style={{
                  fontFamily: FONT.body,
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1,
                  padding: "2px 6px",
                  borderRadius: 999,
                  color: isLit ? theme.ui.ink : theme.ui.inkFaint,
                  background: isLit
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(255,255,255,0.05)",
                  transition: "color 0.18s ease, background 0.18s ease",
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
