@area-SHIP
Feature: Building, deploying and the profile README
  As the owner
  I want one command to build everything and every merge to main to deploy
  so that shipping is boring and my GitHub profile points to the real site.

  @SHIP-001 @ci
  Scenario: One install, one build
    When I run "bun install" and then "bun run build" at the repo root
    Then tokens, components, Storybook and the site build in that order

  @SHIP-002 @ci
  Scenario: Local development
    When I run "bun run dev"
    Then the site is served locally and reloads when a token, component or page changes
    And "bun run storybook" does the same for Storybook

  @SHIP-003 @ci
  Scenario: Bun version is pinned
    Then the repo pins one Bun version
    And CI uses that same version

  # Replaced by GATE-002 and GATE-003.
  @SHIP-004 @ci @retired
  Scenario: The pull request gate
    When a pull request is opened or updated
    Then CI runs typecheck, lint, unit tests, spec checks, Storybook tests, end-to-end tests and the budgets
    And the pull request can't be merged while any of them fail

  @SHIP-005 @ci
  Scenario: Deploy on merge
    When a change is merged to main
    Then GitHub Actions deploys the site, with Storybook under /storybook, to GitHub Pages
    And a failed build leaves the live site unchanged

  @SHIP-006 @site
  Scenario: Served at www.iankaneshiro.dev
    Then the site is built from the IanKaneshiro.github.io repo and served at https://www.iankaneshiro.dev
    And every link and asset works there and in a local preview

  @SHIP-008 @ci
  Scenario: Cutover from the old site
    Then until the new site ships, the old site keeps serving www.iankaneshiro.dev from the root of main, unchanged
    And the pull request that ships the new site switches GitHub Pages to the Actions deploy and removes the old site's files
    And www.iankaneshiro.dev keeps working through the switch

  @SHIP-007 @profile
  Scenario: The profile README points to the site
    Then the IanKaneshiro profile README shows Ian's name, one-line focus and current stack
    And links to the site, the Storybook, LinkedIn and email
    And all its badges use one style
