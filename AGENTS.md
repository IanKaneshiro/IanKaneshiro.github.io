# Working on iankaneshiro.dev

Instructions for every coding agent (Claude Code, Cursor, Grok Build and any other) and for humans.

This repo is Ian Kaneshiro's portfolio: a token-driven StencilJS design system, a Storybook and an
Astro site, built spec-first. **The specs in `specs/portfolio/` are the source of truth**:
intents (why), journeys (who and how) and Gherkin behaviors (what), each with a permanent ID.
Read `specs/portfolio/README.md` once. `bun run specs:review` opens a UI for browsing the graph.

**Trust comes from the gates.** Every rule here is a check that runs on every pull request
(`specs/portfolio/features/gates.feature`). Your work is trusted when the gates are green, not
because someone read every line.

## The loop

1. **Plan with Ian.** Find where the request fits in the graph (`bun run specs:find <words>`), read
   what's around it (`bun run specs:trace <ID>`): the intent's *Why* and *Not this*, the journey's
   steps, the behaviors already there. Then propose the spec change: new or changed behaviors,
   journey steps, or intents. Ian approves it before you build.
2. **Branch.** Never work on `main`. One branch per feature.
3. **Build one behavior at a time.** Write step definitions for its scenario in
   `tests/steps/<area>.steps.ts`, see it fail for the right reason, then write the smallest code
   that makes it pass. Each commit message starts with the behavior ID, e.g. `GATE-008: ...`.
4. **Run the gate:** `bun run gate`. Fix everything it reports.
5. **Open a pull request** with `gh pr create`, using the template. List the behavior IDs it
   implements under `## Behaviors`, and every new dependency with a reason under `## Dependencies`.
6. **Fix until green.** Read the failures (`gh pr checks`, and the gate summary comment on the
   pull request), fix them, push again. Repeat.
7. **Done means green.** You're done only when the pull request passes every required check.
   Report the pull request link and its check status. Only Ian merges, and the merge is the approval.

**Don't stop while the gate fails.** This applies to every agent. In Claude Code a Stop hook
enforces it; in Cursor, Grok Build or anything else, follow it yourself: if `bun run gate` fails,
keep fixing. After 3 attempts that don't get it green, stop and hand over to Ian with the failures
listed.

## Limits

You act on GitHub through the `gh` CLI as Ian, so these limits are what separates you from Ian.
Never:

- **merge** a pull request (`gh pr merge` or the API),
- **add or remove labels**, including `owner-approved` and `chore`; only Ian adds them,
- **push to `main`** or **force push** anything,
- **change branch protection or rulesets**,
- loosen a gate to get to green: no `.skip` or `.only`, no lint-disable, `@ts-ignore` or
  `@ts-expect-error` without a reason (` -- why`), no edits to lint, format, tsconfig, budget or
  gate config, workflows or `.claude/` unless Ian asked for that change.

Changes to `specs/` or to the gates are allowed when they're part of an approved plan. The
`protected-paths` check fails until Ian reviews them and adds the `owner-approved` label.
If a gate looks wrong, say so in the pull request instead of working around it.

## Commands

```bash
bun run gate                 # every check, in CI order; --only lint,typecheck for some
bun test                     # unit tests and scenarios (a scenario without step definitions is todo)
bun test tests/scenarios.test.ts -t "GATE-007"    # one behavior
bun run format               # Prettier
bun run lint:fix             # ESLint and Stylelint autofixes
bun run specs:find <words>   # where a request belongs: matching intents, journeys, behaviors
bun run specs:trace <ID>     # what's around a node: intents above, journeys and behaviors around
bun run specs:check          # the spec graph is consistent and GRAPH.md is current
bun run specs:graph          # regenerate GRAPH.md and graph.json after a spec change
bun run specs:review         # the spec review UI on http://localhost:4400
```

## Layout

```
specs/portfolio/   intents/, journeys/, features/ (Gherkin), README.md, GRAPH.md (generated)
tests/             scenarios.test.ts runs every behavior; steps/ holds step definitions
tools/gate/        the gate: checks.ts lists every check; cli.ts runs them
tools/specs/       spec graph loader, checker and review UI
docs/              drafts (content-draft.md)
index.html css/ js/ assets/ CNAME   the old site, served until the new one ships (SHIP-008)
```
