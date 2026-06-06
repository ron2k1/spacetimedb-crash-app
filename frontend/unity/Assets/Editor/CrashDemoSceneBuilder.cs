// CrashDemoSceneBuilder -- one-click assembly of a minimal, functional Crash demo scene.
//
// Menu: Crash > Build Demo Scene. Produces Assets/Scenes/CrashDemo.unity containing:
//   - Main Camera + a directional light
//   - A fox PLACEHOLDER (primitive capsule) carrying FoxController -- works with NO model
//   - A screen-space Canvas with:
//       * a narration Text label (bound to answer.partial + result.final)
//       * a status Text label (bound to status/error/connection)
//       * an InputField + "Ask" Button (calls CrashWsClient.SubmitRequest)
//       * an About panel with the required attribution line
//   - A CrashWsClient GameObject (the transport) and a CrashDemoUI binder
//
// Uses uGUI (UnityEngine.UI) rather than TextMeshPro so the scene builds with zero extra
// import steps (com.unity.ugui ships with the URP template; TMP needs its Essentials import).
//
// Private [SerializeField] references on CrashDemoUI / FoxController are wired via
// SerializedObject so the saved scene is fully connected with no manual Inspector work.

using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using Crash.Net;
using Crash.Fox;

namespace Crash.EditorTools
{
    public static class CrashDemoSceneBuilder
    {
        private const string ScenePath = "Assets/Scenes/CrashDemo.unity";

        private const string AttributionLine =
            "Fox model: 'Low Poly Fox' by PixelMannen (CC-BY 4.0) / animations by tomkranis.";

        // The real fox: glTFast imports Assets/Models/Fox.glb into a prefab + AnimationClips.
        // Loaded via AssetDatabase so this script needs NO glTFast namespace ref to compile.
        private const string FoxModelPath = "Assets/Models/Fox.glb";
        private const string FoxIdleControllerPath = "Assets/Models/FoxIdle.controller";
        private const string IdleClipName = "Survey"; // the calm look-around idle baked into Fox.glb

        // Hotkey Ctrl+Shift+Alt+B (%#&b) so the scene can be rebuilt without pixel-hunting the
        // menu bar -- reliable for remote/automated invocation on multi-monitor setups.
        [MenuItem("Crash/Build Demo Scene %#&b")]
        public static void BuildDemoScene()
        {
            // Fresh empty scene (single-scene setup) we populate from scratch.
            var scene = EditorSceneManager.NewScene(
                NewSceneSetup.EmptyScene, NewSceneMode.Single);

            BuildCamera();
            BuildLight();

            FoxController fox = BuildFox();
            CrashWsClient client = BuildClient();
            BuildCanvasAndBinder(client, fox);

            EnsureFolder("Assets/Scenes");
            bool saved = EditorSceneManager.SaveScene(scene, ScenePath);
            if (saved)
            {
                AssetDatabase.Refresh();
                Debug.Log("[CrashDemoSceneBuilder] Saved demo scene to " + ScenePath);
            }
            else
            {
                Debug.LogError("[CrashDemoSceneBuilder] Failed to save scene to " + ScenePath);
            }
        }

        // ----------------------------------------------------------------- world

        private static void BuildCamera()
        {
            var go = new GameObject("Main Camera");
            var cam = go.AddComponent<Camera>();
            go.tag = "MainCamera";
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.10f, 0.08f, 0.19f); // matches r3f-shell bg
            go.transform.position = new Vector3(0f, 1.2f, -3.2f);
            go.transform.rotation = Quaternion.Euler(8f, 0f, 0f);
            go.AddComponent<AudioListener>();
        }

        private static void BuildLight()
        {
            var go = new GameObject("Directional Light");
            var light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1.00f, 0.85f, 0.70f);
            light.intensity = 1.1f;
            go.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
        }

        // Build the fox: the REAL rigged Khronos fox if Assets/Models/Fox.glb has been imported
        // (glTFast present + import finished), otherwise the primitive capsule. The demo must stay
        // functional in EVERY state -- a missing/half-imported/failed model degrades to the capsule
        // that already shipped, never a broken scene. All real-fox work is wrapped so it cannot throw.
        private static FoxController BuildFox()
        {
            GameObject foxGo = TryInstantiateRiggedFox();
            if (foxGo != null)
            {
                return WireRealFox(foxGo);
            }
            Debug.Log("[CrashDemoSceneBuilder] Fox.glb not available -- using capsule placeholder.");
            return BuildFoxPlaceholder();
        }

        // Returns an instantiated rigged-fox GameObject, or null if the model is not importable yet.
        // Loads via AssetDatabase ONLY -- no glTFast namespace reference -- so this Editor script
        // compiles and the Crash menu survives even while glTFast is still resolving.
        private static GameObject TryInstantiateRiggedFox()
        {
            try
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(FoxModelPath);
                if (prefab == null)
                {
                    return null; // not imported yet (glTFast missing / import in flight / failed)
                }

                var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                instance.name = "Fox";
                instance.transform.position = Vector3.zero;
                // Khronos fox authors facing +Z; rotate 180 so it faces the camera at z = -3.2.
                instance.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                // 0.025 is the exact effective scale the R3F renderer uses for this same GLB
                // (<primitive scale={0.025}/>). Starting value -- nudge after a Play-mode screenshot.
                instance.transform.localScale = Vector3.one * 0.025f;
                return instance;
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[CrashDemoSceneBuilder] rigged fox instantiate failed (" +
                    e.GetType().Name + ") -- falling back to capsule placeholder.");
                return null;
            }
        }

        // Attach FoxController + a looping idle Animator to the real fox. Wires ONLY riggedFoxRoot:
        // leaving placeholderBody/placeholderRenderer null keeps PlayState from grey-tinting the
        // textured fox, and leaving jawBone/headBone null avoids the Update()-vs-Animator frame
        // conflict (the Animator evaluates Survey AFTER Update writes bone rotations). FoxController
        // then bobs the whole fox root subtly while speaking, which reads fine over an in-place idle.
        private static FoxController WireRealFox(GameObject foxGo)
        {
            SetupIdleAnimator(foxGo);

            var fox = foxGo.AddComponent<FoxController>();
            var so = new SerializedObject(fox);
            SetObjectRef(so, "riggedFoxRoot", foxGo.transform);
            so.ApplyModifiedPropertiesWithoutUndo();
            return fox;
        }

        // Create a one-state AnimatorController that loops the fox's baked "Survey" idle (falling
        // back to any clip the GLB ships) and attach an Animator playing it.
        private static void SetupIdleAnimator(GameObject foxGo)
        {
            try
            {
                AnimationClip idle = FindIdleClip(FoxModelPath);
                if (idle == null)
                {
                    Debug.LogWarning("[CrashDemoSceneBuilder] no AnimationClip in " + FoxModelPath +
                        " -- fox will be static.");
                    return;
                }

                // Force the clip to loop so the idle plays continuously. Best-effort: imported-clip
                // settings may not persist a reimport, but they apply for this session + saved scene.
                try
                {
                    var settings = AnimationUtility.GetAnimationClipSettings(idle);
                    if (!settings.loopTime)
                    {
                        settings.loopTime = true;
                        AnimationUtility.SetAnimationClipSettings(idle, settings);
                    }
                }
                catch (System.Exception) { /* loop is a nicety; ignore if the API refuses */ }

                EnsureFolder("Assets/Models");
                var controller = AnimatorController.CreateAnimatorControllerAtPathWithClip(
                    FoxIdleControllerPath, idle);

                var animator = foxGo.GetComponent<Animator>();
                if (animator == null) animator = foxGo.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;
                animator.applyRootMotion = false;
                animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[CrashDemoSceneBuilder] idle animator setup failed (" +
                    e.GetType().Name + ") -- fox will be static.");
            }
        }

        // Pick the idle clip from the imported GLB: prefer "Survey", then any clip whose name ends
        // in it, then the first real clip found, so something always animates.
        private static AnimationClip FindIdleClip(string assetPath)
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath(assetPath);
            AnimationClip first = null;
            AnimationClip endsWith = null;
            foreach (var obj in assets)
            {
                var clip = obj as AnimationClip;
                if (clip == null) continue;
                if (clip.name.StartsWith("__preview__")) continue; // skip generated preview clips
                if (first == null) first = clip;
                if (clip.name == IdleClipName) return clip;
                if (clip.name.EndsWith(IdleClipName)) endsWith = clip;
            }
            return endsWith != null ? endsWith : first;
        }

        private static FoxController BuildFoxPlaceholder()
        {
            // Primitive capsule stands in for the fox until a GLB is imported + assigned.
            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "FoxPlaceholder";
            body.transform.position = new Vector3(0f, 0.5f, 0f);
            body.transform.localScale = new Vector3(0.6f, 0.6f, 0.6f);

            var fox = body.AddComponent<FoxController>();

            // Wire FoxController's placeholder references to its own body/renderer.
            var so = new SerializedObject(fox);
            SetObjectRef(so, "placeholderBody", body.transform);
            var rend = body.GetComponent<Renderer>();
            if (rend != null) SetObjectRef(so, "placeholderRenderer", rend);
            so.ApplyModifiedPropertiesWithoutUndo();

            return fox;
        }

        private static CrashWsClient BuildClient()
        {
            var go = new GameObject("CrashWsClient");
            return go.AddComponent<CrashWsClient>();
        }

        // ----------------------------------------------------------------- UI

        private static void BuildCanvasAndBinder(CrashWsClient client, FoxController fox)
        {
            // EventSystem so UI input (button clicks, text entry) works in Play mode.
            var es = new GameObject("EventSystem");
            es.AddComponent<UnityEngine.EventSystems.EventSystem>();
            AddInputModule(es);

            // Canvas (screen-space overlay).
            var canvasGo = new GameObject("Canvas");
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280f, 720f);
            canvasGo.AddComponent<GraphicRaycaster>();

            // Narration label (top, large area).
            Text narration = CreateLabel(
                canvasGo.transform, "NarrationLabel",
                new Vector2(0f, 1f), new Vector2(1f, 1f),
                new Vector2(24f, -260f), new Vector2(-24f, -24f),
                "Ask the fox something...", 28, TextAnchor.UpperLeft);
            narration.color = new Color(0.95f, 0.95f, 0.98f);

            // Status label (below narration).
            Text status = CreateLabel(
                canvasGo.transform, "StatusLabel",
                new Vector2(0f, 1f), new Vector2(1f, 1f),
                new Vector2(24f, -300f), new Vector2(-24f, -262f),
                "status: idle", 20, TextAnchor.MiddleLeft);
            status.color = new Color(0.70f, 0.78f, 0.90f);

            // Input field (bottom-left, stretched).
            InputField input = CreateInputField(
                canvasGo.transform, "InputField",
                new Vector2(24f, 24f), new Vector2(360f, 64f));

            // Ask button (right of the input field).
            Button ask = CreateButton(
                canvasGo.transform, "AskButton", "Ask",
                new Vector2(396f, 24f), new Vector2(516f, 64f));

            // About panel (bottom-right) with the required attribution line.
            BuildAboutPanel(canvasGo.transform);

            // Binder: subscribes to the client + drives the UI and fox.
            var binderGo = new GameObject("CrashDemoUI");
            var binder = binderGo.AddComponent<CrashDemoUI>();
            var so = new SerializedObject(binder);
            SetObjectRef(so, "client", client);
            SetObjectRef(so, "fox", fox);
            SetObjectRef(so, "narrationLabel", narration);
            SetObjectRef(so, "statusLabel", status);
            SetObjectRef(so, "inputField", input);
            SetObjectRef(so, "askButton", ask);
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void BuildAboutPanel(Transform parent)
        {
            var panelGo = new GameObject("AboutPanel", typeof(RectTransform), typeof(Image));
            panelGo.transform.SetParent(parent, false);
            var rt = (RectTransform)panelGo.transform;
            rt.anchorMin = new Vector2(1f, 0f);
            rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(1f, 0f);
            rt.anchoredPosition = new Vector2(-24f, 24f);
            rt.sizeDelta = new Vector2(440f, 90f);
            var img = panelGo.GetComponent<Image>();
            img.color = new Color(0f, 0f, 0f, 0.45f);

            Text about = CreateLabel(
                panelGo.transform, "AboutText",
                Vector2.zero, Vector2.one,
                new Vector2(10f, 8f), new Vector2(-10f, -8f),
                "About Crash demo.\n" + AttributionLine, 14, TextAnchor.LowerLeft);
            about.color = new Color(0.85f, 0.85f, 0.88f);
        }

        // ----------------------------------------------------------------- uGUI factory helpers

        private static Text CreateLabel(
            Transform parent, string name,
            Vector2 anchorMin, Vector2 anchorMax,
            Vector2 offsetMin, Vector2 offsetMax,
            string content, int fontSize, TextAnchor align)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.offsetMin = offsetMin;
            rt.offsetMax = offsetMax;

            var text = go.GetComponent<Text>();
            text.text = content;
            text.fontSize = fontSize;
            text.alignment = align;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.font = LegacyFont();
            return text;
        }

        private static InputField CreateInputField(
            Transform parent, string name, Vector2 anchoredMin, Vector2 sizeTopRight)
        {
            // Background image + the InputField component.
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(InputField));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.zero;
            rt.pivot = Vector2.zero;
            rt.anchoredPosition = anchoredMin;
            rt.sizeDelta = sizeTopRight - anchoredMin;

            var bg = go.GetComponent<Image>();
            bg.color = new Color(1f, 1f, 1f, 0.92f);

            // Child text + placeholder, required by InputField.
            Text text = CreateChildText(go.transform, "Text", "", TextAnchor.MiddleLeft,
                new Color(0.1f, 0.1f, 0.12f));
            Text placeholder = CreateChildText(go.transform, "Placeholder", "Type your question...",
                TextAnchor.MiddleLeft, new Color(0.45f, 0.45f, 0.5f));

            var input = go.GetComponent<InputField>();
            input.textComponent = text;
            input.placeholder = placeholder;
            input.lineType = InputField.LineType.SingleLine;
            return input;
        }

        private static Button CreateButton(
            Transform parent, string name, string label, Vector2 anchoredMin, Vector2 sizeTopRight)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.zero;
            rt.pivot = Vector2.zero;
            rt.anchoredPosition = anchoredMin;
            rt.sizeDelta = sizeTopRight - anchoredMin;

            var img = go.GetComponent<Image>();
            img.color = new Color(1.00f, 0.60f, 0.30f); // warm orange, fox-themed

            Text label2 = CreateChildText(go.transform, "Text", label, TextAnchor.MiddleCenter,
                new Color(0.08f, 0.06f, 0.04f));
            label2.fontStyle = FontStyle.Bold;
            return go.GetComponent<Button>();
        }

        private static Text CreateChildText(
            Transform parent, string name, string content, TextAnchor align, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(8f, 4f);
            rt.offsetMax = new Vector2(-8f, -4f);

            var text = go.GetComponent<Text>();
            text.text = content;
            text.alignment = align;
            text.color = color;
            text.fontSize = 18;
            text.font = LegacyFont();
            return text;
        }

        // ----------------------------------------------------------------- misc helpers

        // Built-in legacy font. LegacyRuntime.ttf is the modern name (Unity 2022+/6); fall
        // back to Arial.ttf for older editors. Without a font, uGUI Text renders blank.
        private static Font LegacyFont()
        {
            Font f = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (f == null)
            {
                f = Resources.GetBuiltinResource<Font>("Arial.ttf");
            }
            return f;
        }

        private static void SetObjectRef(SerializedObject so, string propertyName, Object value)
        {
            var prop = so.FindProperty(propertyName);
            if (prop != null)
            {
                prop.objectReferenceValue = value;
            }
            else
            {
                Debug.LogWarning("[CrashDemoSceneBuilder] missing serialized property: " + propertyName);
            }
        }

        // Create an asset folder (and any missing parents) if it does not already exist. General
        // over the path so both "Assets/Scenes" and "Assets/Models" work; previously this ignored
        // its argument and always created "Scenes".
        private static void EnsureFolder(string folder)
        {
            if (AssetDatabase.IsValidFolder(folder)) return;
            int slash = folder.LastIndexOf('/');
            if (slash <= 0) return; // not a nested "Assets/..." path; nothing to create
            string parent = folder.Substring(0, slash);
            string leaf = folder.Substring(slash + 1);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }

        // This project ships with the new Input System active (ProjectSettings
        // activeInputHandler: 1), so the legacy StandaloneInputModule does NOT drive UI
        // events -- buttons/input fields would be dead in Play mode. Add the Input System UI
        // module instead. Resolved by type name so this Editor script compiles even without
        // an explicit assembly reference; falls back to StandaloneInputModule if the Input
        // System package is ever removed.
        private static void AddInputModule(GameObject eventSystem)
        {
            System.Type inputSystemModule = System.Type.GetType(
                "UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
            if (inputSystemModule != null)
            {
                eventSystem.AddComponent(inputSystemModule);
            }
            else
            {
                eventSystem.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();
                Debug.LogWarning("[CrashDemoSceneBuilder] Input System package not found; " +
                    "added legacy StandaloneInputModule. UI input may not work under the new " +
                    "Input System. Verify ProjectSettings > Active Input Handling.");
            }
        }
    }
}
