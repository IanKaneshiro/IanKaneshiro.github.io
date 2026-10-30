---
id: JRN-014
title: An agent delivers a feature through the gates
actor: A coding agent (Claude Code, Cursor, Grok Build) working for Ian
status: active
intents: [INT-010, INT-008]
steps:
  - do: Plans the feature with Ian, and Ian approves the spec change
    behaviors: [GRAPH-009, GRAPH-008, GATE-010]
  - do: Builds it on a branch, running the gate locally
    behaviors: [GATE-001, GATE-013]
  - do: Opens a pull request with gh that names the behaviors it implements
    behaviors: [GATE-018, GATE-011, GATE-017]
  - do: CI runs every gate
    behaviors: [GATE-002, GATE-004, GATE-005, GATE-006, GATE-007, GATE-016, GATE-015]
  - do: Reads the failures and fixes them until everything is green
    behaviors: [GATE-012, GATE-013]
  - do: Can't loosen a gate to get there
    behaviors: [GATE-008, GATE-009, GATE-003]
  - do: Is done when the PR is green, and Ian merges
    behaviors: [GATE-014, GATE-003]
---

This is how the agent's work earns trust: Ian approves the intent up front and the result at the
end, and the gates check everything in between. The first pull request, which sets up the gates
themselves, is the one Ian reviews line by line.
