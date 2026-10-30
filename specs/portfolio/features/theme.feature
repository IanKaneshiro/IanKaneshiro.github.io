@area-THEME
Feature: Light and dark, the visitor's choice
  As a visitor
  I want the site to match my system theme and let me override it
  so that it's comfortable to read and remembers what I picked.

  @THEME-001 @site
  Scenario: Follows the system by default
    Given I have never chosen a theme
    Then the site uses dark when my system prefers dark and light otherwise

  @THEME-002 @site
  Scenario: The toggle switches and remembers
    When I choose dark with the theme toggle
    Then the page turns dark right away
    And the next page I open and my next visit are dark too

  @THEME-003 @site
  Scenario: Going back to the system setting
    Then the toggle offers light, dark and system
    And choosing system clears my saved choice

  @THEME-004 @site
  Scenario: No flash of the wrong theme
    Given I saved dark and my system prefers light
    When I load any page
    Then the first frame painted is already dark

  @THEME-005 @site
  Scenario: System changes apply live
    Given I am on system
    When my system switches between light and dark
    Then the page follows without a reload

  @THEME-006 @site @a11y
  Scenario: The toggle is accessible
    Then the toggle is reachable and operable by keyboard alone
    And its accessible name says the current theme
    And a screen reader announces the new theme when it changes

  @THEME-007 @site
  Scenario: Without JavaScript
    Given JavaScript is disabled
    Then the site follows my system theme
    And the toggle is not shown

  @THEME-008 @component
  Scenario: Components follow the theme
    When the theme changes
    Then every kan- component, including what's inside its shadow root, changes with the page
