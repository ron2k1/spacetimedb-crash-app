---
name: Bug report
about: Report something in Crash that is broken or behaving incorrectly
title: '[bug] '
labels: ['type:bug', 'needs-triage']
assignees: []
---

<!--
  Thanks for filing a bug. Fill out the sections below.
  Do NOT paste any secret, token, credential, .env value, or the contents of the per-session
  socket token file. If you have a stack trace, scrub absolute paths and any credential first.
-->

## What happened

A clear description of the bug and what you expected to happen instead.

## Area

Which part of the system is affected? Pick the closest one.

- [ ] engine (`backend/`, `@crash/engine`)
- [ ] r3f shell (`frontend/r3f-shell/`)
- [ ] unity (`frontend/unity/`)
- [ ] protocol (`protocol/`)
- [ ] deploy / CI / installer
- [ ] not sure

## Steps to reproduce

1.
2.
3.

## Expected vs actual

- Expected:
- Actual:

## Environment

- OS and version (Windows is the demo target):
- Node version (`node --version`):
- pnpm version (`pnpm --version`):
- Provider in use (Claude Code / Codex / deterministic), if relevant:
- Renderer in use (R3F shell / Unity), if relevant:
- Git commit or branch:

## Logs or error codes

<!--
  Engine error events surface a synthetic CODE, not a message. Paste the code(s) you saw.
  If you include console output, redact absolute paths, tokens, prompts, and credentials.
-->

## Additional context

Screenshots, a short recording, or anything else that helps. For UI bugs, a before/after
screenshot is very helpful.
