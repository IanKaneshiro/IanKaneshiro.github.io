@area-CMP
Feature: A Stencil component library that works anywhere
  As the design system author
  I want framework-free web components built only from semantic tokens
  so that the library is a portfolio piece of its own and the site can't drift from it.

  @CMP-001 @component
  Scenario: One prefix
    Then every component's tag starts with kan- and its class name starts with Kan

  @CMP-002 @component
  Scenario: Styled only with semantic tokens
    Then component stylesheets contain no raw color values and no primitive token properties
    And lint fails on either, naming the file and line

  @CMP-003 @component
  Scenario: Shadow DOM with styling hooks
    Then every component renders into a shadow root
    And exposes its main elements as named CSS parts listed in its docs

  @CMP-004 @component
  Scenario: Works in plain HTML
    Given a plain HTML page that loads the component bundle with one script tag
    Then every component renders and works on that page

  @CMP-005 @component
  Scenario: Pages download only what they use
    Then a page that uses two components loads code for those two and the runtime, and no others

  @CMP-006 @component
  Scenario: Content lives in the page
    Then text a component shows is passed in through slots or attributes
    And that text is in the page HTML before JavaScript runs

  @CMP-007 @component
  Scenario: A typed, documented API
    Then every prop, event, slot, CSS part and custom property has a type and a description
    And the generated docs JSON lists all of them

  @CMP-008 @component
  Scenario: Events are namespaced and cross the shadow boundary
    Then custom events are named kan followed by the action, like kanChange
    And they bubble and are composed

  @CMP-009 @component @a11y
  Scenario: Keyboard and focus
    Then every interactive component is reachable by Tab
    And shows the focus.ring on :focus-visible only
    And responds to Enter and Space the way its native equivalent does

  @CMP-010 @component @a11y
  Scenario: No accessibility violations
    Then every story of every component passes axe with no violations in light and in dark

  @CMP-011 @component @a11y
  Scenario: Reduced motion
    Given a visitor prefers reduced motion
    Then no component animates
