import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// GlowCard (21st.dev "spotlight-card"): a card whose border + fill track a radial spotlight that
// follows the pointer across the whole window. The hue rotates with horizontal pointer position
// (--hue = base + xp*spread), so a wall of these reads as a single light sweeping the grid -- a
// natural fit for a marketplace "browse agents" wall. Adapted from the source snippet to be
// TypeScript-clean: refs are typed, `children` is optional, and the style bag carries CSS custom
// properties via an explicit `--*` index signature rather than ad-hoc property assignment.

type GlowColor = "blue" | "purple" | "green" | "red" | "orange";
type GlowSize = "sm" | "md" | "lg";

// CSS custom properties aren't part of React's CSSProperties; this intersection lets the style
// object hold both standard props and our `--x` / `--hue` / etc. spotlight vars with no `any`.
type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>;

interface GlowCardProps {
  children?: ReactNode;
  className?: string;
  glowColor?: GlowColor;
  size?: GlowSize;
  width?: string | number;
  height?: string | number;
  /** When true, ignore `size` and let `width`/`height`/`className` drive sizing. */
  customSize?: boolean;
}

const glowColorMap: Record<GlowColor, { base: number; spread: number }> = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 120, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 },
};

const sizeMap: Record<GlowSize, string> = {
  sm: "w-48 h-64",
  md: "w-64 h-80",
  lg: "w-80 h-96",
};

// Global ::before/::after glow geometry. Injected once per mounted card; identical text across
// instances so the browser dedupes the rules. Drives the bright border-light and the soft outer halo.
const GLOW_PSEUDO_CSS = `
  [data-glow]::before,
  [data-glow]::after {
    pointer-events: none;
    content: "";
    position: absolute;
    inset: calc(var(--border-size) * -1);
    border: var(--border-size) solid transparent;
    border-radius: calc(var(--radius) * 1px);
    background-attachment: fixed;
    background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
    background-repeat: no-repeat;
    background-position: 50% 50%;
    mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
    mask-clip: padding-box, border-box;
    mask-composite: intersect;
  }
  [data-glow]::before {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.75) calc(var(--spotlight-size) * 0.75) at
      calc(var(--x, 0) * 1px) calc(var(--y, 0) * 1px),
      hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 50) * 1%) / var(--border-spot-opacity, 1)), transparent 100%
    );
    filter: brightness(2);
  }
  [data-glow]::after {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.5) calc(var(--spotlight-size) * 0.5) at
      calc(var(--x, 0) * 1px) calc(var(--y, 0) * 1px),
      hsl(0 100% 100% / var(--border-light-opacity, 1)), transparent 100%
    );
  }
  [data-glow] [data-glow] {
    position: absolute;
    inset: 0;
    will-change: filter;
    opacity: var(--outer, 1);
    border-radius: calc(var(--radius) * 1px);
    border-width: calc(var(--border-size) * 20);
    filter: blur(calc(var(--border-size) * 10));
    background: none;
    pointer-events: none;
    border: none;
  }
  [data-glow] > [data-glow]::before {
    inset: -10px;
    border-width: 10px;
  }
`;

export function GlowCard({
  children,
  className,
  glowColor = "purple",
  size = "md",
  width,
  height,
  customSize = false,
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncPointer = (e: PointerEvent) => {
      const card = cardRef.current;
      if (!card) return;
      const { clientX: x, clientY: y } = e;
      card.style.setProperty("--x", x.toFixed(2));
      card.style.setProperty("--xp", (x / window.innerWidth).toFixed(2));
      card.style.setProperty("--y", y.toFixed(2));
      card.style.setProperty("--yp", (y / window.innerHeight).toFixed(2));
    };
    document.addEventListener("pointermove", syncPointer);
    return () => document.removeEventListener("pointermove", syncPointer);
  }, []);

  const { base, spread } = glowColorMap[glowColor];

  const inlineStyles: StyleWithVars = {
    "--base": base,
    "--spread": spread,
    "--radius": "14",
    "--border": "3",
    "--backdrop": "hsl(0 0% 60% / 0.12)",
    "--backup-border": "var(--backdrop)",
    "--size": "200",
    "--outer": "1",
    "--border-size": "calc(var(--border, 2) * 1px)",
    "--spotlight-size": "calc(var(--size, 150) * 1px)",
    "--hue": "calc(var(--base) + (var(--xp, 0) * var(--spread, 0)))",
    backgroundImage: `radial-gradient(
      var(--spotlight-size) var(--spotlight-size) at
      calc(var(--x, 0) * 1px) calc(var(--y, 0) * 1px),
      hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 70) * 1%) / var(--bg-spot-opacity, 0.1)), transparent
    )`,
    backgroundColor: "var(--backdrop, transparent)",
    backgroundSize:
      "calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))",
    backgroundPosition: "50% 50%",
    backgroundAttachment: "fixed",
    border: "var(--border-size) solid var(--backup-border)",
    position: "relative",
    touchAction: "none",
    ...(width !== undefined
      ? { width: typeof width === "number" ? `${width}px` : width }
      : {}),
    ...(height !== undefined
      ? { height: typeof height === "number" ? `${height}px` : height }
      : {}),
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOW_PSEUDO_CSS }} />
      <div
        ref={cardRef}
        data-glow
        style={inlineStyles}
        className={cn(
          customSize ? "" : sizeMap[size],
          !customSize && "aspect-[3/4]",
          "rounded-2xl relative grid grid-rows-[1fr_auto] shadow-[0_1rem_2rem_-1rem_black] p-4 gap-4 backdrop-blur-[5px]",
          className,
        )}
      >
        <div ref={innerRef} data-glow />
        {children}
      </div>
    </>
  );
}

export { GlowCard as SpotlightCard };
