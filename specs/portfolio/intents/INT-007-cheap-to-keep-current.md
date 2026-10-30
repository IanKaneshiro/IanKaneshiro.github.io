---
id: INT-007
title: Keeping the site current is cheap
status: active
---

## Why

The old profile went stale because updating it was a chore. Adding a project or changing the
stack should be a small content edit, and shipping should happen automatically.

## Looks like

- Projects, stack, bio and links are content files with a schema.
- Merging to main deploys. Pull requests are checked by one gate.
- One install and one build for the whole repo.

## Not this

- Content hard-coded in components or pages.
