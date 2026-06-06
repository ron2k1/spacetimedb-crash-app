// HubReturnButton -- a self-wiring "Return to Hub" button for the dashboard scenes.
//
// WHY this exists (not a serialized onClick in the inspector):
//   A dashboard scene (SkillCreator / SkillsMarket / PluginMarket) is loaded ADDITIVELY over the
//   Bootstrap scene. The TeleportController that owns scene transitions lives in Bootstrap, so a
//   button in a dashboard scene CANNOT serialize a UnityEvent onClick targeting it -- cross-scene
//   object references are impossible in Unity. Instead this component reaches the controller at
//   runtime through the persistent CrashApp.Instance singleton, mirroring how the dashboards reach
//   the socket via CrashApp.Instance.Client.
//
// HOUSE STYLE: listener added in OnEnable / removed in OnDisable, so re-entering a dashboard scene
// (which re-runs OnEnable) never double-subscribes.
//
// Wiring (Phase 3): drop this on the dashboard's "Return to Hub" Button GameObject. No serialized
// fields -- the builder just AddComponent<HubReturnButton>()s it; RequireComponent guarantees a
// Button is present.

using UnityEngine;
using UnityEngine.UI;

namespace Crash.World
{
    [RequireComponent(typeof(Button))]
    public class HubReturnButton : MonoBehaviour
    {
        private Button _button;

        private void OnEnable()
        {
            _button = GetComponent<Button>();
            _button.onClick.AddListener(ReturnToHub);
        }

        private void OnDisable()
        {
            if (_button != null)
            {
                _button.onClick.RemoveListener(ReturnToHub);
            }
        }

        private void ReturnToHub()
        {
            CrashApp app = CrashApp.Instance;
            if (app != null && app.Teleport != null)
            {
                app.Teleport.ReturnToHub();
            }
            else
            {
                Debug.LogWarning("[HubReturnButton] CrashApp/Teleport not available; cannot return");
            }
        }
    }
}
