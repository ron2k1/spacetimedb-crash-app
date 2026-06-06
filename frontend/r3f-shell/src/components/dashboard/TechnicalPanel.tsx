// TechnicalPanel -- a READ-ONLY mirror of the raw CLI output streaming from the ONE real headless
// engine session, for technical users. It renders taskStore.terminalLines (fed by the protocol's
// `terminal.output` event) as a dark, monospace, auto-scrolling terminal view: newest line at the
// bottom, stdout muted, stderr in the warn color.
//
// It is a VIEW ONLY. There is deliberately NO input box and NO send button: this panel never spawns a
// CLI, never sends a request, and switching to it is a pure local UI-state change. The buffer it reads
// is in-memory, ephemeral, and bounded (last 500 lines) in the store -- it is never persisted, because
// a line can carry file contents / CLI internals by design.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTaskStore, type TerminalLine } from '../../store/taskStore';
import { theme, FONT } from '../../theme';

// Same human-readable provider mapping the TopBar uses (auth.status.active, mirrored to `provider` on
// session.ready). Falls back to the raw key, then a neutral label, until the engine reports one.
const PROVIDER_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
};

// A monospace stack for the CLI mirror. The shared FONT tokens are the friendly rounded UI faces, so a
// raw terminal feed needs its own fixed-width stack here (intentionally local, not a theme token).
const MONO = "'JetBrains Mono', 'Cascadia Code', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

function ProviderTag() {
  const authActive = useTaskStore((s) => s.authActive);
  const provider = useTaskStore((s) => s.provider);
  const worker = useTaskStore((s) => s.providerWorker);
  // Prefer the typed auth.status.active; fall back to the session.ready provider string.
  const providerKey = authActive ?? provider;
  const label = providerKey ? (PROVIDER_LABEL[providerKey] ?? providerKey) : 'Crash Engine';
  const workerLabel = worker
    ? `${PROVIDER_LABEL[worker.provider] ?? worker.provider} worker ${worker.state}`
    : 'No worker running';
  const workerColor =
    worker?.state === 'error'
      ? theme.ui.bad
      : worker?.state === 'done'
        ? theme.ui.good
        : worker
          ? theme.ui.teal
          : theme.ui.inkFaint;
  return (
    <div style={{ marginBottom: 10, fontFamily: FONT.body, fontSize: 11.5, fontWeight: 700 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: theme.ui.inkSoft,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            flex: '0 0 auto',
            background: theme.ui.teal,
            boxShadow: `0 0 7px ${theme.ui.teal}`,
          }}
        />
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.6, color: theme.ui.inkFaint }}>Live CLI</span>
        <span style={{ color: theme.ui.inkFaint }}>·</span>
        <span style={{ color: theme.ui.ink }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, color: theme.ui.inkSoft }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            flex: '0 0 auto',
            background: workerColor,
            boxShadow: worker ? `0 0 7px ${workerColor}` : 'none',
          }}
        />
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.6, color: theme.ui.inkFaint }}>Headless</span>
        <span style={{ color: theme.ui.inkFaint }}>·</span>
        <span style={{ color: workerColor }}>{workerLabel}</span>
        {worker?.detail ? <span style={{ color: theme.ui.inkFaint }}>({worker.detail})</span> : null}
      </div>
    </div>
  );
}

// One terminal line. stdout reads in a normal/muted ink; stderr in the warn color so errors stand out.
// `white-space: pre-wrap` preserves the engine's own spacing/indentation while still wrapping long
// lines inside the panel. Lines are forwarded verbatim and rendered as text (React escapes them), so
// raw CLI bytes can never inject markup.
function LineRow({ entry }: { entry: TerminalLine }) {
  const isErr = entry.stream === 'stderr';
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: isErr ? theme.ui.warn : theme.ui.inkSoft,
      }}
    >
      {entry.line}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 12.5,
        color: theme.ui.inkFaint,
        padding: '8px 2px',
      }}
    >
      Waiting for the engine to run a task...
    </div>
  );
}

export function TechnicalPanel() {
  const lines = useTaskStore((s) => s.terminalLines);

  // Auto-scroll to the bottom on new lines, but DON'T yank the view if the user has scrolled up to
  // read history: we only re-pin to the bottom when they were already near it. stickRef tracks that
  // intent; the scroll handler updates it, and a layout effect (after the new line is in the DOM but
  // before paint) does the actual scroll so there's no flicker.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distanceFromBottom < 24; // within ~a line of the bottom counts as "at bottom"
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length]);

  // On first mount, start pinned to the bottom (newest) regardless of buffer size.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ProviderTag />
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          // Dark "terminal window" inside the warm parchment panel: a near-black field with a hairline
          // border, so the raw CLI feed reads as a distinct console surface.
          background: 'rgba(0,0,0,0.34)',
          border: `1px solid ${theme.ui.line}`,
          borderRadius: 14,
          padding: 12,
          maxHeight: '100%',
          overflowY: 'auto',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}
      >
        {lines.length === 0 ? (
          <EmptyState />
        ) : (
          lines.map((entry, i) => <LineRow key={`${entry.requestId}:${entry.seq}:${i}`} entry={entry} />)
        )}
      </div>
    </div>
  );
}
