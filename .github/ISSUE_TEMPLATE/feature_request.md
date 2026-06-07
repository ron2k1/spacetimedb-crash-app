---
name: Feature request
about: Propose a new capability or an improvement for Crash
title: '[feat] '
labels: ['type:feat', 'needs-triage']
assignees: []
---

<!--
  Thanks for the idea. The clearer the problem statement, the faster it can be triaged.
  Keep it ASCII only (no emoji, box-drawing, or smart quotes), matching the repo convention.
-->

## Problem

What problem are you trying to solve, or what is missing today? Describe the user need, not
just the solution you have in mind.

## Proposed solution

What you would like to see happen. Be as concrete as you can.

## Area

Which part of the system would this touch? Pick the closest one(s).

- [ ] engine (`backend/`, `@crash/engine`)
- [ ] r3f shell (`frontend/r3f-shell/`)
- [ ] unity (`frontend/unity/`)
- [ ] protocol (`protocol/`)
- [ ] deploy / CI / installer
- [ ] docs

## Protocol impact

<!-- protocol/src/events.ts is the frozen contract (35 event types, PROTOCOL_VERSION 3). -->

- [ ] This needs NO protocol change.
- [ ] This would need a new or changed event shape (describe it below; it must be reviewed before the contract changes).

## Alternatives considered

Other approaches you thought about and why you set them aside.

## Additional context

Mockups, links to related issues or specs, or any other detail. For a UI idea, a sketch or
reference screenshot helps a lot.
