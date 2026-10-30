# Content draft

First-pass copy for the new site, written in Ian's voice for Ian to edit. It draws on the current
site at www.iankaneshiro.dev (index.html at the repo root) and on Ian's answers. When the Astro site
is built, this becomes the content collections (SITE-006) and is then deleted.

## Identity

- **Name:** Ian Kaneshiro
- **Role:** Software Engineer (no employer named). The current site says "Full-Stack Software Engineer".
- **Headline:** Software engineer building with AI agents, spec-first.
  - Alternative: I write the spec. Agents write the code. Tests keep us both honest.
  - Alternative: Agentic software engineering: intent in, tested behavior out.
- **Photo:** `assets/iankaneshiro.jpg` from the current site, if wanted.

## Hero: an agent session (SITE-013)

```
> who is Ian Kaneshiro?

● Read(profile)       ⎿ Software Engineer
● Read(stack)         ⎿ TypeScript · StencilJS · Storybook
● Read(workflow)      ⎿ spec-driven, built with Claude Code, Cursor and Grok Build

Ian is a software engineer who builds with AI agents: Ian writes the spec,
agents build against it, and tests check every step.
```

## About (SITE-004)

I'm a software engineer who builds design systems and web components with TypeScript, StencilJS
and Storybook. More and more of my work happens alongside AI agents. I write the spec as intents,
journeys and Gherkin behaviors, and agents like Claude Code, Cursor and Grok Build build against
it, with tests checking every step. This site was built that way, and you can read the specs that
built it.

I came to software from 8+ years in retail operations, where I led and managed high-performing
teams in fast-paced environments. During the COVID lockdowns I started building websites, got
hooked, and went through App Academy's year-long program. I still love that I never have to say
"I wish there was an app for that". I can build it.

### Working on now (as a `kan-plan`)

- [x] The spec graph for this site: intents → journeys → behaviors
- [~] A token pipeline and the `kan-` web component library
- [ ] Tools that let agents search and trace a spec graph before they change anything

## Stack (SITE-003)

| Group | Items |
|---|---|
| Agentic development | Claude Code · Cursor · Grok Build · Spec-driven development · Gherkin |
| Design systems | StencilJS · Storybook · Web components · Design tokens |
| Languages | TypeScript · JavaScript · Python |

Each project lists its own stack, so frameworks used only in past projects (React, Redux, Flask,
Express) appear there rather than in the main stack.

## Featured projects (SITE-002)

These are the projects on the current site. Their Render demos no longer respond, so each links to
its source only. GIFs from the current site (`assets/img/gifs/`) can serve as previews.

### KanDiscer

A web app that helps disc golfers improve their game.

- Course previews and live GPS navigation with Mapbox.
- Charts of each disc's flight path (Recharts), so players can find gaps in their bag.
- Filters by manufacturer and flight characteristics, built on SQLAlchemy.
- Debounced search to cut unnecessary API calls.

Stack: React · Redux · Python · Flask · SQLAlchemy · Mapbox · AWS. Source: github.com/IanKaneshiro/KanDiscer

### Jeanak Eats

An Uber Eats–style app for restaurants, menus and reviews.

- Image upload and retrieval with AWS S3.
- A Flask and SQLAlchemy REST API.
- Real-time store availability from store hours and the current time.
- Built by a team using a feature-branch Git workflow.

Stack: React · Redux · Python · Flask · SQLAlchemy · AWS. Source: github.com/IanKaneshiro/Jeanak-Eats

### KanairBnB

An Airbnb-style booking app with user accounts, listings and a documented REST API.

Stack: React · Redux · Express · Sequelize · PostgreSQL. Source: github.com/IanKaneshiro/KanairBnB

## Resume (SITE-015)

The current PDF (`assets/Kaneshiro_Ian_Resume.pdf`, December 2023) is out of date. **Needed from
Ian: an updated PDF.** The link stays hidden until there is one.

## Links

- GitHub: https://github.com/IanKaneshiro
- LinkedIn: https://www.linkedin.com/in/iandkaneshiro
- Email: iandkaneshiro@gmail.com
