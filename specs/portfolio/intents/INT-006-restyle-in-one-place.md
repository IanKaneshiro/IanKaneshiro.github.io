---
id: INT-006
title: Changing the look is an edit in one place, and mistakes are caught
status: active
---

## Why

Identities evolve. With primitive → semantic → component layers, changing the accent or the
type scale should be a token edit, with the build catching broken references and
contrast failures before they ship.

## Looks like

- Components and pages use semantic tokens only, enforced by lint.
- One token build feeds CSS, TypeScript and the docs.
- Contrast and references are checked on every build.

## Not this

- Hand-edited generated files, or values copied between layers.
