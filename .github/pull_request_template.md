<!--
Agents: draft this with `bun run pr:body > pr.md`, which fills in every section it can from the code.
Write the sections it leaves as prompts, then open the pull request with `gh pr create --body-file pr.md`.
The pr-trace check fails until Summary, How it was verified and Review guide have content (GATE-019).
-->

## Summary

<!-- What this does and why, in 2 to 4 sentences. Name the intent it serves. -->

## Behaviors

<!-- The behavior IDs this implements, with their status before and after (GATE-011). Each one's scenario must pass. -->

| ID | Behavior | Before → after |
|---|---|---|

## Spec trace

<!-- The intents and journeys these behaviors serve (bun run specs:trace <ID>). -->

## What changed

<!-- Files by area, with a line per area on what changed and why. -->

## How it was verified

<!-- The gate's results (bun run gate), behavior coverage before and after, and anything else you checked. -->

## Decisions

<!-- Choices you made and the alternatives you rejected. Delete this section if there were none. -->

## Protected changes

<!-- Files that need Ian's owner-approved label, and why each had to change. "None." if there are none. -->

## Dependencies

<!-- Every dependency this adds, with why it's needed (GATE-017). "None." if there are none. -->

## Risks and follow-ups

<!-- What could break, what's deferred, open spec questions. Delete this section if there are none. -->

## Review guide

<!-- Where to start reading and in what order. Point at the riskiest change first. -->
