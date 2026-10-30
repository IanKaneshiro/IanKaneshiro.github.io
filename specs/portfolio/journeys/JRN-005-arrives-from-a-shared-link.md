---
id: JRN-005
title: A visitor arrives from a shared link or a search
actor: Someone who saw the link on LinkedIn, in a chat, or in search results
status: active
intents: [INT-001, INT-005]
steps:
  - do: Sees a rich preview where the link was shared
    behaviors: [SITE-010]
  - do: The page loads fast and nothing tracks them
    behaviors: [QUAL-001, QUAL-002, QUAL-003, QUAL-004, CMP-005]
  - do: Uses whatever browser they have
    behaviors: [QUAL-006]
  - do: Follows an old or mistyped link
    behaviors: [SITE-009]
---

The first impression happens before the page loads: the preview card, then the speed.
