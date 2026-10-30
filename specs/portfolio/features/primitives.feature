@area-PRIM
Feature: Primitive tokens: the raw palette and scales
  As the design system author
  I want every raw value to come from one named, reviewed scale
  so that the identity is decided in one place and nothing else invents values.

  @PRIM-001 @tokens
  Scenario: Tokens are written in DTCG format
    Then every file under packages/tokens/src/primitive is valid W3C DTCG JSON
    And every token has a $value and a $type, on itself or inherited from its group

  @PRIM-002 @tokens
  Scenario: Colors are authored in OKLCH
    Then every primitive color is authored in the OKLCH color space
    And is output as an oklch() CSS value

  @PRIM-003 @tokens
  Scenario: The electric cyan brand ramp
    Then color.cyan has 11 steps: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900 and 950
    And each step is darker than the one before it
    And 500 is the reference electric cyan the identity is built on

  @PRIM-004 @tokens
  Scenario: A neutral ramp tinted toward the brand
    Then color.neutral has the same 11 steps as color.cyan, each darker than the one before
    And its hue leans toward cyan with low chroma, so grays read as cool rather than flat
    And color.white and color.black exist on their own

  @PRIM-005 @tokens
  Scenario: Status ramps that can't be mistaken for the accent
    Then color.green, color.amber and color.red each have the same 11 steps
    And each of their 500 steps is at least 30 degrees of hue away from cyan 500

  @PRIM-006 @tokens
  Scenario: A 4px spacing scale
    Then space has steps 0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16 and 24
    And each step is that many multiples of 4px

  @PRIM-007 @tokens
  Scenario: Two font families
    Then font.family.mono is JetBrains Mono and font.family.sans is Inter
    And each ends with a system fallback stack of the same kind

  @PRIM-008 @tokens
  Scenario: A modular type scale
    Then font.size has steps xs, sm, md, lg, xl, 2xl, 3xl, 4xl and 5xl
    And md is 16px and the steps from md upward follow a 1.25 ratio, rounded to whole pixels
    And font.weight has regular 400, medium 500 and bold 700
    And font.line-height has tight 1.15, normal 1.5 and relaxed 1.7

  @PRIM-009 @tokens
  Scenario: Shape: small radii and thin borders
    Then radius has none 0, sm 2px, md 4px, lg 8px and full 9999px
    And border.width has thin 1px and thick 2px

  @PRIM-010 @tokens
  Scenario: Motion
    Then duration has fast 120ms, normal 200ms and slow 320ms
    And easing has standard and emphasized cubic-bezier curves

  @PRIM-011 @tokens
  Scenario: Breakpoints
    Then breakpoint has sm 640px, md 768px, lg 1024px and xl 1280px
