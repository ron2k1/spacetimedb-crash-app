// CrashApp -- the persistent application root for the Crash dashboard-world.
//
// Lives on a GameObject in Bootstrap.unity alongside the CrashWsClient and the persistent
// File Activity Canvas. It survives every additive scene load/unload (DontDestroyOnLoad) so
// the socket connection and the file panel stay alive while the mascot teleports between
// dashboard scenes. Everything else reaches the live socket through CrashApp.Instance.Client.
//
// Responsibilities (single global seam):
//   - Enforce a singleton (Instance) and persist across scene changes.
//   - Cache the CrashWsClient that lives in the same Bootstrap scene.
//   - On Start(), additively load the Hub scene via the TeleportController so the hub world
//     appears over the persistent bootstrap.
//   - Track the name of the currently-loaded dashboard scene ("" when only Hub is loaded),
//     written by the TeleportController as the mascot teleports.
//
// This file holds NO protocol parsing and NO scene-loading mechanics -- it is the shared
// reference point. CrashWsClient owns the socket; TeleportController owns scene transitions.

using UnityEngine;

namespace Crash.World
{
    public class CrashApp : MonoBehaviour
    {
        /// <summary>The single live CrashApp. Null only before Bootstrap's Awake runs.</summary>
        public static CrashApp Instance { get; private set; }

        [Header("Wiring (assigned in Bootstrap.unity by the scene builder)")]
        [Tooltip("The CrashWsClient living in the Bootstrap scene. Reached app-wide via Client.")]
        [SerializeField] private Crash.Net.CrashWsClient client;

        [Tooltip("The TeleportController that performs additive scene loads/unloads. Lives in " +
                 "Bootstrap so it persists across dashboard swaps.")]
        [SerializeField] private TeleportController teleport;

        [Header("Hub")]
        [Tooltip("The name of the persistent hub scene additively loaded on Start. Must be in " +
                 "Build Settings. The hub stays loaded the whole session; dashboards load over it.")]
        [SerializeField] private string hubSceneName = "Hub";

        // The currently-loaded dashboard scene name, or "" when only the Hub is loaded.
        // Written by TeleportController.GoTo / ReturnToHub; read by anyone needing context.
        private string _currentDashboardScene = string.Empty;

        /// <summary>The live socket client. Non-null once Bootstrap has loaded.</summary>
        public Crash.Net.CrashWsClient Client => client;

        /// <summary>The shared scene-transition controller (additive load/unload).</summary>
        public TeleportController Teleport => teleport;

        /// <summary>Name of the dashboard scene currently loaded over the Hub, or "" if none.</summary>
        public string CurrentDashboardScene => _currentDashboardScene;

        /// <summary>The configured hub scene name (the always-loaded base world).</summary>
        public string HubSceneName => hubSceneName;

        private void Awake()
        {
            // Singleton: the first CrashApp wins and persists; any duplicate (e.g. Bootstrap
            // loaded twice) destroys itself so Instance never points at a stale object.
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            // Bring up the hub world over the persistent bootstrap. TeleportController owns the
            // actual additive load; CrashApp just kicks it off once on launch.
            if (teleport != null)
            {
                teleport.LoadHub(hubSceneName);
            }
            else
            {
                Debug.LogWarning("[CrashApp] no TeleportController assigned; Hub will not load");
            }
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        /// <summary>
        /// Record which dashboard scene is currently loaded over the Hub. Called by the
        /// TeleportController after a successful additive load ("" after ReturnToHub).
        /// </summary>
        public void SetCurrentDashboardScene(string sceneName)
        {
            _currentDashboardScene = sceneName ?? string.Empty;
        }
    }
}
