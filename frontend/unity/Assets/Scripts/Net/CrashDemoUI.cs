// CrashDemoUI -- demo-scene glue that binds the CrashWsClient to a minimal uGUI surface
// and the fox. Kept separate from CrashWsClient (transport) and FoxController (presentation)
// so each file has one responsibility. The Editor scene builder attaches and references-wires
// this component; all event subscription happens here in code (robust vs. serialized
// persistent UnityEvent listeners).
//
// Bindings:
//   answer.partial -> append delta to the narration label + fox.NotifySpeaking()
//   result.final   -> show the final answer in the narration label
//   status         -> update the status label + fox.PlayState(state)
//   error          -> show a synthetic "error: <code>" in the status label (code only)
//   Ask button     -> CrashWsClient.SubmitRequest(newRequestId, inputText)
//
// SECURITY: only error CODE is ever shown; no message bodies/tokens are surfaced.

using System;
using UnityEngine;
using UnityEngine.UI;
using Crash.Fox;
using Crash.Protocol;

namespace Crash.Net
{
    public class CrashDemoUI : MonoBehaviour
    {
        [Header("Wiring (assigned by the demo scene builder)")]
        [SerializeField] private CrashWsClient client;
        [SerializeField] private FoxController fox;

        [Header("UI (uGUI)")]
        [SerializeField] private Text narrationLabel;
        [SerializeField] private Text statusLabel;
        [SerializeField] private InputField inputField;
        [SerializeField] private Button askButton;

        // Tracks the in-flight requestId so result.final / answer.partial can be matched if
        // desired. The demo keeps it simple and shows the latest stream regardless.
        private string _currentRequestId;
        private string _streamingAnswer = string.Empty;

        private void OnEnable()
        {
            if (client != null)
            {
                client.OnSessionReady += HandleSessionReady;
                client.OnStatus += HandleStatus;
                client.OnAnswerPartial += HandleAnswerPartial;
                client.OnResultFinal += HandleResultFinal;
                client.OnError += HandleError;
                client.OnConfirmRequired += HandleConfirmRequired;
                client.OnConnectionStateUnity.AddListener(HandleConnectionState);
            }
            if (askButton != null)
            {
                askButton.onClick.AddListener(OnAskClicked);
            }
        }

        private void OnDisable()
        {
            if (client != null)
            {
                client.OnSessionReady -= HandleSessionReady;
                client.OnStatus -= HandleStatus;
                client.OnAnswerPartial -= HandleAnswerPartial;
                client.OnResultFinal -= HandleResultFinal;
                client.OnError -= HandleError;
                client.OnConfirmRequired -= HandleConfirmRequired;
                client.OnConnectionStateUnity.RemoveListener(HandleConnectionState);
            }
            if (askButton != null)
            {
                askButton.onClick.RemoveListener(OnAskClicked);
            }
        }

        private void OnAskClicked()
        {
            if (client == null || inputField == null)
            {
                return;
            }
            string text = inputField.text;
            if (string.IsNullOrEmpty(text))
            {
                return;
            }
            if (!client.IsSessionReady)
            {
                SetStatus("waiting for engine session...");
                return;
            }
            _currentRequestId = "req_" + Guid.NewGuid().ToString("N").Substring(0, 12);
            _streamingAnswer = string.Empty;
            if (narrationLabel != null)
            {
                narrationLabel.text = string.Empty;
            }
            client.SubmitRequest(_currentRequestId, text);
            SetStatus("submitted");
        }

        // ----------------------------------------------------------------- handlers

        private void HandleSessionReady(SessionReadyPayload p)
        {
            SetStatus("connected (provider: " + (p.provider ?? "?") + ")");
            if (fox != null) fox.PlayState("idle");
        }

        private void HandleStatus(StatusPayload p)
        {
            string detail = string.IsNullOrEmpty(p.detail) ? string.Empty : " -- " + p.detail;
            SetStatus(p.state + detail);
            if (fox != null) fox.PlayState(p.state);
        }

        private void HandleAnswerPartial(AnswerPartialPayload p)
        {
            _streamingAnswer += p.textDelta ?? string.Empty;
            if (narrationLabel != null)
            {
                narrationLabel.text = _streamingAnswer;
            }
            if (fox != null) fox.NotifySpeaking();
        }

        private void HandleResultFinal(ResultFinalPayload p)
        {
            if (narrationLabel != null)
            {
                narrationLabel.text = p.answer ?? string.Empty;
            }
            SetStatus("done");
            if (fox != null) fox.PlayState("done");
        }

        private void HandleConfirmRequired(ConfirmRequiredPayload p)
        {
            // Demo policy: surface the human-facing action label so the operator can see the
            // gate. A full UI would show approve/deny buttons calling client.RespondConfirm.
            SetStatus("confirm needed: " + p.action + " (" + p.detail + ")");
            if (fox != null) fox.PlayState("awaiting_confirm");
        }

        private void HandleError(ErrorPayload p)
        {
            // SECURITY: code only -- never a message body.
            SetStatus("error: " + p.code + (p.retryable ? " (retryable)" : string.Empty));
            if (fox != null) fox.PlayState("error");
        }

        private void HandleConnectionState(string state)
        {
            SetStatus("socket: " + state);
        }

        private void SetStatus(string text)
        {
            if (statusLabel != null)
            {
                statusLabel.text = text;
            }
        }
    }
}
