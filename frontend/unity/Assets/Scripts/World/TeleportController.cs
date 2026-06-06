// TeleportController -- owns all additive scene transitions for the dashboard-world.
//
// The world is layered: a persistent Bootstrap scene (CrashApp + socket + file panel) plus a
// persistent Hub scene loaded once on launch, with at most ONE dashboard scene loaded
// additively over the Hub at a time. Teleporting between dashboards means: unload the current
// dashboard (if any), additively load the target, then mark the target the ACTIVE scene so its
// lighting/skybox applies. ReturnToHub just unloads the current dashboard (the Hub never unloads).
//
// Lives in Bootstrap.unity so it persists across swaps; CrashApp holds the reference and kicks
// off the initial Hub load via LoadHub(). Guards against double-loads: a load already in flight
// makes GoTo a no-op until it completes.
//
// SceneManager note: every scene named here (Hub + each dashboard) MUST be added to
// File > Build Settings > Scenes In Build, or LoadSceneAsync will fail at runtime.

using UnityEngine;
using UnityEngine.SceneManagement;

namespace Crash.World
{
    public class TeleportController : MonoBehaviour
    {
        // True while an additive load/unload is running. Blocks re-entrant GoTo so a mascot
        // bouncing on a portal volume cannot stack two loads of the same scene.
        private bool _transitionInFlight;

        // Cached hub name (set by LoadHub) so we never accidentally unload the base world.
        private string _hubSceneName = string.Empty;

        /// <summary>True while a scene load/unload is running (GoTo is a no-op meanwhile).</summary>
        public bool IsTransitioning => _transitionInFlight;

        /// <summary>
        /// Additively load the persistent Hub once on launch. Called by CrashApp.Start. The Hub
        /// stays loaded for the whole session; dashboards load over it. We do NOT mark the Hub
        /// the active scene here -- the first GoTo's target becomes active, and ReturnToHub
        /// restores the Hub as active.
        /// </summary>
        public void LoadHub(string hubSceneName)
        {
            _hubSceneName = hubSceneName ?? string.Empty;
            if (string.IsNullOrEmpty(_hubSceneName))
            {
                Debug.LogWarning("[TeleportController] LoadHub called with an empty scene name");
                return;
            }
            // If the hub is somehow already loaded (e.g. domain reload in the Editor), skip.
            if (SceneManager.GetSceneByName(_hubSceneName).isLoaded)
            {
                return;
            }
            SceneManager.LoadSceneAsync(_hubSceneName, LoadSceneMode.Additive);
        }

        /// <summary>
        /// Teleport to a dashboard scene: unload the current dashboard (if one is loaded), then
        /// additively load the target and mark it the active scene. No-op if a transition is
        /// already in flight, or if the target is already the current dashboard.
        /// </summary>
        public void GoTo(string sceneName)
        {
            if (string.IsNullOrEmpty(sceneName))
            {
                return;
            }
            if (_transitionInFlight)
            {
                // A load is already running -- ignore so we never stack two loads.
                return;
            }

            string current = CrashApp.Instance != null
                ? CrashApp.Instance.CurrentDashboardScene
                : string.Empty;

            // Already showing this dashboard -> no-op (per acceptance: GoTo on a loaded target).
            if (current == sceneName)
            {
                return;
            }

            _transitionInFlight = true;

            // Unload the outgoing dashboard first (if any), then load the incoming one. We chain
            // via the unload's completed callback so the swap is sequential and clean.
            if (!string.IsNullOrEmpty(current) && SceneManager.GetSceneByName(current).isLoaded)
            {
                AsyncOperation unload = SceneManager.UnloadSceneAsync(current);
                if (unload != null)
                {
                    unload.completed += _ => BeginLoad(sceneName);
                }
                else
                {
                    // Unload could not start (already gone) -- proceed straight to the load.
                    BeginLoad(sceneName);
                }
            }
            else
            {
                BeginLoad(sceneName);
            }
        }

        /// <summary>
        /// Return to the Hub: unload the current dashboard (the Hub stays loaded the whole time)
        /// and mark the Hub active again so its lighting applies. No-op while transitioning or
        /// when no dashboard is loaded.
        /// </summary>
        public void ReturnToHub()
        {
            if (_transitionInFlight)
            {
                return;
            }

            string current = CrashApp.Instance != null
                ? CrashApp.Instance.CurrentDashboardScene
                : string.Empty;

            if (string.IsNullOrEmpty(current))
            {
                // Already at the hub -- nothing to unload.
                return;
            }

            _transitionInFlight = true;

            if (SceneManager.GetSceneByName(current).isLoaded)
            {
                AsyncOperation unload = SceneManager.UnloadSceneAsync(current);
                if (unload != null)
                {
                    unload.completed += _ => FinishReturnToHub();
                }
                else
                {
                    FinishReturnToHub();
                }
            }
            else
            {
                FinishReturnToHub();
            }
        }

        // ----------------------------------------------------------------- internals

        private void BeginLoad(string sceneName)
        {
            AsyncOperation load = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
            if (load == null)
            {
                // The scene name is not in Build Settings (or otherwise invalid). Surface a
                // marker and clear the flag so the world is not wedged.
                Debug.LogWarning("[TeleportController] could not load scene '" + sceneName +
                                 "' (is it in Build Settings?)");
                _transitionInFlight = false;
                return;
            }
            load.completed += _ =>
            {
                // Make the freshly-loaded dashboard the active scene so its lighting/skybox
                // applies (additively-loaded scenes are not active by default).
                Scene loaded = SceneManager.GetSceneByName(sceneName);
                if (loaded.IsValid() && loaded.isLoaded)
                {
                    SceneManager.SetActiveScene(loaded);
                }
                if (CrashApp.Instance != null)
                {
                    CrashApp.Instance.SetCurrentDashboardScene(sceneName);
                }
                _transitionInFlight = false;
            };
        }

        private void FinishReturnToHub()
        {
            // Restore the Hub as the active scene so its lighting governs the hub view again.
            if (!string.IsNullOrEmpty(_hubSceneName))
            {
                Scene hub = SceneManager.GetSceneByName(_hubSceneName);
                if (hub.IsValid() && hub.isLoaded)
                {
                    SceneManager.SetActiveScene(hub);
                }
            }
            if (CrashApp.Instance != null)
            {
                CrashApp.Instance.SetCurrentDashboardScene(string.Empty);
            }
            _transitionInFlight = false;
        }
    }
}
