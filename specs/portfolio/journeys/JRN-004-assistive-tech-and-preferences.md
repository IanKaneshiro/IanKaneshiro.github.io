---
id: JRN-004
title: A visitor uses a keyboard, a screen reader, reduced motion or no JavaScript
actor: A visitor who relies on assistive tech or has strict browser settings
status: active
intents: [INT-004]
steps:
  - do: Skips to the content and moves around by keyboard
    behaviors: [SITE-011, CMP-009, SEM-011, KIT-010]
  - do: Listens with a screen reader
    behaviors: [KIT-006, KIT-012, KIT-001, KIT-013, KIT-014, THEME-006, CMP-006]
  - do: Prefers reduced motion
    behaviors: [SEM-012, CMP-011, KIT-007]
  - do: Reads with low vision
    behaviors: [SEM-007, SEM-008, QUAL-005, CMP-010]
  - do: Browses with JavaScript turned off
    behaviors: [SITE-008, THEME-007]
---

The same content and the same identity, reached in a different way. None of these visitors
should get a lesser site.
