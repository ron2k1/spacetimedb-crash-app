// NavMeshBaker -- bakes a NavMeshSurface at RUNTIME so the mascot's NavMeshAgent has a walkable
// surface the moment the Hub scene loads, with zero edit-time asset plumbing.
//
// WHY runtime bake (not an edit-time bake saved to a NavMeshData asset):
//   A programmatic scene builder cannot cleanly persist a baked NavMeshData asset -- the editor
//   bake flow (NavMeshAssetManager) is editor-internal and the in-memory NavMeshData produced by
//   BuildNavMesh() does not survive a scene reload unless it is written out as an asset and
//   re-linked. Baking on Awake instead is deterministic, needs no asset, and the Hub floor is tiny
//   so the synchronous bake costs well under a frame.
//
// WHY collectObjects = Children:
//   The default NavMeshSurface collects ALL render meshes in the scene -- which would carve the
//   mascot capsule and the portal pillars into the floor as obstacles (holes at their footprints).
//   Restricting collection to this object's CHILDREN means only the Floor (parented under this
//   GameObject by the builder) contributes geometry, yielding a clean flat walkable surface. The
//   mascot and portals live elsewhere in the hierarchy and are therefore ignored by the bake.
//
// EXECUTION ORDER:
//   [DefaultExecutionOrder(-100)] runs this Awake before the mascot's so the surface exists before
//   the NavMeshAgent's first simulation tick. (Even without it, all Awakes complete before the
//   first agent tick on frame 1 -- but ordering it first removes any doubt.)
//
// Wiring (Phase 3): put this on an empty "NavMesh" GameObject and parent the Floor under it.
// RequireComponent adds the NavMeshSurface automatically.

using UnityEngine;
using Unity.AI.Navigation;

namespace Crash.World
{
    [RequireComponent(typeof(NavMeshSurface))]
    [DefaultExecutionOrder(-100)]
    public class NavMeshBaker : MonoBehaviour
    {
        private void Awake()
        {
            NavMeshSurface surface = GetComponent<NavMeshSurface>();

            // Bake only the children of this object (the Floor), not the whole scene, so the
            // mascot + portal visuals are never carved into the walkable surface.
            surface.collectObjects = CollectObjects.Children;
            surface.BuildNavMesh();
        }
    }
}
