# frontend/

User-facing renderers. Both are clients of the `@crash/protocol` socket contract; neither
holds product logic.

- `r3f-shell/` -- Tauri 2 + React 19 + react-three-fiber desktop shell. The shipped product
  and the 6/1 demo: it hosts the interactive Crash robot and the dashboard surfaces (Skills,
  Create, Power-Ups, Activity). pnpm workspace member `@crash/r3f-shell`.
- `unity/` -- Unity 6 (6000.4.9f1, URP 17.4.0) parity client. A second renderer that proves the
  engine is face-agnostic, not the shipped face. Not a pnpm member (C# project); consumes the
  hand-mirrored `protocol/Protocol.cs`.
