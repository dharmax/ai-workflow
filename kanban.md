---
kanban-plugin: board
---

# Kanban

_Generated from the workflow DB. Edit through `ai-workflow project ...` or `ai-workflow sync`._
_Core lanes are fixed. Rare lanes only render when they contain cards. `Archived` history lives in `kanban-archive.md`._

## Deep Backlog

- No items

## Backlog

- No items

## ToDo
<!-- canonical alias: ## Todo -->

- No items

## Bugs P1

- No items

## Bugs P2/P3

- No items

## In Progress

- No items

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] TKT-KNOWLEDGE-LOOP-001 Strengthen knowledge capture and reuse ✅ 2026-04-20
  - Summary: Upgrade project knowledge from mostly static config to a loop that captures findings, promotes durable knowledge, updates it after successful work, and reuses it in later shell reasoning.
  - State: archived
- [ ] TKT-SHELL-INTROSPECTION-001 Improve shell introspection and self-configuration ✅ 2026-04-20
  - Summary: Make the shell understand its tools, providers, and capabilities well enough to answer configuration questions from natural language and to propose or apply safe self-configuration changes when appropriate.
  - State: archived
- [ ] TKT-SHELL-TRUST-001 Make shell proof and tests auditably honest ✅ 2026-04-20
  - Summary: Replace weak shell proof with transcript- and artifact-backed verification so operator-facing claims are defensible. Cover real shell turns, generated plans, execution path, and failure visibility instead of narrow mocked success paths.
  - State: archived
- [ ] TKT-ARTIFACT-RECOGNITION-001 Improve artifact boundary and drift recognition ✅ 2026-04-20
  - Summary: Make sync and shell reasoning better at identifying features, modules, ownership boundaries, purpose, and drift so recommendations and plans are grounded in the real project structure.
  - State: archived
- [ ] TKT-FIXER-LOOP-001 Build a real autonomous fixer loop ✅ 2026-04-20
  - Summary: Turn 'sweep bugs' into a trustworthy fix-execute-verify-retry loop that records why it acted, what it changed, what failed, and what it learned. Bias toward fixing and coding over parallel dispatch work.
  - State: archived
- [ ] TKT-SHELL-TRACE-001 Add file-backed shell trace without console pollution ✅ 2026-04-19
  - Summary: Support commands like 'trace on file <path>' so AI and workflow trace can be captured to a file while keeping the interactive console readable. Include destination visibility and tests.
  - State: archived
- [ ] BUG-SHELL-PLANNER-CAPABILITIES Shell planner answers capability/model questions with generic LLM advice ✅ 2026-04-19
  - Summary: Conversation-mode shell answers operator questions like 'teach me how to use you' and 'which llms would you use?' with generic assistant text instead of ai-workflow-specific commands, connected providers, and shell-scoped guidance.
  - State: archived
- [ ] TKT-SHELL-ADVICE-001 Add proactive shell advice with guardrails ✅ 2026-04-20
  - Summary: Use workflow DB state, recent failures, and model synthesis to surface timely operator advice before the user asks, while keeping the signal high and avoiding noisy interruptions.
  - State: archived
- [ ] TKT-SHELL-FINDINGS-001 Grade and structure shell findings before execution ✅ 2026-04-20
  - Summary: Have the shell classify findings by importance, attach tags and evidence, and return a structured plan before mutating so the user gets a useful decision surface instead of a flat answer.
  - State: archived
- [ ] BUG-SHELL-OLLAMA-FOLLOWUP Shell misroutes short provider follow-ups like 'what about ollama?' ✅ 2026-04-19
  - Summary: After provider/model discussion, a short follow-up like 'what about ollama?' is classified as a generic status query and rendered as project status instead of provider status or Ollama-specific guidance. The generic status heuristic fires before provider-status handling.
  - State: archived
- [ ] TKT-SHELL-AUDIT-001 Make shell dogfood evidence and metrics audit-grade ✅ 2026-04-19
  - Summary: The current dogfood/reporting path still leaves critical trust gaps: the report does not show per-turn model provenance, the raw transcript is dominated by JSON envelopes so English->JS evidence is unclear, deterministic run_codelet routing is not distinguished from model-authored JS, and metrics still show zero token usage plus weak per-session accounting. Implement audit-grade provenance, transcript artifacts, and metrics so a user can verify what the shell planned, what JS it generated, what codelet executed, which model/provider was used, and what the session actually cost.
  - State: archived
- [ ] TKT-HONESTY-001 Enforce shell honesty and manual-contamination detection ✅ 2026-04-19
  - Summary: Add first-class workflow evidence that separates ai-workflow-authored work from manual edits, blocks closure when manual contamination exists, and makes failure honesty DB/kanban-auditable.
  - State: archived
- [ ] TKT-HONESTY-003 Add gap guardrails and escalation policy ✅ 2026-04-19
  - Summary: Detect wish-vs-done gaps, choose recovery actions such as retry/escalate/web-search/user-input/trial-and-error, persist them in the workflow DB, and surface them in verification and audit outputs.
  - State: archived
- [ ] TKT-HONESTY-004 Add workflow note resolution and stale-risk retirement ✅ 2026-04-19
  - Summary: Add a DB-backed note resolution flow so stale BUG/RISK/TODO evidence can be retired with explicit reason, excluded from readiness blockers, and archived in candidate/projection state when later work closes the gap.
  - State: archived
- [ ] BUG-SHELL-JS-RESULT-RENDERING Operator JS workflows hide successful structured results from the shell ✅ 2026-04-19
  - Summary: When the planner falls back from English to generated JS and the JS returns a structured result, the shell only prints 'Workflow completed successfully' instead of the returned summary or verification payload. The transcript shows module discovery succeeding but no modules displayed.
  - State: archived
- [ ] TKT-PROGRAMMING-DOGFOOD-001 Add smart programming dogfood that generates and verifies a modular emoji Space Invaders game ✅ 2026-04-18
  - Summary: Create an ai-workflow-driven programming dogfood flow that plans, brainstorms, implements, tests, debugs, and reports on a generated dedicated-folder project: a modular expandable 3d canvas Space Invaders-style game using emoji ships, epics/features/modules/vision, and readable efficiency metrics.
  - State: archived
- [ ] TKT-SMART-CODELET-003 Add routed fallback and degraded diagnostics to smart codelet runner ✅ 2026-04-18
  - Summary: Programming dogfood exposed that runSmartCodelet can fail hard on a blocked recommended provider instead of trying the router fallback chain or returning a structured degraded result with route diagnostics.
  - State: archived
- [ ] TKT-HONESTY-002 Make dogfood and audit fail on mixed manual-plus-shell artifacts ✅ 2026-04-19
  - Summary: Detect and report when a dogfood target was repaired outside ai-workflow, persist that evidence, and fail dogfood/workflow-audit until a clean run exists.
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-005 Plan active guardrail compilation from guidelines ✅ 2026-04-18
  - Summary: Automatically convert repo guidelines into effective active guardrails that are enforced across all execution surfaces and modes, including shell and non-shell flows.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-METRICS-COVERAGE-005 Record smart codelet and artifact judge runs in metrics summaries ✅ 2026-04-18
  - Summary: Programming dogfood now succeeds, but metrics remain misleading because artifact evaluation and smart codelet executions do not append metric events, so the efficiency/reporting surface only reflects older shell-planning data.
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-001 Plan epic and projection integrity repair ✅ 2026-04-18
  - Summary: Define how to repair malformed epic and projection state so new planning work lands on clean DB-backed workflow surfaces.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-ARTIFACT-JUDGE-002 Harden artifact judge against non-structured model output and add fallback routing ✅ 2026-04-18
  - Summary: Dogfood exposed that artifact verification can accept junk non-JSON model output as a normal needs-human-review result instead of retrying alternate providers and clearly flagging an unstructured verdict failure with diagnostics.
  - State: archived
- [ ] TKT-ROUTE-REDACTION-004 Redact route candidate credentials in verification and smart codelet payloads ✅ 2026-04-18
  - Summary: Regression output showed that route sanitization only redacts route.providers, leaving recommended/fallbackChain/candidates entries with raw apiKey values in JSON payloads.
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-002 Plan DB coverage for features modules and host surfaces ✅ 2026-04-18
  - Summary: Define required DB representations for features, modules, shell surfaces, and plugin or MCP host integrations involved in the new work.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-SHELL-METRICS-001 Expose shell fallback failures and richer metrics for degraded planning runs ✅ 2026-04-18
  - Summary: Reproduce shell planning/provider fallback degradation, surface the failing phase/provider chain more clearly, and extend metrics/reporting so dogfood runs show where time and failures were spent.
  - State: archived
- [ ] TKT-SHELL-TRANSCRIPT-001 Harden shell transcript judge against malformed model output ✅ 2026-04-19
  - Summary: Dogfood still shows shell transcript judge returning raw numeric arrays instead of a structured verdict. Add parser hardening, routing fallback, and regression coverage.
  - State: archived
- [ ] TKT-SHELL-MODES-001 Plan canonical shell work-mode model ✅ 2026-04-18
  - Summary: Define operator-visible shell work modes for planning, fixing, feature work, auditing, bug-hunting, and auto, while keeping mutation safety enforced internally.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-003 Plan shared governance hooks for shell and host integrations ✅ 2026-04-18
  - Summary: Specify how shell, ask, operator-brain, JS orchestrator hooks, and plugin or MCP adapters consume one shared DB-backed judgment core.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-004 Plan shell capability intelligence and project situational awareness ✅ 2026-04-18
  - Summary: Define how the shell learns built-in, configured, and project-provided capabilities; explains and improves them with the user; and grounds every development discussion in live features, epics, surfaces, modules, problems, and plans.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-SHELL-MODES-002 Plan shell mode inference and override UX ✅ 2026-04-18
  - Summary: Define automatic mode selection plus explicit commands like mode <name>, mode auto, and mode status, including session persistence rules.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-SHELL-MODES-004 Plan shell mode visibility in DB and transcripts ✅ 2026-04-18
  - Summary: Define how effective mode, mode source, and mode transitions are recorded, projected, and exposed to operators and host integrations.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-GOE-002 Plan default-on GoE policy and overrides ✅ 2026-04-18
  - Summary: Define project-level default enablement, session and request overrides, and the narrow cases where trivial or deterministic work bypasses GoE.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-SHELL-MODES-003 Plan mode-aware routing and execution policy ✅ 2026-04-18
  - Summary: Map each shell work mode onto task classes, routing strategy, action eligibility, mutation posture, and answer style.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-GOE-004 Plan GoE on shell interpretation and produced code ✅ 2026-04-18
  - Summary: Define how GoE governs shell planning and interpretation itself and also audits the actual code or fix artifacts produced by the workflow.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-GOE-001 Plan fixed v1 GoE triad and iteration contract ✅ 2026-04-18
  - Summary: Define the suggester, critic, and auditor or escalator loop, including bounded retries, approval rules, and third-persona escalation after repeated dissatisfaction.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-GOE-005 Plan GoE escalation outcomes and human handoff ✅ 2026-04-18
  - Summary: Define stronger-model escalation, unsolved-problem tickets for the user, stored evidence, and explicit approve or reject verdicts.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-GOE-003 Plan GoE coverage for coding and debugging work ✅ 2026-04-18
  - Summary: Define how GoE wraps most coding and debugging work by default, especially when routed through weaker or cheaper models.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] 272af4783f188efd601c99883e18eca9320dee2d Initialize Project ✅ 2026-04-19
  - State: archived
- [ ] d90a89c1cc0ce2a2b88e14a1479d9abf96c6a752 Modular, Expandable 3D Canvas Space Invaders-style Game with Emoji Ships ✅ 2026-04-19
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
