<!--
  Template: Shell Planner User Prompt
  Purpose: Construct the final payload for the Shell Planner for a single turn.
  Injection Variables:
    - {{catalog}}: Available actions/capabilities
    - {{runtimeContext}}: Environment details (cwd, project title)
    - {{guidanceContext}}: Extracted guideline snippets
    - {{groundingContext}}: Evidence from the repo (status, tickets, etc)
    - {{notesLoreExtra}}: Recent history and memory summary
    - {{schemaPrompt}}: The required JSON output format
    - {{inputText}}: The user's literal request
-->
## Available Actions (Your Capabilities):
{{catalog}}

## Runtime Context
{{runtimeContext}}

## Guidance Highlights
{{guidanceContext}}

## Grounded Repo Evidence
{{groundingContext}}

## History & Notes
{{notesLoreExtra}}

## Schema
{{schemaPrompt}}

## Current User Request:
{{inputText}}

Your Response (JSON):
