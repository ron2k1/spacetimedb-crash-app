// FileAttachUI.tsx -- the three shared visual atoms of the file-attach flow, so PromptBar and
// SkillCreatorPanel render the SAME consent card, the SAME attached-file chip, and (on web) the SAME
// paste-a-path field. Keeping these here -- rather than re-styling them per surface -- is what stops
// the consent promise from drifting into two slightly different wordings, which on a permission
// prompt would be a real trust bug, not a cosmetic one.
import { motion } from 'motion/react';
import { Button } from '../ui/primitives';
import { CONSENT_TITLE, CONSENT_BODY } from './attach';
import { theme, FONT } from '../theme';

// The one-time consent card. Honest, adult copy (from attach.ts) describing exactly what Crash does
// with a chosen file: reads it locally, never uploads, asks before writing. "Allow" both records the
// consent and proceeds to the picker; "Not now" backs out leaving nothing attached.
export function FileConsent({ onAllow, onDismiss }: { onAllow: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{
        marginTop: 10,
        padding: 13,
        borderRadius: 14,
        background: theme.ui.chipBg,
        border: `1.5px solid ${theme.ui.accent}44`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 15 }}>🔒</span>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 13.5, color: theme.ui.ink }}>{CONSENT_TITLE}</span>
      </div>
      <div style={{ fontFamily: FONT.body, fontSize: 12.5, lineHeight: 1.5, color: theme.ui.inkSoft, marginBottom: 11 }}>{CONSENT_BODY}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={onAllow}>
          Allow
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </motion.div>
  );
}

// The attached-file chip: a paper icon + the basename (truncated -- the full absolute path is never
// shown, mirroring the engine's basename-only citations) + a remove button. onRemove clears it.
export function FileChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        maxWidth: '100%',
        padding: '5px 7px 5px 10px',
        borderRadius: 999,
        background: theme.ui.accentSoft,
        border: `1px solid ${theme.ui.accent}3a`,
        fontFamily: FONT.body,
        fontSize: 12,
        fontWeight: 700,
        color: theme.ui.ink,
      }}
    >
      <span aria-hidden style={{ fontSize: 13, flex: '0 0 auto' }}>
        📄
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        style={{
          flex: '0 0 auto',
          width: 18,
          height: 18,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.10)',
          color: theme.ui.inkSoft,
          fontSize: 13,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </span>
  );
}

// The web fallback when there is no native dialog (plain browser preview): a field to paste an
// absolute path. This is genuinely functional -- the engine runs on THIS machine and reads any
// absolute path the user types -- so it is an honest fallback, not a placeholder. Enter confirms,
// Esc cancels.
export function PastePathField({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 10 }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onConfirm();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Paste the full path to a file"
        aria-label="Full path to a file"
        style={{
          flex: 1,
          minWidth: 0,
          boxSizing: 'border-box',
          fontFamily: FONT.body,
          fontSize: 12.5,
          color: theme.ui.ink,
          background: theme.ui.chipBg,
          border: `1.5px solid ${theme.ui.line}`,
          borderRadius: 12,
          padding: '9px 12px',
          outline: 'none',
        }}
      />
      <Button variant="primary" onClick={onConfirm} disabled={value.trim().length === 0}>
        Add
      </Button>
    </div>
  );
}
