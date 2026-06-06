// FoxController -- drives the on-screen fox guide during narration.
//
// Design goal: the scene must be FUNCTIONAL BEFORE any GLB is imported. So this controller
// works against a PRIMITIVE FALLBACK (a capsule/sphere placeholder assigned in the demo
// scene) and degrades gracefully: SetSpeaking bobs/scales the placeholder; PlayState tints
// it per run-state. When a rigged fox model is later imported, assign its jaw/head bone
// Transforms in the Inspector and this controller will drive those instead.
//
// Wiring (done by CrashDemoSceneBuilder / the operator):
//   CrashWsClient.OnAnswerPartial -> NotifySpeaking()  (speak with a short decay)
//   CrashWsClient.OnStatus.state  -> PlayState(state)  (idle/planning/.../done/error)
//
// This file is intentionally a thin presentation seam: no protocol parsing lives here.

using UnityEngine;

namespace Crash.Fox
{
    public class FoxController : MonoBehaviour
    {
        [Header("Primitive fallback (works with NO imported model)")]
        [Tooltip("The placeholder body to animate when no rigged model is assigned. " +
                 "Typically a capsule/sphere created by the demo scene builder. If left null, " +
                 "this GameObject's own transform is used.")]
        [SerializeField] private Transform placeholderBody;

        [Tooltip("Optional renderer whose material color reflects the run-state. If null, " +
                 "the controller searches the placeholder body for a Renderer at Awake.")]
        [SerializeField] private Renderer placeholderRenderer;

        [Header("Rigged fox slot (assign AFTER importing the GLB) -- OPTIONAL")]
        [Tooltip("SLOT: assign the imported fox's root here once a rigged model exists. " +
                 "Purely informational for now; the controller animates jawBone/headBone below.")]
        [SerializeField] private Transform riggedFoxRoot;

        [Tooltip("SLOT: the fox's jaw bone Transform. When assigned, speaking opens/closes " +
                 "the jaw instead of bobbing the placeholder.")]
        [SerializeField] private Transform jawBone;

        [Tooltip("SLOT: the fox's head bone Transform. When assigned, speaking adds a subtle " +
                 "head nod. Optional even when a model is present.")]
        [SerializeField] private Transform headBone;

        [Header("Speaking animation")]
        [Tooltip("Seconds the fox keeps 'speaking' after the last answer.partial delta.")]
        [SerializeField] private float speakDecaySeconds = 0.35f;
        [SerializeField] private float bobAmplitude = 0.06f;
        [SerializeField] private float bobFrequency = 9f;
        [SerializeField] private float jawOpenDegrees = 14f;

        // Cached neutral pose so we can return the placeholder/bones to rest.
        private Vector3 _bodyRestLocalPos;
        private Quaternion _jawRestLocalRot;
        private Quaternion _headRestLocalRot;
        private Material _runtimeMaterialInstance;

        private bool _isSpeaking;
        private float _speakingUntil;     // Time.time after which speaking stops
        private string _runState = "idle";

        private Transform Body => placeholderBody != null ? placeholderBody : transform;

        private void Awake()
        {
            _bodyRestLocalPos = Body.localPosition;
            if (jawBone != null) _jawRestLocalRot = jawBone.localRotation;
            if (headBone != null) _headRestLocalRot = headBone.localRotation;

            if (placeholderRenderer == null && placeholderBody != null)
            {
                placeholderRenderer = placeholderBody.GetComponentInChildren<Renderer>();
            }
            if (placeholderRenderer != null)
            {
                // Instance the material so tinting does not leak into the shared asset.
                _runtimeMaterialInstance = placeholderRenderer.material;
            }

            PlayState("idle");
        }

        // ----------------------------------------------------------------- public seam

        /// <summary>
        /// Set the speaking flag directly. Use <see cref="NotifySpeaking"/> for the
        /// answer.partial streaming case (it auto-decays).
        /// </summary>
        public void SetSpeaking(bool speaking)
        {
            _isSpeaking = speaking;
            if (speaking)
            {
                _speakingUntil = Time.time + speakDecaySeconds;
            }
        }

        /// <summary>
        /// Call on each answer.partial delta: marks the fox speaking and refreshes the decay
        /// timer so a stream of deltas keeps the mouth moving, then settles shortly after the
        /// last one.
        /// </summary>
        public void NotifySpeaking()
        {
            _isSpeaking = true;
            _speakingUntil = Time.time + speakDecaySeconds;
        }

        /// <summary>
        /// Map a RunState string (idle/planning/indexing/running/awaiting_confirm/done/error)
        /// to simple, visible feedback. Unknown values fall back to the idle tint.
        /// </summary>
        public void PlayState(string runState)
        {
            _runState = string.IsNullOrEmpty(runState) ? "idle" : runState;
            if (_runtimeMaterialInstance != null)
            {
                _runtimeMaterialInstance.color = ColorForState(_runState);
            }
        }

        // ----------------------------------------------------------------- update loop

        private void Update()
        {
            // Decay speaking back to rest after the last delta.
            if (_isSpeaking && Time.time >= _speakingUntil)
            {
                _isSpeaking = false;
            }

            bool hasRig = (jawBone != null) || (headBone != null);
            if (hasRig)
            {
                DriveRiggedBones();
            }
            else
            {
                DrivePlaceholder();
            }
        }

        private void DrivePlaceholder()
        {
            float bob = _isSpeaking
                ? Mathf.Abs(Mathf.Sin(Time.time * bobFrequency)) * bobAmplitude
                : 0f;
            Body.localPosition = _bodyRestLocalPos + new Vector3(0f, bob, 0f);
        }

        private void DriveRiggedBones()
        {
            if (jawBone != null)
            {
                float open = _isSpeaking
                    ? Mathf.Abs(Mathf.Sin(Time.time * bobFrequency)) * jawOpenDegrees
                    : 0f;
                // Open along local X (typical jaw hinge). Operator can tweak axis if the rig
                // differs; this is the documented assumption for the PixelMannen fox.
                jawBone.localRotation = _jawRestLocalRot * Quaternion.Euler(open, 0f, 0f);
            }
            if (headBone != null)
            {
                float nod = _isSpeaking
                    ? Mathf.Sin(Time.time * (bobFrequency * 0.5f)) * (jawOpenDegrees * 0.25f)
                    : 0f;
                headBone.localRotation = _headRestLocalRot * Quaternion.Euler(nod, 0f, 0f);
            }
        }

        // ----------------------------------------------------------------- helpers

        private static Color ColorForState(string state)
        {
            switch (state)
            {
                case "planning":         return new Color(0.36f, 0.55f, 1.00f); // blue
                case "indexing":         return new Color(0.60f, 0.40f, 1.00f); // violet
                case "running":          return new Color(1.00f, 0.60f, 0.30f); // warm orange
                case "awaiting_confirm": return new Color(1.00f, 0.84f, 0.20f); // amber
                case "done":             return new Color(0.36f, 0.85f, 0.45f); // green
                case "error":            return new Color(0.90f, 0.30f, 0.30f); // red
                case "idle":
                default:                 return new Color(0.80f, 0.80f, 0.82f); // neutral grey
            }
        }
    }
}
