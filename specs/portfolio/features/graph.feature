@area-GRAPH
Feature: The spec graph: intents, journeys and behaviors
  As the owner working with coding agents
  I want every behavior tied to the journeys it serves and the intents behind them
  so that an agent can find what exists and why before it adds or changes anything.

  @GRAPH-001 @specs
  Scenario: Three layers in three places
    Then intents live in specs/portfolio/intents, one Markdown file each with YAML front matter
    And journeys live in specs/portfolio/journeys, one Markdown file each with YAML front matter
    And behaviors are Gherkin scenarios in specs/portfolio/features

  @GRAPH-002 @specs
  Scenario: Permanent IDs
    Then intents are INT-NNN, journeys are JRN-NNN and behaviors are AREA-NNN
    And every ID is unique across the whole graph
    And each behavior has exactly one ID tag, whose area matches its feature's @area- tag

  @GRAPH-003 @specs
  Scenario: Edges live in journeys
    Then each journey lists the intents it serves and each of its steps lists the behaviors it relies on
    And intents and behaviors don't list their own edges, so there is one source of truth

  @GRAPH-004 @specs
  Scenario: Nothing is orphaned
    Then every active intent is served by at least one active journey
    And every active journey serves at least one intent and every step names at least one behavior
    And every active behavior is named by at least one journey step

  @GRAPH-005 @specs
  Scenario: References must resolve
    Given a journey names an intent or behavior ID that doesn't exist or is retired
    When the specs are checked
    Then the check fails, naming the journey file and the bad ID

  @GRAPH-006 @specs
  Scenario: Gherkin must parse
    Given a feature file with invalid Gherkin
    When the specs are checked
    Then the check fails, naming the file and line

  @GRAPH-007 @specs
  Scenario: The graph is generated
    When I run "bun run specs:graph"
    Then GRAPH.md is written with a Mermaid diagram of intents and journeys and, per journey, its steps and behaviors
    And graph.json is written with every node and edge for agents to read
    And the spec check fails when either is out of date

  @GRAPH-008 @specs
  Scenario: Trace any node
    When I run "bun run specs:trace" with an intent, journey or behavior ID
    Then it prints the intents above it and the journeys and behaviors around it, each with its title and file location
    And for a behavior, the other behaviors that share its journey steps

  @GRAPH-009 @specs
  Scenario: Find where a request belongs
    When I run "bun run specs:find" with a few words
    Then it lists the intents, journeys and behaviors whose text matches, best match first, with their IDs

  @GRAPH-010 @specs
  Scenario: Retiring instead of deleting
    Then a dropped intent or journey is marked status: retired and a dropped behavior is tagged @retired
    And retired nodes stay in the files, keep their IDs, and are left out of the coverage checks
    And no ID is ever reused
