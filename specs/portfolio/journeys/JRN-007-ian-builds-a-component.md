---
id: JRN-007
title: Ian builds a new component
actor: Ian, or an agent working for Ian
status: active
intents: [INT-003, INT-006]
steps:
  - do: Creates it following the library's conventions
    behaviors: [CMP-001, CMP-002, CMP-003, CMP-006, CMP-007, CMP-008, TOK-005]
  - do: Documents and tests it in Storybook
    behaviors: [DOCS-001, DOCS-003, DOCS-007, CMP-010]
  - do: Uses it on a page
    behaviors: [SITE-007, CMP-005]
---

A new component is added only when a page needs it (see INT-003).
