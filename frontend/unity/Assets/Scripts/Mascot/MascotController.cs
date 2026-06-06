// MascotController -- click-to-move guide for the dashboard-world (REPLACES FoxController in
// the new scenes; FoxController stays as the demo-scene harness).
//
// Design goal (inherited from FoxController): the mascot must be FUNCTIONAL BEFORE any rigged
// model is imported. Movement is driven by a NavMeshAgent, so a bare CAPSULE with a
// NavMeshAgent (and NO AnimatorController yet) still walks where you click. When a rigged
// model with an Animator + a "Speed" float in its blend tree is parented under this object,
// the controller feeds agent speed into that float so idle<->walk blends automatically. The
// Animator is fully OPTIONAL and null-guarded; nothing crashes on a model-less placeholder.
//
// Wiring (Phase 3):
//   - Put this on the mascot root. Tag it "Player" (PortalTrigger reacts to that tag).
//   - Add a NavMeshAgent (required). Bake a NavMesh in the Hub + each dashboard.
//   - OPTIONAL: add an Animator with a float param "Speed" and an idle/walk blend tree.
//   - A camera tagged "MainCamera" must exist for click raycasts (Camera.main).
//
// INPUT: this project's Active Input Handling is "Input System Package (New)" ONLY
// (ProjectSettings activeInputHandler:1), so UnityEngine.Input.* THROWS at runtime
// ("InvalidOperationException: ... switched active Input handling to Input System package")
// and must NOT be used. Click-to-move reads the New Input System directly:
// Mouse.current.leftButton.wasPressedThisFrame + ScreenPointToRay(Mouse.current.position
// .ReadValue()). Mouse.current is null when no mouse device is attached, so reads are
// null-guarded. (If the project is ever flipped to "Both"/"Old", the legacy equivalents are
// Input.GetMouseButtonDown(0) + Input.mousePosition.)

using UnityEngine;
using UnityEngine.AI;
using UnityEngine.InputSystem;

namespace Crash.Mascot
{
    [RequireComponent(typeof(NavMeshAgent))]
    public class MascotController : MonoBehaviour
    {
        [Header("Movement")]
        [Tooltip("How far from the clicked point we will search the NavMesh for a valid stand " +
                 "position. Larger = more forgiving clicks near mesh edges.")]
        [SerializeField] private float navSampleMaxDistance = 2f;

        [Tooltip("Layers the click raycast hits (ground/floor colliders). Default Everything.")]
        [SerializeField] private LayerMask clickRaycastMask = ~0;

        [Tooltip("Max raycast distance from the camera for a click. Generous for big scenes.")]
        [SerializeField] private float clickRaycastMaxDistance = 200f;

        [Header("Animator (OPTIONAL -- null-safe; a bare capsule still moves)")]
        [Tooltip("The Animator whose float 'Speed' drives an idle/walk blend tree. Leave null " +
                 "for a model-less placeholder; movement still works via the NavMeshAgent.")]
        [SerializeField] private Animator animator;

        [Tooltip("Name of the Animator float set to the agent's planar speed each frame.")]
        [SerializeField] private string speedParam = "Speed";

        [Tooltip("Name of the Animator trigger fired by PlayEmote (e.g. a wave). Safe no-op if " +
                 "the param is absent.")]
        [SerializeField] private string emoteTrigger = "Wave";

        private NavMeshAgent _agent;
        private Camera _camera;

        // Cached: whether the assigned Animator actually has the configured params, so we never
        // spam warnings nor pay the cost of SetFloat/SetTrigger on a controller that lacks them.
        private bool _hasSpeedParam;
        private bool _hasEmoteTrigger;

        private void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();

            // Auto-find an Animator on/under the mascot if one was not wired explicitly. Still
            // fine if none exists -- movement does not depend on it.
            if (animator == null)
            {
                animator = GetComponentInChildren<Animator>();
            }
            CacheAnimatorParams();
        }

        private void Start()
        {
            // Camera.main resolves the MainCamera-tagged camera. Cache it; re-resolve lazily in
            // Update if the active camera changes across scene swaps.
            _camera = Camera.main;
        }

        private void Update()
        {
            HandleClickToMove();
            DriveAnimator();
        }

        // ----------------------------------------------------------------- input

        private void HandleClickToMove()
        {
            // New Input System (project is Input System ONLY -- activeInputHandler:1; see header).
            // Mouse.current is null when no mouse device is attached -- bail safely if so.
            Mouse mouse = Mouse.current;
            if (mouse == null || !mouse.leftButton.wasPressedThisFrame)
            {
                return;
            }

            // Re-resolve the camera lazily -- after an additive scene swap the previous
            // MainCamera may have been unloaded.
            if (_camera == null)
            {
                _camera = Camera.main;
                if (_camera == null)
                {
                    return;
                }
            }

            Ray ray = _camera.ScreenPointToRay(mouse.position.ReadValue());
            if (!Physics.Raycast(ray, out RaycastHit hit, clickRaycastMaxDistance, clickRaycastMask))
            {
                return;
            }

            // Snap the clicked world point to the nearest point on the baked NavMesh so the
            // agent always gets a reachable destination.
            if (NavMesh.SamplePosition(hit.point, out NavMeshHit navHit, navSampleMaxDistance, NavMesh.AllAreas))
            {
                if (_agent != null && _agent.isOnNavMesh)
                {
                    _agent.SetDestination(navHit.position);
                }
            }
        }

        // ----------------------------------------------------------------- animation seam

        private void DriveAnimator()
        {
            if (animator == null || !_hasSpeedParam)
            {
                return;
            }
            // Planar speed (NavMeshAgent.velocity already excludes the agent's own gravity).
            float speed = _agent != null ? _agent.velocity.magnitude : 0f;
            animator.SetFloat(speedParam, speed);
        }

        /// <summary>
        /// Optional wave/emote. Fires the configured Animator trigger if it exists; a safe
        /// no-op when there is no Animator or the trigger param is absent.
        /// </summary>
        public void PlayEmote()
        {
            if (animator != null && _hasEmoteTrigger)
            {
                animator.SetTrigger(emoteTrigger);
            }
        }

        // ----------------------------------------------------------------- helpers

        private void CacheAnimatorParams()
        {
            _hasSpeedParam = false;
            _hasEmoteTrigger = false;
            if (animator == null || animator.runtimeAnimatorController == null)
            {
                // No controller -> no params. Movement still works; we just skip SetFloat.
                return;
            }
            foreach (AnimatorControllerParameter param in animator.parameters)
            {
                if (param.type == AnimatorControllerParameterType.Float && param.name == speedParam)
                {
                    _hasSpeedParam = true;
                }
                else if (param.type == AnimatorControllerParameterType.Trigger && param.name == emoteTrigger)
                {
                    _hasEmoteTrigger = true;
                }
            }
        }
    }
}
