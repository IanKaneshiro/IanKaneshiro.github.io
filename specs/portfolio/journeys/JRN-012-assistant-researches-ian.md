---
id: JRN-012
title: A visitor's AI assistant researches Ian
actor: An AI agent asked by a recruiter or engineer, "What has Ian Kaneshiro built?"
status: active
intents: [INT-009, INT-001]
steps:
  - do: Is allowed in, and finds /llms.txt
    behaviors: [AGENT-005, AGENT-001]
  - do: Reads the pages as Markdown
    behaviors: [AGENT-002, AGENT-004]
  - do: Pulls out facts about Ian and the projects
    behaviors: [AGENT-003]
---

More and more first contact will go through an assistant. Whatever it reports should be
exactly what a person would read on the site.
