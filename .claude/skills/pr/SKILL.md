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

This runs the gate and the scenarios on this branch and on main, then fills in the facts:
- **Behaviors**: every behavior that now passes, with its status before and after.
- **Spec trace**: the intents and journey steps those behaviors serve.
- **What changed**: files grouped by area, with lines added and removed.
- **How it was verified**: each check's result and behavior coverage before and after.
- **Protected changes** and **Dependencies**: the files that need Ian's label and the packages added.

## 3. Write the prompts it leaves

Replace every `<!-- ... -->` prompt with real content. Read the diff (`git diff origin/main...`)
and the spec trace (`bun run specs:trace <ID>`) first.

- **Summary**: 2 to 4 sentences. What it does, why, and the intent it serves. Lead with the
  outcome, not the file list.
- **What changed**: one line per area saying what changed and why, where file names don't say it.
- **How it was verified**: add anything beyond the gate. Mutation tests (break the code and show
  the scenario fails), screenshots for anything visual, and manual runs with their output.
- **Decisions**: choices that weren't obvious, and the alternatives you rejected. Delete the
  section if there were none.
- **Protected changes**: one reason per file.
- **Dependencies**: one reason per package.
- **Risks and follow-ups**: what could break, what's deferred, spec questions for Ian. Delete the
  section if there are none.
- **Review guide**: where Ian should start reading and in what order, riskiest change first.

Be specific and honest. If something wasn't verified, say so. Don't pad.

End the description with the attribution line from your system prompt, if there is one.

## 4. Open it and get it green

```bash
gh pr create --base main --title "<behavior IDs or area>: <what it does>" --body-file /tmp/pr-body.md
gh pr checks <number> --watch
```

If a check fails, read the gate's summary comment on the pull request, fix the code, push, and
update the description if the facts changed (`bun run pr:body` again, then
`gh pr edit <number> --body-file ...`). Never loosen a gate, and never add labels or merge.
Only Ian does that.

## 5. Report

Give Ian the pull request link, each check's status, and anything waiting on Ian (usually the
`owner-approved` label for protected changes).
