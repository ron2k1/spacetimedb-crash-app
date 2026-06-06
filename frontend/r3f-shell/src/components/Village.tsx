// Village -- the cozy, CONTAINED little world the fox lives on: the SOLID grassy island (now a per-tab
// BIOME, see <Ground>), a cabin and a house with glowing windows, plus trees, a stepping-stone path,
// and bushes to fill the stage. All procedural primitives (CC0-clean, no GLB). This is deliberately a
// diorama, not an open world -- the camera is clamped (see Scene.tsx) so you can't peek under the
// island, and the warm pools of light against the warm sky are the "feels familiar / safe" cue the
// design calls for.
//
// Per-tab recolor: the island (<Ground>) AND the living foliage (trees, bushes) follow the shared
// `biome` colors (biome.ts), so switching dashboard tabs cross-fades the whole ground as one place --
// green meadow (Skills) / lavender dream (Create) / teal energy (Agent) / lime growth (Activity).
// Built objects (cabin, house, path stones, lantern) stay their own materials -- a house is a house in
// any biome; only the LAND and what grows from it change.
import type { ReactNode } from 'react';
import { RoundedBox } from '@react-three/drei';
import { theme } from '../theme';
import { Ground } from './Ground';
import { useBiomeColor } from '../biome';

const WINDOW = theme.glow.window;
const FLOOR_Y = -0.9; // the grass surface; matches the fox's foot plane

// A glowing window: emissive so it reads as "lit from inside" regardless of scene lighting.
function GlowWindow({ position }: { position: [number, number, number] }) {
  return (
    <RoundedBox args={[0.3, 0.3, 0.06]} radius={0.02} smoothness={4} position={position}>
      <meshStandardMaterial color={WINDOW} emissive={WINDOW} emissiveIntensity={1.7} />
    </RoundedBox>
  );
}

// A door: dark wood with a faint warm rim-glow leaking around it.
function Door({
  position,
  size = [0.36, 0.62],
}: {
  position: [number, number, number];
  size?: [number, number];
}) {
  return (
    <RoundedBox args={[size[0], size[1], 0.06]} radius={0.02} smoothness={4} position={position}>
      <meshStandardMaterial color="#3c2a1a" emissive="#ff8a3a" emissiveIntensity={0.25} roughness={0.8} />
    </RoundedBox>
  );
}

// A reusable building: box walls + a 4-segment cone (square pyramid = gable roof), plus a warm
// point-light spilling from the doorway toward the fox. Windows/door come in as children authored
// on the local +z front face, so they rotate with the building.
function Building({
  position,
  rotation = 0,
  wall,
  roof,
  wallColor,
  roofColor,
  children,
}: {
  position: [number, number, number];
  rotation?: number;
  wall: [number, number, number]; // [w, h, d]
  roof: [number, number]; // [baseRadius, height]
  wallColor: string;
  roofColor: string;
  children?: ReactNode;
}) {
  const h = wall[1];
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox args={wall} radius={0.04} smoothness={4} position={[0, h / 2, 0]}>
        <meshStandardMaterial color={wallColor} roughness={0.85} />
      </RoundedBox>
      <mesh position={[0, h + roof[1] / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[roof[0], roof[1], 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.8} />
      </mesh>
      {/* warm light spilling from the doorway toward the fox at origin */}
      <pointLight position={[0, h * 0.5, 1.4]} color="#ffb066" intensity={7} distance={7} decay={2} />
      {children}
    </group>
  );
}

// A chunky low-poly tree: a tapered trunk + two stacked foliage cones. Trunk follows the biome's
// soilDark, the foliage follows grassDark/grass -- so the tree recolors WITH the ground on a tab
// change instead of being a green island in a lavender field.
function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const trunkMat = useBiomeColor('soilDark');
  const lowerMat = useBiomeColor('grassDark');
  const upperMat = useBiomeColor('grass');
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.12, 0.17, 0.8, 8]} />
        <meshStandardMaterial ref={trunkMat} color={theme.ground.soilDark} roughness={1} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <coneGeometry args={[0.6, 1.0, 12]} />
        <meshStandardMaterial ref={lowerMat} color={theme.ground.grassDark} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <coneGeometry args={[0.42, 0.78, 12]} />
        <meshStandardMaterial ref={upperMat} color={theme.ground.grass} roughness={0.9} />
      </mesh>
    </group>
  );
}

// A small round bush -- a squashed icosphere (follows the biome's grassDark) with a couple of tiny
// warm berries for a constant pop of color in every biome.
function Bush({ position }: { position: [number, number, number] }) {
  const bodyMat = useBiomeColor('grassDark');
  return (
    <group position={position}>
      <mesh scale={[1, 0.8, 1]}>
        <icosahedronGeometry args={[0.32, 1]} />
        <meshStandardMaterial ref={bodyMat} color={theme.ground.grassDark} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.14, 0.16, 0.16]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#e0533d" emissive="#e0533d" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.12, 0.1, 0.18]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#ff8a3a" emissive="#ff8a3a" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

// A flat stepping-stone for the path (stone stays stone in every biome).
function PathStone({ position, r = 0.34 }: { position: [number, number, number]; r?: number }) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[r, r, 0.08, 10]} />
      <meshStandardMaterial color={theme.ground.stone} roughness={1} />
    </mesh>
  );
}

export function Village() {
  return (
    <group>
      {/* ---------- SOLID GROUND ISLAND (per-tab biome; also drives the shared `biome` colors) ---------- */}
      <Ground />

      {/* ---------- BUILDINGS ---------- */}
      {/* CABIN -- back-left, small, wood walls + red-brown roof, with a chimney */}
      <Building
        position={[-2.9, FLOOR_Y, -1.4]}
        rotation={0.5}
        wall={[1.4, 1.05, 1.2]}
        roof={[1.15, 0.8]}
        wallColor="#6e4a30"
        roofColor="#8a4232"
      >
        <Door position={[0, 0.31, 0.61]} />
        <GlowWindow position={[-0.42, 0.66, 0.61]} />
        <GlowWindow position={[0.42, 0.66, 0.61]} />
        <RoundedBox args={[0.16, 0.5, 0.16]} radius={0.03} smoothness={4} position={[0.45, 1.55, -0.2]}>
          <meshStandardMaterial color="#5a3c28" roughness={0.9} />
        </RoundedBox>
      </Building>

      {/* HOUSE -- back-right of the fox but pulled IN from the edge and pushed back, so it frames
          the fox and stays clear of the permanent right-side task panel (the 3D "stage" is really
          the left ~70% of the viewport). Larger, warm tan walls + brown roof, three lit windows. */}
      <Building
        position={[1.7, FLOOR_Y, -3.2]}
        rotation={-0.25}
        wall={[1.9, 1.3, 1.5]}
        roof={[1.55, 0.95]}
        wallColor="#a9794a"
        roofColor="#7a4a3a"
      >
        <Door position={[0, 0.36, 0.76]} size={[0.42, 0.72]} />
        <GlowWindow position={[-0.55, 0.82, 0.76]} />
        <GlowWindow position={[0.55, 0.82, 0.76]} />
        <GlowWindow position={[0, 0.82, 0.76]} />
      </Building>

      {/* ---------- PROPS (fill the stage) ---------- */}
      {/* trees clustered back-left + one back-right, clear of the buildings */}
      <Tree position={[-4.4, FLOOR_Y, 0.4]} scale={1.15} />
      <Tree position={[-3.7, FLOOR_Y, -3.1]} scale={0.95} />
      <Tree position={[3.9, FLOOR_Y, -1.4]} scale={1.05} />

      {/* a curved stepping-stone path from near the fox toward the house door */}
      <PathStone position={[0.2, FLOOR_Y + 0.04, 1.1]} />
      <PathStone position={[0.7, FLOOR_Y + 0.04, 0.2]} r={0.3} />
      <PathStone position={[1.05, FLOOR_Y + 0.04, -0.7]} />
      <PathStone position={[1.3, FLOOR_Y + 0.04, -1.6]} r={0.3} />

      {/* low bushes for foreground coziness */}
      <Bush position={[-1.6, FLOOR_Y + 0.18, 1.4]} />
      <Bush position={[2.5, FLOOR_Y + 0.18, 0.6]} />

      {/* a little warm lantern on a post near the fox */}
      <group position={[1.25, FLOOR_Y, 0.7]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.03, 0.04, 1.0, 8]} />
          <meshStandardMaterial color="#2b1d16" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.02, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial color={WINDOW} emissive={WINDOW} emissiveIntensity={1.9} />
        </mesh>
        <pointLight position={[0, 1.02, 0]} color="#ffcf8f" intensity={5} distance={5} decay={2} />
      </group>
    </group>
  );
}
