// Fox -- the guide character. Loads the rigged Khronos "Fox" glTF (CC-BY 4.0; see
// public/models/CREDITS.md) and plays its baked "Survey" idle clip. The same GLB is consumed
// by the Unity renderer via glTFast, so both clients share one canonical model file.
//
// Robustness: useGLTF suspends while the model streams in and THROWS on a decode/404 failure.
// Scene.tsx wraps this in <Suspense> + <ErrorBoundary> so a missing or bad model degrades to a
// simple clickable shape (FoxFallback) instead of white-screening the user's session.
import { useGLTF, useAnimations } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';

const FOX_URL = '/models/Fox.glb';

export function Fox({ onClick }: { onClick?: () => void }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(FOX_URL);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    // The Khronos Fox ships Survey / Walk / Run; Survey is the calm look-around idle.
    const name = names.includes('Survey') ? 'Survey' : names[0];
    const action = name ? actions[name] : null;
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, names]);

  return (
    <group
      ref={group}
      dispose={null}
      position={[0, -0.9, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <primitive object={scene} scale={0.025} />
    </group>
  );
}

/** Shown while the GLB streams in, and if it fails to load. Clickable so the app stays usable. */
export function FoxFallback({ onClick }: { onClick?: () => void }) {
  return (
    <mesh
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ff9966" />
    </mesh>
  );
}

// Warm the loader cache so the model is ready by first paint.
useGLTF.preload(FOX_URL);
