@area-SEM
Feature: Semantic tokens: names that say what a value is for
  As the design system author
  I want components and pages to ask for a role, not a raw value
  so that light and dark, and any future restyle, change one layer only.

  @SEM-001 @tokens
  Scenario: Semantic tokens only reference primitives
    Then every semantic token's $value is a reference that resolves to a primitive token
    And no semantic token holds a raw value

  @SEM-002 @tokens
  Scenario: Light and dark define the same tokens
    Given the semantic color tokens live in semantic/light.json and semantic/dark.json
    Then both files define exactly the same token names
    And the build fails naming any token that is in one but not the other

  @SEM-003 @tokens
  Scenario: Background roles
    Then color.bg has canvas, surface, raised and inset
    And inset is the background for code and terminal blocks

  @SEM-004 @tokens
  Scenario: Text roles
    Then color.text has default, muted, subtle, inverse, accent and on-accent

  @SEM-005 @tokens
  Scenario: Border roles
    Then color.border has subtle, default, strong and focus

  @SEM-006 @tokens
  Scenario: Accent and status roles
    Then color.accent has default, hover, active and subtle
    And color.status has success, warning, danger and info, each with fg, bg and border

  @SEM-007 @tokens @a11y
  Scenario: Text meets WCAG AA contrast in both modes
    Then in light and in dark, every color.text token except inverse and on-accent reaches 4.5:1 against bg.canvas, bg.surface and bg.raised
    And text.on-accent reaches 4.5:1 against accent.default
    And each status fg reaches 4.5:1 against its status bg

  @SEM-008 @tokens @a11y
  Scenario: UI elements meet non-text contrast in both modes
    Then in light and in dark, border.strong, border.focus and accent.default reach 3:1 against bg.canvas and bg.surface

  @SEM-009 @tokens
  Scenario: Typography roles
    Then typography has heading-1, heading-2 and heading-3 in the mono family
    And body-lg, body-md and body-sm in the sans family
    And label and code in the mono family
    And each sets family, size, weight and line height from primitives

  @SEM-010 @tokens
  Scenario: Spacing and layout roles
    Then space has inset sm, md and lg, stack sm, md and lg, and inline sm, md and lg
    And layout has gutter, section-gap, content-max-width and prose-max-width

  @SEM-011 @tokens
  Scenario: One focus ring for everything
    Then focus.ring sets the color from border.focus, a width and an offset

  @SEM-012 @tokens @a11y
  Scenario: Motion turns off for reduced motion
    Given a visitor prefers reduced motion
    Then every semantic motion duration resolves to 0ms
