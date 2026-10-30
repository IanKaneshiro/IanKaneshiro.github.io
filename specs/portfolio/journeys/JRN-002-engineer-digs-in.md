---
id: JRN-002
title: An engineer digs into the work
actor: A frontend or design-systems engineer, often an interviewer
status: active
intents: [INT-003, INT-002]
steps:
  - do: Opens a project's source or live demo
    behaviors: [SITE-002, KIT-002]
  - do: Follows the footer link to the Storybook
    behaviors: [KIT-011, SHIP-005, DOCS-006]
  - do: Browses components in light and dark
    behaviors: [DOCS-001, DOCS-002, DOCS-003, KIT-001]
  - do: Inspects the tokens and their contrast
    behaviors: [DOCS-004, DOCS-005, PRIM-003, SEM-007]
  - do: Tries the library on a plain HTML page
    behaviors: [CMP-004, CMP-001, CMP-003, CMP-007, CMP-008]
---

This visitor is judging craft. The Storybook and the component APIs are the evidence, so
they need to be easy to reach from the site and good under close inspection.
