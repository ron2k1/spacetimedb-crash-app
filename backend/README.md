# backend/ -- @crash/engine

The headless engine host: a token-gated `127.0.0.1` WebSocket server (per-session token), a
provider-agnostic agent loop (Claude Code or OpenAI Codex behind one interface, plus a
deterministic offline mode), local RAG, and skill save/load. It is renderer-agnostic -- it
speaks only the `@crash/protocol` contract, so the R3F + Tauri shell and the Unity parity
client are interchangeable clients.

**Status:** live. The socket server, handshake, and provider-agnostic agent loop are
implemented and covered by the workspace test suite. See the repo root `README.md` for the
run-it steps and `docs/DEPLOYMENT.md` for how the engine ships as a bundled sidecar.
