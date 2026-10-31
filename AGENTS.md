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
2. **Branch.** Never work on `main`. One branch per feature. Commit as the agent (see *Agent identity*).
3. **Build one behavior at a time.** Write step definitions for its scenario in
   `tests/steps/<area>.steps.ts`, see it fail for the right reason, then write the smallest code
   that makes it pass. Each commit message starts with the behavior ID, e.g. `GATE-008: ...`.
4. **Run the gate:** `bun run gate`. Fix everything it reports.
5. **Push and open a pull request as the agent:** `bun run agent:push`, then
   `bun run agent:gh -- pr create --title "..." --body-file pr.md`. Draft the description with
   `bun run pr:body --out pr.md`, which fills in the behaviors, what they serve, the files to review
   closely, the gate result and any dependencies. Then write what it leaves as prompts: the Summary,
   the Review guide, Notes if there's anything worth flagging, and a reason for each new dependency.
   Keep it short. In Claude Code, the `pr` skill does all of this.
6. **Fix until green.** Read the failures (`gh pr checks`, and the gate summary comment on the
   pull request), fix them, `bun run agent:push` again. Repeat.
7. **Done means green.** You're done only when the pull request passes every required check.
   Report the pull request link and its check status. Ian approves and merges; agents never merge.

**Don't stop while the gate fails.** This applies to every agent. In Claude Code a Stop hook
enforces it; in Cursor, Grok Build or anything else, follow it yourself: if `bun run gate` fails,
keep fixing. After 3 attempts that don't get it green, stop and hand over to Ian with the failures
listed.

## Limits

You act on GitHub as `ians-agent[bot]`, through the agent commands. The app has no Administration
or Workflows permission, so GitHub itself stops it from changing rulesets, branch protection or CI.
The agent commands refuse the rest. Never:

- **merge** a pull request (`gh pr merge` or the API),
- **add or remove labels**, including `chore`; only Ian adds them,
- **act as Ian**: no plain `git push` or `gh pr create`/`edit`/`comment`, and no reading the app's key,
- **push to `main`** or **force push** anything,
- **change branch protection or rulesets**,
- loosen a gate to get to green: no `.skip` or `.only`, no lint-disable, `@ts-ignore` or
  `@ts-expect-error` without a reason (` -- why`), no edits to lint, format, tsconfig, budget or
  gate config, workflows or `.claude/` unless Ian asked for that change.

Changes to `specs/`, the gates or the agent's own rules are allowed when they're part of an
approved plan. The `protected-paths` check lists them so Ian reviews them closely, and nothing
merges without Ian's approval.
If a gate looks wrong, say so in the pull request instead of working around it.

## Agent identity

Agents act as the GitHub App **ians-agent** (`ians-agent[bot]`). Its settings are in
`tools/agent/app.json`. Its private key stays on Ian's machine at `~/.config/ian-agent/private-key.pem`
and never goes in the repo. Tokens last an hour and are limited to this repository.

- **Commits:** author them as `ians-agent[bot] <350450150+ians-agent[bot]@users.noreply.github.com>`.
  Claude Code sets this for you. Other agents set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`,
  `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` to those values.
- **Push:** `bun run agent:push` pushes the current branch. It refuses `main` and any options, so no
  force pushes or deletes.
- **GitHub:** `bun run agent:gh -- <gh args>` runs `gh` as the agent. It refuses merging, labels,
  reviews and write calls through `gh api`.

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
bun run pr:body --out pr.md   # draft a pull request description from the code
bun run agent:push           # push the current branch as ians-agent[bot]
bun run agent:gh -- pr create --title "..." --body-file pr.md   # gh as ians-agent[bot]
```

## Layout

```
specs/portfolio/   intents/, journeys/, features/ (Gherkin), README.md, GRAPH.md (generated)
packages/tokens/   design tokens: DTCG JSON in src/, built with Style Dictionary (bun run build) into dist/
tests/             scenarios.test.ts runs every behavior; steps/ holds step definitions
tools/gate/        the gate: checks.ts lists every check; cli.ts runs them
tools/agent/       the agent's identity: token minting, agent:gh, agent:push and their guards
tools/specs/       spec graph loader, checker and review UI
docs/              drafts (content-draft.md)
apps/site/         the Astro site, served at the root of www.iankaneshiro.dev (Storybook under /storybook)
```
