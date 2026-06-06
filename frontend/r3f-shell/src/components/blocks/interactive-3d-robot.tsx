import { Suspense, lazy } from "react";

// InteractiveRobotSpline -- the full-bleed hero: a draggable/interactive 3D robot (Crash) streamed
// from Spline. Lazy-loaded like SplineScene so the Spline runtime is its own chunk and a slow network
// can't block first paint. The fallback is a dark spinner panel (bg-gray-900) that fills the same box,
// so the layout never jumps between "loading" and "loaded".
const Spline = lazy(() => import("@splinetool/react-spline"));

interface InteractiveRobotSplineProps {
  scene: string;
  className?: string;
}

export function InteractiveRobotSpline({ scene, className }: InteractiveRobotSplineProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`flex h-full w-full items-center justify-center bg-gray-900 text-white ${className ?? ""}`}
        >
          <svg
            className="mr-3 h-6 w-6 animate-spin text-white/80"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading 3D Robot...</span>
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
