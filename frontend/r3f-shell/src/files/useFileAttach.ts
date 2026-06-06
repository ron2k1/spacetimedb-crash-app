// useFileAttach.ts -- a tiny state machine for one "Add a file" control, shared by PromptBar and
// SkillCreatorPanel so both gate on the SAME one-time consent and capture an absolute path the SAME
// way. The hook owns the LOGIC (consent check -> native pick OR web paste -> attached path); each
// surface renders the consent card / paste field / chip in its own layout from this returned state.
//
// Why a hook (not a shared component): the two surfaces have very different layouts (a compact prompt
// pill vs. a roomy creation panel), so sharing the BEHAVIOR while letting each own its PRESENTATION
// keeps both honest and consistent without forcing one cramped component to serve both.
import { useState } from 'react';
import { useFileAccessStore } from '../store/fileAccessStore';
import { isTauri, basename, pickFileNative } from './attach';

export interface Attached {
  path: string; // absolute path, passed to the engine as targetPath (never logged by the engine)
  name: string; // basename, the only thing shown in the chip
}

export type AttachPhase = 'idle' | 'consent' | 'paste';

export interface FileAttach {
  attached: Attached | null;
  phase: AttachPhase;
  pasted: string;
  setPasted: (v: string) => void;
  begin: () => void; // "Add a file" pressed
  allow: () => void; // consent "Allow" pressed
  dismiss: () => void; // consent "Not now" / paste cancel
  confirmPaste: () => void; // web paste field confirmed
  clear: () => void; // remove the attached file
}

export function useFileAttach(): FileAttach {
  const granted = useFileAccessStore((s) => s.granted);
  const grant = useFileAccessStore((s) => s.grant);
  const [attached, setAttached] = useState<Attached | null>(null);
  const [phase, setPhase] = useState<AttachPhase>('idle');
  const [pasted, setPasted] = useState('');

  // The actual pick, platform-split: Tauri opens the native dialog and attaches the result; the web
  // preview reveals a paste-the-path field instead (the local engine reads any absolute path you
  // type, so this is functional, not theater).
  const pick = async () => {
    if (isTauri) {
      const p = await pickFileNative();
      if (p) setAttached({ path: p, name: basename(p) });
      setPhase('idle');
    } else {
      setPhase('paste');
    }
  };

  // "Add a file" pressed: the first time ever, ask for consent; afterwards go straight to the picker.
  const begin = () => {
    if (granted) void pick();
    else setPhase('consent');
  };

  // Consent "Allow": persist it, then immediately proceed to the picker (no second click needed).
  const allow = () => {
    grant();
    void pick();
  };

  const dismiss = () => {
    setPasted('');
    setPhase('idle');
  };

  // Web paste field confirmed: accept a typed absolute path as the attached file.
  const confirmPaste = () => {
    const p = pasted.trim();
    if (!p) return;
    setAttached({ path: p, name: basename(p) });
    setPasted('');
    setPhase('idle');
  };

  const clear = () => setAttached(null);

  return { attached, phase, pasted, setPasted, begin, allow, dismiss, confirmPaste, clear };
}
