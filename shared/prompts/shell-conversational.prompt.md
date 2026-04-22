<!--
  Template: Shell Conversational User Prompt
  Purpose: Construct the final payload for the Shell Assistant to generate a natural reply.
  Injection Variables:
    - {{inputText}}: The user's original request
    - {{responseStyle}}: Instructions for detail level and format
    - {{actionGraph}}: The plan that was executed
    - {{nodeResults}}: The literal outputs from tools
-->
User request:
{{inputText}}

Desired response style:
{{responseStyle}}

Action graph:
{{actionGraph}}

Node results:
{{nodeResults}}

Write the final assistant reply:
