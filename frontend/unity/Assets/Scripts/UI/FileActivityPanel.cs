// FileActivityPanel -- the persistent "what the AI is doing to your files" panel.
//
// Lives on the DontDestroyOnLoad Canvas in Bootstrap so it is visible across every dashboard
// scene. It subscribes to two engine events through CrashApp.Instance.Client:
//   - folder.snapshot -> seed the file TREE (one row per workspace-relative path).
//   - file.activity    -> mutate the tree (add/highlight/strike a row) AND append a LOG line.
//
// Two surfaces, both legacy uGUI (no TextMeshPro in this project):
//   TREE: a ScrollRect whose Content holds one instantiated row per path. A row is a small
//         prefab with a Text (the path) and an optional background Image (the highlight). On a
//         create/mkdir for a NEW path we add a row and flash it; on write we flash the existing
//         row; on delete we strike it then drop it after a moment.
//   LOG : a ScrollRect with a single multi-line Text, newest line at the BOTTOM, capped at
//         maxLogLines. Lines read like "created skills/foo/SKILL.md (412 bytes)".
//
// SECURITY: this panel renders ONLY op / path / bytes. It never shows file CONTENTS -- and the
// file.activity event carries none anyway (see protocol/src/events.ts). Do not add any field
// that could surface a body, token, prompt, or answer here.
//
// THREAD-SAFETY: CrashWsClient dispatches inbound frames on the Unity main thread (in its
// Update via NativeWebSocket.DispatchMessageQueue), so mutating UI directly from these
// handlers is safe -- no marshalling needed.

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using Crash.Net;
using Crash.Protocol;

namespace Crash.UI
{
    public class FileActivityPanel : MonoBehaviour
    {
        [Header("Client source")]
        [Tooltip("Optional explicit client. If left null, the panel uses CrashApp.Instance.Client " +
                 "(the normal case -- the panel lives in Bootstrap beside the client).")]
        [SerializeField] private CrashWsClient client;

        [Header("Tree (uGUI ScrollRect)")]
        [Tooltip("The ScrollRect.content transform under which path rows are instantiated.")]
        [SerializeField] private RectTransform treeContent;

        [Tooltip("Row prefab: a RectTransform with a Text child (the path) and OPTIONALLY an " +
                 "Image used as the highlight background. Instantiated once per tracked path.")]
        [SerializeField] private GameObject treeRowPrefab;

        [Tooltip("Optional ScrollRect wrapping the tree, so new rows can auto-scroll into view.")]
        [SerializeField] private ScrollRect treeScrollRect;

        [Header("Log (uGUI ScrollRect)")]
        [Tooltip("The single multi-line Text that holds the activity log (newest at bottom).")]
        [SerializeField] private Text logText;

        [Tooltip("Optional ScrollRect wrapping the log, auto-scrolled to the bottom on append.")]
        [SerializeField] private ScrollRect logScrollRect;

        [Tooltip("Maximum log lines kept; older lines are dropped from the top.")]
        [SerializeField] private int maxLogLines = 200;

        [Header("Highlight")]
        [Tooltip("Seconds a row stays highlighted after a create/mkdir/write before fading back.")]
        [SerializeField] private float highlightSeconds = 1.0f;
        [SerializeField] private Color createColor = new Color(0.36f, 0.85f, 0.45f, 0.5f); // green
        [SerializeField] private Color writeColor = new Color(1.00f, 0.84f, 0.20f, 0.5f);  // amber
        [SerializeField] private Color deleteColor = new Color(0.90f, 0.30f, 0.30f, 0.5f); // red
        [SerializeField] private Color idleColor = new Color(0f, 0f, 0f, 0f);              // clear

        [Tooltip("Seconds a deleted row stays struck-through before it is removed.")]
        [SerializeField] private float deleteLingerSeconds = 0.8f;

        // path -> the live row tracking that path. One row per workspace-relative path.
        private readonly Dictionary<string, FileRow> _rows = new Dictionary<string, FileRow>();

        // The log buffer; we keep the lines and re-join on append so the cap is trivial.
        private readonly List<string> _logLines = new List<string>();

        // A small struct of the per-row UI handles so we are not re-fetching components.
        private class FileRow
        {
            public GameObject go;
            public Text label;
            public Image highlight; // may be null if the prefab has no background Image
            public Coroutine fade;  // the running highlight-fade coroutine, if any
            public bool deleted;
        }

        // ----------------------------------------------------------------- lifecycle

        private void OnEnable()
        {
            // Resolve the client from the singleton if not explicitly wired. We do this in
            // OnEnable (not Awake) so CrashApp.Awake has run regardless of script order.
            if (client == null && CrashApp_TryGetClient(out var resolved))
            {
                client = resolved;
            }
            if (client != null)
            {
                client.OnFolderSnapshot += HandleFolderSnapshot;
                client.OnFileActivity += HandleFileActivity;
            }
        }

        private void OnDisable()
        {
            if (client != null)
            {
                client.OnFolderSnapshot -= HandleFolderSnapshot;
                client.OnFileActivity -= HandleFileActivity;
            }
        }

        // CrashApp lives in Crash.World; we avoid a hard compile dependency direction issue by
        // resolving it reflectively-free through its public static Instance. Both assemblies are
        // the same (no asmdef split here), so a direct reference is fine -- this helper just
        // keeps the null-handling in one place.
        private static bool CrashApp_TryGetClient(out CrashWsClient resolved)
        {
            resolved = null;
            var app = Crash.World.CrashApp.Instance;
            if (app != null)
            {
                resolved = app.Client;
            }
            return resolved != null;
        }

        // ----------------------------------------------------------------- handlers

        private void HandleFolderSnapshot(FolderSnapshotPayload p)
        {
            if (p == null || p.entries == null)
            {
                return;
            }
            // Seed the tree from scratch: clear any existing rows, then add a row per entry.
            ClearTree();
            foreach (FolderEntry entry in p.entries)
            {
                if (entry == null || string.IsNullOrEmpty(entry.path))
                {
                    continue;
                }
                EnsureRow(entry.path);
            }
        }

        private void HandleFileActivity(FileActivityPayload p)
        {
            if (p == null || string.IsNullOrEmpty(p.path))
            {
                return;
            }

            switch (p.op)
            {
                case "mkdir":
                case "create":
                {
                    FileRow row = EnsureRow(p.path);
                    Flash(row, createColor);
                    break;
                }
                case "write":
                {
                    FileRow row = EnsureRow(p.path);
                    Flash(row, writeColor);
                    break;
                }
                case "delete":
                {
                    StrikeAndRemove(p.path);
                    break;
                }
                default:
                    // Unknown op -- still log it, but do not touch the tree.
                    break;
            }

            AppendLog(FormatActivityLine(p));
        }

        // ----------------------------------------------------------------- tree ops

        private FileRow EnsureRow(string path)
        {
            if (_rows.TryGetValue(path, out FileRow existing))
            {
                // If a previously-deleted path comes back (re-create), revive the row.
                if (existing.deleted)
                {
                    existing.deleted = false;
                    if (existing.label != null)
                    {
                        existing.label.text = path;
                    }
                }
                return existing;
            }

            var row = new FileRow();
            if (treeRowPrefab != null && treeContent != null)
            {
                row.go = Instantiate(treeRowPrefab, treeContent);
                row.go.SetActive(true);
                row.label = row.go.GetComponentInChildren<Text>();
                // The highlight Image, if present, is the row's own background. We look for an
                // Image on the root first, then any child (the Text's own Image is fine too).
                row.highlight = row.go.GetComponent<Image>();
                if (row.highlight == null)
                {
                    row.highlight = row.go.GetComponentInChildren<Image>();
                }
            }
            if (row.label != null)
            {
                row.label.text = path;
            }
            if (row.highlight != null)
            {
                row.highlight.color = idleColor;
            }
            _rows[path] = row;
            ScrollTreeToBottom();
            return row;
        }

        private void StrikeAndRemove(string path)
        {
            if (!_rows.TryGetValue(path, out FileRow row))
            {
                // Deleting a path we never tracked: nothing to strike. (Still logged by caller.)
                return;
            }
            row.deleted = true;
            if (row.label != null)
            {
                // Visible "struck" marker without rich text dependence: a leading strike glyph.
                row.label.text = "(deleted) " + path;
            }
            Flash(row, deleteColor);
            StartCoroutine(RemoveRowAfter(path, deleteLingerSeconds));
        }

        private IEnumerator RemoveRowAfter(string path, float seconds)
        {
            yield return new WaitForSeconds(seconds);
            if (_rows.TryGetValue(path, out FileRow row) && row.deleted)
            {
                if (row.fade != null)
                {
                    StopCoroutine(row.fade);
                }
                if (row.go != null)
                {
                    Destroy(row.go);
                }
                _rows.Remove(path);
            }
        }

        private void Flash(FileRow row, Color color)
        {
            if (row == null || row.highlight == null)
            {
                return;
            }
            if (row.fade != null)
            {
                StopCoroutine(row.fade);
            }
            row.fade = StartCoroutine(FadeHighlight(row, color));
        }

        private IEnumerator FadeHighlight(FileRow row, Color from)
        {
            if (row.highlight == null)
            {
                yield break;
            }
            float elapsed = 0f;
            row.highlight.color = from;
            while (elapsed < highlightSeconds)
            {
                // A deleted row keeps its delete tint until it is removed.
                if (row.deleted)
                {
                    yield break;
                }
                elapsed += Time.deltaTime;
                float t = highlightSeconds > 0f ? (elapsed / highlightSeconds) : 1f;
                row.highlight.color = Color.Lerp(from, idleColor, t);
                yield return null;
            }
            row.highlight.color = idleColor;
            row.fade = null;
        }

        private void ClearTree()
        {
            foreach (KeyValuePair<string, FileRow> kv in _rows)
            {
                if (kv.Value != null && kv.Value.go != null)
                {
                    Destroy(kv.Value.go);
                }
            }
            _rows.Clear();
        }

        private void ScrollTreeToBottom()
        {
            if (treeScrollRect != null)
            {
                // Defer one frame so the newly-added row is laid out before we scroll.
                StartCoroutine(SetNormalizedNextFrame(treeScrollRect, 0f));
            }
        }

        // ----------------------------------------------------------------- log ops

        private void AppendLog(string line)
        {
            if (string.IsNullOrEmpty(line))
            {
                return;
            }
            _logLines.Add(line);
            // Cap: drop oldest lines from the top once we exceed the limit.
            int overflow = _logLines.Count - Mathf.Max(1, maxLogLines);
            if (overflow > 0)
            {
                _logLines.RemoveRange(0, overflow);
            }
            if (logText != null)
            {
                logText.text = string.Join("\n", _logLines);
            }
            if (logScrollRect != null)
            {
                StartCoroutine(SetNormalizedNextFrame(logScrollRect, 0f));
            }
        }

        // ----------------------------------------------------------------- formatting

        // Build a human line from op/path/bytes ONLY. No contents ever.
        private static string FormatActivityLine(FileActivityPayload p)
        {
            string verb = VerbFor(p.op);
            // bytes is meaningful for create/write; for mkdir/delete it is 0 and we omit it.
            bool showBytes = (p.op == "create" || p.op == "write") && p.bytes > 0;
            return showBytes
                ? verb + " " + p.path + " (" + FormatBytes(p.bytes) + ")"
                : verb + " " + p.path;
        }

        private static string VerbFor(string op)
        {
            switch (op)
            {
                case "create": return "created";
                case "write":  return "wrote";
                case "delete": return "deleted";
                case "mkdir":  return "made dir";
                default:       return string.IsNullOrEmpty(op) ? "touched" : op;
            }
        }

        // "412 bytes" / "1.2 KB" / "3.4 MB". Plain ASCII; no localization.
        private static string FormatBytes(int bytes)
        {
            if (bytes < 1024)
            {
                return bytes + " bytes";
            }
            double kb = bytes / 1024.0;
            if (kb < 1024.0)
            {
                return kb.ToString("0.0") + " KB";
            }
            double mb = kb / 1024.0;
            return mb.ToString("0.0") + " MB";
        }

        // Set a ScrollRect's verticalNormalizedPosition after one frame so layout has settled.
        private static IEnumerator SetNormalizedNextFrame(ScrollRect rect, float normalized)
        {
            yield return null;
            if (rect != null)
            {
                rect.verticalNormalizedPosition = normalized;
            }
        }
    }
}
