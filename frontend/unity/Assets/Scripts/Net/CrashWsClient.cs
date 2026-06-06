// CrashWsClient -- the Unity renderer's WebSocket client for the Crash engine.
//
// Responsibilities (single seam between the engine socket and the rest of the app):
//   1. Resolve the engine handshake file (.runtime/socket.json) via CrashSocketDescriptor.
//   2. Connect over loopback WebSocket using endel/NativeWebSocket.
//   3. Send the mandatory `hello` first frame (token + protocolVersion=2 + renderer + provider).
//   4. Pump NativeWebSocket's message queue in Update().
//   5. Parse every inbound frame, type-switch over the 15 Engine->Renderer events, and
//      raise C# events + UnityEvents the rest of the app subscribes to.
//   6. Expose public Send* methods for the 8 Renderer->Engine events, each wrapping its
//      payload in the { v, type, sessionId, seq, payload } envelope with an incrementing seq.
//
// PROTOCOL GOTCHAS baked in here (see protocol/src/events.ts + backend/src/socket/server.ts):
//   - The FIRST frame MUST be `hello`. If HelloSchema fails OR token mismatches OR
//     protocolVersion != 2, the server closes with code 1008 'unauthorized'.
//   - The hello envelope's sessionId is "" (the engine assigns the real id in session.ready).
//   - hello payload.provider MUST be a valid enum value ('claude-code' | 'codex'). It is
//     DISPLAY ONLY -- the engine uses its own detected provider -- but safeParse REJECTS a
//     missing/invalid provider, so we send "claude-code". NEVER send "unity" there.
//     renderer="unity" is correct (renderer is a free string the engine just records).
//   - JsonUtility cannot parse a tagged union; we use Newtonsoft JObject to read the root
//     `type`/`seq`/`sessionId`, then obj["payload"].ToObject<T>() for the matched event.
//
// SECURITY: on `error` frames surface ONLY code + retryable. NEVER log message bodies,
// tokens, prompts, answers, or env values to any external sink. Debug.Log of a synthetic
// code is acceptable; raw payload text is not.

using System;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Events;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NativeWebSocket;
using Crash.Protocol;

namespace Crash.Net
{
    /// <summary>UnityEvent variants so designers can wire reactions in the Inspector.</summary>
    [Serializable] public class SessionReadyEvent : UnityEvent<SessionReadyPayload> { }
    [Serializable] public class PlanProposedEvent : UnityEvent<PlanProposedPayload> { }
    [Serializable] public class StatusEvent : UnityEvent<StatusPayload> { }
    [Serializable] public class IndexProgressEvent : UnityEvent<IndexProgressPayload> { }
    [Serializable] public class StepStartedEvent : UnityEvent<StepStartedPayload> { }
    [Serializable] public class StepProgressEvent : UnityEvent<StepProgressPayload> { }
    [Serializable] public class ConfirmRequiredEvent : UnityEvent<ConfirmRequiredPayload> { }
    [Serializable] public class AnswerPartialEvent : UnityEvent<AnswerPartialPayload> { }
    [Serializable] public class ResultFinalEvent : UnityEvent<ResultFinalPayload> { }
    [Serializable] public class SkillSaveOfferEvent : UnityEvent<SkillSaveOfferPayload> { }
    [Serializable] public class SkillSavedEvent : UnityEvent<SkillSavedPayload> { }
    [Serializable] public class FileActivityEvent : UnityEvent<FileActivityPayload> { }
    [Serializable] public class FolderSnapshotEvent : UnityEvent<FolderSnapshotPayload> { }
    [Serializable] public class MarketplaceInstalledEvent : UnityEvent<MarketplaceInstalledPayload> { }
    [Serializable] public class ErrorEvent : UnityEvent<ErrorPayload> { }
    [Serializable] public class ConnectionStateEvent : UnityEvent<string> { }

    public class CrashWsClient : MonoBehaviour
    {
        [Header("Engine discovery")]
        [Tooltip("Absolute path to the engine's .runtime/socket.json. Leave blank to use the " +
                 "default: CRASH_WORKSPACE env var, else <home>/Crash/.runtime/socket.json.")]
        [SerializeField] private string socketJsonPathOverride = string.Empty;

        [Tooltip("Renderer name reported in the hello frame. The engine just records it.")]
        [SerializeField] private string renderer = "unity";

        [Tooltip("Provider reported in hello. DISPLAY ONLY and engine-ignored, but MUST be a " +
                 "valid enum value or the handshake is rejected. Use 'claude-code' or 'codex'.")]
        [SerializeField] private string helloProvider = "claude-code";

        [Tooltip("Connect automatically on Start(). Disable to call Connect() manually.")]
        [SerializeField] private bool connectOnStart = true;

        [Header("Inbound events (Engine -> Renderer) -- wire UI/fox reactions here")]
        public SessionReadyEvent OnSessionReadyUnity = new SessionReadyEvent();
        public PlanProposedEvent OnPlanProposedUnity = new PlanProposedEvent();
        public StatusEvent OnStatusUnity = new StatusEvent();
        public IndexProgressEvent OnIndexProgressUnity = new IndexProgressEvent();
        public StepStartedEvent OnStepStartedUnity = new StepStartedEvent();
        public StepProgressEvent OnStepProgressUnity = new StepProgressEvent();
        public ConfirmRequiredEvent OnConfirmRequiredUnity = new ConfirmRequiredEvent();
        public AnswerPartialEvent OnAnswerPartialUnity = new AnswerPartialEvent();
        public ResultFinalEvent OnResultFinalUnity = new ResultFinalEvent();
        public SkillSaveOfferEvent OnSkillSaveOfferUnity = new SkillSaveOfferEvent();
        public SkillSavedEvent OnSkillSavedUnity = new SkillSavedEvent();
        public FileActivityEvent OnFileActivityUnity = new FileActivityEvent();
        public FolderSnapshotEvent OnFolderSnapshotUnity = new FolderSnapshotEvent();
        public MarketplaceInstalledEvent OnMarketplaceInstalledUnity = new MarketplaceInstalledEvent();
        public ErrorEvent OnErrorUnity = new ErrorEvent();

        [Header("Connection lifecycle (state strings: connecting/open/closed/error)")]
        public ConnectionStateEvent OnConnectionStateUnity = new ConnectionStateEvent();

        // C# events for code-side subscribers (the UnityEvents above are for the Inspector).
        public event Action<SessionReadyPayload> OnSessionReady;
        public event Action<PlanProposedPayload> OnPlanProposed;
        public event Action<StatusPayload> OnStatus;
        public event Action<IndexProgressPayload> OnIndexProgress;
        public event Action<StepStartedPayload> OnStepStarted;
        public event Action<StepProgressPayload> OnStepProgress;
        public event Action<ConfirmRequiredPayload> OnConfirmRequired;
        public event Action<AnswerPartialPayload> OnAnswerPartial;
        public event Action<ResultFinalPayload> OnResultFinal;
        public event Action<SkillSaveOfferPayload> OnSkillSaveOffer;
        public event Action<SkillSavedPayload> OnSkillSaved;
        public event Action<FileActivityPayload> OnFileActivity;
        public event Action<FolderSnapshotPayload> OnFolderSnapshot;
        public event Action<MarketplaceInstalledPayload> OnMarketplaceInstalled;
        public event Action<ErrorPayload> OnError;

        private WebSocket _ws;
        private string _sessionId = string.Empty; // assigned from session.ready; "" until then
        private int _seq;                          // monotonically increasing outbound counter
        private bool _helloSent;

        /// <summary>True once the engine has returned session.ready and we can send actions.</summary>
        public bool IsSessionReady { get; private set; }

        /// <summary>The engine-assigned session id, or "" before session.ready.</summary>
        public string SessionId => _sessionId;

        // ----------------------------------------------------------------- lifecycle

        private void Start()
        {
            if (connectOnStart)
            {
                Connect();
            }
        }

        /// <summary>
        /// Resolve the descriptor and open the socket. Fire-and-forget: NativeWebSocket's
        /// Connect() task does not resolve until the socket closes, so we must NOT await it
        /// in Start(). Connection failures raise the 'error' connection state.
        /// </summary>
        public void Connect()
        {
            CrashSocketDescriptor descriptor;
            try
            {
                string path = string.IsNullOrEmpty(socketJsonPathOverride)
                    ? CrashSocketDescriptor.DefaultSocketJsonPath()
                    : socketJsonPathOverride;
                descriptor = CrashSocketDescriptor.Load(path);
            }
            catch (Exception ex)
            {
                // ex.Message here is our own synthetic hint (never the file body/token).
                Debug.LogWarning("[CrashWsClient] cannot resolve engine socket: " + ex.Message);
                RaiseConnectionState("error");
                return;
            }

            // The protocolVersion in socket.json is informational; the hello we send carries
            // CrashProtocol.Version (=2), which is what the engine actually checks.
            ConnectWithDescriptor(descriptor);
        }

        private async void ConnectWithDescriptor(CrashSocketDescriptor descriptor)
        {
            _ws = new WebSocket(descriptor.WsUrl);

            _ws.OnOpen += () =>
            {
                RaiseConnectionState("open");
                SendHello(descriptor);
            };

            _ws.OnError += (string errMessage) =>
            {
                // Log a category marker only -- NativeWebSocket's errMessage can include
                // transport detail we do not want forwarded anywhere external.
                Debug.LogWarning("[CrashWsClient] socket error (transport)");
                RaiseConnectionState("error");
            };

            _ws.OnClose += (WebSocketCloseCode code) =>
            {
                IsSessionReady = false;
                // 1008 == policy violation == our hello was rejected (bad/missing token or
                // wrong protocolVersion). Surface the synthetic code only.
                Debug.Log("[CrashWsClient] socket closed (code=" + (int)code + ")");
                RaiseConnectionState("closed");
            };

            _ws.OnMessage += (byte[] bytes) =>
            {
                string raw = System.Text.Encoding.UTF8.GetString(bytes);
                HandleFrame(raw);
            };

            RaiseConnectionState("connecting");
            await _ws.Connect(); // resolves only when the socket closes -- do not block on it
        }

        private void Update()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            _ws?.DispatchMessageQueue();
#endif
        }

        private async void OnApplicationQuit()
        {
            await CloseAsync();
        }

        private async void OnDestroy()
        {
            await CloseAsync();
        }

        private async Task CloseAsync()
        {
            if (_ws != null && _ws.State == WebSocketState.Open)
            {
                await _ws.Close();
            }
        }

        // ----------------------------------------------------------------- inbound

        /// <summary>
        /// Parse one inbound frame and dispatch by `type`. Uses Newtonsoft so the tagged
        /// union (payload shape varies per type) deserializes cleanly into the right class.
        /// </summary>
        private void HandleFrame(string raw)
        {
            JObject root;
            try
            {
                root = JObject.Parse(raw);
            }
            catch
            {
                Debug.LogWarning("[CrashWsClient] dropped a non-JSON inbound frame");
                return;
            }

            string type = (string)root["type"];
            if (string.IsNullOrEmpty(type))
            {
                Debug.LogWarning("[CrashWsClient] inbound frame missing 'type'");
                return;
            }

            JToken payload = root["payload"];

            switch (type)
            {
                case "session.ready":
                {
                    var p = payload != null ? payload.ToObject<SessionReadyPayload>() : null;
                    if (p != null)
                    {
                        _sessionId = p.sessionId ?? string.Empty;
                        IsSessionReady = true;
                        OnSessionReady?.Invoke(p);
                        OnSessionReadyUnity.Invoke(p);
                    }
                    break;
                }
                case "plan.proposed":
                {
                    var p = payload != null ? payload.ToObject<PlanProposedPayload>() : null;
                    if (p != null) { OnPlanProposed?.Invoke(p); OnPlanProposedUnity.Invoke(p); }
                    break;
                }
                case "status":
                {
                    var p = payload != null ? payload.ToObject<StatusPayload>() : null;
                    if (p != null) { OnStatus?.Invoke(p); OnStatusUnity.Invoke(p); }
                    break;
                }
                case "index.progress":
                {
                    var p = payload != null ? payload.ToObject<IndexProgressPayload>() : null;
                    if (p != null) { OnIndexProgress?.Invoke(p); OnIndexProgressUnity.Invoke(p); }
                    break;
                }
                case "step.started":
                {
                    var p = payload != null ? payload.ToObject<StepStartedPayload>() : null;
                    if (p != null) { OnStepStarted?.Invoke(p); OnStepStartedUnity.Invoke(p); }
                    break;
                }
                case "step.progress":
                {
                    var p = payload != null ? payload.ToObject<StepProgressPayload>() : null;
                    if (p != null) { OnStepProgress?.Invoke(p); OnStepProgressUnity.Invoke(p); }
                    break;
                }
                case "confirm.required":
                {
                    var p = payload != null ? payload.ToObject<ConfirmRequiredPayload>() : null;
                    if (p != null) { OnConfirmRequired?.Invoke(p); OnConfirmRequiredUnity.Invoke(p); }
                    break;
                }
                case "answer.partial":
                {
                    var p = payload != null ? payload.ToObject<AnswerPartialPayload>() : null;
                    if (p != null) { OnAnswerPartial?.Invoke(p); OnAnswerPartialUnity.Invoke(p); }
                    break;
                }
                case "result.final":
                {
                    var p = payload != null ? payload.ToObject<ResultFinalPayload>() : null;
                    if (p != null) { OnResultFinal?.Invoke(p); OnResultFinalUnity.Invoke(p); }
                    break;
                }
                case "skill.save.offer":
                {
                    var p = payload != null ? payload.ToObject<SkillSaveOfferPayload>() : null;
                    if (p != null) { OnSkillSaveOffer?.Invoke(p); OnSkillSaveOfferUnity.Invoke(p); }
                    break;
                }
                case "skill.saved":
                {
                    var p = payload != null ? payload.ToObject<SkillSavedPayload>() : null;
                    if (p != null) { OnSkillSaved?.Invoke(p); OnSkillSavedUnity.Invoke(p); }
                    break;
                }
                case "file.activity":
                {
                    var p = payload != null ? payload.ToObject<FileActivityPayload>() : null;
                    if (p != null) { OnFileActivity?.Invoke(p); OnFileActivityUnity.Invoke(p); }
                    break;
                }
                case "folder.snapshot":
                {
                    var p = payload != null ? payload.ToObject<FolderSnapshotPayload>() : null;
                    if (p != null) { OnFolderSnapshot?.Invoke(p); OnFolderSnapshotUnity.Invoke(p); }
                    break;
                }
                case "marketplace.installed":
                {
                    var p = payload != null ? payload.ToObject<MarketplaceInstalledPayload>() : null;
                    if (p != null) { OnMarketplaceInstalled?.Invoke(p); OnMarketplaceInstalledUnity.Invoke(p); }
                    break;
                }
                case "error":
                {
                    var p = payload != null ? payload.ToObject<ErrorPayload>() : null;
                    if (p != null)
                    {
                        // SECURITY: code + retryable only. Never the requestId-linked content.
                        Debug.Log("[CrashWsClient] engine error code=" + p.code +
                                  " retryable=" + p.retryable);
                        OnError?.Invoke(p);
                        OnErrorUnity.Invoke(p);
                    }
                    break;
                }
                default:
                    // Unknown type (e.g. a Renderer->Engine type echoed back, or a future
                    // event). Ignore quietly; do not crash the renderer.
                    break;
            }
        }

        // ----------------------------------------------------------------- outbound

        /// <summary>
        /// The hello handshake. sessionId is intentionally "" (the engine assigns the real
        /// one in session.ready). seq starts at 0. provider/protocolVersion are validated
        /// server-side; getting them wrong closes the socket with 1008.
        /// </summary>
        private void SendHello(CrashSocketDescriptor descriptor)
        {
            if (_helloSent)
            {
                return;
            }
            var payload = new HelloPayload
            {
                token = descriptor.Token,
                protocolVersion = CrashProtocol.Version, // == 2
                renderer = string.IsNullOrEmpty(renderer) ? "unity" : renderer,
                provider = NormalizeProvider(helloProvider),
            };
            // sessionId "" for the pre-session hello (events.ts: only hello carries "").
            SendEnvelope("hello", payload, string.Empty);
            _helloSent = true;
        }

        /// <summary>request.submit -- ask the engine to handle the user's text.</summary>
        public void SubmitRequest(string requestId, string text, string targetPath = null)
        {
            var payload = new RequestSubmitPayload
            {
                requestId = requestId,
                text = text,
                targetPath = targetPath, // optional; null is fine (field is optional in zod)
            };
            SendEnvelope("request.submit", payload);
        }

        /// <summary>plan.confirm -- approve a proposed plan so the engine executes it.</summary>
        public void ConfirmPlan(string planId)
        {
            SendEnvelope("plan.confirm", new PlanConfirmPayload { planId = planId });
        }

        /// <summary>plan.cancel -- reject a proposed plan.</summary>
        public void CancelPlan(string planId)
        {
            SendEnvelope("plan.cancel", new PlanCancelPayload { planId = planId });
        }

        /// <summary>confirm.response -- answer an in-run confirm.required gate.</summary>
        public void RespondConfirm(string confirmId, bool approved)
        {
            SendEnvelope("confirm.response",
                new ConfirmResponsePayload { confirmId = confirmId, approved = approved });
        }

        /// <summary>skill.save.accept -- accept the engine's offer to save a skill.</summary>
        public void AcceptSkillSave(string requestId, string name)
        {
            SendEnvelope("skill.save.accept",
                new SkillSaveAcceptPayload { requestId = requestId, name = name });
        }

        /// <summary>run.cancel -- cancel an in-flight run.</summary>
        public void CancelRun(string requestId)
        {
            SendEnvelope("run.cancel", new RunCancelPayload { requestId = requestId });
        }

        /// <summary>marketplace.install -- ask the engine to copy a catalog item into the workspace.</summary>
        public void SendMarketplaceInstall(string installId, string kind, string itemId)
        {
            SendEnvelope("marketplace.install",
                new MarketplaceInstallPayload { installId = installId, kind = kind, itemId = itemId });
        }

        // ----------------------------------------------------------------- helpers

        /// <summary>
        /// Wrap a payload in the canonical envelope { v, type, sessionId, seq, payload } and
        /// send it. seq increments on every outbound frame. Uses the current session id
        /// unless an explicit override is given (the hello passes "").
        /// </summary>
        private void SendEnvelope(string type, object payload, string sessionIdOverride = null)
        {
            if (_ws == null || _ws.State != WebSocketState.Open)
            {
                Debug.LogWarning("[CrashWsClient] cannot send '" + type + "' -- socket not open");
                return;
            }

            string sid = sessionIdOverride ?? _sessionId;
            var envelope = new JObject
            {
                ["v"] = CrashProtocol.Version,
                ["type"] = type,
                ["sessionId"] = sid ?? string.Empty,
                ["seq"] = _seq++,
                // Serialize the strongly-typed payload to a JToken so optional null fields
                // can be dropped (NullValueHandling.Ignore) -- matches the zod .optional() shape.
                ["payload"] = JToken.FromObject(payload, JsonSerializer.CreateDefault(
                    new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore })),
            };

            _ws.SendText(envelope.ToString(Formatting.None));
        }

        private static string NormalizeProvider(string value)
        {
            // The engine's zod enum accepts only these two literals. Anything else (incl.
            // "unity" or empty) fails HelloSchema.safeParse -> 1008 close. Default safely.
            if (value == "claude-code" || value == "codex")
            {
                return value;
            }
            return "claude-code";
        }

        private void RaiseConnectionState(string state)
        {
            OnConnectionStateUnity.Invoke(state);
        }
    }
}
