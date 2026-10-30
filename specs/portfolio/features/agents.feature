@area-AGENT
Feature: Readable by agents
  As an AI assistant researching Ian for someone
  I want the site's content in clean, structured, honest forms
  so that my answers about Ian are accurate and up to date.

  @AGENT-001 @site
  Scenario: llms.txt
    Then /llms.txt follows the llms.txt convention
    And summarizes who Ian is and links to the Markdown version of every page

  @AGENT-002 @site
  Scenario: A Markdown version of every page
    Then every page has a Markdown version at the same path ending in .md
    And it's generated from the same content collections as the page

  @AGENT-003 @site
  Scenario: Structured data
    Then the home page has JSON-LD for Ian as a Person, with job title and profile links
    And each featured project as a SoftwareSourceCode entry with its repository and demo links

  @AGENT-004 @site @security
  Scenario: Agents read what people see
    Then no page contains text that is hidden from people but readable by agents
    And every sentence in a page's Markdown version also appears on the page

  @AGENT-005 @site
  Scenario: AI crawlers are welcome
    Then /robots.txt allows every crawler, AI crawlers included, and lists the sitemap
