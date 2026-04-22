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

## Environment
{{runtimeContext}}

## Guidelines
{{guidanceContext}}

## Evidence
{{groundingContext}}

## History & Notes
{{notesLoreExtra}}

## Schema
{{schemaPrompt}}

## Request:
"{{inputText}}"

Your Response (JSON):
