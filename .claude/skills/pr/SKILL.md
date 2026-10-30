---
name: pr
description: Open or update a pull request in this repo the way Ian reviews them. Drafts the description with bun run pr:body, writes the summary, decisions, risks and review guide, opens it with gh, then watches the gate and fixes failures until every check is green. Use when the work on a branch is ready for review, when asked to open, update or describe a PR, or to write a PR description.
---

# Open a pull request

Ian reviews intent and results, not every line, so the description has to carry the detail:
what the work does and why, which behaviors it makes pass, how it was verified, and where to
look first. The gate enforces the shape (GATE-011, GATE-017, GATE-019).

## 1. Make sure the branch is ready

- You're on a feature branch, not `main`.
- Every commit message starts with the behavior ID it implements.
- `bun run gate` passes, apart from the checks that need a pull request (pr-trace,
  dependencies, protected-paths), which show as skipped.

## 2. Draft the description

```bash
bun run pr:body --out /tmp/pr-body.md
```

This runs the gate and the scenarios on this branch and on main, then fills in the facts: the
behaviors that are new or changed and what they serve, the files to review closely, the gate result
with behavior coverage before → after, and any added dependencies.

## 3. Write the prompts it leaves

Keep it short. Ian reads this to decide where to look, not to relive the work. Read the diff
(`git diff origin/main...`) first.

- **Summary**: 2 or 3 sentences. What it does and why. Lead with the outcome.
- **Review guide**: where to start and what deserves the closest look, riskiest first. A short
  numbered list of files or functions. The "Review closely" line is generated; keep it.
- **Verification**: keep the generated line. Add only what goes beyond the gate (mutation tests,
  screenshots, manual runs), as one line each. Delete the prompt if there's nothing.
- **Notes**: only decisions, risks or follow-ups Ian should know about, as one bullet each. Delete
  the section if there are none.
- **Dependencies**: one reason per package, if the section is there.

Don't add sections, file tables or per-check results: GitHub's Files and Checks tabs already show
them. Be specific and honest. If something wasn't verified, say so.

End the description with the attribution line from your system prompt, if there is one.

## 4. Open it and get it green

```bash
bun run agent:push
bun run agent:gh -- pr create --base main --title "<behavior IDs or area>: <what it does>" --body-file /tmp/pr-body.md
gh pr checks <number> --watch
```

If a check fails, read the gate's summary comment on the pull request, fix the code,
`bun run agent:push`, and update the description if the facts changed (`bun run pr:body` again,
then `bun run agent:gh -- pr edit <number> --body-file ...`). Never loosen a gate, and never add
labels or merge. Ian approves and merges.

## 5. Report

Give Ian the pull request link, each check's status, and what's waiting on Ian: the approval,
plus any protected changes to review closely.
