<!--
  Template: Operator Brain User Prompt
  Purpose: Construct the final payload for the AI Planner for a single turn.
  Injection Variables:
    - {{runtimeContext}}: Environment details (cwd, project title)
    - {{managedContext}}: Condensed high-density conversation summary
    - {{historyContext}}: Raw recent turn logs
    - {{groundingContext}}: Evidence from the repo (status, tickets, etc)
    - {{schemaPrompt}}: The required JSON output format and helpers
    - {{inputText}}: The user's literal request
-->
## Environment
{{runtimeContext}}
{{managedContext}}

## Session History
{{historyContext}}

## Evidence
{{groundingContext}}

## Schema
{{schemaPrompt}}

## Request:
"{{inputText}}"

Your Response (JSON):
