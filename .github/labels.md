# Recommended labels

This is the canonical label set for the Crash repo. Labels are applied with the `gh` CLI (or
the GitHub UI) rather than committed config, so this file is the source of truth for what the
set should be. The issue templates auto-apply `type:*` and `needs-triage`; the rest are added
during triage and review.

## Label set

| Label | Color | Use for |
|-------|-------|---------|
| `type:bug` | `d73a4a` | Something is broken or behaving incorrectly. Auto-applied by the bug-report template. |
| `type:feat` | `0e8a16` | A new capability or improvement. Auto-applied by the feature-request template. |
| `type:chore` | `fef2c0` | Tooling, dependencies, formatting, CI, or other maintenance with no user-facing behavior change. |
| `area:engine` | `1d76db` | The headless Node engine (`backend/`, `@crash/engine`). |
| `area:r3f` | `5319e7` | The React-three-fiber web renderer (`frontend/r3f-shell/`). |
| `area:unity` | `0052cc` | The Unity 6 parity renderer (`frontend/unity/`). |
| `area:protocol` | `006b75` | The shared socket contract (`protocol/`). Treat changes here as high-care: the engine and both renderers depend on it. |
| `area:deploy` | `c5def5` | CI, the tag-gated release, the installer, and packaging. |
| `good-first-issue` | `7057ff` | Well-scoped, low-context work suitable for a first-time contributor. |
| `needs-triage` | `ededed` | Not yet reviewed or prioritized. Auto-applied by both issue templates; remove once triaged. |

## Applying the set with gh

Run these once to create the labels in the repo. `--force` updates color and description if a
label already exists, so the command is safe to re-run.

```powershell
gh label create "type:bug"          --color d73a4a --description "Something is broken or behaving incorrectly" --force
gh label create "type:feat"         --color 0e8a16 --description "A new capability or improvement" --force
gh label create "type:chore"        --color fef2c0 --description "Tooling, deps, formatting, CI, or maintenance" --force
gh label create "area:engine"       --color 1d76db --description "Headless Node engine (backend/, @crash/engine)" --force
gh label create "area:r3f"          --color 5319e7 --description "React-three-fiber web renderer (frontend/r3f-shell/)" --force
gh label create "area:unity"        --color 0052cc --description "Unity 6 parity renderer (frontend/unity/)" --force
gh label create "area:protocol"     --color 006b75 --description "Shared socket contract (protocol/)" --force
gh label create "area:deploy"       --color c5def5 --description "CI, release, installer, packaging" --force
gh label create "good-first-issue"  --color 7057ff --description "Well-scoped, low-context first contribution" --force
gh label create "needs-triage"      --color ededed --description "Not yet reviewed or prioritized" --force
```

## Conventions

- Every open issue should carry exactly one `type:*` label and at least one `area:*` label
  once triaged.
- `needs-triage` is the default landing state; drop it the moment the issue has a `type:*` and
  an `area:*` and a clear next step.
- `good-first-issue` is additive: it sits alongside a `type:*` and an `area:*`, never replaces
  them.
