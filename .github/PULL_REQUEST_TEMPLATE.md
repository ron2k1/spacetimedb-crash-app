<!--
  Crash pull request template.
  Fill out each section. Delete the guidance comments before submitting if you like.
  See CONTRIBUTING.md for branch naming, the local gate, and the security rules.
-->

## Summary

<!-- What does this PR do, and why? One or two sentences. The diff shows the "what";
     use this space for the "why" a reviewer cannot infer. -->

## Linked issue or spec

<!-- Reference the issue or design doc this closes or advances, e.g. "Closes #12" or
     "Implements docs/superpowers/specs/...". Put "n/a" if there is genuinely none. -->

- Closes:

## Type of change

<!-- Tick all that apply. -->

- [ ] feat (new capability)
- [ ] fix (bug fix)
- [ ] chore (tooling, deps, formatting, maintenance)
- [ ] refactor (no behavior change)
- [ ] docs

## Area

<!-- Tick the part(s) of the system this touches. -->

- [ ] engine (`backend/`, `@crash/engine`)
- [ ] r3f shell (`frontend/r3f-shell/`)
- [ ] unity (`frontend/unity/`)
- [ ] protocol (`protocol/`)
- [ ] deploy / CI / installer
- [ ] docs only

## How tested

<!-- Show the gate is green. Paste the commands you ran (and that they passed). -->

- [ ] `pnpm --filter @crash/protocol run build` (protocol dist built)
- [ ] `pnpm run typecheck`
- [ ] `pnpm run test`
- [ ] `cargo test --manifest-path frontend/r3f-shell/src-tauri/Cargo.toml --locked` (if the Tauri shell crate changed)
- [ ] `pnpm exec prettier --write` on any new files (format clean)

<!-- Add anything manual: what you ran the engine against, what you saw in the renderer, etc. -->

## Screenshots or recording (UI changes)

<!-- Required for any visible change to the R3F shell or Unity client. Show before and after
     if you changed existing UI. Drag images directly into this box. Put "n/a" for non-UI changes. -->

## Protocol impact

<!-- protocol/src/events.ts is the frozen contract (35 event types, PROTOCOL_VERSION 3). -->

- [ ] This PR does NOT change any event shape or `protocol/`.
- [ ] This PR changes the protocol AND updates `Protocol.cs`, the affected example, bumps `PROTOCOL_VERSION`, and the drift-guard test passes.

## Security checklist

<!-- These are hard rules. See CONTRIBUTING.md > Security rules. -->

- [ ] No secret, token, credential, or `.env` value is committed or printed anywhere.
- [ ] The per-session socket token is never read, logged, or bundled.
- [ ] Error paths emit a synthetic `code` only, never a message, stack, prompt, env value, or response body.
- [ ] Any new third-party asset is permissively licensed and its attribution is recorded in `CREDITS.md`.
- [ ] Every file I added or edited is ASCII only (no emoji, box-drawing, smart quotes, or banners).

## Reviewer checklist

<!-- For the reviewer to confirm before merge. -->

- [ ] Branch is `feat/` `fix/` or `chore/` and targets `main`.
- [ ] Commits are atomic with clear conventional-commit messages.
- [ ] The gate is green in CI (`quick-check`: typecheck + test on Ubuntu, `cargo test` on Windows).
- [ ] Scope matches the linked issue; no unrelated drive-by changes.
