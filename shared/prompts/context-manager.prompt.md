<!--
  Template: Context Manager User Prompt
  Purpose: Perform the actual condensation of the latest turn into the managed context.
  Injection Variables:
    - {{currentContext}}: The existing condensed summary
    - {{lastUserTurn}}: The user's prompt
    - {{lastAiTurn}}: The AI's result/reply
-->
## Current Managed Context
{{currentContext}}

## New Turn
User: {{lastUserTurn}}
AI: {{lastAiTurn}}

## Task
Produce the updated, condensed managed context.
