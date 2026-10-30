---
id: JRN-006
title: Ian restyles the identity
actor: Ian, changing the accent color, type scale or spacing
status: active
intents: [INT-006, INT-002]
steps:
  - do: Edits the primitive tokens
    behaviors: [PRIM-001, PRIM-002, PRIM-003, PRIM-004, PRIM-005, PRIM-006, PRIM-007, PRIM-008, PRIM-009, PRIM-010, PRIM-011]
  - do: The semantic roles pick up the change
    behaviors: [SEM-001, SEM-002, SEM-003, SEM-004, SEM-005, SEM-006, SEM-009, SEM-010]
  - do: One build regenerates every output
    behaviors: [TOK-001, TOK-002, TOK-004, TOK-005, TOK-008]
  - do: Mistakes are caught before they ship
    behaviors: [TOK-006, TOK-007, CMP-002, SITE-007]
  - do: Reviews the result in Storybook
    behaviors: [DOCS-004, DOCS-005, DOCS-002]
---

This is the journey the token architecture exists for. If a restyle ever needs edits outside
packages/tokens/src, the layering has leaked.
