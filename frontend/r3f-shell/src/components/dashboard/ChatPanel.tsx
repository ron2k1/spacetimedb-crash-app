// ChatPanel -- the "Ask Crash" conversation view. This is what the dashboard renders under the Activity
// section (PromptBar routes here the moment you ask). It turns taskStore.transcript into a real chat:
// your questions on the right, the CLI's streamed replies on the left. Every assistant bubble is LABELED
// with the provider that answered (Claude Code / Codex), so it is always obvious you are talking to your
// chosen CLI -- which is exactly the ask. The reply is the headless CLI's verbatim voice: it streams
// token-by-token from answer.partial and renders as Markdown (code fences, lists, tables). An empty
// transcript shows an honest "ready" state naming the CLI, never a blank panel.
import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useTaskStore } from '../../store/taskStore';
import type { ChatTurn } from '../../store/taskStore';
import { cancelRun, respondConfirm } from '../../net/connection';
import { Markdown } from '@/components/ui/markdown';
import { theme, FONT } from '../../theme';

const PROVIDER_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
};

function providerName(key: string | null | undefined): string {
  if (!key) return 'your CLI';
  return PROVIDER_LABEL[key] ?? key;
}

function pillBtn(primary: boolean): React.CSSProperties {
  return {
    fontFamily: FONT.body,
    fontWeight: 800,
    fontSize: 12.5,
    cursor: 'pointer',
    borderRadius: 999,
    padding: '7px 15px',
    color: primary ? '#0b0a14' : theme.ui.inkSoft,
    background: primary ? theme.ui.accent : 'transparent',
    border: primary ? 'none' : `1px solid ${theme.ui.line}`,
  };
}

// Three breathing dots shown while the assistant turn has opened but no tokens have arrived yet, so
// "Crash is thinking" reads before the first character streams in.
function ThinkingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
          style={{ width: 6, height: 6, borderRadius: 999, background: theme.ui.inkSoft, display: 'block' }}
        />
      ))}
    </span>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          maxWidth: '82%',
          padding: '10px 14px',
          borderRadius: '16px 16px 4px 16px',
          background: `linear-gradient(180deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
          color: '#ffffff',
          fontFamily: FONT.body,
          fontSize: 13.5,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: `0 4px 12px ${theme.ui.accent}44`,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ turn }: { turn: ChatTurn }) {
  const label = providerName(turn.provider);
  const errored = turn.status === 'error';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}>
      {/* Provider label -- names the CLI that is answering this turn. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 4 }}>
        <span style={{ fontSize: 14 }}>🦊</span>
        <span style={{ fontFamily: FONT.body, fontWeight: 800, fontSize: 11.5, color: theme.ui.inkSoft, letterSpacing: 0.2 }}>
          {label}
        </span>
        {turn.status === 'streaming' && (
          <motion.span
            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: 6, height: 6, borderRadius: 999, background: theme.ui.accent, boxShadow: `0 0 6px ${theme.ui.accent}`, display: 'block' }}
          />
        )}
      </div>
      <div
        style={{
          maxWidth: '92%',
          padding: '11px 15px',
          borderRadius: '4px 16px 16px 16px',
          background: theme.ui.cardBg,
          border: `1.5px solid ${errored ? theme.ui.bad : theme.ui.line}`,
          color: theme.ui.ink,
          fontFamily: FONT.body,
          fontSize: 13.5,
          lineHeight: 1.55,
        }}
      >
        {turn.text ? (
          <Markdown>{turn.text}</Markdown>
        ) : errored ? (
          <span style={{ color: theme.ui.inkSoft }}>No reply -- something went wrong. Ask again.</span>
        ) : (
          <ThinkingDots />
        )}
      </div>
    </div>
  );
}

function ConfirmRow() {
  const c = useTaskStore((s) => s.pendingConfirm);
  if (!c) return null;
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '92%',
        padding: '11px 15px',
        borderRadius: 14,
        background: theme.ui.cardBg,
        border: `1.5px solid ${theme.ui.warn}`,
      }}
    >
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 13.5, color: theme.ui.ink, marginBottom: 3 }}>
        Confirm before continuing: {c.action}
      </div>
      <div style={{ fontFamily: FONT.body, fontSize: 13, color: theme.ui.inkSoft, marginBottom: 10 }}>{c.detail}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => respondConfirm(c.confirmId, true)} style={pillBtn(true)}>
          Continue
        </button>
        <button type="button" onClick={() => respondConfirm(c.confirmId, false)} style={pillBtn(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function EmptyState({ cliName }: { cliName: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 18px', color: theme.ui.inkSoft }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🦊</div>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 17, color: theme.ui.ink, marginBottom: 6 }}>
        You're chatting with {cliName}
      </div>
      <div style={{ fontFamily: FONT.body, fontSize: 13.5, lineHeight: 1.55, maxWidth: 420, margin: '0 auto' }}>
        Ask anything in the bar below. Your question and {cliName}'s reply show up here as a conversation,
        streamed live from the CLI running on your machine.
      </div>
    </div>
  );
}

export function ChatPanel() {
  const transcript = useTaskStore((s) => s.transcript);
  const runState = useTaskStore((s) => s.runState);
  const activeRequestId = useTaskStore((s) => s.activeRequestId);
  const authActive = useTaskStore((s) => s.authActive);
  const provider = useTaskStore((s) => s.provider);
  const cliName = providerName(authActive ?? provider);
  const running = runState === 'planning' || runState === 'indexing' || runState === 'running';

  // Auto-scroll to the newest content as the reply streams. Keyed on both turn COUNT (a new bubble) and
  // the last turn's text LENGTH (more tokens arrived) so it follows a long streaming answer down.
  const endRef = useRef<HTMLDivElement>(null);
  const lastLen = transcript.length ? transcript[transcript.length - 1].text.length : 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript.length, lastLen]);

  if (transcript.length === 0) return <EmptyState cliName={cliName} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Standing banner so the CLI is named even when the first bubbles scroll out of view. */}
      <div
        style={{
          alignSelf: 'center',
          fontFamily: FONT.body,
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: 0.3,
          color: theme.ui.inkFaint,
          background: theme.ui.chipBg,
          border: `1px solid ${theme.ui.line}`,
          borderRadius: 999,
          padding: '4px 12px',
        }}
      >
        Connected to {cliName}
      </div>

      {transcript.map((t) =>
        t.role === 'user' ? <UserBubble key={t.id} text={t.text} /> : <AssistantBubble key={t.id} turn={t} />,
      )}

      <ConfirmRow />

      {running && activeRequestId && (
        <button
          type="button"
          onClick={() => cancelRun(activeRequestId)}
          style={{
            alignSelf: 'flex-start',
            fontFamily: FONT.body,
            fontWeight: 800,
            fontSize: 12.5,
            cursor: 'pointer',
            color: theme.ui.inkSoft,
            background: 'transparent',
            border: `1px solid ${theme.ui.line}`,
            borderRadius: 999,
            padding: '7px 15px',
          }}
        >
          Stop
        </button>
      )}

      <div ref={endRef} />
    </div>
  );
}
