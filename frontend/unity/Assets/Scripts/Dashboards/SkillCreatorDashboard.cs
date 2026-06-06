// SkillCreatorDashboard -- the live hero surface. Drives the full Spec section 4 skill-creation loop
// against the engine through CrashApp.Instance.Client:
//
//   input + Create     -> Client.SubmitRequest(reqId, text)
//   plan.proposed      -> show the plan card (title/summary/steps) + Confirm / Cancel
//   plan Confirm       -> Client.ConfirmPlan(planId)   ; Cancel -> Client.CancelPlan(planId)
//   status/step.*/index.progress -> progress UI (state + step label + fraction/processed)
//   answer.partial     -> append streaming text
//   result.final       -> show the final answer + citations
//   skill.save.offer   -> "Save as skill?" + Save -> Client.AcceptSkillSave(reqId, name)
//   skill.saved        -> confirmation + a new saved-skill card (the File Activity panel shows
//                         the real SKILL.md write independently)
//   STOP               -> Client.CancelRun(reqId)
//   re-run             -> clicking a saved card re-submits its stored goal (a fresh request)
//
// House-style mirrored from CrashDemoUI: legacy uGUI ([SerializeField] Text/InputField/Button),
// ALL subscription in code (OnEnable/OnDisable via the C# events), requestId built as
// "req_" + Guid.NewGuid().ToString("N").Substring(0,12), and errors surfaced as CODE ONLY.
//
// SECURITY: on error, show the synthetic code only -- never a message body. Citations come from
// the engine's result.final payload and are display strings the engine already curated.
//
// THREAD-SAFETY: events arrive on the Unity main thread (CrashWsClient.Update dispatches the
// socket queue), so direct UI mutation in these handlers is safe.

using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.UI;
using Crash.Net;
using Crash.Protocol;
using Crash.World;

namespace Crash.Dashboards
{
    public class SkillCreatorDashboard : MonoBehaviour
    {
        [Header("Client source")]
        [Tooltip("Optional explicit client. If null, uses CrashApp.Instance.Client.")]
        [SerializeField] private CrashWsClient client;

        [Header("Request input")]
        [SerializeField] private InputField goalInput;
        [SerializeField] private Button createButton;
        [SerializeField] private Button stopButton;

        [Header("Status / progress")]
        [SerializeField] private Text statusLabel;
        [SerializeField] private Text stepLabel;
        [SerializeField] private Slider progressBar; // optional; 0..1

        [Header("Plan card")]
        [Tooltip("Root GameObject of the plan card; toggled on plan.proposed, off after confirm/cancel.")]
        [SerializeField] private GameObject planCard;
        [SerializeField] private Text planTitleLabel;
        [SerializeField] private Text planSummaryLabel;
        [SerializeField] private Text planStepsLabel;
        [SerializeField] private Button planConfirmButton;
        [SerializeField] private Button planCancelButton;

        [Header("Answer")]
        [SerializeField] private Text answerLabel;
        [SerializeField] private Text citationsLabel;

        [Header("Skill-save offer")]
        [Tooltip("Root GameObject of the save-offer card; toggled on skill.save.offer.")]
        [SerializeField] private GameObject saveOfferCard;
        [SerializeField] private Text saveOfferLabel;
        [SerializeField] private InputField saveNameInput; // pre-filled with the suggested name
        [SerializeField] private Button saveAcceptButton;
        [SerializeField] private Button saveDeclineButton;

        [Header("Saved-skill cards (re-run)")]
        [Tooltip("Content transform under which saved-skill cards are instantiated.")]
        [SerializeField] private RectTransform savedCardsContent;

        [Tooltip("Saved-card prefab: a RectTransform with a Text (the skill name) and a Button " +
                 "(click to re-run the stored goal). The Text may be on the Button or a child.")]
        [SerializeField] private GameObject savedCardPrefab;

        // ---- in-flight state ----
        private string _currentRequestId = string.Empty;
        private string _currentPlanId = string.Empty;
        private string _suggestedName = string.Empty;
        private readonly StringBuilder _streamingAnswer = new StringBuilder();

        // The goal text the most recent request was submitted with, so a freshly-saved skill
        // card can store it for re-run. Keyed nowhere fancy -- a single in-flight request.
        private string _lastSubmittedGoal = string.Empty;

        // Maps a saved card's GameObject to the goal it re-runs (so the click handler can find it).
        private readonly Dictionary<GameObject, string> _savedCardGoals = new Dictionary<GameObject, string>();

        // ----------------------------------------------------------------- lifecycle

        private void OnEnable()
        {
            if (client == null && CrashApp.Instance != null)
            {
                client = CrashApp.Instance.Client;
            }
            if (client != null)
            {
                client.OnPlanProposed += HandlePlanProposed;
                client.OnStatus += HandleStatus;
                client.OnIndexProgress += HandleIndexProgress;
                client.OnStepStarted += HandleStepStarted;
                client.OnStepProgress += HandleStepProgress;
                client.OnAnswerPartial += HandleAnswerPartial;
                client.OnResultFinal += HandleResultFinal;
                client.OnSkillSaveOffer += HandleSkillSaveOffer;
                client.OnSkillSaved += HandleSkillSaved;
                client.OnError += HandleError;
            }

            if (createButton != null) createButton.onClick.AddListener(OnCreateClicked);
            if (stopButton != null) stopButton.onClick.AddListener(OnStopClicked);
            if (planConfirmButton != null) planConfirmButton.onClick.AddListener(OnPlanConfirmClicked);
            if (planCancelButton != null) planCancelButton.onClick.AddListener(OnPlanCancelClicked);
            if (saveAcceptButton != null) saveAcceptButton.onClick.AddListener(OnSaveAcceptClicked);
            if (saveDeclineButton != null) saveDeclineButton.onClick.AddListener(OnSaveDeclineClicked);

            // Start with the transient cards hidden.
            SetActiveSafe(planCard, false);
            SetActiveSafe(saveOfferCard, false);
        }

        private void OnDisable()
        {
            if (client != null)
            {
                client.OnPlanProposed -= HandlePlanProposed;
                client.OnStatus -= HandleStatus;
                client.OnIndexProgress -= HandleIndexProgress;
                client.OnStepStarted -= HandleStepStarted;
                client.OnStepProgress -= HandleStepProgress;
                client.OnAnswerPartial -= HandleAnswerPartial;
                client.OnResultFinal -= HandleResultFinal;
                client.OnSkillSaveOffer -= HandleSkillSaveOffer;
                client.OnSkillSaved -= HandleSkillSaved;
                client.OnError -= HandleError;
            }

            if (createButton != null) createButton.onClick.RemoveListener(OnCreateClicked);
            if (stopButton != null) stopButton.onClick.RemoveListener(OnStopClicked);
            if (planConfirmButton != null) planConfirmButton.onClick.RemoveListener(OnPlanConfirmClicked);
            if (planCancelButton != null) planCancelButton.onClick.RemoveListener(OnPlanCancelClicked);
            if (saveAcceptButton != null) saveAcceptButton.onClick.RemoveListener(OnSaveAcceptClicked);
            if (saveDeclineButton != null) saveDeclineButton.onClick.RemoveListener(OnSaveDeclineClicked);
        }

        // ----------------------------------------------------------------- button handlers

        private void OnCreateClicked()
        {
            if (client == null || goalInput == null)
            {
                return;
            }
            string text = goalInput.text;
            if (string.IsNullOrEmpty(text))
            {
                return;
            }
            if (!client.IsSessionReady)
            {
                SetStatus("waiting for engine session...");
                return;
            }
            SubmitGoal(text);
        }

        // Shared by the Create button and a saved-card re-run.
        private void SubmitGoal(string text)
        {
            _currentRequestId = "req_" + Guid.NewGuid().ToString("N").Substring(0, 12);
            _currentPlanId = string.Empty;
            _lastSubmittedGoal = text;
            _streamingAnswer.Length = 0;
            if (answerLabel != null) answerLabel.text = string.Empty;
            if (citationsLabel != null) citationsLabel.text = string.Empty;
            SetActiveSafe(planCard, false);
            SetActiveSafe(saveOfferCard, false);
            SetProgress(0f);
            client.SubmitRequest(_currentRequestId, text);
            SetStatus("submitted");
        }

        private void OnStopClicked()
        {
            if (client == null || string.IsNullOrEmpty(_currentRequestId))
            {
                return;
            }
            client.CancelRun(_currentRequestId);
            SetStatus("cancelling...");
        }

        private void OnPlanConfirmClicked()
        {
            if (client == null || string.IsNullOrEmpty(_currentPlanId))
            {
                return;
            }
            client.ConfirmPlan(_currentPlanId);
            SetActiveSafe(planCard, false);
            SetStatus("plan confirmed");
        }

        private void OnPlanCancelClicked()
        {
            if (client == null || string.IsNullOrEmpty(_currentPlanId))
            {
                return;
            }
            client.CancelPlan(_currentPlanId);
            SetActiveSafe(planCard, false);
            SetStatus("plan cancelled");
        }

        private void OnSaveAcceptClicked()
        {
            if (client == null || string.IsNullOrEmpty(_currentRequestId))
            {
                return;
            }
            string name = (saveNameInput != null && !string.IsNullOrEmpty(saveNameInput.text))
                ? saveNameInput.text
                : _suggestedName;
            if (string.IsNullOrEmpty(name))
            {
                return;
            }
            client.AcceptSkillSave(_currentRequestId, name);
            SetActiveSafe(saveOfferCard, false);
            SetStatus("saving skill...");
        }

        private void OnSaveDeclineClicked()
        {
            // Decline is purely local -- there is no decline event in the protocol. Just hide.
            SetActiveSafe(saveOfferCard, false);
        }

        // ----------------------------------------------------------------- engine handlers

        private void HandlePlanProposed(PlanProposedPayload p)
        {
            if (p == null)
            {
                return;
            }
            _currentPlanId = p.planId ?? string.Empty;
            if (planTitleLabel != null) planTitleLabel.text = p.title ?? string.Empty;
            if (planSummaryLabel != null) planSummaryLabel.text = p.summary ?? string.Empty;
            if (planStepsLabel != null) planStepsLabel.text = FormatSteps(p.steps);
            SetActiveSafe(planCard, true);
            SetStatus("plan proposed");
        }

        private void HandleStatus(StatusPayload p)
        {
            if (p == null)
            {
                return;
            }
            string detail = string.IsNullOrEmpty(p.detail) ? string.Empty : " -- " + p.detail;
            SetStatus((p.state ?? string.Empty) + detail);
        }

        private void HandleIndexProgress(IndexProgressPayload p)
        {
            if (p == null)
            {
                return;
            }
            if (stepLabel != null)
            {
                stepLabel.text = "indexing " + p.processed + "/" + p.total;
            }
            if (p.total > 0)
            {
                SetProgress((float)p.processed / p.total);
            }
        }

        private void HandleStepStarted(StepStartedPayload p)
        {
            if (p == null)
            {
                return;
            }
            if (stepLabel != null)
            {
                stepLabel.text = p.label ?? string.Empty;
            }
            SetProgress(0f);
        }

        private void HandleStepProgress(StepProgressPayload p)
        {
            if (p == null)
            {
                return;
            }
            SetProgress(p.fraction);
        }

        private void HandleAnswerPartial(AnswerPartialPayload p)
        {
            if (p == null)
            {
                return;
            }
            _streamingAnswer.Append(p.textDelta ?? string.Empty);
            if (answerLabel != null)
            {
                answerLabel.text = _streamingAnswer.ToString();
            }
        }

        private void HandleResultFinal(ResultFinalPayload p)
        {
            if (p == null)
            {
                return;
            }
            if (answerLabel != null)
            {
                answerLabel.text = p.answer ?? string.Empty;
            }
            if (citationsLabel != null)
            {
                citationsLabel.text = FormatCitations(p.citations);
            }
            SetProgress(1f);
            SetStatus("done");
        }

        private void HandleSkillSaveOffer(SkillSaveOfferPayload p)
        {
            if (p == null)
            {
                return;
            }
            _suggestedName = p.suggestedName ?? string.Empty;
            if (saveOfferLabel != null)
            {
                string desc = string.IsNullOrEmpty(p.description) ? string.Empty : " -- " + p.description;
                saveOfferLabel.text = "Save as skill?" + desc;
            }
            if (saveNameInput != null)
            {
                saveNameInput.text = _suggestedName;
            }
            SetActiveSafe(saveOfferCard, true);
        }

        private void HandleSkillSaved(SkillSavedPayload p)
        {
            if (p == null)
            {
                return;
            }
            SetStatus("skill saved: " + (p.name ?? p.skillId ?? string.Empty));
            // The new card re-runs the goal that produced it (the last submitted goal).
            AddSavedCard(p.name ?? p.skillId ?? "skill", _lastSubmittedGoal);
        }

        private void HandleError(ErrorPayload p)
        {
            if (p == null)
            {
                return;
            }
            // SECURITY: code only -- never a message body.
            SetStatus("error: " + p.code + (p.retryable ? " (retryable)" : string.Empty));
        }

        // ----------------------------------------------------------------- saved cards

        private void AddSavedCard(string displayName, string goal)
        {
            if (savedCardPrefab == null || savedCardsContent == null)
            {
                return;
            }
            GameObject card = Instantiate(savedCardPrefab, savedCardsContent);
            card.SetActive(true);

            Text label = card.GetComponentInChildren<Text>();
            if (label != null)
            {
                label.text = displayName;
            }

            _savedCardGoals[card] = goal ?? string.Empty;

            Button button = card.GetComponentInChildren<Button>();
            if (button != null)
            {
                // Capture the card so the closure re-runs THIS card's stored goal.
                GameObject captured = card;
                button.onClick.AddListener(() => OnSavedCardClicked(captured));
            }
        }

        private void OnSavedCardClicked(GameObject card)
        {
            if (client == null || card == null)
            {
                return;
            }
            if (!_savedCardGoals.TryGetValue(card, out string goal) || string.IsNullOrEmpty(goal))
            {
                return;
            }
            if (!client.IsSessionReady)
            {
                SetStatus("waiting for engine session...");
                return;
            }
            // Re-run = a fresh request.submit with the stored goal.
            SubmitGoal(goal);
        }

        // ----------------------------------------------------------------- formatting / helpers

        private static string FormatSteps(PlanStep[] steps)
        {
            if (steps == null || steps.Length == 0)
            {
                return string.Empty;
            }
            var sb = new StringBuilder();
            for (int i = 0; i < steps.Length; i++)
            {
                PlanStep s = steps[i];
                if (s == null)
                {
                    continue;
                }
                sb.Append(i + 1).Append(". ").Append(s.label ?? string.Empty);
                if (i < steps.Length - 1)
                {
                    sb.Append('\n');
                }
            }
            return sb.ToString();
        }

        private static string FormatCitations(Citation[] citations)
        {
            if (citations == null || citations.Length == 0)
            {
                return string.Empty;
            }
            var sb = new StringBuilder();
            sb.Append("Sources:\n");
            for (int i = 0; i < citations.Length; i++)
            {
                Citation c = citations[i];
                if (c == null)
                {
                    continue;
                }
                sb.Append("- ").Append(c.source ?? string.Empty);
                if (!string.IsNullOrEmpty(c.snippet))
                {
                    sb.Append(": ").Append(c.snippet);
                }
                if (i < citations.Length - 1)
                {
                    sb.Append('\n');
                }
            }
            return sb.ToString();
        }

        private void SetStatus(string text)
        {
            if (statusLabel != null)
            {
                statusLabel.text = text;
            }
        }

        private void SetProgress(float fraction)
        {
            if (progressBar != null)
            {
                progressBar.value = Mathf.Clamp01(fraction);
            }
        }

        private static void SetActiveSafe(GameObject go, bool active)
        {
            if (go != null && go.activeSelf != active)
            {
                go.SetActive(active);
            }
        }
    }
}
