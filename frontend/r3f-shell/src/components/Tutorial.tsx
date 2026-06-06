// Tutorial -- the first-run welcome overlay. The very first time someone opens Crash, this fades up
// over the dashboard and walks them, in plain warm language, through what the app is and how to use
// it: Crash is a marketplace for AI agents, skills, workflows, and tools; you ask it things in the
// prompt bar, it makes a plan and runs it live so you can watch, every paid tool call is metered with
// x402 so an agent only spends what you allow, and the left rail is how you move between areas. It
// shows ONCE -- tutorialStore persists a "seen" flag to localStorage -- and offers both a Skip (top)
// and a Got it (final step) to dismiss.
//
// Tone: plain, warm, and adult-simple. It explains things clearly for someone non-technical WITHOUT
// talking down to them -- no "for kids", no "explain like you're 10". Crash is the character; the fox
// emoji stays. Styling is the same dark-violet glass as the rest of the chrome (theme.ui.* + FONT).
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTutorialStore } from '../store/tutorialStore';
import { useTaskStore } from '../store/taskStore';
import { theme, FONT, SHADOW } from '../theme';

// Each card is one idea, in order. `art` is a friendly emoji glyph (not decoration -- it labels the
// idea), `title` is the short headline, `body` is one or two plain sentences. A card may instead
// carry `tips` -- a short list of how-to pointers rendered as a tight vertical list (used by the
// provider-aware card, which teaches getting good answers from the user's specific CLI).
type Card = { art: string; title: string; body?: string; tips?: { name: string; line: string }[] };

// Provider-specific guidance for getting great answers, used VERBATIM from Anthropic (Claude Code)
// and OpenAI (Codex). Kept as data so the second card can pick the right set from the live provider.
const CLAUDE_TIPS: { name: string; line: string }[] = [
  { name: 'Say it plainly', line: 'Ask in normal words. There is no special wording to learn.' },
  { name: 'Give the why', line: 'A sentence on what it is for helps Claude aim the answer.' },
  { name: 'One step at a time', line: 'For anything involved, ask for numbered steps.' },
  { name: 'Show an example', line: 'One example of what you want beats a long description.' },
  { name: 'Start broad, then narrow', line: 'Begin general, then refine with a follow-up.' },
  { name: 'Ask, then adjust', line: 'Read the first answer and tell it what to change.' },
];

const CODEX_TIPS: { name: string; line: string }[] = [
  { name: 'Be specific', line: 'Spell out exactly what you want; details beat vagueness.' },
  { name: 'State the must-haves', line: 'Name anything that must not be left out.' },
  { name: 'Ask for a plan', line: 'Have it outline the steps before it does the work.' },
  { name: 'Say what done looks like', line: 'Describe the finished result you expect.' },
  { name: 'Show a sample', line: 'Give one example to copy the shape of.' },
  { name: 'Refine as you go', line: 'Tweak with a quick follow-up after the first try.' },
];

export function Tutorial() {
  const dismiss = useTutorialStore((s) => s.dismiss);
  // Resolve the effective provider from the live store -- prefer the engine-resolved active provider,
  // fall back to the requested provider, and default to Claude (Anthropic) when neither is known yet.
  // Mirrors how ProviderSwitcher reads these selectors.
  const authActive = useTaskStore((s) => s.authActive);
  const provider = useTaskStore((s) => s.provider);
  const isCodex = (authActive ?? provider) === 'codex';
  const [i, setI] = useState(0);

  // Cards are built in-component (not a module const) because the second card's tips depend on the
  // live provider; useMemo keeps the array stable while the provider is unchanged.
  const CARDS = useMemo<Card[]>(
    () => [
      {
        art: '🦊',
        title: 'Welcome to Crash',
        body: 'Crash is a live market for AI agents, skills, workflows, and tools. People and agents list them here, and you can buy and run them in plain words, one clear step at a time.',
      },
      {
        art: '💬',
        title: 'Just ask',
        body: 'Type whatever you need into the prompt bar at the bottom. A real request in everyday language is all it takes. There is no special wording to learn.',
      },
      {
        // Placed second because it is about HOW to ask. Title + tips come from the active provider.
        art: '💡',
        title: isCodex ? 'Getting great answers from Codex' : 'Getting great answers from Claude',
        tips: isCodex ? CODEX_TIPS : CLAUDE_TIPS,
      },
      {
        art: '🗺️',
        title: 'Watch it work',
        body: 'Pick an agent or tool and Crash makes a short plan, then runs it live so you can follow along. You see each step as it happens, so it never feels like a black box.',
      },
      {
        art: '⭐',
        title: 'You set the spending',
        body: 'Every paid tool call is metered with x402, so an agent only ever spends what you allow. Set a limit and it stops there -- no surprise bills.',
      },
      {
        art: '🧭',
        title: 'Find your way around',
        body: 'The rail on the left moves you between areas: Skills you own, Create to list something new, Agent to build subagents, and Activity to see what has run.',
      },
    ],
    [isCodex],
  );

  const last = i === CARDS.length - 1;
  const card = CARDS[i];

  const next = () => (last ? dismiss() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  return (
    <div
      // Full-screen scrim over the dashboard. Dark, slightly blurred so the live stage shows faintly
      // behind the card without competing with it. Above the chrome (zIndex 200) but a normal overlay.
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(6,4,14,0.62)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        style={{
          position: 'relative',
          width: 'min(460px, 100%)',
          background: theme.ui.panel,
          backdropFilter: 'blur(16px)',
          border: `1.5px solid ${theme.ui.line}`,
          borderRadius: 22,
          boxShadow: SHADOW.panel,
          padding: 26,
          fontFamily: FONT.body,
        }}
      >
        {/* Skip -- always available, top-right, quiet styling so it doesn't compete with Got it. */}
        <button
          onClick={dismiss}
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: FONT.body,
            fontSize: 13,
            fontWeight: 700,
            color: theme.ui.inkFaint,
          }}
        >
          Skip
        </button>

        {/* Card body cross-fades as you step through, so each idea feels like its own page. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 34,
                marginBottom: 16,
                background: theme.ui.accentSoft,
                boxShadow: `inset 0 0 0 2px ${theme.ui.accent}55`,
              }}
            >
              {card.art}
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: FONT.display,
                fontSize: 22,
                fontWeight: 800,
                color: theme.ui.ink,
                letterSpacing: 0.2,
              }}
            >
              {card.title}
            </h2>
            {card.tips ? (
              // Tip cards render a tight vertical list: each row leads with the bold name (ink),
              // then the plain guidance line (inkSoft). Reads cleanly at the 460px card width.
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '12px 0 0' }}>
                {card.tips.map((tip) => (
                  <div key={tip.name} style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <span style={{ fontFamily: FONT.body, fontWeight: 800, color: theme.ui.ink }}>
                      {tip.name}
                    </span>
                    <span style={{ color: theme.ui.inkSoft }}>: {tip.line}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  margin: '10px 0 0',
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: theme.ui.inkSoft,
                }}
              >
                {card.body}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer: step dots on the left, navigation on the right. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 26,
          }}
        >
          {/* Progress dots -- the active one is wider + accent, the rest are faint, so the user can
              see how far along they are at a glance. */}
          <div style={{ display: 'flex', gap: 7 }}>
            {CARDS.map((_, d) => (
              <span
                key={d}
                style={{
                  width: d === i ? 20 : 7,
                  height: 7,
                  borderRadius: 4,
                  background: d === i ? theme.ui.accent : theme.ui.line,
                  transition: 'width 0.2s ease, background 0.2s ease',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Back appears from the second card on. */}
            {i > 0 && (
              <button
                onClick={back}
                style={{
                  border: `1.5px solid ${theme.ui.line}`,
                  background: theme.ui.chipBg,
                  cursor: 'pointer',
                  fontFamily: FONT.body,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: theme.ui.inkSoft,
                  padding: '9px 14px',
                  borderRadius: 12,
                }}
              >
                Back
              </button>
            )}
            {/* Primary action: advance, or finish on the last card. */}
            <button
              onClick={next}
              style={{
                border: 'none',
                cursor: 'pointer',
                fontFamily: FONT.body,
                fontSize: 13.5,
                fontWeight: 800,
                color: '#ffffff',
                padding: '9px 18px',
                borderRadius: 12,
                background: `linear-gradient(135deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
                boxShadow: `0 8px 20px ${theme.ui.accentDeep}55`,
              }}
            >
              {last ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
