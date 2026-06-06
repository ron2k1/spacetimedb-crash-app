// CrashSceneBuilder -- one menu command that generates the entire Rev-5 "dashboard world" from code.
//
// WHY a programmatic builder (not hand-clicking 5 scenes in the Editor):
//   The dashboard world is 5 additive scenes, 3 UI prefabs, 5 materials, a baked NavMesh, a mascot,
//   3 trigger portals, and ~30 serialized field wirings. Hand-authoring that is slow, unreviewable,
//   and a single mis-dragged reference is a silent null at runtime. A builder is deterministic,
//   diffable in the PR, and re-runnable -- the exact same pattern the working CrashDemoSceneBuilder
//   already proves out for the demo scene.
//
// ARCHITECTURE (additive scenes):
//   Bootstrap (build index 0, the ONLY scene loaded at startup) holds the persistent spine:
//     CrashApp (singleton, DontDestroyOnLoad) + CrashWsClient + TeleportController, a screen-space
//     File Activity panel (sortingOrder 100 so it floats over every dashboard), and the single
//     EventSystem that serves all scenes. CrashApp.Start asks the TeleportController to load Hub.
//   Hub is the 3D room: a baked NavMesh floor, the click-to-move mascot, and 3 portals. Walking the
//     mascot into a portal additively loads a dashboard scene and unloads Hub.
//   SkillCreator / SkillsMarket / PluginMarket are screen-space-overlay "rooms" (no 3D, no mascot)
//     with a self-wiring Return-to-Hub button.
//
// CROSS-SCENE REFERENCE RULE (the load-bearing constraint this builder obeys):
//   Unity cannot serialize an object reference that crosses a scene boundary. So:
//     - Bootstrap components (FileActivityPanel, CrashApp) wire `client`/`teleport` directly --
//       those targets live in the same scene.
//     - Dashboard components (SkillCreator/Marketplace) leave `client` NULL on purpose; they resolve
//       CrashApp.Instance.Client at runtime in OnEnable. Wiring it here would silently not serialize.
//
// Run it: Unity menu  Crash -> Build Dashboard World   (shortcut Ctrl+Shift+Alt+W).

using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI; // NavMeshAgent (line ~238) lives in the built-in AIModule's UnityEngine.AI namespace.
                      // NOTE: this is NOT the same as NavMeshSurface's Unity.AI.Navigation package -- that
                      // type is named only inside NavMeshBaker, which carries its own using for it.
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using Crash.Dashboards;
using Crash.Mascot;
using Crash.Net;
using Crash.UI;
using Crash.World;

namespace Crash.EditorTools
{
    public static class CrashSceneBuilder
    {
        // ----- asset folders -----
        private const string ScenesDir = "Assets/Scenes";
        private const string PrefabDir = "Assets/Prefabs/DashboardWorld";
        private const string MatDir = "Assets/Materials/DashboardWorld";

        // ----- scene names (also the targetScene strings the portals fire) -----
        private const string SceneBootstrap = "Bootstrap";
        private const string SceneHub = "Hub";
        private const string SceneSkillCreator = "SkillCreator";
        private const string SceneSkillsMarket = "SkillsMarket";
        private const string ScenePluginMarket = "PluginMarket";

        // ----- palette -----
        private static readonly Color Bg = new Color(0.07f, 0.08f, 0.11f, 1f);
        private static readonly Color PanelBg = new Color(0.11f, 0.12f, 0.16f, 0.97f);
        private static readonly Color CardBg = new Color(0.16f, 0.18f, 0.23f, 0.97f);
        private static readonly Color White = new Color(0.96f, 0.97f, 0.99f, 1f);
        private static readonly Color Muted = new Color(0.62f, 0.66f, 0.72f, 1f);
        private static readonly Color Accent = new Color(0.22f, 0.55f, 0.92f, 1f);
        private static readonly Color SaveGreen = new Color(0.20f, 0.55f, 0.38f, 1f);

        // A 4-vector anchor/offset bundle. Unity RectTransforms are fully defined by anchorMin/Max +
        // offsetMin/Max (pivot only affects rotation/scale), so these four values place any element.
        private struct R4
        {
            public Vector2 AMin, AMax, OffMin, OffMax;
            public R4(Vector2 aMin, Vector2 aMax, Vector2 offMin, Vector2 offMax)
            {
                AMin = aMin; AMax = aMax; OffMin = offMin; OffMax = offMax;
            }
        }

        // Top-anchored, full parent width minus padding, `top` px below parent top, `h` px tall.
        // Stacking forms come from a local y-cursor in each scene method.
        private static R4 Band(float top, float h, float l, float r) =>
            new R4(new Vector2(0, 1), new Vector2(1, 1), new Vector2(l, -(top + h)), new Vector2(-r, -top));

        // Top-left anchored fixed-size box (for side-by-side buttons).
        private static R4 Box(float x, float y, float w, float h) =>
            new R4(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, -(y + h)), new Vector2(x + w, -y));

        // Bottom-left anchored fixed-size box (for the Return button).
        private static R4 BottomBox(float x, float y, float w, float h) =>
            new R4(new Vector2(0, 0), new Vector2(0, 0), new Vector2(x, y), new Vector2(x + w, y + h));

        private static R4 Explicit(float aminx, float aminy, float amaxx, float amaxy,
                                   float ominx, float ominy, float omaxx, float omaxy) =>
            new R4(new Vector2(aminx, aminy), new Vector2(amaxx, amaxy),
                   new Vector2(ominx, ominy), new Vector2(omaxx, omaxy));

        // =================================================================================
        //  ENTRY POINT
        // =================================================================================
        [MenuItem("Crash/Build Dashboard World %#&w")]
        public static void BuildDashboardWorld()
        {
            // Give the user a chance to save whatever scene is open -- NewScene(Single) below will
            // replace it. A false return means the user hit Cancel.
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                Debug.Log("[CrashSceneBuilder] aborted: user declined to save the current scene.");
                return;
            }

            try
            {
                EnsureFolder("Assets/Prefabs");
                EnsureFolder("Assets/Materials");
                EnsureFolder(ScenesDir);
                EnsureFolder(PrefabDir);
                EnsureFolder(MatDir);

                // --- materials (URP/Lit; primitives otherwise render with the URP default, never pink) ---
                Material floorMat = MakeMat("CrashFloor", new Color(0.17f, 0.21f, 0.27f));
                Material mascotMat = MakeMat("CrashMascot", new Color(0.96f, 0.45f, 0.13f)); // Crash-style orange
                Material portalSkill = MakeMat("CrashPortal_SkillCreator", new Color(0.20f, 0.78f, 0.70f));
                Material portalSkills = MakeMat("CrashPortal_SkillsMarket", new Color(0.58f, 0.42f, 0.92f));
                Material portalPlugin = MakeMat("CrashPortal_PluginMarket", new Color(0.96f, 0.74f, 0.22f));

                // --- prefabs (built in a throwaway scene, saved as assets, then the GOs destroyed) ---
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                GameObject fileRowPrefab = BuildFileRowPrefab();
                GameObject marketCardPrefab = BuildMarketCardPrefab();
                GameObject savedCardPrefab = BuildSavedSkillCardPrefab();

                // --- scenes ---
                BuildBootstrap(fileRowPrefab);
                BuildHub(floorMat, mascotMat, portalSkill, portalSkills, portalPlugin);
                BuildSkillCreator(savedCardPrefab);
                BuildMarket(SceneSkillsMarket, "skill", "Skills Marketplace",
                    "Browse the local skill catalog. Install copies the skill folder into your workspace.",
                    marketCardPrefab);
                BuildMarket(ScenePluginMarket, "plugin", "Plugin Marketplace",
                    "Browse the local plugin catalog. Install copies the plugin folder into your workspace.",
                    marketCardPrefab);

                SetBuildSettings();

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();

                // Land the user on Bootstrap so they can press Play immediately.
                EditorSceneManager.OpenScene(ScenePath(SceneBootstrap), OpenSceneMode.Single);
                Debug.Log("[CrashSceneBuilder] OK -- 5 scenes + 3 prefabs + 5 materials built. " +
                          "Bootstrap is index 0. Press Play.");
            }
            catch (Exception e)
            {
                Debug.LogError("[CrashSceneBuilder] build FAILED: " + e);
                throw;
            }
        }

        // =================================================================================
        //  SCENE: Bootstrap -- persistent spine (socket + file panel + EventSystem)
        // =================================================================================
        private static void BuildBootstrap(GameObject fileRowPrefab)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // CrashApp root: socket + teleport + app singleton all on one DontDestroyOnLoad object.
            var app = new GameObject("CrashApp");
            CrashWsClient client = app.AddComponent<CrashWsClient>(); // defaults already: renderer="unity", connectOnStart=true
            TeleportController teleport = app.AddComponent<TeleportController>();
            CrashApp crashApp = app.AddComponent<CrashApp>();

            new Wire(crashApp)
                .Ref("client", client)
                .Ref("teleport", teleport)
                .Str("hubSceneName", SceneHub)
                .Apply();

            // Persistent File Activity canvas -- order 100 so it draws above every dashboard (order 0).
            Canvas canvas = MakeCanvas("BootstrapCanvas", 100);
            canvas.transform.SetParent(app.transform, false); // child of CrashApp -> rides DontDestroyOnLoad

            // Right-docked panel, 440 wide, full height with an 8px margin.
            Image panelBg = Panel(canvas.transform, "FileActivityPanel",
                Explicit(1, 0, 1, 1, -448, 8, -8, -8), PanelBg);
            FileActivityPanel panel = panelBg.gameObject.AddComponent<FileActivityPanel>();

            Label(panelBg.transform, "Title", Explicit(0, 1, 1, 1, 10, -36, -10, -8),
                "File Activity", 16, TextAnchor.MiddleLeft, White);

            // Tree (top ~54%) and Log (bottom ~46%) scroll views.
            var (treeScroll, treeContent) = Scroll(panelBg.transform, "TreeScroll",
                Explicit(0, 0.46f, 1, 1, 8, 6, -8, -42), new Color(0, 0, 0, 0.18f));
            var (logScroll, logContent) = Scroll(panelBg.transform, "LogScroll",
                Explicit(0, 0, 1, 0.46f, 8, 8, -8, -6), new Color(0, 0, 0, 0.18f));

            Text logText = MakeChildText(logContent, "LogText", "", 12, TextAnchor.UpperLeft, Muted);

            new Wire(panel)
                .Ref("client", client) // same scene -> safe to wire
                .Ref("treeContent", treeContent)
                .Ref("treeRowPrefab", fileRowPrefab)
                .Ref("treeScrollRect", treeScroll)
                .Ref("logText", logText)
                .Ref("logScrollRect", logScroll)
                .Apply();

            // The single EventSystem for the whole app (New Input System UI module).
            var es = new GameObject("EventSystem", typeof(EventSystem));
            es.transform.SetParent(app.transform, false);
            AddInputModule(es);

            EditorSceneManager.SaveScene(scene, ScenePath(SceneBootstrap));
        }

        // =================================================================================
        //  SCENE: Hub -- 3D room with NavMesh floor, mascot, 3 portals, camera + light
        // =================================================================================
        private static void BuildHub(Material floorMat, Material mascotMat,
            Material portalSkill, Material portalSkills, Material portalPlugin)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // NavMesh root: NavMeshBaker (RequireComponent pulls in NavMeshSurface) bakes its children
            // at runtime. Floor parented under it so ONLY the floor is carved into the walkable mesh.
            var navRoot = new GameObject("NavMesh");
            navRoot.AddComponent<NavMeshBaker>();
            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "Floor";
            floor.transform.SetParent(navRoot.transform, false);
            floor.transform.localScale = new Vector3(2.4f, 1f, 2.4f); // plane = 10u, so ~24x24 room
            floor.GetComponent<MeshRenderer>().sharedMaterial = floorMat;

            // Mascot: NavMeshAgent moves the root (pivot on the mesh); the visual capsule child sits at
            // local y=+1 so its base touches the floor instead of being half-buried.
            var mascot = new GameObject("Mascot");
            mascot.tag = "Player";
            NavMeshAgent agent = mascot.AddComponent<NavMeshAgent>();
            agent.radius = 0.4f;
            agent.height = 2f;
            agent.speed = 4.5f;
            agent.angularSpeed = 720f;
            agent.acceleration = 30f;
            var cap = mascot.AddComponent<CapsuleCollider>();
            cap.center = new Vector3(0, 1, 0);
            cap.height = 2f;
            cap.radius = 0.5f;
            // Kinematic Rigidbody: OnTriggerEnter only fires when one party has a Rigidbody, and a
            // NavMeshAgent moves the transform kinematically (no physics body). Without this the
            // portals would NEVER fire -- silently. useGravity off so it never fights the agent.
            var rb = mascot.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.useGravity = false;
            mascot.AddComponent<MascotController>(); // defaults are fine (clickRaycastMask ~0, etc.)

            GameObject body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "Body";
            body.transform.SetParent(mascot.transform, false);
            body.transform.localPosition = new Vector3(0, 1, 0);
            UnityEngine.Object.DestroyImmediate(body.GetComponent<Collider>()); // collider lives on the agent root
            body.GetComponent<MeshRenderer>().sharedMaterial = mascotMat;

            // Portals -- walking the mascot into the trigger fires PortalTrigger -> Teleport.GoTo.
            var portals = new GameObject("Portals");
            BuildPortal(portals.transform, "Portal_SkillCreator", new Vector3(-6f, 0, 5f),
                SceneSkillCreator, "Skill Creator", portalSkill);
            BuildPortal(portals.transform, "Portal_SkillsMarket", new Vector3(0f, 0, 6.5f),
                SceneSkillsMarket, "Skills Market", portalSkills);
            BuildPortal(portals.transform, "Portal_PluginMarket", new Vector3(6f, 0, 5f),
                ScenePluginMarket, "Plugin Market", portalPlugin);

            // Camera (the only one in the app; tagged MainCamera so Mascot's Camera.main resolves).
            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            camGo.tag = "MainCamera";
            Camera cam = camGo.GetComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Bg;
            cam.fieldOfView = 60f;
            camGo.transform.position = new Vector3(0, 9f, -9f);
            camGo.transform.rotation = Quaternion.Euler(42f, 0, 0);

            var lightGo = new GameObject("Directional Light", typeof(Light));
            Light li = lightGo.GetComponent<Light>();
            li.type = LightType.Directional;
            li.intensity = 1.15f;
            li.color = new Color(1f, 0.97f, 0.9f);
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0);

            EditorSceneManager.SaveScene(scene, ScenePath(SceneHub));
        }

        private static void BuildPortal(Transform parent, string name, Vector3 pos,
            string targetScene, string label, Material mat)
        {
            var portal = new GameObject(name);
            portal.transform.SetParent(parent, false);
            portal.transform.position = pos;

            var trigger = portal.AddComponent<BoxCollider>();
            trigger.isTrigger = true;
            trigger.center = new Vector3(0, 1, 0);
            trigger.size = new Vector3(2.4f, 2.4f, 2.4f);

            PortalTrigger pt = portal.AddComponent<PortalTrigger>();
            new Wire(pt).Str("targetScene", targetScene).Apply(); // mascotTag default "Player" is correct

            GameObject pillar = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pillar.name = "Pillar";
            pillar.transform.SetParent(portal.transform, false);
            pillar.transform.localPosition = new Vector3(0, 1, 0);
            pillar.transform.localScale = new Vector3(1.3f, 1f, 1.3f);
            UnityEngine.Object.DestroyImmediate(pillar.GetComponent<Collider>()); // the trigger is the only collider
            pillar.GetComponent<MeshRenderer>().sharedMaterial = mat;

            // 3D TextMesh label, rotated to face the camera (camera sits on -Z looking toward +Z).
            var labelGo = new GameObject("Label", typeof(TextMesh));
            labelGo.transform.SetParent(portal.transform, false);
            labelGo.transform.localPosition = new Vector3(0, 2.7f, 0);
            labelGo.transform.localRotation = Quaternion.Euler(0, 180f, 0);
            TextMesh tm = labelGo.GetComponent<TextMesh>();
            tm.text = label;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.characterSize = 0.2f;
            tm.fontSize = 64;
            tm.color = White;
            Font f = LegacyFont();
            if (f != null)
            {
                tm.font = f;
                var mr = labelGo.GetComponent<MeshRenderer>();
                if (mr != null) mr.sharedMaterial = f.material;
            }
        }

        // =================================================================================
        //  SCENE: SkillCreator -- the fully-live hero dashboard (21 wired refs)
        // =================================================================================
        private static void BuildSkillCreator(GameObject savedCardPrefab)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            Canvas canvas = MakeCanvas("SkillCreatorCanvas", 0);
            AddPlainCamera(); // keeps a clean render when Hub (and its camera) is unloaded
            Panel(canvas.transform, "Bg", Explicit(0, 0, 1, 1, 0, 0, 0, 0), Bg);

            // Content column on the LEFT, leaving 470px clear on the right for the persistent panel.
            Image col = Panel(canvas.transform, "Column", Explicit(0, 0, 1, 1, 24, 24, -470, -24),
                new Color(0, 0, 0, 0));
            Transform c = col.transform;

            SkillCreatorDashboard dash = canvas.gameObject.AddComponent<SkillCreatorDashboard>();

            float y = 0f;
            R4 Next(float h, float gap = 10f) { var b = Band(y, h, 0, 0); y += h + gap; return b; }

            Label(c, "Title", Next(32), "Skill Creator", 22, TextAnchor.MiddleLeft, White);
            Label(c, "Help", Next(20), "Type a goal, press Create, and watch the file panel write your skill.",
                12, TextAnchor.MiddleLeft, Muted);
            InputField goalInput = Field(c, "GoalInput", Next(38),
                "e.g. Summarize a PDF and extract action items");

            float rowY = y;
            Button createButton = Btn(c, "CreateButton", Box(0, rowY, 150, 34), "Create", 15, Accent);
            Button stopButton = Btn(c, "StopButton", Box(160, rowY, 110, 34), "Stop", 14,
                new Color(0.45f, 0.18f, 0.18f, 1f));
            y = rowY + 34 + 10f;

            Text statusLabel = Label(c, "StatusLabel", Next(22), "Idle.", 13, TextAnchor.MiddleLeft, White);
            Text stepLabel = Label(c, "StepLabel", Next(18), "", 12, TextAnchor.MiddleLeft, Muted);
            Slider progressBar = Bar(c, "ProgressBar", Next(12));

            Label(c, "AnswerHeader", Next(18), "Answer", 12, TextAnchor.MiddleLeft, Muted);
            var (_, answerContent) = Scroll(c, "AnswerScroll", Next(168), new Color(0, 0, 0, 0.18f));
            Text answerLabel = MakeChildText(answerContent, "AnswerLabel", "", 13, TextAnchor.UpperLeft, White);

            Text citationsLabel = Label(c, "CitationsLabel", Next(50), "", 11, TextAnchor.UpperLeft, Muted);

            Label(c, "SavedHeader", Next(18), "Saved skills", 12, TextAnchor.MiddleLeft, Muted);
            var (_, savedContent) = Scroll(c, "SavedScroll", Next(92), new Color(0, 0, 0, 0.18f));

            // Return-to-Hub button, bottom-left of the column, self-wiring via HubReturnButton.
            Button returnBtn = Btn(c, "ReturnButton", BottomBox(0, 0, 150, 34), "Return to Hub", 14,
                new Color(0.20f, 0.22f, 0.28f, 1f));
            returnBtn.gameObject.AddComponent<HubReturnButton>();

            // Plan card + Save-offer card float centered over the column; the dashboard toggles them.
            GameObject planCard = CenterCard(canvas.transform, "PlanCard", 480, 244,
                new Vector2(-200, 0));
            Text planTitleLabel = Label(planCard.transform, "PlanTitle", Box(14, 12, 452, 26),
                "Plan", 16, TextAnchor.MiddleLeft, White);
            Text planSummaryLabel = Label(planCard.transform, "PlanSummary", Box(14, 44, 452, 44),
                "", 13, TextAnchor.UpperLeft, White);
            Text planStepsLabel = Label(planCard.transform, "PlanSteps", Box(14, 92, 452, 96),
                "", 12, TextAnchor.UpperLeft, Muted);
            Button planConfirmButton = Btn(planCard.transform, "PlanConfirm", Box(14, 200, 215, 32),
                "Confirm & Run", 14, Accent);
            Button planCancelButton = Btn(planCard.transform, "PlanCancel", Box(251, 200, 215, 32),
                "Cancel", 14, new Color(0.30f, 0.32f, 0.38f, 1f));

            GameObject saveOfferCard = CenterCard(canvas.transform, "SaveOfferCard", 480, 196,
                new Vector2(-200, 0));
            Text saveOfferLabel = Label(saveOfferCard.transform, "SaveOfferLabel", Box(14, 12, 452, 44),
                "Save this as a reusable skill?", 14, TextAnchor.UpperLeft, White);
            InputField saveNameInput = Field(saveOfferCard.transform, "SaveNameInput",
                Box(14, 62, 452, 34), "skill-name");
            Button saveAcceptButton = Btn(saveOfferCard.transform, "SaveAccept", Box(14, 152, 215, 32),
                "Save skill", 14, SaveGreen);
            Button saveDeclineButton = Btn(saveOfferCard.transform, "SaveDecline", Box(251, 152, 215, 32),
                "No thanks", 14, new Color(0.30f, 0.32f, 0.38f, 1f));

            // Wire all 21 same-scene refs. `client` is intentionally NOT wired (cross-scene; the
            // dashboard resolves CrashApp.Instance.Client in OnEnable).
            new Wire(dash)
                .Ref("goalInput", goalInput)
                .Ref("createButton", createButton)
                .Ref("stopButton", stopButton)
                .Ref("statusLabel", statusLabel)
                .Ref("stepLabel", stepLabel)
                .Ref("progressBar", progressBar)
                .Ref("planCard", planCard)
                .Ref("planTitleLabel", planTitleLabel)
                .Ref("planSummaryLabel", planSummaryLabel)
                .Ref("planStepsLabel", planStepsLabel)
                .Ref("planConfirmButton", planConfirmButton)
                .Ref("planCancelButton", planCancelButton)
                .Ref("answerLabel", answerLabel)
                .Ref("citationsLabel", citationsLabel)
                .Ref("saveOfferCard", saveOfferCard)
                .Ref("saveOfferLabel", saveOfferLabel)
                .Ref("saveNameInput", saveNameInput)
                .Ref("saveAcceptButton", saveAcceptButton)
                .Ref("saveDeclineButton", saveDeclineButton)
                .Ref("savedCardsContent", savedContent)
                .Ref("savedCardPrefab", savedCardPrefab)
                .Apply();

            EditorSceneManager.SaveScene(scene, ScenePath(SceneSkillCreator));
        }

        // =================================================================================
        //  SCENE: SkillsMarket / PluginMarket -- catalog browse + install
        // =================================================================================
        private static void BuildMarket(string sceneName, string kind, string title, string help,
            GameObject cardPrefab)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            Canvas canvas = MakeCanvas(sceneName + "Canvas", 0);
            AddPlainCamera();
            Panel(canvas.transform, "Bg", Explicit(0, 0, 1, 1, 0, 0, 0, 0), Bg);

            Image col = Panel(canvas.transform, "Column", Explicit(0, 0, 1, 1, 24, 24, -470, -24),
                new Color(0, 0, 0, 0));
            Transform c = col.transform;

            MarketplaceDashboard dash = canvas.gameObject.AddComponent<MarketplaceDashboard>();

            float y = 0f;
            R4 Next(float h, float gap = 10f) { var b = Band(y, h, 0, 0); y += h + gap; return b; }

            Label(c, "Title", Next(32), title, 22, TextAnchor.MiddleLeft, White);
            Label(c, "Help", Next(36), help, 12, TextAnchor.UpperLeft, Muted);
            Text statusLabel = Label(c, "StatusLabel", Next(22), "Loading catalog...", 13,
                TextAnchor.MiddleLeft, Muted);

            // Card list fills the rest of the column above the return button.
            var (_, cardsContent) = Scroll(c,
                "CardsScroll", Explicit(0, 0, 1, 1, 0, 48, 0, -(y)), new Color(0, 0, 0, 0.18f));

            Button returnBtn = Btn(c, "ReturnButton", BottomBox(0, 0, 150, 34), "Return to Hub", 14,
                new Color(0.20f, 0.22f, 0.28f, 1f));
            returnBtn.gameObject.AddComponent<HubReturnButton>();

            // `client` not wired (cross-scene). nameTextChildName default "" is correct.
            new Wire(dash)
                .Str("kind", kind)
                .Ref("cardsContent", cardsContent)
                .Ref("cardPrefab", cardPrefab)
                .Ref("statusLabel", statusLabel)
                .Apply();

            EditorSceneManager.SaveScene(scene, ScenePath(sceneName));
        }

        // =================================================================================
        //  PREFABS
        // =================================================================================

        // FileRow: root Image (the activity highlight) + child Text (the path). FileActivityPanel does
        // GetComponent<Image>() for the highlight and GetComponentInChildren<Text>() for the label.
        private static GameObject BuildFileRowPrefab()
        {
            var root = new GameObject("FileRow", typeof(RectTransform), typeof(Image), typeof(LayoutElement));
            root.GetComponent<Image>().color = new Color(1, 1, 1, 0); // transparent until an op highlights it
            var le = root.GetComponent<LayoutElement>();
            le.minHeight = 22; le.preferredHeight = 22;

            Text label = MakeChildText(root.transform, "Label", "row", 13, TextAnchor.MiddleLeft,
                new Color(0.86f, 0.90f, 0.95f));
            label.horizontalOverflow = HorizontalWrapMode.Overflow;
            label.verticalOverflow = VerticalWrapMode.Truncate;
            var lrt = (RectTransform)label.transform;
            lrt.offsetMin = new Vector2(6, 0);
            lrt.offsetMax = new Vector2(-4, 0);

            return SavePrefab(root, "FileRow");
        }

        // MarketCard: root Image + VerticalLayoutGroup; children in order NameText, DescText,
        // InstallButton(+child Text). MarketplaceDashboard reads Texts in hierarchy order (first two
        // = name, desc) and the only Button = install. The button's own label Text is skipped via
        // IsChildOf(installButton), so hierarchy order is the contract.
        private static GameObject BuildMarketCardPrefab()
        {
            var root = new GameObject("MarketCard", typeof(RectTransform), typeof(Image),
                typeof(VerticalLayoutGroup), typeof(LayoutElement));
            root.GetComponent<Image>().color = CardBg;
            var vlg = root.GetComponent<VerticalLayoutGroup>();
            vlg.padding = new RectOffset(10, 10, 8, 8);
            vlg.spacing = 4;
            vlg.childControlWidth = true; vlg.childControlHeight = true;
            vlg.childForceExpandWidth = true; vlg.childForceExpandHeight = false;
            vlg.childAlignment = TextAnchor.UpperLeft;
            var le = root.GetComponent<LayoutElement>();
            le.minHeight = 98; le.preferredHeight = 108;

            Text name = MakeChildText(root.transform, "NameText", "Skill name", 15, TextAnchor.UpperLeft, White);
            name.fontStyle = FontStyle.Bold;
            AddLayout(name.gameObject, 20);

            Text desc = MakeChildText(root.transform, "DescText", "Description.", 12,
                TextAnchor.UpperLeft, new Color(0.78f, 0.82f, 0.88f));
            desc.gameObject.AddComponent<LayoutElement>().flexibleHeight = 1;

            Button install = BuildChildButton(root.transform, "InstallButton", "Install", Accent);
            AddLayout(install.gameObject, 28);

            return SavePrefab(root, "MarketCard");
        }

        // SavedSkillCard: root Button + child Text. SkillCreatorDashboard does
        // GetComponentInChildren<Button>() (root) + GetComponentInChildren<Text>() (child) to re-run.
        private static GameObject BuildSavedSkillCardPrefab()
        {
            var root = new GameObject("SavedSkillCard", typeof(RectTransform), typeof(Image),
                typeof(Button), typeof(LayoutElement));
            root.GetComponent<Image>().color = new Color(0.18f, 0.30f, 0.26f, 0.97f);
            var le = root.GetComponent<LayoutElement>();
            le.minHeight = 26; le.preferredHeight = 26;

            Text t = MakeChildText(root.transform, "Text", "saved skill", 13, TextAnchor.MiddleLeft, White);
            var rt = (RectTransform)t.transform;
            rt.offsetMin = new Vector2(8, 0);
            rt.offsetMax = new Vector2(-8, 0);

            return SavePrefab(root, "SavedSkillCard");
        }

        // =================================================================================
        //  UI PRIMITIVE HELPERS
        // =================================================================================
        private static Canvas MakeCanvas(string name, int sortingOrder)
        {
            var go = new GameObject(name, typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = sortingOrder;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;
            return canvas;
        }

        // A SolidColor camera with no AudioListener -- dashboards keep a clean render after Hub (and
        // its camera) unloads. Untagged so it never shadows Hub's MainCamera for Camera.main.
        private static void AddPlainCamera()
        {
            var camGo = new GameObject("UICamera", typeof(Camera));
            Camera cam = camGo.GetComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Bg;
            cam.cullingMask = 0; // renders nothing 3D; the overlay canvas draws the UI
        }

        private static void SetRect(GameObject go, R4 r)
        {
            var rt = (RectTransform)go.transform;
            rt.anchorMin = r.AMin;
            rt.anchorMax = r.AMax;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.offsetMin = r.OffMin;
            rt.offsetMax = r.OffMax;
        }

        private static Image Panel(Transform parent, string name, R4 r, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            SetRect(go, r);
            go.GetComponent<Image>().color = color;
            return go.GetComponent<Image>();
        }

        private static Text Label(Transform parent, string name, R4 r, string content, int size,
            TextAnchor anchor, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            SetRect(go, r);
            return ConfigText(go.GetComponent<Text>(), content, size, anchor, color);
        }

        // A child Text whose RectTransform is left for a layout group to control (used inside VLGs).
        private static Text MakeChildText(Transform parent, string name, string content, int size,
            TextAnchor anchor, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
            return ConfigText(go.GetComponent<Text>(), content, size, anchor, color);
        }

        private static Text ConfigText(Text t, string content, int size, TextAnchor anchor, Color color)
        {
            t.font = LegacyFont();
            t.fontSize = size;
            t.alignment = anchor;
            t.color = color;
            t.text = content;
            t.supportRichText = true;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            return t;
        }

        private static Button Btn(Transform parent, string name, R4 r, string label, int size, Color bg)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            SetRect(go, r);
            go.GetComponent<Image>().color = bg;
            Text t = MakeChildText(go.transform, "Text", label, size, TextAnchor.MiddleCenter, White);
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            return go.GetComponent<Button>();
        }

        private static Button BuildChildButton(Transform parent, string name, string label, Color bg)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            go.GetComponent<Image>().color = bg;
            Text t = MakeChildText(go.transform, "Text", label, 13, TextAnchor.MiddleCenter, White);
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            return go.GetComponent<Button>();
        }

        private static InputField Field(Transform parent, string name, R4 r, string placeholder)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(InputField));
            go.transform.SetParent(parent, false);
            SetRect(go, r);
            go.GetComponent<Image>().color = new Color(0.08f, 0.10f, 0.13f, 1f);
            InputField input = go.GetComponent<InputField>();

            Text text = MakeChildText(go.transform, "Text", "", 14, TextAnchor.MiddleLeft, White);
            text.supportRichText = false;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Truncate;
            PadChild((RectTransform)text.transform);

            Text ph = MakeChildText(go.transform, "Placeholder", placeholder, 14,
                TextAnchor.MiddleLeft, new Color(0.55f, 0.58f, 0.63f, 1f));
            ph.fontStyle = FontStyle.Italic;
            PadChild((RectTransform)ph.transform);

            input.textComponent = text;
            input.placeholder = ph;
            input.text = "";
            return input;
        }

        private static void PadChild(RectTransform rt)
        {
            rt.offsetMin = new Vector2(8, 4);
            rt.offsetMax = new Vector2(-8, -4);
        }

        private static Slider Bar(Transform parent, string name, R4 r)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Slider));
            go.transform.SetParent(parent, false);
            SetRect(go, r);
            Slider slider = go.GetComponent<Slider>();

            Panel(go.transform, "Background", new R4(Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero), new Color(0.14f, 0.16f, 0.20f, 1f));

            var fillArea = new GameObject("Fill Area", typeof(RectTransform));
            fillArea.transform.SetParent(go.transform, false);
            var fart = (RectTransform)fillArea.transform;
            fart.anchorMin = Vector2.zero; fart.anchorMax = Vector2.one;
            fart.offsetMin = new Vector2(2, 2); fart.offsetMax = new Vector2(-2, -2);

            var fill = new GameObject("Fill", typeof(RectTransform), typeof(Image));
            fill.transform.SetParent(fillArea.transform, false);
            var frt = (RectTransform)fill.transform;
            frt.anchorMin = Vector2.zero; frt.anchorMax = Vector2.one;
            frt.offsetMin = Vector2.zero; frt.offsetMax = Vector2.zero;
            fill.GetComponent<Image>().color = new Color(0.30f, 0.70f, 0.42f, 1f);

            slider.fillRect = frt;
            slider.targetGraphic = fill.GetComponent<Image>();
            slider.direction = Slider.Direction.LeftToRight;
            slider.minValue = 0; slider.maxValue = 1; slider.value = 0;
            slider.interactable = false; // a progress display, not a control
            return slider;
        }

        // Vertical scroll view: root(Image+ScrollRect) -> Viewport(RectMask2D) -> Content(VLG+CSF).
        private static (ScrollRect, RectTransform) Scroll(Transform parent, string name, R4 r, Color bg)
        {
            var root = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(ScrollRect));
            root.transform.SetParent(parent, false);
            SetRect(root, r);
            root.GetComponent<Image>().color = bg;
            ScrollRect sr = root.GetComponent<ScrollRect>();
            sr.horizontal = false; sr.vertical = true;
            sr.movementType = ScrollRect.MovementType.Clamped;
            sr.scrollSensitivity = 26f;

            var vp = new GameObject("Viewport", typeof(RectTransform), typeof(Image), typeof(RectMask2D));
            vp.transform.SetParent(root.transform, false);
            var vprt = (RectTransform)vp.transform;
            vprt.anchorMin = Vector2.zero; vprt.anchorMax = Vector2.one;
            vprt.offsetMin = new Vector2(2, 2); vprt.offsetMax = new Vector2(-2, -2);
            vprt.pivot = new Vector2(0, 1);
            vp.GetComponent<Image>().color = new Color(1, 1, 1, 0.01f); // near-invisible raycast target

            var content = new GameObject("Content", typeof(RectTransform),
                typeof(VerticalLayoutGroup), typeof(ContentSizeFitter));
            content.transform.SetParent(vp.transform, false);
            var crt = (RectTransform)content.transform;
            crt.anchorMin = new Vector2(0, 1); crt.anchorMax = new Vector2(1, 1);
            crt.pivot = new Vector2(0.5f, 1);
            crt.offsetMin = Vector2.zero; crt.offsetMax = Vector2.zero;
            var vlg = content.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 3;
            vlg.padding = new RectOffset(4, 4, 4, 4);
            vlg.childControlWidth = true; vlg.childControlHeight = true;
            vlg.childForceExpandWidth = true; vlg.childForceExpandHeight = false;
            vlg.childAlignment = TextAnchor.UpperLeft;
            var csf = content.GetComponent<ContentSizeFitter>();
            csf.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            csf.horizontalFit = ContentSizeFitter.FitMode.Unconstrained;

            sr.viewport = vprt;
            sr.content = crt;
            return (sr, crt);
        }

        private static GameObject CenterCard(Transform parent, string name, float w, float h, Vector2 pos)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = new Vector2(0.5f, 0.5f);
            rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(w, h);
            rt.anchoredPosition = pos;
            go.GetComponent<Image>().color = new Color(0.13f, 0.15f, 0.20f, 0.99f);
            return go;
        }

        private static void AddLayout(GameObject go, float height)
        {
            var le = go.AddComponent<LayoutElement>();
            le.minHeight = height; le.preferredHeight = height;
        }

        private static void AddInputModule(GameObject go)
        {
            // New Input System: the UI module must be InputSystemUIInputModule. StandaloneInputModule
            // throws under activeInputHandler:1. Resolve by type name so the Editor assembly needs no
            // direct reference to the Input System assembly.
            Type t = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
            if (t != null)
            {
                go.AddComponent(t);
            }
            else
            {
                go.AddComponent<StandaloneInputModule>();
                Debug.LogWarning("[CrashSceneBuilder] InputSystemUIInputModule not found; added " +
                                 "StandaloneInputModule (will throw under the New Input System).");
            }
        }

        private static Font LegacyFont()
        {
            // Built-in legacy font. LegacyRuntime.ttf is the modern name (Unity 2022+/6); fall back
            // to Arial.ttf for older editors. MUST be Resources.GetBuiltinResource (runtime builtin),
            // NOT AssetDatabase.GetBuiltinExtraResource -- fonts are builtin, not "builtin extra"
            // (that bucket is the default UI sprite/material), so the AssetDatabase call returns null
            // and every Text/TextMesh renders blank. Matches the proven CrashDemoSceneBuilder.
            Font f = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (f == null)
            {
                f = Resources.GetBuiltinResource<Font>("Arial.ttf");
            }
            return f;
        }

        // =================================================================================
        //  ASSET HELPERS
        // =================================================================================
        private static Material MakeMat(string assetName, Color color)
        {
            Shader sh = Shader.Find("Universal Render Pipeline/Lit");
            if (sh == null)
            {
                sh = Shader.Find("Standard");
                Debug.LogWarning("[CrashSceneBuilder] URP/Lit not found; using Standard. Is this a URP project?");
            }
            var m = new Material(sh);
            if (sh.name.Contains("Universal")) m.SetColor("_BaseColor", color);
            else m.color = color;
            string path = MatDir + "/" + assetName + ".mat";
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        private static GameObject SavePrefab(GameObject go, string assetName)
        {
            string path = PrefabDir + "/" + assetName + ".prefab";
            GameObject asset = PrefabUtility.SaveAsPrefabAsset(go, path);
            UnityEngine.Object.DestroyImmediate(go);
            return asset;
        }

        private static string ScenePath(string name) => ScenesDir + "/" + name + ".unity";

        private static void SetBuildSettings()
        {
            // Bootstrap MUST be index 0 (the scene loaded at startup). The rest are loaded additively
            // by name, so they only need to be present in the list.
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(ScenePath(SceneBootstrap), true),
                new EditorBuildSettingsScene(ScenePath(SceneHub), true),
                new EditorBuildSettingsScene(ScenePath(SceneSkillCreator), true),
                new EditorBuildSettingsScene(ScenePath(SceneSkillsMarket), true),
                new EditorBuildSettingsScene(ScenePath(ScenePluginMarket), true),
            };
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            string leaf = Path.GetFileName(path);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }

        // Fluent SerializedObject wirer. FindProperty returning null is logged (a typo'd field name)
        // rather than silently doing nothing -- the whole point of generating instead of hand-dragging.
        private sealed class Wire
        {
            private readonly SerializedObject _so;
            public Wire(UnityEngine.Object target) { _so = new SerializedObject(target); }

            public Wire Ref(string prop, UnityEngine.Object value)
            {
                SerializedProperty p = _so.FindProperty(prop);
                if (p == null) Debug.LogError($"[CrashSceneBuilder] no serialized field '{prop}' on {_so.targetObject.GetType().Name}");
                else p.objectReferenceValue = value;
                return this;
            }

            public Wire Str(string prop, string value)
            {
                SerializedProperty p = _so.FindProperty(prop);
                if (p == null) Debug.LogError($"[CrashSceneBuilder] no serialized field '{prop}' on {_so.targetObject.GetType().Name}");
                else p.stringValue = value;
                return this;
            }

            public void Apply() => _so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
