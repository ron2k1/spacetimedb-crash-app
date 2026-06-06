// SkillCreatorPanel -- the "make your own super-power" surface. This is a SELECTION of creation
// methods: the user first picks HOW they want to make a skill (tiles), then the chosen method's
// input appears below. Two methods are real and route to the live engine exactly like PromptBar
// does; one is an honest "coming soon" slot that does nothing yet (no fake behavior).
//
// REAL submit path (mock-free): both working methods call submitRequest(text) from the connection
// facade and flip the dashboard to Activity so the user watches the actual run and gets the real
// "save as skill" offer in ActivityPanel. Submit is gated on the live connState the same way
// PromptBar gates it -- with no engine attached we don't pretend; we keep the text and say so.
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTaskStore } from '../../store/taskStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { useFileAccessStore } from '../../store/fileAccessStore';
import { submitRequest } from '../../net/connection';
import { Button, SectionLabel } from '../../ui/primitives';
import { Textarea } from '@/components/ui/8bit-textarea';
import { isTauri, pickFileNative, looksLikePath } from '../../files/attach';
import { FileConsent } from '../../files/FileAttachUI';
import { theme, FONT, SHADOW } from '../../theme';

// A dark, legible input style (NOT the old cream '#fffdf8' field -- that made near-white ink
// illegible). Translucent dark fill + theme ink keeps it on the panel's dark-glass register.
const darkField: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: FONT.body,
  fontSize: 13,
  color: theme.ui.ink,
  background: theme.ui.chipBg,
  border: `1.5px solid ${theme.ui.line}`,
  borderRadius: 12,
  padding: '10px 12px',
  outline: 'none',
};

type MethodId = 'teach' | 'source' | 'guided';

interface Method {
  id: MethodId;
  icon: string;
  title: string;
  short: string; // compact label for the segmented 3-up picker
  blurb: string;
  soon?: boolean;
}

const METHODS: Method[] = [
  {
    id: 'teach',
    icon: '🗣️',
    title: 'Teach in your words',
    short: 'Describe',
    blurb: 'Describe what you want Crash to do. It builds the skill from your description.',
  },
  {
    id: 'source',
    icon: '📎',
    title: 'From a file or page',
    short: 'From a file',
    blurb: 'Point Crash at a file, a link, or a topic and let it learn the skill from that.',
  },
  {
    id: 'guided',
    icon: '🧭',
    title: 'Crash interviews you',
    short: 'Guided',
    blurb: 'Crash asks a few questions and shapes the skill with you, step by step.',
    soon: true,
  },
];

export function SkillCreatorPanel() {
  const connState = useTaskStore((s) => s.connState);
  const setSection = useDashboardStore((s) => s.setSection);

  // One-time "let Crash read my files" consent, shared with PromptBar via the same persisted store.
  const granted = useFileAccessStore((s) => s.granted);
  const grant = useFileAccessStore((s) => s.grant);

  const [method, setMethod] = useState<MethodId>('teach');
  const [teach, setTeach] = useState('');
  const [source, setSource] = useState('');
  // Honest inline "not connected" notice, set only when a submit is attempted while offline.
  const [notice, setNotice] = useState<string | null>(null);
  // Shown when Browse is pressed for the first time, before the native picker opens.
  const [askConsent, setAskConsent] = useState(false);

  const NOT_READY = "Crash isn't connected yet -- start the engine, then try.";

  // The one real submit path, shared by both working methods. Mirrors PromptBar.submit():
  // only sends when connState === 'ready'; otherwise keeps the text and shows an honest notice.
  // No local "made" flag, no canned success -- the real run + save offer live in ActivityPanel.
  const send = (request: string, clear: () => void, targetPath?: string) => {
    const trimmed = request.trim();
    if (!trimmed) return;
    if (connState === 'ready') {
      submitRequest(trimmed, targetPath);
      setSection('activity');
      clear();
      setNotice(null);
    } else {
      setNotice(NOT_READY);
    }
  };

  const submitTeach = () => send(teach, () => setTeach(''));

  // "From a file or page": route by what the input actually is. A real local path goes to the engine
  // as targetPath (it reads the file in place) with generic wording -- the file IS the source, so
  // there is no reason to also narrate the path to the model. A link or topic has no local file to
  // read, so it stays in the request prose, exactly as before. Both share the one gated send().
  const submitSource = () => {
    const ref = source.trim();
    if (!ref) return;
    if (looksLikePath(ref)) {
      send('Learn a new skill from this file and walk me through it.', () => setSource(''), ref);
    } else {
      send(`Learn a new skill from this and walk me through it: ${ref}`, () => setSource(''));
    }
  };

  // Browse the OS file dialog, gated behind the shared one-time consent on first use. The chosen
  // absolute path lands in the source field, where submitSource() detects it (looksLikePath) and
  // sends it as targetPath. Cancel/failure is swallowed so the paste-path fallback is never blocked.
  const browseForFile = async () => {
    if (!granted) {
      setAskConsent(true);
      return;
    }
    const picked = await pickFileNative();
    if (picked) setSource(picked);
  };

  // Consent "Allow": persist the grant, then immediately open the picker (no second click).
  const allowAndBrowse = async () => {
    grant();
    setAskConsent(false);
    const picked = await pickFileNative();
    if (picked) setSource(picked);
  };

  const onTeachKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitTeach();
    }
  };

  const onSourceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitSource();
    }
  };

  const pickMethod = (id: MethodId) => {
    if (id === 'guided') return; // honest: nothing to open yet
    setMethod(id);
    setNotice(null);
  };

  const active = METHODS.find((m) => m.id === method) ?? METHODS[0];

  return (
    <div>
      {/* Hero header -- a tight title row instead of a tall banner card, so the distinctive compose
          surface below rises into first paint rather than sitting under a big block of copy. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span
          style={{
            flex: '0 0 auto',
            width: 40,
            height: 40,
            borderRadius: 13,
            display: 'grid',
            placeItems: 'center',
            fontSize: 21,
            background: `linear-gradient(180deg, ${theme.ui.accentSoft}, rgba(167,139,250,0.05))`,
            border: `1px solid ${theme.ui.accent}33`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          ✨
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 17, color: theme.ui.ink, lineHeight: 1.15 }}>
            Make a new skill
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 12, color: theme.ui.inkSoft }}>
            It runs live, then you save what it learns.
          </div>
        </div>
      </div>

      {/* Segmented 3-up method picker: a compact pill rail (vs. a tall vertical stack). Each segment
          is a real toggle; "guided" stays a dimmed, non-clickable "Soon" segment (no fake behavior). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          padding: 5,
          marginBottom: 4,
          borderRadius: 16,
          background: 'rgba(0,0,0,0.22)',
          border: `1px solid ${theme.ui.line}`,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
        }}
      >
        {METHODS.map((m) => {
          const selected = !m.soon && method === m.id;
          return (
            <button
              key={m.id}
              onClick={m.soon ? undefined : () => pickMethod(m.id)}
              aria-pressed={selected}
              disabled={m.soon}
              title={m.soon ? 'Coming soon' : m.title}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 6px 8px',
                borderRadius: 12,
                cursor: m.soon ? 'default' : 'pointer',
                opacity: m.soon ? 0.5 : 1,
                background: selected
                  ? `linear-gradient(180deg, ${theme.ui.accentSoft}, rgba(167,139,250,0.04))`
                  : 'transparent',
                border: `1px solid ${selected ? `${theme.ui.accent}66` : 'transparent'}`,
                boxShadow: selected ? `inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
                transition: 'background 160ms ease, border-color 160ms ease',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>{m.icon}</span>
              <span
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 800,
                  fontSize: 10.5,
                  letterSpacing: 0.2,
                  textAlign: 'center',
                  lineHeight: 1.15,
                  color: selected ? theme.ui.ink : theme.ui.inkSoft,
                }}
              >
                {m.short}
              </span>
              {m.soon && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    fontFamily: FONT.body,
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    color: theme.ui.teal,
                  }}
                >
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* One-line description of the chosen method, so the segmented rail stays compact but the choice
          is still explained. */}
      <div style={{ fontFamily: FONT.body, fontSize: 12, lineHeight: 1.4, color: theme.ui.inkSoft, margin: '0 4px 14px' }}>
        {active.blurb}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {method === 'teach' ? (
          <motion.div
            key="teach"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <SectionLabel>Teach Crash</SectionLabel>
            {/* The 8bit double-rule textarea is the signature input of this surface, so it gets framed
                as the hero: a labeled glass slab with the retro frame nested inside, intentional rather
                than incidental. The frame uses negative margins (-mx-1.5 / -my-1.5), so the inner pad
                keeps the thick rule off the slab edge and inside the ~360px column. */}
            <div
              style={{
                position: 'relative',
                padding: '16px 16px 14px',
                marginBottom: 12,
                borderRadius: 18,
                backgroundColor: theme.ui.panelSolid,
                backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(0,0,0,0.08))',
                border: `1.5px solid ${theme.ui.line}`,
                boxShadow: `${SHADOW.card}, inset 0 1px 0 rgba(255,255,255,0.06)`,
              }}
            >
              <div
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: theme.ui.accent,
                  marginBottom: 12,
                }}
              >
                In your own words
              </div>
              <Textarea
                value={teach}
                onChange={(e) => setTeach(e.target.value)}
                onKeyDown={onTeachKeyDown}
                rows={4}
                placeholder="e.g. When I paste a recipe, list just the ingredients as a checklist."
              />
            </div>
            <div
              style={{
                fontFamily: FONT.body,
                fontSize: 11.5,
                color: theme.ui.inkFaint,
                margin: '0 2px 10px',
              }}
            >
              ⏎ to send · Shift+⏎ for a new line
            </div>
            <Button variant="primary" full disabled={teach.trim().length === 0} onClick={submitTeach}>
              {teach.trim().length === 0 ? 'Type what to teach Crash' : '✨ Build this skill'}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="source"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <SectionLabel>Point Crash at something</SectionLabel>
            <div
              style={{
                position: 'relative',
                marginBottom: 12,
                borderRadius: 14,
                backgroundColor: theme.ui.panelSolid,
                backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(0,0,0,0.08))',
                border: `1.5px solid ${theme.ui.line}`,
                boxShadow: `${SHADOW.card}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: theme.ui.accent,
                  marginBottom: 10,
                }}
              >
                File · link · topic
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <span
                    aria-hidden
                    style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.7, pointerEvents: 'none' }}
                  >
                    📎
                  </span>
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    onKeyDown={onSourceKeyDown}
                    placeholder="Paste a file path, a link, or a topic"
                    aria-label="File path, link, or topic"
                    style={{ ...darkField, padding: '10px 12px 10px 32px' }}
                  />
                </div>
                {isTauri && (
                  <button
                    type="button"
                    onClick={browseForFile}
                    aria-label="Browse your files"
                    style={{
                      flex: '0 0 auto',
                      background: theme.ui.chipBg,
                      border: `1.5px solid ${theme.ui.line}`,
                      borderRadius: 12,
                      color: theme.ui.ink,
                      fontFamily: FONT.body,
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    📁 Browse
                  </button>
                )}
              </div>
            </div>
            {/* First Browse press asks consent here; Allow persists it and opens the native picker. */}
            {askConsent && <FileConsent onAllow={allowAndBrowse} onDismiss={() => setAskConsent(false)} />}
            <Button variant="primary" full disabled={source.trim().length === 0} onClick={submitSource}>
              {source.trim().length === 0 ? 'Add a file, link, or topic' : '✨ Learn from this'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              background: theme.ui.chipBg,
              border: `1.5px solid ${theme.ui.warn}55`,
              fontFamily: FONT.body,
              fontSize: 13,
              lineHeight: 1.45,
              color: theme.ui.ink,
            }}
          >
            <span style={{ marginRight: 6 }}>🦊</span>
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
