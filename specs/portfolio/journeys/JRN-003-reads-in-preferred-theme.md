---
id: JRN-003
title: A visitor reads in their preferred theme
actor: Any visitor
status: active
intents: [INT-004, INT-002]
steps:
  - do: Arrives with a system light or dark setting
    behaviors: [THEME-001, THEME-004, TOK-003]
  - do: Switches the theme, and the choice is remembered
    behaviors: [THEME-002, THEME-003, KIT-009, THEME-008]
  - do: Their system switches theme while they read
    behaviors: [THEME-005]
---

Dark-first fits the terminal identity, but the visitor's setting wins, and light mode is
held to the same standard.
