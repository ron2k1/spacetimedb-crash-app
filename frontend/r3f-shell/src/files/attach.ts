// attach.ts -- platform-aware file-attach helpers, shared by every surface that lets the user point
// Crash at a local file (PromptBar, SkillCreatorPanel). Kept pure + framework-free so the path logic
// is unit-testable without a DOM; the one side-effecting bit (the native dialog) is isolated in
// pickFileNative so everything else stays trivially testable.

import { open } from '@tauri-apps/plugin-dialog';

// True only inside the packaged Tauri webview, where the native OS file dialog exists. In the plain
// browser dev preview this is false and surfaces fall back to a paste-the-path field instead. The
// flag never changes after load, so a module-level const is fine.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// The consent copy lives here so EVERY surface asks for permission in the same honest, adult words:
// Crash reads only what you pick, locally, never uploads, and asks before writing. (This mirrors the
// engine's real behavior -- read-only retrieval + a confirm.required gate before any write -- so the
// promise is truthful, not marketing.)
export const CONSENT_TITLE = 'Let Crash read a file?';
export const CONSENT_BODY =
  'Crash reads only the file you choose, right here on your computer. It never uploads your files, and it always asks first before it writes anything.';

// Last path segment, handling BOTH separators: a Windows pick is "C:\\notes\\trip.md", a POSIX pick
// is "/home/you/trip.md", and a user might paste either. Splitting on / or \\ covers both; we drop
// empty segments so a trailing slash doesn't yield "".
export function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

// A cheap "does this look like an absolute local path?" test for the web paste field + the
// SkillCreatorPanel free-text input, so a pasted PATH is sent as targetPath (the engine reads it)
// while a TOPIC or link is left in the request prose. Covers Windows drive (C:\ or C:/), UNC
// (\\server\share), POSIX absolute (/usr/...), and home (~/...). Deliberately NOT exhaustive -- the
// engine is the real authority (a path it can't stat takes the honest "no files" branch); this only
// decides how to route the text, never whether the file exists.
export function looksLikePath(s: string): boolean {
  const t = s.trim();
  return /^[a-zA-Z]:[\\/]/.test(t) || /^\\\\/.test(t) || /^\//.test(t) || /^~[\\/]/.test(t);
}

// Open the native OS file dialog (Tauri only). Returns the chosen absolute path, or null on cancel OR
// any failure -- callers then fall back to the paste-path field so a denied/unavailable dialog can
// never dead-end the user. directory:false picks a single file (the engine reads a directory too, but
// the affordance is file-first to keep the first-run flow concrete).
export async function pickFileNative(): Promise<string | null> {
  try {
    const picked = await open({ multiple: false, directory: false, title: 'Choose a file for Crash to read' });
    return typeof picked === 'string' && picked ? picked : null;
  } catch {
    // Dialog unavailable or denied -- swallow and let the paste-path fallback take over.
    return null;
  }
}
