# curriculum/

Source-of-truth lesson content for the v0.1 slice. At install/first-run the engine copies
these into the end-user runtime workspace (`Crash/skills/`), where lesson, starter, and
user-authored skills are the same on-disk artifact (spec Section 3.4: "the shelf is the state").

Planned v0.1 lessons (built in a later plan): `ask-my-stuff/` (local RAG) and `summarize-this/`.
Nothing here is a runtime path — the runtime workspace lives on the user's machine, not in the repo.
