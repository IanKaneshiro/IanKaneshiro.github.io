@area-GATE
Feature: Gates that keep agents honest
  As the owner working with coding agents
  I want every rule checked automatically on every pull request, in a way agents can't get around
  so that I can trust the work when the gates are green.

  @GATE-001 @ci
  Scenario: One gate command
    When I run "bun run gate"
    Then every check that CI runs, runs locally in the same order
    And it exits non-zero, naming each check that failed

  @GATE-002 @ci
  Scenario: Every pull request runs the gate
    When a pull request is opened or updated
    Then GitHub Actions runs each check as its own required status check: typecheck, lint, format, unit and scenario tests, spec check, build, Storybook tests, end-to-end and accessibility tests, budgets and the secret scan

  @GATE-003 @ci @security
  Scenario: main only changes through a green, approved pull request
    Then main rejects direct pushes and force pushes
    And a pull request can't merge until every required check passes and Ian has approved it
    And "bun run gate:protection" fails if GitHub's branch protection settings don't say so

  @GATE-004 @ci
  Scenario: Typecheck
    Then every package typechecks in strict mode
    And each error is reported with its file and line

  @GATE-005 @ci
  Scenario: Lint and format
    Then ESLint, Stylelint and Prettier report no errors in any package
    And a file that isn't formatted fails, named

  @GATE-006 @ci
  Scenario: The design rules are lint rules
    Then raw colors, and primitive tokens used outside packages/tokens, fail lint in components and the site
    And a component tag without the kan- prefix fails lint
    And each failure names the rule and how to fix it

  @GATE-007 @ci
  Scenario: Behaviors are tests, and coverage never drops
    Then every active behavior runs as a scenario test, and one without step definitions shows as todo
    And a pull request fails if it turns a behavior that passes on main into todo or failing

  @GATE-008 @ci @security
  Scenario: Tests can't be quietly weakened
    Then a pull request fails if it adds .skip or .only to a test
    And if it adds a lint-disable, @ts-ignore or @ts-expect-error comment without a reason on the same line

  @GATE-009 @ci @security
  Scenario: The gates themselves are owner-protected
    Then changes to workflows, lint and format configs, tsconfig, budgets, thresholds or gate scripts need Ian's review
    And CODEOWNERS enforces this

  @GATE-010 @ci @security
  Scenario: Specs are owner-protected
    Then changes under specs/ need Ian's review
    And CODEOWNERS enforces this

  @GATE-011 @ci
  Scenario: Pull requests trace to behaviors
    Then a pull request names the behavior IDs it implements in its description
    And the gate fails if it names none, unless it is labeled chore, or if a named ID doesn't exist
    And the gate lists any named behavior whose scenario still doesn't pass

  @GATE-012 @ci
  Scenario: Failures say what to fix
    Then each failed check reports the file, line, rule and a one-line fix
    And the pull request has one summary comment listing every failure, updated on every push

  @GATE-013 @ci
  Scenario: An agent can't stop on red
    Given a Claude Code session that changed code
    When the agent tries to finish while "bun run gate" fails
    Then a Stop hook keeps it working, up to 3 attempts, and then hands over to Ian with the failures listed
    And AGENTS.md states the same rule for Cursor, Grok Build and any other agent

  @GATE-014 @ci
  Scenario: Done means green
    Then an agent's work is done only when its pull request passes every required check
    And the agent reports the pull request link and its check status
    And Ian approves and merges

  @GATE-015 @ci
  Scenario: The gate is fast
    Then the full CI gate finishes in under 10 minutes

  @GATE-016 @ci @security
  Scenario: No secrets
    Then a pull request that adds a secret, key or token fails the secret scan, naming the file and line

  @GATE-017 @ci
  Scenario: New dependencies are explained
    Then a pull request that adds a dependency fails unless its description gives a reason for each one

  @GATE-018 @ci @security
  Scenario: Agents work as their own GitHub identity
    Then agents push and open pull requests as a separate bot account with write access
    And the bot account can't approve pull requests, merge to main or bypass branch protection
