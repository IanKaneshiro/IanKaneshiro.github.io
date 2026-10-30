---
id: JRN-010
title: Ian asks an agent to add a feature
actor: Ian, talking to a coding agent (Claude Code, Cursor, Grok Build)
status: active
intents: [INT-008]
steps:
  - do: Ian describes the feature in plain words
    behaviors: [GRAPH-009]
  - do: The agent reads the current behavior and the intent behind it
    behaviors: [GRAPH-001, GRAPH-003, GRAPH-008]
  - do: The agent proposes changes to intents, journeys and behaviors, and Ian approves them
    behaviors: [GRAPH-002, GRAPH-010]
  - do: The spec check catches any gaps in the graph
    behaviors: [GRAPH-004, GRAPH-005, GRAPH-006, GRAPH-007]
  - do: The agent delivers it through the gates (JRN-014)
    behaviors: [GATE-011, GATE-014]
---

The agent's workflow is written out in the spec README under "Changing the specs".
