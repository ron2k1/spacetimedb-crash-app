// Copied from repo-root protocol/Protocol.cs (canonical). Keep in sync.
// Crash socket contract -- HAND-MIRROR of protocol/src/events.ts for Unity (C#).
// The TypeScript file is canonical. This file is kept in sync by the drift-guard test
// protocol/test/contract.test.ts, which asserts the Version and every event-type string
// below match events.ts. If you change events.ts, change this file in the SAME commit.
//
// SECURITY: ErrorPayload carries Code only -- never a message/stack/prompt/credential.
//
// PROVIDER: HelloPayload + SessionReadyPayload carry `provider` ('claude-code' | 'codex')
// for DISPLAY ONLY. Show which backend is live; never branch behavior on it. (Spec 3.1/3.2.)

using System;

namespace Crash.Protocol
{
    public static class CrashProtocol
    {
        // Mirrors PROTOCOL_VERSION in events.ts.
        public const int Version = 2;

        // Mirrors ALL_EVENT_TYPES in events.ts (order-independent; the drift test checks membership).
        public static readonly string[] EventTypes = new string[]
        {
            // Renderer -> Engine
            "hello",
            "request.submit",
            "plan.confirm",
            "plan.cancel",
            "confirm.response",
            "skill.save.accept",
            "run.cancel",
            "marketplace.install",
            // Engine -> Renderer
            "session.ready",
            "plan.proposed",
            "status",
            "index.progress",
            "step.started",
            "step.progress",
            "confirm.required",
            "answer.partial",
            "result.final",
            "skill.save.offer",
            "skill.saved",
            "file.activity",
            "folder.snapshot",
            "marketplace.installed",
            "error",
        };
    }

    // Envelope: { v, type, sessionId, seq, payload }. Unity deserializes `type` first to
    // pick the payload struct. (Concrete JSON wiring is added when Unity consumes this.)
    [Serializable]
    public class Envelope
    {
        public int v;
        public string type;
        public string sessionId;
        public int seq;
    }

    // ---- shared ----
    [Serializable] public class PlanStep { public string id; public string label; }
    [Serializable] public class Citation { public string source; public string snippet; }

    // ---- Renderer -> Engine payloads ----
    [Serializable] public class HelloPayload { public string token; public int protocolVersion; public string renderer; public string provider; } // provider: 'claude-code' | 'codex' (display only)
    [Serializable] public class RequestSubmitPayload { public string requestId; public string text; public string targetPath; }
    [Serializable] public class PlanConfirmPayload { public string planId; }
    [Serializable] public class PlanCancelPayload { public string planId; }
    [Serializable] public class ConfirmResponsePayload { public string confirmId; public bool approved; }
    [Serializable] public class SkillSaveAcceptPayload { public string requestId; public string name; }
    [Serializable] public class RunCancelPayload { public string requestId; }

    // ---- Engine -> Renderer payloads ----
    [Serializable] public class SessionReadyPayload { public string sessionId; public int protocolVersion; public string engineVersion; public string provider; } // provider: 'claude-code' | 'codex' (display only)
    [Serializable] public class PlanProposedPayload { public string requestId; public string planId; public string title; public string summary; public PlanStep[] steps; }
    [Serializable] public class StatusPayload { public string requestId; public string state; public string detail; }
    [Serializable] public class IndexProgressPayload { public string requestId; public int processed; public int total; }
    [Serializable] public class StepStartedPayload { public string planId; public string stepId; public string label; }
    [Serializable] public class StepProgressPayload { public string planId; public string stepId; public float fraction; }
    [Serializable] public class ConfirmRequiredPayload { public string confirmId; public string planId; public string action; public string detail; }
    [Serializable] public class AnswerPartialPayload { public string requestId; public string textDelta; }
    [Serializable] public class ResultFinalPayload { public string requestId; public string answer; public Citation[] citations; }
    [Serializable] public class SkillSaveOfferPayload { public string requestId; public string suggestedName; public string description; }
    [Serializable] public class SkillSavedPayload { public string skillId; public string name; public string path; }
    [Serializable] public class ErrorPayload { public string requestId; public string code; public bool retryable; }

    // ---- v2 additions ----
    [Serializable] public class MarketplaceInstallPayload { public string installId; public string kind; public string itemId; } // kind: 'skill' | 'plugin'
    [Serializable] public class FileActivityPayload { public string op; public string path; public int bytes; public int seq; } // op: 'create'|'write'|'delete'|'mkdir'; path workspace-relative POSIX
    [Serializable] public class FolderEntry { public string path; public string kind; public int bytes; } // kind: 'file' | 'dir'
    [Serializable] public class FolderSnapshotPayload { public FolderEntry[] entries; }
    [Serializable] public class MarketplaceInstalledPayload { public string installId; public string kind; public string itemId; public string path; }
}
