// PromptBar -- the new way you talk to Crash. Replacing the old floating input bubble, this is a
// warm pill anchored at the bottom of the 3D stage that springs OPEN into a roomy compose card when
// you focus it (the MorphPanel interaction pattern), then collapses back when you're done. The morph
// is a single motion element with `layout`, so the size change is a fluid spring, not a popup.
//
// Submit is gated honestly on the live connection: with a real engine it sends the request and flips
// the dashboard to Activity so you can watch it work; with no engine attached it doesn't pretend --
// the fox gently says it's still waking up, and your text is kept so nothing is lost. The compose
// box itself is always interactive so the interaction looks/feels alive even before an engine exists.
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTaskStore } from '../store/taskStore';
import { useDashboardStore } from '../store/dashboardStore';
import { useDialogStore } from '../store/dialogStore';
import { submitRequest } from '../net/connection';
import { useFileAttach } from '../files/useFileAttach';
import { FileConsent, FileChip, PastePathField } from '../files/FileAttachUI';
import { theme, FONT, SHADOW } from '../theme';
import { EDGE_INSET } from './dashboard/layout';

export function PromptBar() {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const connState = useTaskStore((s) => s.connState);
  const appendUserMessage = useTaskStore((s) => s.appendUserMessage);
  const setSection = useDashboardStore((s) => s.setSection);
  // The subagent the user clicked "Use" on (or null). When set, the bar composes the request as that
  // persona and shows a removable "As {name}" chip; clearing it drops back to a plain Ask.
  const activeSubagent = useDashboardStore((s) => s.activeSubagent);
  const clearActiveSubagent = useDashboardStore((s) => s.clearActiveSubagent);
  const say = useDialogStore((s) => s.setPrompt);
  const setBubble = useDialogStore((s) => s.setOpen);
  // The file-attach state machine (consent -> native pick or web paste -> attached path). Shared with
  // SkillCreatorPanel via the same consent store so "let Crash read my files" is asked exactly once.
  const fa = useFileAttach();
  const wrapRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Honest connection read, derived from the live socket state. `ready` is the ONLY state in which
  // submit actually delivers to the engine; everything else shows an honest "still waking up" cue so
  // the bar never pretends to work. We map the 4 ConnState values to a tiny status descriptor used
  // by both the collapsed pill (a colored dot) and the open card (a one-line label).
  const status =
    connState === 'ready'
      ? { dot: theme.ui.good, label: 'Connected', hint: 'Ready when you are.' }
      : connState === 'connecting'
        ? { dot: theme.ui.warn, label: 'Waking up', hint: 'Crash is starting its engine.' }
        : { dot: theme.ui.inkFaint, label: 'Not connected', hint: 'Start the engine, then ask.' };
  const ready = connState === 'ready';
  // A file alone is a valid request (we default the wording below), so an attached file can send even
  // with an empty box.
  const canSend = ready && (text.trim().length > 0 || !!fa.attached);

  useEffect(() => {
    if (expanded) areaRef.current?.focus();
  }, [expanded]);

  // Clicking "Use" on a subagent (which sets activeSubagent) springs the bar open so the persona chip
  // is visible and the box is ready to type. The focus-on-expand effect above then focuses the area.
  useEffect(() => {
    if (activeSubagent) setExpanded(true);
  }, [activeSubagent]);

  // Collapse when clicking anywhere outside the bar (keeps any typed text).
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [expanded]);

  const submit = () => {
    const trimmed = text.trim();
    const targetPath = fa.attached?.path;
    if (!trimmed && !targetPath) return;
    if (connState === 'ready') {
      // A file with no question defaults to a plain-language summary; the engine reads the file
      // (targetPath) and its holistic-intent fallback surfaces the contents. targetPath also forces
      // the engine's 'task' route, so an attached file is never misread as a chat turn.
      //
      // If a subagent is active, the request is composed as that persona: its name + role frame who
      // is answering, its instructions set the standing brief, and the user's typed task (or, if the
      // box is empty, the instructions themselves) is the actual ask. With no active subagent this is
      // just the plain task, so the normal path is unchanged.
      const task = trimmed || activeSubagent?.instructions || 'Summarize this in plain language.';
      const request = activeSubagent
        ? `You are "${activeSubagent.name}"${activeSubagent.role ? `, ${activeSubagent.role}` : ''}.\n${activeSubagent.instructions}\n\n${task}`.trim()
        : task;
      // Record the user's turn in the chat transcript BEFORE submitting -- submitRequest -> beginRequest
      // opens the matching assistant turn, so ordering here gives "you ask, the CLI answers" in the view.
      // We show the plain task (not the persona-composed request) so the bubble reads as what you typed.
      appendUserMessage(task);
      submitRequest(request, targetPath);
      clearActiveSubagent();
      setSection('activity');
      say('On it. Follow along in the panel. ⚙️');
      setBubble(true);
      setText('');
      fa.clear();
      setExpanded(false);
    } else {
      // Honest: no engine to deliver to. Don't fake work -- nudge, keep the text + the open box.
      say("I'm not connected yet. Start the engine, then ask me. 😴");
      setBubble(true);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setExpanded(false);
      return;
    }
    // Enter submits; Shift+Enter makes a newline. Cmd/Ctrl+Enter always submits.
    if (e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 26,
        left: EDGE_INSET,
        right: EDGE_INSET,
        zIndex: 90,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <motion.div
        ref={wrapRef}
        layout
        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
        style={{
          pointerEvents: 'auto',
          width: expanded ? 'min(560px, 100%)' : 380,
          background: theme.ui.panel,
          backdropFilter: 'blur(14px)',
          // Open: the border picks up a faint accent tint + glow so the compose card reads as the
          // focused, "live" surface. Collapsed: a quiet hairline pill that doesn't shout.
          border: `1.5px solid ${expanded ? `${theme.ui.accent}55` : theme.ui.line}`,
          borderRadius: expanded ? 22 : 999,
          boxShadow: expanded ? `${SHADOW.prompt}, 0 0 0 4px ${theme.ui.accent}1f` : SHADOW.prompt,
          overflow: 'hidden',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {expanded ? (
            <motion.div key="open" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: 14 }}>
              {/* Header: fox + title on the left, an honest connection chip on the right. The chip is
                  a colored dot + label so "can this actually send?" is answered before you type. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🦊</span>
                <span style={{ flex: 1, fontFamily: FONT.display, fontWeight: 800, fontSize: 14, color: theme.ui.ink }}>Ask Crash</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 9px 3px 7px',
                    borderRadius: 999,
                    background: theme.ui.chipBg,
                    border: `1px solid ${theme.ui.line}`,
                    fontFamily: FONT.body,
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 0.2,
                    color: theme.ui.inkSoft,
                  }}
                >
                  <motion.span
                    animate={ready ? { scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 1 }}
                    transition={ready ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                    style={{ width: 7, height: 7, borderRadius: 999, background: status.dot, boxShadow: ready ? `0 0 7px ${status.dot}` : 'none' }}
                  />
                  {status.label}
                </span>
              </div>
              {/* Active-persona chip: shown when the user clicked "Use" on a subagent. The next request
                  is composed as this persona (see submit). The x clears it and drops back to a plain
                  Ask. Tinted with the teal "yours/local" tokens to match the Agent tab's affordances. */}
              {activeSubagent && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    marginBottom: 10,
                    padding: '4px 6px 4px 11px',
                    borderRadius: 999,
                    background: theme.ui.tealSoft,
                    border: `1px solid ${theme.ui.teal}55`,
                    fontFamily: FONT.body,
                    fontWeight: 800,
                    fontSize: 12,
                    color: theme.ui.teal,
                  }}
                >
                  As {activeSubagent.name}
                  <button
                    type="button"
                    onClick={clearActiveSubagent}
                    aria-label={`Stop using ${activeSubagent.name}`}
                    style={{
                      display: 'inline-grid',
                      placeItems: 'center',
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: 'none',
                      background: 'transparent',
                      color: theme.ui.teal,
                      fontFamily: FONT.body,
                      fontWeight: 800,
                      fontSize: 14,
                      lineHeight: 1,
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              <textarea
                ref={areaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={3}
                placeholder={
                  activeSubagent
                    ? `Ask ${activeSubagent.name} to...`
                    : 'What should Crash do? e.g. explain how photosynthesis works'
                }
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: FONT.body,
                  fontSize: 15,
                  lineHeight: 1.5,
                  color: theme.ui.ink,
                }}
              />
              {/* Attached file (basename only -- the absolute path is never shown, mirroring the
                  engine's basename-only citations). Removable via the chip's x. */}
              {fa.attached && (
                <div style={{ marginTop: 10 }}>
                  <FileChip name={fa.attached.name} onRemove={fa.clear} />
                </div>
              )}
              {/* First-ever attach asks consent; on web (no native dialog) the next step is a
                  paste-a-path field. Both render inside the card, so a click never collapses it. */}
              {fa.phase === 'consent' && <FileConsent onAllow={fa.allow} onDismiss={fa.dismiss} />}
              {fa.phase === 'paste' && (
                <PastePathField value={fa.pasted} onChange={fa.setPasted} onConfirm={fa.confirmPaste} onCancel={fa.dismiss} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                {/* The "drop a file in" entry the local user asked for: one-time consent, then a native
                    OS picker (Tauri) or a paste-a-path field (web). The chosen path rides to the engine
                    as targetPath -- it is read in place, never uploaded. */}
                <button
                  type="button"
                  onClick={fa.begin}
                  aria-label="Add a file for Crash to read"
                  style={{
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 11px',
                    borderRadius: 999,
                    border: `1px solid ${theme.ui.line}`,
                    background: theme.ui.chipBg,
                    color: theme.ui.inkSoft,
                    fontFamily: FONT.body,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📎 {fa.attached ? 'Change file' : 'Add a file'}
                </button>
                <span style={{ flex: 1, minWidth: 0, fontFamily: FONT.body, fontSize: 11.5, color: theme.ui.inkFaint }}>
                  {ready ? '⏎ to send · Shift+⏎ new line' : status.hint}
                </span>
                {/* Always clickable: when not ready, submit() runs the honest "not connected" nudge
                    via the fox instead of faking a send. canSend only governs the LOOK (dimmed +
                    not-allowed cursor) so the affordance is truthful without changing the call. */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={canSend ? { y: -1 } : undefined}
                  onClick={submit}
                  aria-label={ready ? 'Send to Crash' : 'Crash is not connected yet'}
                  style={{
                    flex: '0 0 auto',
                    fontFamily: FONT.display,
                    fontWeight: 800,
                    fontSize: 14,
                    color: '#ffffff',
                    border: '1px solid transparent',
                    borderRadius: 12,
                    padding: '8px 18px',
                    cursor: canSend ? 'pointer' : 'not-allowed',
                    opacity: canSend ? 1 : 0.5,
                    backgroundImage: `linear-gradient(180deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
                    boxShadow: canSend ? `0 6px 14px ${theme.ui.accent}66, inset 0 1px 0 rgba(255,255,255,0.18)` : 'none',
                    transition: 'opacity 160ms ease, box-shadow 160ms ease',
                  }}
                >
                  Ask {'✨'}
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              whileHover={{ scale: 1.012 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setExpanded(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                border: 'none',
                cursor: 'text',
                background: 'transparent',
                padding: '12px 14px 12px 16px',
              }}
            >
              {/* Fox with a tiny status dot tucked at its corner -- the at-rest connection cue, so the
                  honest state is visible even collapsed (green pulse = ready, amber = waking, grey = off). */}
              <span style={{ position: 'relative', fontSize: 20, flex: '0 0 auto', lineHeight: 1 }}>
                🦊
                <motion.span
                  animate={ready ? { scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 1 }}
                  transition={ready ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -1,
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: status.dot,
                    border: `1.5px solid ${theme.ui.panelSolid}`,
                    boxShadow: ready ? `0 0 7px ${status.dot}` : 'none',
                  }}
                />
              </span>
              <span style={{ flex: 1, textAlign: 'left', fontFamily: FONT.body, fontSize: 15, color: theme.ui.inkSoft }}>
                Ask Crash anything…
              </span>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: '0 0 auto',
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 16,
                  color: '#ffffff',
                  backgroundImage: `linear-gradient(180deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
                  boxShadow: `0 4px 10px ${theme.ui.accent}66, inset 0 1px 0 rgba(255,255,255,0.2)`,
                }}
              >
                ✨
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
