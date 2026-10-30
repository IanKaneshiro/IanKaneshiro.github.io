---
id: JRN-013
title: An engineer sees how the site was built
actor: An engineer curious about spec-driven, agent-assisted development
status: active
intents: [INT-003, INT-008]
steps:
  - do: Opens "How this site was built" from the footer
    behaviors: [KIT-011, SITE-014]
  - do: Follows an intent down to its journeys and behaviors
    behaviors: [SITE-014, GRAPH-007]
  - do: Opens a behavior's Gherkin in the source repo
    behaviors: [GRAPH-001]
---
