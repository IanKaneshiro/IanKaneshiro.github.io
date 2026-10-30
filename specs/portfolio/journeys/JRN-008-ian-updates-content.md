---
id: JRN-008
title: Ian adds a project or updates the content
actor: Ian
status: active
intents: [INT-007, INT-001]
steps:
  - do: Adds or edits a content entry
    behaviors: [SITE-006, SITE-002, SITE-003]
  - do: Previews it locally
    behaviors: [SHIP-002]
  - do: Merges, and the site deploys
    behaviors: [GATE-002, SHIP-005]
---

This should take minutes and need no component or page code.
