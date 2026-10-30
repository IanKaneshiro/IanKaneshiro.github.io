@area-DOCS
Feature: Storybook: the living style guide
  As the design system author, and as a reviewer looking at my work
  I want one place that shows the tokens and every component in every state
  so that the system explains itself and can't go out of date.

  @DOCS-001 @docs
  Scenario: Every variant and state has a story
    Then every component has a story for each variant, size and state it supports

  @DOCS-002 @docs
  Scenario: Theme switch in the toolbar
    Then the toolbar switches every story between light and dark
    And the switch sets data-theme exactly the way the site does

  @DOCS-003 @docs
  Scenario: Component docs come from the source
    Then each component's docs page lists its props, events, slots, CSS parts and custom properties
    And the lists are generated from the Stencil docs JSON, not written by hand

  @DOCS-004 @docs
  Scenario: Foundations pages show the tokens
    Then a Foundations section shows each primitive ramp as named swatches with their values
    And every semantic token with its light and dark values and the primitives they reference
    And both pages are generated from the token build's JSON

  @DOCS-005 @docs @a11y
  Scenario: Contrast is visible
    Then the semantic color page shows the contrast ratio of each text and background pair in each mode

  @DOCS-006 @docs
  Scenario: An introduction to the system
    Then the first page explains the primitive → semantic → component layers
    And shows how to use the library on a plain HTML page

  @DOCS-007 @docs
  Scenario: Stories are tested
    Then story interaction tests and the axe checks run headless in CI
    And any failure fails the pull request
