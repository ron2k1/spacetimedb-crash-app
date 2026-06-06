// ActivityPanel -- the live "what Crash is doing right now" view. This is the warm reskin of the
// original ConversationPane: it renders the engine-driven run (plan -> steps -> confirm -> answer ->
// save-as-skill) straight from taskStore, plus a friendly empty state when nothing is running yet.
// All the engine round-trips (confirm/cancel/approve/save) go through the connection facade exactly
// as before -- only the styling changed, so the proven wiring is untouched.
import { useState } from 'react';
import { motion } from 'motion/react';
import { useTaskStore } from '../../store/taskStore';
import { confirmPlan, cancelPlan, respondConfirm, acceptSkillSave, cancelRun } from '../../net/connection';
import { Card, Button, Chip } from '../../ui/primitives';
import { Markdown } from '@/components/ui/markdown';
import { theme, FONT } from '../../theme';

function RunHeader() {
  const runState = useTaskStore((s) => s.runState);
  const detail = useTaskStore((s) => s.statusDetail);
  const live = runState === 'planning' || runState === 'indexing' || runState === 'running';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
      {/* A small live dot that breathes only while a run is in flight, so "is Crash working?" reads
          at a glance before you even parse the state word. */}
      <motion.span
        animate={live ? { scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 1 }}
        transition={live ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          flex: '0 0 auto',
          background: live ? theme.ui.accent : theme.ui.good,
          boxShadow: live ? `0 0 8px ${theme.ui.accent}` : 'none',
        }}
      />
      <Chip tone="accent">{runState}</Chip>
      {detail && <span style={{ fontFamily: FONT.body, fontSize: 12, color: theme.ui.inkSoft }}>{detail}</span>}
    </div>
  );
}

// One row in the plan: a status glyph (pulsing dot while running, check when done, hollow ring when
// pending), the step label, a live percentage, and a progress bar. The bar width already eases via
// `transition: width 240ms`, so when the engine emits PACED step.progress fractions over several
// seconds the fill glides smoothly rather than snapping. The currently-running step (started but not
// yet complete) gets a subtle breathing pulse on its dot + a soft glow on the bar so the eye lands
// on what Crash is doing right now.
function PlanStepRow({ label, fraction, started }: { label: string; fraction: number; started: boolean }) {
  const done = fraction >= 1;
  const running = started && !done;
  const pct = Math.round(fraction * 100);

  const glyph = done ? (
    <span style={{ color: theme.ui.good, fontSize: 12, lineHeight: 1 }}>✓</span>
  ) : running ? (
    <motion.span
      animate={{ scale: [1, 1.35, 1], opacity: [0.85, 1, 0.85] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: theme.ui.accent,
        boxShadow: `0 0 8px ${theme.ui.accent}`,
        display: 'block',
      }}
    />
  ) : (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        border: `1.5px solid ${theme.ui.inkFaint}`,
        display: 'block',
      }}
    />
  );

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT.body, fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ flex: '0 0 auto', width: 8, height: 8, display: 'grid', placeItems: 'center' }}>{glyph}</span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: started ? theme.ui.ink : theme.ui.inkSoft,
            fontWeight: running ? 700 : 600,
            opacity: started ? 1 : 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span style={{ flex: '0 0 auto', color: done ? theme.ui.good : theme.ui.inkFaint, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'rgba(0,0,0,0.28)',
          borderRadius: 999,
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            height: 6,
            width: `${pct}%`,
            borderRadius: 999,
            background: done
              ? `linear-gradient(90deg, ${theme.ui.good}, #34d399)`
              : `linear-gradient(90deg, ${theme.ui.accentDeep}, ${theme.ui.accent})`,
            boxShadow: running ? `0 0 10px ${theme.ui.accent}99` : 'none',
            transition: 'width 240ms ease, box-shadow 240ms ease',
          }}
        />
      </div>
    </div>
  );
}

function PlanCard() {
  const plan = useTaskStore((s) => s.plan);
  const runState = useTaskStore((s) => s.runState);
  if (!plan) return null;
  const awaitingApproval = runState === 'planning';
  const total = plan.steps.length;
  const doneCount = plan.steps.filter((st) => st.fraction >= 1).length;
  return (
    <Card index={0} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 15, color: theme.ui.ink, lineHeight: 1.2 }}>
          {plan.title}
        </div>
        {total > 0 && !awaitingApproval && (
          <span style={{ flex: '0 0 auto', fontFamily: FONT.body, fontSize: 11, fontWeight: 800, color: theme.ui.inkFaint, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            {doneCount}/{total}
          </span>
        )}
      </div>
      <div style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 1.45, color: theme.ui.inkSoft, marginBottom: 12 }}>{plan.summary}</div>
      {plan.steps.map((st) => (
        <PlanStepRow key={st.id} label={st.label} fraction={st.fraction} started={st.started} />
      ))}
      {awaitingApproval && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button onClick={() => confirmPlan(plan.planId)}>Start this plan</Button>
          <Button variant="ghost" onClick={() => cancelPlan(plan.planId)}>Cancel</Button>
        </div>
      )}
    </Card>
  );
}

function IndexBar() {
  const ip = useTaskStore((s) => s.indexProgress);
  if (!ip || ip.total === 0) return null;
  const pct = Math.round((ip.processed / ip.total) * 100);
  return (
    <Card index={1} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: FONT.body, fontSize: 12.5, fontWeight: 700, color: theme.ui.ink }}>Reading your notes</span>
        <span style={{ fontFamily: FONT.body, fontSize: 11.5, fontWeight: 800, color: theme.ui.inkFaint, fontVariantNumeric: 'tabular-nums' }}>
          {ip.processed}/{ip.total}
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(0,0,0,0.28)', borderRadius: 999, overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' }}>
        <div
          style={{
            height: 6,
            width: `${pct}%`,
            borderRadius: 999,
            background: `linear-gradient(90deg, #0fb6d6, ${theme.ui.teal})`,
            boxShadow: `0 0 8px ${theme.ui.teal}80`,
            transition: 'width 240ms ease',
          }}
        />
      </div>
    </Card>
  );
}

function ConfirmCard() {
  const c = useTaskStore((s) => s.pendingConfirm);
  if (!c) return null;
  return (
    <Card index={0} style={{ marginBottom: 12, border: `1.5px solid ${theme.ui.warn}` }}>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 14, color: theme.ui.ink, marginBottom: 3 }}>
        Confirm before continuing: {c.action}
      </div>
      <div style={{ fontFamily: FONT.body, fontSize: 13, color: theme.ui.inkSoft, marginBottom: 10 }}>{c.detail}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => respondConfirm(c.confirmId, true)}>Continue</Button>
        <Button variant="ghost" onClick={() => respondConfirm(c.confirmId, false)}>Cancel</Button>
      </div>
    </Card>
  );
}

function AnswerCard() {
  const answer = useTaskStore((s) => s.answer);
  const citations = useTaskStore((s) => s.citations);
  const activeRequestId = useTaskStore((s) => s.activeRequestId);
  if (!answer) return null;
  return (
    <Card index={0} style={{ marginBottom: 12 }}>
      {/* The answer is the headless local LLM's VOICE. It arrives as Markdown (code fences, lists, bold,
          GFM tables), so we render it through the shared Markdown component instead of the old
          character-by-character Typewriter: a streamed fenced code block has to be PARSED to show as a
          real code block, which a char-stream of literal backticks can never do. The "live" feel is kept
          by the breathing run-dot in RunHeader plus a short fade-in here, keyed on activeRequestId so each
          new question fades in from a clean slate. The model still runs entirely on the user's machine --
          this governs PRESENTATION only. */}
      <motion.div
        key={activeRequestId ?? 'answer'}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        style={{ fontFamily: FONT.body, fontSize: 13.5, lineHeight: 1.55, color: theme.ui.ink }}
      >
        <Markdown>{answer}</Markdown>
      </motion.div>
      {citations.length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${theme.ui.line}`, paddingTop: 8 }}>
          <div style={{ fontFamily: FONT.body, fontSize: 11, fontWeight: 800, color: theme.ui.inkFaint, marginBottom: 4 }}>
            Where this came from
          </div>
          {citations.map((c, i) => (
            <div key={i} style={{ fontFamily: FONT.body, fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: theme.ui.accentDeep, fontWeight: 700 }}>{c.source}</span>
              <span style={{ color: theme.ui.inkSoft }}> — {c.snippet}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SkillOfferCard() {
  const offer = useTaskStore((s) => s.skillOffer);
  const saved = useTaskStore((s) => s.savedSkill);
  const [name, setName] = useState('');
  if (saved) {
    return (
      <Card index={0} style={{ marginBottom: 12, border: `1.5px solid ${theme.ui.good}` }}>
        <div style={{ fontFamily: FONT.body, fontSize: 13, color: theme.ui.ink }}>
          ⭐ Saved <strong>{saved.name}</strong> to your shelf
        </div>
      </Card>
    );
  }
  if (!offer) return null;
  const value = name || offer.suggestedName;
  return (
    <Card index={0} style={{ marginBottom: 12, border: `1.5px solid ${theme.ui.accent}` }}>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 14, color: theme.ui.ink, marginBottom: 3 }}>
        Save this as a skill?
      </div>
      <div style={{ fontFamily: FONT.body, fontSize: 13, color: theme.ui.inkSoft, marginBottom: 8 }}>{offer.description}</div>
      <input
        value={value}
        onChange={(e) => setName(e.target.value)}
        aria-label="Skill name"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          marginBottom: 8,
          padding: '8px 10px',
          borderRadius: 10,
          // Dark-field style (mirrors SkillCreatorPanel.darkField): the old cream '#fffdf8' fill made
          // the near-white ink illegible. Translucent dark fill + theme ink keeps it on register.
          border: `1.5px solid ${theme.ui.line}`,
          background: theme.ui.chipBg,
          color: theme.ui.ink,
          fontFamily: FONT.body,
          fontSize: 13,
          outline: 'none',
        }}
      />
      <Button variant="teal" onClick={() => acceptSkillSave(offer.requestId, value.trim())}>Save skill</Button>
    </Card>
  );
}

function ErrorCard() {
  const code = useTaskStore((s) => s.lastErrorCode);
  const runState = useTaskStore((s) => s.runState);
  if (!code || runState !== 'error') return null;
  return (
    <Card index={0} style={{ marginBottom: 12, border: `1.5px solid ${theme.ui.bad}` }}>
      <div style={{ fontFamily: FONT.body, fontSize: 13, color: theme.ui.ink }}>
        Something went wrong (<code style={{ color: theme.ui.bad }}>{code}</code>). Try asking again.
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '36px 18px', color: theme.ui.inkSoft }}>
      <div style={{ fontSize: 46, marginBottom: 10 }}>🐾</div>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 17, color: theme.ui.ink, marginBottom: 6 }}>
        Crash is ready
      </div>
      <div style={{ fontFamily: FONT.body, fontSize: 13.5, lineHeight: 1.5 }}>
        Ask a question in the bar below, and Crash's plan, thinking, and answer show up right here.
      </div>
    </div>
  );
}

export function ActivityPanel() {
  const runState = useTaskStore((s) => s.runState);
  const activeRequestId = useTaskStore((s) => s.activeRequestId);
  const answer = useTaskStore((s) => s.answer);
  const plan = useTaskStore((s) => s.plan);
  const eventsLen = useTaskStore((s) => s.events.length);
  const running = runState === 'planning' || runState === 'indexing' || runState === 'running';

  const idle = runState === 'idle' && !answer && !plan && eventsLen === 0;
  if (idle) return <EmptyState />;

  return (
    <div>
      <RunHeader />
      <PlanCard />
      <IndexBar />
      <ConfirmCard />
      <AnswerCard />
      <SkillOfferCard />
      <ErrorCard />
      {running && activeRequestId && (
        <Button variant="ghost" onClick={() => cancelRun(activeRequestId)}>
          Stop
        </Button>
      )}
    </div>
  );
}
