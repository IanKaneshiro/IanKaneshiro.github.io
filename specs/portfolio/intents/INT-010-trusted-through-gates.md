---
id: INT-010
title: Agent output is trusted because gates enforce the rules
status: active
---

## Why

Agents write most of the code. Trust doesn't come from Ian reading every line. It comes from
rules that machines check on every pull request, which an agent can't skip or weaken. Ian
reviews the intent (the specs) and the result (a green PR). The gates check everything in
between.

## Looks like

- One gate that runs the same way on a laptop and on every PR.
- Every rule in the specs (types, lint, design-token rules, behaviors, accessibility,
  budgets) is a check that can fail.
- Failures name the file, the rule and the fix, so an agent can repair its own work.
- An agent isn't done until its PR is green. It keeps working while any check fails.
- Specs and gate configuration can only change with Ian's approval.

## Not this

- Rules that only live in a prompt or in AGENTS.md.
- "It passed on my machine."
- Gates an agent can edit, skip or loosen to get to green.
- Ian reading every diff line as the safety net.
