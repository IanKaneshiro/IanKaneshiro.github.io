@area-KIT
Feature: The first components: what the site needs
  As the design system author
  I want the smallest set of components that builds the whole site
  so that every component is exercised by a real page.

  @KIT-001 @component
  Scenario: kan-button
    Then it has primary, secondary and ghost variants and sm and md sizes
    And renders a native button, or a native link when href is set
    And a disabled button can't be activated and says so to assistive tech

  @KIT-002 @component
  Scenario: kan-link
    Then it renders a native link in text.accent, underlined on hover and focus
    And when it opens a new tab it adds rel="noopener noreferrer", an external icon and an accessible "opens in a new tab" hint

  @KIT-003 @component
  Scenario: kan-tag
    Then it shows a short mono label, like a technology name, with an optional leading icon
    And it isn't interactive

  @KIT-004 @component
  Scenario: kan-card
    Then it is a bg.surface container with optional header and footer slots
    And when href is set the whole card is clickable through a single link, never nested links

  @KIT-005 @component
  Scenario: kan-project-card
    Then it shows a project's name, one-line summary and stack tags
    And links to its source, and to its live demo when there is one
    And it is built from kan-card, kan-tag and kan-link

  @KIT-006 @component
  Scenario: kan-section-heading
    Then it shows a terminal-style rule with the label inside, like "── projects ──"
    And it is a real heading, h2 unless a level is given
    And the rule characters are hidden from screen readers

  @KIT-007 @component
  Scenario: kan-prompt
    Then it shows a prompt glyph, the slotted text and a blinking cursor
    And the text is in the page from the start, never typed in by script
    And the cursor doesn't blink when the visitor prefers reduced motion

  @KIT-008 @component
  Scenario: kan-terminal
    Then it is a framed window on bg.inset with a title bar and a title
    And shows slotted commands and output in the mono family
    And long lines scroll inside the window instead of widening the page

  @KIT-009 @component
  Scenario: kan-theme-toggle
    Then it implements THEME-002, THEME-003 and THEME-006
    And it emits kanThemeChange with the chosen theme

  @KIT-010 @component
  Scenario: kan-site-header
    Then it shows Ian's name, the navigation links and the theme toggle
    And below the md breakpoint the links move into a menu button that opens and closes with the keyboard

  @KIT-011 @component
  Scenario: kan-site-footer
    Then it shows Ian's contact links and links to the site's source, the Storybook and "How this site was built"

  @KIT-012 @component @a11y
  Scenario: kan-icon
    Then it draws icons from one SVG set: github, linkedin, mail, external, sun, moon, monitor, terminal, menu and close
    And an icon is hidden from assistive tech unless it is given a label

  @KIT-013 @component @a11y
  Scenario: kan-tool-call
    Then it shows a tool call the way an agent session does: a status glyph, the tool name, a short argument and a one-line result
    And its details expand and collapse with the keyboard
    And pending, success and error states use the status tokens and a glyph, never color alone

  @KIT-014 @component @a11y
  Scenario: kan-plan
    Then it shows an ordered checklist of steps, each done, in progress or pending
    And each step's state is shown by a glyph and announced as text, never by color alone
