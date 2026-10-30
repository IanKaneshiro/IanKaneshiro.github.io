---
id: JRN-009
title: Ian ships a change
actor: Ian, or an agent working for Ian
status: active
intents: [INT-007, INT-005]
steps:
  - do: Builds everything from a clean checkout
    behaviors: [SHIP-001, SHIP-003]
  - do: Opens a pull request and the gate runs
    behaviors: [GATE-001, GATE-002, QUAL-001, QUAL-002, QUAL-006, DOCS-007, GRAPH-006]
  - do: Merges, and the site and Storybook deploy
    behaviors: [SHIP-005, SHIP-006, SHIP-008]
---
