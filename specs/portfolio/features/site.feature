@area-SITE
Feature: The site: who I am and what I build
  As a visitor (a recruiter, a hiring manager or another engineer)
  I want to learn quickly who Ian is, what Ian works with and what Ian has built
  so that I can decide to look closer or get in touch.

  @SITE-001 @site
  Scenario: The first screen says who and what
    When I open the home page at 375px or 1280px wide
    Then my first screen shows Ian's name, role, a one-line focus, and links to GitHub, LinkedIn and email

  @SITE-002 @site
  Scenario: Featured projects
    Then each featured project shows its name, a one-line summary and its stack
    And links to its source, and to its live demo when there is one
    And projects appear in the order set in the content

  @SITE-003 @site
  Scenario: The tech stack, grouped
    Then the stack section shows the current stack in the groups set in the content
    And each item is an kan-tag

  @SITE-004 @site
  Scenario: About
    Then an about section gives a short bio
    And what Ian is working on now, shown as an kan-plan

  @SITE-005 @site
  Scenario: Contact without a backend
    Then contact is a mailto link plus LinkedIn and GitHub
    And there is no form

  @SITE-006 @site
  Scenario: Content is data
    Then projects, the stack, the bio and links come from Astro content collections with a schema
    And an entry missing a required field fails the build, naming the file and the field

  @SITE-007 @site
  Scenario: Built only from the design system
    Then pages are composed from kan- components and semantic tokens
    And site styles contain no raw color values and no primitive token properties

  @SITE-008 @site
  Scenario: Readable without JavaScript
    Given JavaScript is disabled
    Then every page's text, project details and links are present and work
    And only the theme toggle and animations are missing

  @SITE-009 @site
  Scenario: A 404 in the terminal voice
    When I open a path that doesn't exist
    Then I see a "command not found" page with a link home
    And the response status is 404

  @SITE-010 @site
  Scenario: Shares well
    Then every page has a title, a description, a canonical URL under https://iankaneshiro.github.io, and Open Graph and Twitter card tags with an image
    And the favicon uses the brand mark

  @SITE-011 @site @a11y
  Scenario: Landmarks, headings and a skip link
    Then the first focusable element skips to the main content
    And each page has header, main and footer landmarks
    And exactly one h1, with no skipped heading levels

  @SITE-012 @site
  Scenario: Responsive from phone to wide desktop
    Then no page scrolls sideways at any width from 320px to 1920px

  @SITE-013 @site
  Scenario: The home page reads like an agent session
    Then the hero is a prompt asking who Ian is, answered by a few tool calls and a short summary
    And every word of it is in the page HTML from the start
    And any reveal animation is skipped when the visitor prefers reduced motion

  @SITE-014 @site
  Scenario: How this site was built
    Then a page shows the spec graph: the intents, the journeys that serve them and the behaviors behind each step
    And it is generated from graph.json at build time, with links to each spec file in the source repo
