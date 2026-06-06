import { Suspense, lazy } from "react";

// @splinetool/react-spline streams a .splinecode scene from prod.spline.design over WebGL at
// RUNTIME, so we lazy-load it: the (large) Spline runtime is split into its own chunk that only
// downloads when a <SplineScene> actually mounts, and React Suspense shows the fallback until the
// scene's first frame is ready. Lazy here also means a dead network can't block initial paint.
const Spline = lazy(() => import("@splinetool/react-spline"));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
