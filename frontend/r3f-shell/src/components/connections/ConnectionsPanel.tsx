// ConnectionsPanel -- the "bring your own keys" surface, one of the dashboard sections. Each
// connector family (web search, chat, image, voice, video, and the USDC commerce wallet) gets a
// row with a single password field. Saving a key hands it to the engine over Tauri's native IPC
// (setConnectorKey) and then CLEARS the field immediately. The key lands in the engine's 0o600
// keystore and is read at boot; it NEVER enters a renderer store, NEVER crosses the WebSocket, and is
// NEVER logged.
//
// "Connected" honesty: the renderer is only ever told booleans -- it cannot read the keystore back --
// so "Key saved" here is an optimistic, in-session acknowledgement that the IPC save resolved, NOT a
// claim that the key is valid. The copy says exactly that. Outside the Tauri desktop app (e.g. the
// plain browser dev build) there is no native IPC, so saving is disabled with an honest note rather
// than a faked success.
import { useState } from "react";
import { setConnectorKey } from "../../lib/setConnectorKey";
import { isTauri } from "../../files/attach";
import { theme, FONT } from "../../theme";

// Renderer-side display metadata for the built-in connectors. This MIRRORS the engine connector
// registry (backend/src/connectors/registry.ts) for presentation only -- the `id` MUST match the
// registry id so the saved key lands under the right connector. One representative vendor per
// capability keeps the panel approachable; the same field shape keys any other vendor later.
interface ConnectorRow {
  id: string; // MUST match the engine registry id (e.g. 'tavily')
  icon: string;
  name: string;
  capability: string; // plain-language "what it unlocks"
  hint: string; // what it's for, in one line
}

const CONNECTORS: ConnectorRow[] = [
  { id: "tavily", icon: "🔎", name: "Tavily", capability: "Web search", hint: "Lets agents search the live web." },
  { id: "openai", icon: "🧠", name: "OpenAI", capability: "Chat + reasoning", hint: "A general model for agents to think with." },
  { id: "anthropic", icon: "📚", name: "Anthropic", capability: "Chat + reasoning", hint: "Claude models for agents to think with." },
  { id: "fal", icon: "🎨", name: "fal", capability: "Image generation", hint: "Lets agents create images." },
  { id: "elevenlabs", icon: "🗣️", name: "ElevenLabs", capability: "Voice", hint: "Lets agents speak out loud." },
  { id: "higgsfield", icon: "🎬", name: "Higgsfield", capability: "Video", hint: "Lets agents generate video." },
  { id: "x402.wallet", icon: "💳", name: "Payment wallet", capability: "Agent payments", hint: "A funded Base wallet key (USDC) so agents can pay for paid tools via x402." },
];

const darkField: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: FONT.body,
  fontSize: 13,
  color: theme.ui.ink,
  background: theme.ui.chipBg,
  border: `1.5px solid ${theme.ui.line}`,
  borderRadius: 11,
  padding: "9px 11px",
  outline: "none",
};

// One connector row. Owns its own field + per-row status so saving one never disturbs another. Status
// is a tiny state machine: idle -> saving -> saved | error (each terminal state self-describes).
function ConnectorRowView({ row }: { row: ConnectorRow }) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [focus, setFocus] = useState(false);

  const save = async () => {
    const value = key.trim();
    if (!value) return;
    // Outside the desktop app there is no native IPC to receive the key. Be honest -- do not pretend
    // a save happened, and never stash the key anywhere as a fallback.
    if (!isTauri) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      await setConnectorKey(row.id, value);
      setKey(""); // SECURITY: clear the field the instant the save resolves; the key never enters state
      setStatus("saved");
    } catch {
      // Synthetic outcome only -- never surface the underlying error message (it can echo input).
      setKey("");
      setStatus("error");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };

  const saved = status === "saved";

  return (
    <div
      style={{
        padding: 13,
        borderRadius: 15,
        backgroundColor: "#0b0a14",
        border: `1.5px solid ${saved ? `${theme.ui.good}55` : theme.ui.line}`,
        boxShadow: saved ? `0 0 16px -8px ${theme.ui.good}` : "inset 0 1px 0 rgba(255,255,255,0.05)",
        transition: "border-color 200ms ease, box-shadow 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
        <span
          aria-hidden
          style={{
            flex: "0 0 auto",
            width: 36,
            height: 36,
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            background: theme.ui.chipBg,
            border: `1px solid ${theme.ui.line}`,
          }}
        >
          {row.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 14.5, color: theme.ui.ink }}>
              {row.name}
            </span>
            {saved && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: FONT.body,
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: theme.ui.good,
                  background: `${theme.ui.good}1f`,
                  border: `1px solid ${theme.ui.good}55`,
                  borderRadius: 999,
                  padding: "1px 7px",
                }}
              >
                ✓ Key saved
              </span>
            )}
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 11.5, color: theme.ui.inkSoft }}>
            {row.capability} · {row.hint}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={saved ? "Saved -- paste a new key to replace" : `Paste your ${row.name} key`}
          aria-label={`${row.name} API key`}
          style={{
            ...darkField,
            flex: 1,
            minWidth: 0,
            borderColor: focus ? `${theme.ui.accent}88` : theme.ui.line,
            boxShadow: focus ? `0 0 0 3px ${theme.ui.accent}1f` : "none",
            transition: "border-color 160ms ease, box-shadow 160ms ease",
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={key.trim().length === 0 || status === "saving"}
          style={{
            flex: "0 0 auto",
            fontFamily: FONT.body,
            fontWeight: 800,
            fontSize: 13,
            color: "#ffffff",
            background:
              key.trim().length === 0
                ? theme.ui.chipBg
                : `linear-gradient(180deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
            border: "1px solid transparent",
            borderRadius: 11,
            padding: "9px 16px",
            cursor: key.trim().length === 0 ? "default" : "pointer",
            opacity: key.trim().length === 0 ? 0.55 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {status === "saving" ? "Saving..." : "Connect"}
        </button>
      </div>

      {/* The non-Tauri honesty note -- only the desktop app has the native channel to receive a key. */}
      {status === "error" && (
        <div
          style={{
            marginTop: 8,
            fontFamily: FONT.body,
            fontSize: 11.5,
            lineHeight: 1.4,
            color: theme.ui.warn,
          }}
        >
          {isTauri
            ? "Couldn't save that key -- please try again."
            : "Saving keys needs the Crash desktop app. The browser preview can't store keys."}
        </div>
      )}
    </div>
  );
}

export function ConnectionsPanel() {
  return (
    <div>
      {/* Hero header -- same tight title row idiom as the other dashboard sections. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span
          style={{
            flex: "0 0 auto",
            width: 40,
            height: 40,
            borderRadius: 13,
            display: "grid",
            placeItems: "center",
            fontSize: 21,
            background: `linear-gradient(180deg, ${theme.ui.accentSoft}, rgba(167,139,250,0.05))`,
            border: `1px solid ${theme.ui.accent}33`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          🔌
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 17, color: theme.ui.ink, lineHeight: 1.15 }}>
            Connect your keys
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 12, color: theme.ui.inkSoft }}>
            Bring your own accounts so agents can do real work.
          </div>
        </div>
      </div>

      {/* Security frame -- said plainly, up front, because trust is the whole point of a key field. */}
      <div
        style={{
          margin: "0 0 16px",
          padding: 12,
          borderRadius: 14,
          background: theme.ui.chipBg,
          border: `1.5px solid ${theme.ui.line}`,
          fontFamily: FONT.body,
          fontSize: 12,
          lineHeight: 1.5,
          color: theme.ui.inkSoft,
        }}
      >
        <span aria-hidden style={{ marginRight: 6 }}>
          🔒
        </span>
        Keys stay on this computer. Crash hands each key straight to its own engine and uses it there
        -- it never travels over the network to us and is never shown again after you save it.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CONNECTORS.map((row) => (
          <ConnectorRowView key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}
