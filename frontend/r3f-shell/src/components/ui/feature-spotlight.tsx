import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// FeaturedSpotlight (21st.dev "feature-spotlight"): a large featured card with an image header that
// scales on hover, a lifting card body, and an ArrowUpRight that nudges out on hover. Adapted from
// the source snippet with three corrections:
//   1. The source styled text with `hsl(var(--foreground))` inline -- but this project's design
//      tokens are OKLCH, so wrapping them in hsl() yields `hsl(oklch(...))` = invalid CSS. Replaced
//      with semantic Tailwind classes (text-foreground / text-muted-foreground / bg-card) that read
//      the OKLCH tokens directly.
//   2. The Unsplash URL in the snippet had a trailing `$0` paste artifact -> 404. Removed.
//   3. Hardcoded "Modern / Living" copy -> fully prop-driven so it can feature any marketplace agent.
//   4. Added an onError fallback on the <img>: a branded violet/teal gradient replaces the photo if it
//      404s or the network is down, so an offline demo never shows a broken-image icon.

interface FeaturedSpotlightProps {
  label?: string;
  titleTop?: string;
  titleBottom?: string;
  description?: string;
  ctaLabel?: string;
  imageSrc?: string;
  imageAlt?: string;
  /** Small monospace index badge, e.g. "01". */
  index?: string;
  className?: string;
  onClick?: () => void;
}

export function FeaturedSpotlight({
  label = "Featured",
  titleTop = "Autonomous",
  titleBottom = "Research Agent",
  description = "A self-directed agent that plans, searches, and pays for the tools it needs to answer your question end to end.",
  ctaLabel = "Explore agent",
  imageSrc = "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop",
  imageAlt = "Featured agent",
  index = "01",
  className,
  onClick,
}: FeaturedSpotlightProps) {
  // Track image load success so a dead remote URL degrades to a gradient instead of a broken icon.
  const [imgOk, setImgOk] = useState(true);
  return (
    <article
      onClick={onClick}
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-border bg-card transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10",
        className,
      )}
    >
      <div className="relative h-72 w-full overflow-hidden">
        {imgOk ? (
          <img
            src={imageSrc}
            alt={imageAlt}
            loading="lazy"
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
            style={{
              background:
                "radial-gradient(120% 120% at 25% 15%, rgba(167,139,250,0.55) 0%, transparent 55%), radial-gradient(120% 120% at 85% 90%, rgba(34,211,238,0.40) 0%, transparent 55%), linear-gradient(160deg, #1a1530 0%, #0d0a18 100%)",
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
        <span className="absolute left-6 top-6 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium uppercase tracking-widest text-primary backdrop-blur">
          {label}
        </span>
        <span className="absolute right-6 top-6 font-mono text-sm text-muted-foreground">
          {index}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-6">
        <h3 className="text-2xl font-semibold leading-tight text-foreground">
          {titleTop}
          {titleBottom ? (
            <>
              <br />
              <span className="text-muted-foreground">{titleBottom}</span>
            </>
          ) : null}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-4 text-sm font-medium text-foreground">
          <span>{ctaLabel}</span>
          <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </article>
  );
}
