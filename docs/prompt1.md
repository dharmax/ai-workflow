Continue the original agency-restoration goal on master. Keep its full acceptance criteria. Do not declare completion until the complete adversarial Agency Gate and all three mandatory live requests genuinely pass.

Change direction: prioritize the recurring routing, execution-authority, evidence, and progress defects. Stop treating more prompt wording as the primary repair strategy.

Preserve demonstrated fixes, unrelated work, and all failed runs. Audit speculative changes separately; explain any removal before making it. Follow ticket leasing and ledger synchronization requirements.

First, write a short defect ledger. For each recurring failure, identify:
- the exact preserved reproduction;
- the responsible runtime contract or model decision;
- the causal hypothesis;
- the smallest experiment that could falsify it;
- the evidence required to accept a fix.

Address these problems:

1. Routing and fallback
Establish the intended contract for ordinary requests, configured mode/task routes, explicit model choices, locality, and fallback. Resolve the code-versus-dev mismatch rather than preserving surprising behavior accidentally.

Eligible fallbacks must have concrete, valid provider/model targets. Account for OpenRouter explicitly; do not silently make local Qwen the only practical recovery path. Preserve explicit user choices and genuine local-only restrictions.

Distinguish provider availability, valid structured output, and successful goal completion. HTTP200 is not evidence of competence. Record every attempted route and the actual model used. Do not select a stronger model merely to obtain green acceptance.

2. Read-only execution authority
Reproduce a read-only request that attempts project writes or dependency installation. Enforce its authorized scope through the existing execution path, rather than relying solely on instructions.

Preserve legitimate implementation work and ephemeral computation. Temporary helpers may operate in an appropriate scratch area, but must not alter project records or become fabricated evidence. Do not introduce phrase-based read/write classification, command blacklists as the whole solution, or a second executor.

3. Evidence and provenance
Reproduce:
- “the guessed path is absent” becoming “the project has no records”;
- invented sample records becoming evidence for an answer.

Preserve the distinction between observed project facts, assumptions, generated examples, and helper output. Missing evidence must lead to investigation or a concrete unresolved limitation, not manufacturing facts. Creating a computational helper is different from creating the data the user asked to inspect.

4. Progress and termination
Reproduce repeated identical run_command observations consuming the budget. Repair the general progress contract without treating every shell command as read-only or blocking legitimate repeated mutations.

Distinguish model-selected final_answer and runtime completed from verified task success. Use existing Actor and verification contracts; do not add another planner/orchestrator or query-specific answer validator.

For every production edit:
- state the hypothesis and falsifying experiment first;
- reproduce the failure before fixing it;
- make the smallest supported general change;
- verify both the failure case and working behavior that could regress;
- test the real configured model route, recording it precisely.

Do not add another prompt clause without demonstrated benefit. Negative experiments are evidence against that proposed fix; do not repeatedly reopen them without new evidence.

Only rerun the complete Agency Gate after targeted experiments demonstrate an improvement. Preserve every failure and independently inspect scope, provenance, grounding, and correctness. No success claims from keyword matches, mocked model decisions, component tests, fortunate reruns, or runtime completion.

The bootstrap must remain tiny and discovery-independent. Preserve discovery-off, misleading/failed discovery, forced-DEV, paraphrase, self-extension, and complete public trace requirements. No full catalog, baseline script_eval, query-specific ranking/ordinal/critical-path logic, or parallel framework.

Continue autonomously while meaningful work is available. Report concrete progress and remaining failures candidly. Stop only when the original goal is genuinely achieved or a verified external blocker prevents further meaningful progress.
