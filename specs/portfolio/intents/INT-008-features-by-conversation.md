---
id: INT-008
title: Features are added by talking to an agent, guided by the spec graph
status: active
---

## Why

Ian works spec-first with coding agents. When Ian asks for a feature, the agent should
find the intents, journeys and behaviors it touches, see what exists and why, and then
propose a change to all three layers before any code.

## Looks like

- Every behavior traces to a journey and an intent, with no orphans.
- An agent can search the graph, trace any node and see what else shares a journey.
- A spec change is proposed and approved before it's implemented.

## Not this

- Behaviors added with no stated reason, or intents that nothing serves.
- Agents editing specs and code in one step without review.
