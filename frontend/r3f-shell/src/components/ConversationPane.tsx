// ConversationPane -- the 2D overlay that renders the full run, driven entirely by the
// taskStore (which is itself driven by the Engine->Renderer event stream). This is the
// interactive surface: it shows the proposed plan and lets the user confirm/cancel it, shows
// mid-run confirmation prompts (Approve/Deny), streams the answer + citations, and offers to
// save the result as a reusable skill. Styling is intentionally plain -- claude.ai/design
// polish lands later; this proves the wiring end to end.
import { useState } from 'react';
import { useTaskStore } from '../store/taskStore';
import {
  confirmPlan,
  cancelPlan,
  respondConfirm,
  acceptSkillSave,
  cancelRun,
} from '../net/connection';

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  width: 380,
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  background: 'rgba(20, 16, 40, 0.92)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  padding: 16,
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  zIndex: 100,
};
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};
const btn: React.CSSProperties = {
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  marginRight: 8,
  fontSize: 13,
  cursor: 'pointer',
  fontWeight: 600,
};
const primaryBtn = { ...btn, background: '#ff9966', color: '#1a1530' };
const ghostBtn = { ...btn, background: 'rgba(255,255,255,0.12)', color: 'white' };

function StatusHeader() {
  const connState = useTaskStore((s) => s.connState);
  const runState = useTaskStore((s) => s.runState);
  const provider = useTaskStore((s) => s.provider);
  const detail = useTaskStore((s) => s.statusDetail);
  const dot = connState === 'ready' ? '#5fd97a' : connState === 'error' ? '#ff5f5f' : '#ffcf5f';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: dot }} />
      <span style={{ fontWeight: 700 }}>{runState}</span>
      {detail && <span style={{ color: '#aaa' }}>· {detail}</span>}
      <span style={{ marginLeft: 'auto', color: '#888', fontSize: 11 }}>
        {provider ?? '—'} · {connState}
      </span>
    </div>
  );
}

function PlanCard() {
  const plan = useTaskStore((s) => s.plan);
  const runState = useTaskStore((s) => s.runState);
  if (!plan) return null;
  const awaitingApproval = runState === 'planning';
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{plan.title}</div>
      <div style={{ color: '#bbb', marginBottom: 10 }}>{plan.summary}</div>
      {plan.steps.map((st) => (
        <div key={st.id} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: st.started ? 1 : 0.6 }}>
              {st.started ? '▶' : '○'} {st.label}
            </span>
            <span style={{ color: '#888' }}>{Math.round(st.fraction * 100)}%</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.10)', borderRadius: 2 }}>
            <div style={{ height: 3, width: `${st.fraction * 100}%`, background: '#ff9966', borderRadius: 2 }} />
          </div>
        </div>
      ))}
      {awaitingApproval && (
        <div style={{ marginTop: 10 }}>
          <button style={primaryBtn} onClick={() => confirmPlan(plan.planId)}>
            Start this plan
          </button>
          <button style={ghostBtn} onClick={() => cancelPlan(plan.planId)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function IndexProgress() {
  const ip = useTaskStore((s) => s.indexProgress);
  if (!ip || ip.total === 0) return null;
  const pct = Math.round((ip.processed / ip.total) * 100);
  return (
    <div style={card}>
      <div style={{ marginBottom: 4 }}>
        Indexing {ip.processed}/{ip.total}
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.10)', borderRadius: 2 }}>
        <div style={{ height: 4, width: `${pct}%`, background: '#9966ff', borderRadius: 2 }} />
      </div>
    </div>
  );
}

function ConfirmPrompt() {
  const c = useTaskStore((s) => s.pendingConfirm);
  if (!c) return null;
  return (
    <div style={{ ...card, border: '1px solid #ffcf5f' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Confirm: {c.action}</div>
      <div style={{ color: '#bbb', marginBottom: 10 }}>{c.detail}</div>
      <button style={primaryBtn} onClick={() => respondConfirm(c.confirmId, true)}>
        Approve
      </button>
      <button style={ghostBtn} onClick={() => respondConfirm(c.confirmId, false)}>
        Deny
      </button>
    </div>
  );
}

function AnswerCard() {
  const answer = useTaskStore((s) => s.answer);
  const citations = useTaskStore((s) => s.citations);
  if (!answer) return null;
  return (
    <div style={card}>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{answer}</div>
      {citations.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 8 }}>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Sources</div>
          {citations.map((c, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{ color: '#ff9966' }}>{c.source}</span>
              <span style={{ color: '#aaa' }}> — {c.snippet}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillOfferCard() {
  const offer = useTaskStore((s) => s.skillOffer);
  const saved = useTaskStore((s) => s.savedSkill);
  const [name, setName] = useState('');
  if (saved) {
    return (
      <div style={{ ...card, border: '1px solid #5fd97a' }}>
        ✓ Saved skill <strong>{saved.name}</strong>
        <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{saved.path}</div>
      </div>
    );
  }
  if (!offer) return null;
  // Pre-fill the editable name with the engine's suggestion the first time we render it.
  const value = name || offer.suggestedName;
  return (
    <div style={{ ...card, border: '1px solid #ff9966' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Save this as a reusable skill?</div>
      <div style={{ color: '#bbb', marginBottom: 8 }}>{offer.description}</div>
      <input
        value={value}
        onChange={(e) => setName(e.target.value)}
        style={{
          width: '100%',
          marginBottom: 8,
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.20)',
          background: 'rgba(0,0,0,0.20)',
          color: 'white',
          fontSize: 13,
        }}
      />
      <button style={primaryBtn} onClick={() => acceptSkillSave(offer.requestId, value.trim())}>
        Save skill
      </button>
    </div>
  );
}

function ErrorCard() {
  const code = useTaskStore((s) => s.lastErrorCode);
  const runState = useTaskStore((s) => s.runState);
  if (!code || runState !== 'error') return null;
  return (
    <div style={{ ...card, border: '1px solid #ff5f5f' }}>
      Something went wrong (<code>{code}</code>). You can try again.
    </div>
  );
}

function RawLog() {
  const events = useTaskStore((s) => s.events);
  const [show, setShow] = useState(false);
  if (events.length === 0) return null;
  return (
    <div>
      <button style={{ ...ghostBtn, fontSize: 11, padding: '4px 8px' }} onClick={() => setShow((v) => !v)}>
        {show ? 'Hide' : 'Show'} event log ({events.length})
      </button>
      {show && (
        <div style={{ marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#9aa' }}>
          {events.map((e, i) => (
            <div key={i}>{e.type}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConversationPane() {
  const runState = useTaskStore((s) => s.runState);
  const activeRequestId = useTaskStore((s) => s.activeRequestId);
  const running = runState === 'planning' || runState === 'indexing' || runState === 'running';
  return (
    <div style={panel}>
      <StatusHeader />
      <PlanCard />
      <IndexProgress />
      <ConfirmPrompt />
      <AnswerCard />
      <SkillOfferCard />
      <ErrorCard />
      {running && activeRequestId && (
        <button style={{ ...ghostBtn, marginBottom: 12 }} onClick={() => cancelRun(activeRequestId)}>
          Stop
        </button>
      )}
      <RawLog />
    </div>
  );
}
