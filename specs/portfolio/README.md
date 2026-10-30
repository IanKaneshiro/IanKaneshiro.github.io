# Ian Kaneshiro's site: spec graph

**A portfolio with an agentic identity, built spec-first: a token-driven StencilJS design
system, a public Storybook and an Astro site, all traced from intent to tested behavior.**

These specs are the source of truth for what the site does and why. Nothing is built that
isn't here, and nothing is here without a reason.

## The graph

```
INT  intent    why        an outcome worth having, what it looks like, what it is not
 ▲ serves
JRN  journey   who, how   an actor's path through the product, step by step
 │ each step uses
 ▼
AREA behavior  what       a Gherkin scenario, and the thing that gets tested
```

- **[intents/](intents/)** has one Markdown file per intent: front matter (`id`, `title`, `status`),
  then *Why*, *Looks like* and *Not this*. *Not this* is how an agent tells a good fit from scope creep.
- **[journeys/](journeys/)** has one Markdown file per journey: front matter (`id`, `title`, `actor`,
  `status`, `intents`, `steps` with `behaviors`), then a short note.
- **[features/](features/)** holds Gherkin files. Each scenario is one behavior with a permanent `@AREA-NNN` ID.
- **[GRAPH.md](GRAPH.md)** and **[graph.json](graph.json)** are generated and never edited by hand.

**Edges live only in journeys.** A journey says which intents it serves, and each step says which
behaviors it uses. Everything else, like "which journeys use KIT-005?" or "what serves INT-004?",
is computed. That gives one source of truth and no back-references to keep in sync.

**Rules the check enforces** (GRAPH-002 to GRAPH-006): IDs are unique and permanent, every
reference resolves, Gherkin parses, and nothing is orphaned. Every intent has a journey, every
journey has an intent, and every behavior is used by a journey step.

## Commands

```bash
bun run specs:review   # review UI at http://localhost:4400: graph, trace, search, review notes
bun run specs:check    # IDs, references, coverage, Gherkin, and GRAPH.md/graph.json up to date
bun run specs:graph    # regenerate GRAPH.md and graph.json after editing specs
```

Review notes from the UI are saved to `review-notes.json` in this folder, keyed by ID.

## Principles (use these to settle scope questions)

1. **Agentic, on a terminal base.** The site looks like the work: an agent session in electric cyan,
   with prompts, tool calls and plans. It is never a fake chatbot.
2. **Tokens are the identity.** Every visual value is a primitive. Components and pages ask for
   semantic roles only. Nothing skips a layer.
3. **Content first, JavaScript second.** Every page reads completely as HTML. Components enhance it.
4. **Built for people and agents.** What an agent reads is exactly what a person sees.
5. **The build is part of the portfolio.** The Storybook and this graph are public on purpose.
6. **Content is data.** Projects, stack and bio live in content files, never in components.
7. **Trust comes from gates.** Every rule here is a check that runs on every pull request. Agents
   aren't done until the gates are green, and they can't change the gates or the specs without Ian.

## Areas

| Area | Feature | Layer |
|---|---|---|
| PRIM | [Primitive tokens](features/primitives.feature) | tokens |
| SEM | [Semantic tokens](features/semantics.feature) | tokens |
| TOK | [Building and shipping the tokens](features/token-build.feature) | tokens |
| THEME | [Light and dark](features/theme.feature) | tokens, site |
| CMP | [Component library conventions](features/components.feature) | components |
| KIT | [The first components](features/kit.feature) | components |
| DOCS | [Storybook](features/storybook.feature) | docs |
| SITE | [The site](features/site.feature) | site |
| AGENT | [Readable by agents](features/agents.feature) | site |
| QUAL | [Performance, accessibility, budgets](features/quality.feature) | CI |
| SHIP | [Build, deploy, profile README](features/ship.feature) | CI |
| GRAPH | [The spec graph itself](features/graph.feature) | specs |
| GATE | [Gates that keep agents honest](features/gates.feature) | CI |

**Tags:** surface is one of `@tokens`, `@component`, `@docs`, `@site`, `@ci`, `@specs` or `@profile`.
`@a11y` and `@security` mark behaviors that must not be dropped without a replacement.
`@retired` marks a dropped behavior (GRAPH-010). SHIP-004 is retired, replaced by GATE-002 and GATE-003.

## Changing the specs (how an agent adds a feature)

This is JRN-010. When Ian asks for a feature:

1. **Find.** Search the graph for the request (`bun run specs:find <words>`, GRAPH-009), or read
   GRAPH.md. Note the intents and journeys it touches.
2. **Understand.** Trace each hit (`bun run specs:trace <ID>`, GRAPH-008). Read the intent's *Why*
   and *Not this*, the journey's steps, and the behaviors that are already there.
3. **Place it.** Decide which of these fits best:
   - a new or changed **behavior** in an existing journey step (most features),
   - a new **step** in an existing journey,
   - a new **journey** serving existing intents,
   - a new **intent**, only when no *Why* covers the request. Say so explicitly, because it changes direction.

   If the request runs into an intent's *Not this*, raise that instead of quietly working around it.
4. **Propose.** Write the spec change: new IDs at the end of their area, changed scenarios edited
   in place, dropped ones retired rather than deleted. Show Ian the diff and the updated trace.
5. **Approve.** Ian approves the spec change, and it's committed on its own.
6. **Build.** This is JRN-014. Work on a branch, one behavior at a time, with each commit message
   starting with the behavior ID. Run `bun run gate` before pushing.
7. **Open a pull request** that names the behavior IDs it implements (GATE-011) and explains any
   new dependency (GATE-017).
8. **Fix until green.** Read the failures (`gh pr checks`, and the summary comment from GATE-012),
   fix them, and push again. Never loosen a gate, skip a test or edit specs to get to green: those
   changes need Ian (GATE-008 to GATE-010). If a gate seems wrong, say so in the pull request.
9. **Done** means every required check passes. Report the pull request link and its status;
   Ian approves and merges (GATE-014).

## Decisions

Confirmed on 2026-10-30.

| Decision | Where |
|---|---|
| Served at https://iankaneshiro.github.io from the `IanKaneshiro.github.io` repo | SHIP-006, SITE-010 |
| Component prefix `kan-`: tags `kan-*`, classes `Kan*`, events `kan*`, custom properties `--kan-*` | CMP-001, CMP-008, TOK-002 |
| JetBrains Mono for headings, labels and code; Inter for body text | PRIM-007 |
| AI crawlers are welcome | AGENT-005 |
| Agents push and open pull requests as a separate bot account, and Ian approves as Ian | GATE-003, GATE-018 |
| Lint and format with ESLint (with the Stencil plugin), Stylelint and Prettier | GATE-005, GATE-006 |
| v1 is the home page and "How this site was built". More pages go through the graph later | SITE-* |

**Starting values,** accepted for now and open to tuning at the identity checkpoint in Storybook:

| Value | Where |
|---|---|
| Cyan, neutral and status ramps with 11 steps (50–950), authored in OKLCH | PRIM-002 to PRIM-005 |
| Status hues at least 30° from cyan 500 | PRIM-005 |
| 4px spacing base and a 1.25 type ratio from 16px | PRIM-006, PRIM-008 |
| Radii of 0, 2, 4 and 8px | PRIM-009 |
| Motion at 120, 200 and 320ms | PRIM-010 |
| Breakpoints at 640, 768, 1024 and 1280px | PRIM-011 |
| Lighthouse 95+ and a 50 KB gzipped JavaScript budget | QUAL-001, QUAL-002 |

## Content

Content lives in content collections (SITE-006), not in these specs. The first draft of every
piece of copy (headline, hero, about, working-on-now, stack groups, projects, links) is in
[docs/content-draft.md](../../docs/content-draft.md), waiting for Ian's edits. It becomes the
content collections when the site is built.

## Not in v1

Project detail pages, a writing section, work history, a resume download, and a live "ask about Ian"
agent (it needs a backend, which GitHub Pages doesn't have, and would break QUAL-004). Each of these
would come back through the graph as a new journey or behaviors.

## Suggested build order

1. **Specs tooling:** GRAPH, so the graph is checked from the first commit.
2. **Gates:** GATE, with SHIP-001 and SHIP-003. This is the one pull request Ian reviews line by
   line. Every pull request after it goes through the gates.
3. **Foundations:** PRIM, then TOK.
4. **Semantics and theming:** SEM, the token parts of THEME, and DOCS-004 and DOCS-005.
   **Checkpoint:** Ian reviews the identity in Storybook before any components are built.
5. **Components:** CMP, KIT and DOCS.
6. **Site:** SITE, AGENT, the rest of THEME, and QUAL. Their checks join the gate as they land.
7. **Ship:** SHIP-005 to SHIP-007.
