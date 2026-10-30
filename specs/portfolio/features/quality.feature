@area-QUAL
Feature: Fast, accessible, and kept that way
  As the owner
  I want quality bars that CI enforces
  so that the site stays an example of the work it advertises.

  @QUAL-001 @ci
  Scenario: Lighthouse
    Then the home page scores at least 95 in performance, accessibility, best practices and SEO on Lighthouse mobile
    And CI fails a pull request that drops any score below that

  @QUAL-002 @ci
  Scenario: JavaScript budget
    Then the home page loads at most 50 KB of JavaScript, gzipped
    And CI fails a pull request over budget, naming the size and the budget

  @QUAL-003 @site
  Scenario: Fonts
    Then fonts are self-hosted, subset to Latin, and only the weights in use are shipped
    And text shows in the fallback font while they load

  @QUAL-004 @site
  Scenario: No third-party requests
    Then loading any page makes no requests to another origin: no trackers, external fonts or CDNs

  @QUAL-005 @site @a11y
  Scenario: Every page passes axe
    Then every page passes axe with no violations in light and in dark

  @QUAL-006 @ci
  Scenario: Works across browser engines
    Then the end-to-end tests pass in Chromium, Firefox and WebKit
