// PortalTrigger -- a teleport portal volume in the Hub. When the mascot walks into the
// trigger collider, it asks the shared TeleportController to additively load the target
// dashboard scene. One portal per dashboard; drop it on a trigger Collider in Hub.unity.
//
// Wiring (Phase 3): put this on a GameObject with a Collider set isTrigger = true, set
// targetScene to the dashboard's scene name (must be in Build Settings), and ensure the
// mascot GameObject is tagged "Player" with a Rigidbody (a trigger needs a Rigidbody on at
// least one of the two colliders for OnTriggerEnter to fire -- the mascot's NavMeshAgent
// moves a Rigidbody-bearing capsule).
//
// Debounce: OnTriggerEnter only fires once per physical entry, but we also guard with a flag
// so a jittery contact at the volume edge cannot double-fire a load. The flag resets on exit.

using UnityEngine;

namespace Crash.World
{
    [RequireComponent(typeof(Collider))]
    public class PortalTrigger : MonoBehaviour
    {
        [Header("Target")]
        [Tooltip("Scene name of the dashboard to load when the mascot enters. MUST be in " +
                 "File > Build Settings > Scenes In Build.")]
        [SerializeField] private string targetScene = string.Empty;

        [Tooltip("Tag the portal reacts to. The mascot must carry this tag. Default 'Player'.")]
        [SerializeField] private string mascotTag = "Player";

        // Set true from entry until the mascot leaves, so we fire GoTo at most once per entry.
        private bool _fired;

        private void OnTriggerEnter(Collider other)
        {
            if (_fired)
            {
                return;
            }
            if (other == null || !other.CompareTag(mascotTag))
            {
                return;
            }
            if (string.IsNullOrEmpty(targetScene))
            {
                Debug.LogWarning("[PortalTrigger] entered with no targetScene set");
                return;
            }
            if (CrashApp.Instance == null || CrashApp.Instance.Teleport == null)
            {
                Debug.LogWarning("[PortalTrigger] no CrashApp/TeleportController available");
                return;
            }

            _fired = true;
            CrashApp.Instance.Teleport.GoTo(targetScene);
        }

        private void OnTriggerExit(Collider other)
        {
            // Re-arm only when the same mascot leaves the volume, so the portal can fire again
            // on a later re-entry (e.g. after ReturnToHub).
            if (other != null && other.CompareTag(mascotTag))
            {
                _fired = false;
            }
        }
    }
}
