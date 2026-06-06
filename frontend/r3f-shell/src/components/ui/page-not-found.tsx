// Crash "this screen failed to load" fallback. Adapted from a 21st.dev 404 staging upload
// (docs/incoming-components/page-not-found.tsx) into the Crash dark-violet shadcn theme.
//
// Offline-proofed for the desktop app: the original shipped a CharactersAnimation built from six
// raw.githubusercontent.com stick-figure SVGs (an offline landmine) -- that whole component and all
// remote URLs are removed. The only retained visual is CircleAnimation, a dependency-free <canvas>
// particle burst that we re-tint from white to a light violet so it reads on the near-black violet
// background; it sits behind the message at a low z-index with pointer-events disabled.
//
// The original also imported react-router's useNavigate (commented out). This app has no router, so
// navigation is handled via optional props that both default to a full reload -- which makes this
// component safe to drop in as a top-level ErrorBoundary fallback that receives no props.

import { useEffect, useRef } from "react";
import { House, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotFoundProps {
  /** Called by the "Reload" button. Defaults to a full window reload. */
  onReload?: () => void;
  /** Called by the "Back to Crash" button. Defaults to a full window reload. */
  onHome?: () => void;
}

interface Particle {
  x: number;
  y: number;
  size: number;
}

/**
 * Dependency-free canvas particle burst. Self-contained: sizes itself to the window, redraws on
 * resize, tints the dots a light violet so they read on the dark background, and tears down its
 * animation frame + resize listener on unmount. Decorative only -- sits behind the message and
 * never intercepts pointer events.
 */
function CircleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const seedParticles = () => {
      particlesRef.current = [];
      for (let i = 0; i < 300; i++) {
        const x =
          Math.floor(
            Math.random() * (canvas.width * 3 - canvas.width * 1.2 + 1),
          ) +
          canvas.width * 1.2;
        const y =
          Math.floor(Math.random() * (canvas.height - (canvas.height * -0.2 + 1))) +
          canvas.height * -0.2;
        const size = canvas.width / 1000;
        particlesRef.current.push({ x, y, size });
      }
    };

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      timerRef.current++;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const distanceX = canvas.width / 80;
      const growthRate = canvas.width / 1000;

      // Light violet that reads on the near-black violet background. ~oklch(0.78 0.12 295)
      // equivalent, expressed as rgba so it works on a 2D canvas context everywhere.
      ctx.fillStyle = "rgba(196, 181, 253, 0.85)";
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p) => {
        ctx.beginPath();

        if (timerRef.current < 65) {
          p.x -= distanceX;
          p.size += growthRate;
        } else if (timerRef.current < 500) {
          p.x -= distanceX * 0.02;
          p.size += growthRate * 0.2;
        }

        ctx.arc(p.x, p.y, Math.max(p.size, 0), 0, Math.PI * 2);
        ctx.fill();
      });

      if (timerRef.current > 500) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const start = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      timerRef.current = 0;
      seedParticles();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      draw();
    };

    const handleResize = () => start();

    start();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-60"
    />
  );
}

/**
 * Full-screen fallback for "this screen didn't load". Themed dark violet, fully offline, safe as a
 * top-level ErrorBoundary fallback (both actions default to a reload when no props are passed).
 */
export default function NotFound({ onReload, onHome }: NotFoundProps) {
  const handleReload = onReload ?? (() => window.location.reload());
  const handleHome = onHome ?? (() => window.location.reload());

  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-background text-foreground">
      <CircleAnimation />

      <div className="relative z-10 flex w-[90%] max-w-xl flex-col items-center text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
          Crash
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          This screen didn&apos;t load
        </h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground">
          Something hiccuped while drawing this. You can reload, or head back to
          Crash.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button onClick={handleReload}>
            <RotateCw />
            Reload
          </Button>
          <Button variant="outline" onClick={handleHome}>
            <House />
            Back to Crash
          </Button>
        </div>
      </div>
    </div>
  );
}
