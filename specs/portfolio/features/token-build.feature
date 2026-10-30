@area-TOK
Feature: Building and shipping the tokens
  As the design system author
  I want one Style Dictionary build to turn the token source into everything that consumes it
  so that CSS, TypeScript and the docs never drift apart.

  @TOK-001 @tokens
  Scenario: One build makes every output
    When I run "bun run build" in packages/tokens
    Then it writes a CSS file of custom properties, a typed TypeScript module and a JSON file for the docs

  @TOK-002 @tokens
  Scenario: Every custom property is prefixed
    Then every CSS custom property the build writes starts with --kan-

  @TOK-003 @tokens
  Scenario: Modes in CSS
    Then light semantic values are set on :root
    And dark values are set under [data-theme="dark"]
    And dark values also apply under prefers-color-scheme: dark unless data-theme="light" is set

  @TOK-004 @tokens
  Scenario: Semantic properties point at primitives
    Then each semantic custom property is written as var() of its primitive's custom property, so devtools show which primitive a role uses

  @TOK-005 @tokens
  Scenario: Typed token names
    Then the TypeScript module exports every token name as a string literal type
    And using a name that doesn't exist is a type error

  @TOK-006 @tokens
  Scenario: Broken references fail the build
    Given a semantic token references a primitive that doesn't exist
    When the tokens are built
    Then the build fails and names both the semantic token and the missing reference

  @TOK-007 @tokens
  Scenario: Contrast is checked on every build
    When the tokens are built
    Then the contrast rules in SEM-007 and SEM-008 are checked
    And a failing pair fails the build, naming both tokens, the mode and the ratio

  @TOK-008 @tokens
  Scenario: The build is repeatable
    When the tokens are built twice from the same source
    Then the outputs are byte-for-byte identical
