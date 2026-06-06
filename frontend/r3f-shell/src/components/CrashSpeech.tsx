// CrashSpeech -- the mounted 2D speech bubble for the guide (Crash, the fox). dialogStore has writers
// (PromptBar, LeftRail, SkillCreatorPanel, and now the run narration) that set { open, prompt }, but
// its only previous reader (DialogBubble) lived inside the retired <Scene> canvas and is no longer
// mounted -- so every line the guide "said" was rendering into the void (a store-without-a-subscriber
// bug). This is that missing consumer: a glass bubble that springs in when the guide speaks and fades
// on its own a few seconds later.
//
// POSITION: the Crash robot mascot now lives ONLY on the login stage -- the dashboard has no on-screen
// robot. So this is a standalone bottom-left corner toast (no speech tail, since there is no robot
// below it to point at): anchored bottom-left (no centering transform), it springs up gently and a
// longer line grows UPWARD + rightward into the clear band over the backdrop, never reaching toward
// the DashboardPanel.
//
// NARRATION: importing net/narration here (and calling installNarration once on mount) wires the
// taskStore -> dialogStore bridge that makes the bubble actually speak during a run. The install is
// idempotent, so mounting CrashSpeech is enough to turn narration on without a second import site.
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDialogStore } from '../store/dialogStore';
import { installNarration } from '../net/narration';
import { theme, FONT, SHADOW } from '../theme';
import { Markdown } from './ui/markdown';

// How long a line stays up before it fades on its own (ms) -- long enough to read a short nudge.
const DISMISS_MS = 6000;

export function CrashSpeech() {
  const open = useDialogStore((s) => s.open);
  const prompt = useDialogStore((s) => s.prompt);
  const setOpen = useDialogStore((s) => s.setOpen);

  // Turn on run narration once, when the bubble first mounts. installNarration() guards against
  // double-wiring, so this is safe under StrictMode's double-invoke and hot reloads.
  useEffect(() => {
    installNarration();
  }, []);

  // Auto-dismiss: when a line opens, start a timer to close it. Keyed on `prompt` too, so a rapid
  // second line resets the clock and gets its own full reading window rather than inheriting the
  // first line's leftover time.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), DISMISS_MS);
    return () => clearTimeout(t);
  }, [open, prompt, setOpen]);

  return (
    <div
      // Standalone bottom-left corner toast (the robot mascot is login-only now, so there is nothing
      // below to anchor a tail to). Anchored by left + bottom (no centering transform); a longer line
      // grows UPWARD + rightward rather than down. pointer-events are off on the wrapper so the cursor
      // passes through to everything but the bubble itself.
      style={{
        position: 'fixed',
        left: 16,
        bottom: 24,
        zIndex: 95,
        width: 'max-content',
        // Cap width so the bubble stays a tidy corner card and never stretches toward the dashboard.
        maxWidth: 300,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {open && prompt && (
          <motion.div
            // Spring up gently from slightly below so the toast rises into view; bottom-left origin
            // keeps the scale anchored to the corner.
            initial={{ opacity: 0, y: 20, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
            style={{
              position: 'relative',
              pointerEvents: 'auto',
              maxWidth: '100%',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: theme.ui.panel,
              backdropFilter: 'blur(14px)',
              border: `1.5px solid ${theme.ui.line}`,
              borderRadius: 18,
              padding: '12px 16px',
              boxShadow: SHADOW.prompt,
              transformOrigin: 'bottom left',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1, flex: '0 0 auto' }}>🦊</span>
            <div style={{ flex: 1, minWidth: 0, fontFamily: FONT.body, fontSize: 14.5, lineHeight: 1.5, color: theme.ui.ink }}>
              <Markdown compact>{prompt}</Markdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
