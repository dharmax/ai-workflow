# Cycle 4 — Actor, tools, configuration and operational Stories

**Migration note (2026-10-21):** Candidate US/source inventory for [the revised US-led test digestion plan](US-TEST-CONSOLIDATION-PLAN.md). The earlier cycle labels and file-centric retirement proposals are historical; do **not** treat them as the final accepted Story catalog, test-file organization, numerical reduction goal or instructions to discard real non-pristine/sub-flow/bug cases.
Status: **proposed**, reviewed test-oracle map; these are not auto-accepted Product records.

## US-A01 — Complete a compound personalized engineering request
**Actor/intent:** Developer asks a multi-stage project question/action; Actor chooses and composes existing capabilities rather than demanding one exact matching tool.
**Initial:** A real project and bounded registered capabilities.
**Action:** Ask for project status, critical path, relevant proof and an explicit follow-up action.
**Observable:** Grounded answer/observations and coherent tool sequence, with honest partial result and no invented current-state claims.
**Adverse:** Failed discovery, disabled capability, missing model, repeated observation, explicit cancellation and true unsupported goal.
**Owners:** `user-story-j24-sophisticated-goal`, `actor`, `tool-discovery`, `actor-engine-boundaries`.

## US-A02 — Discover capabilities semantically without tool-registry flooding
**Actor/intent:** Agent needs a bounded, specific executable capability.
**Initial:** Domain/object/action registry with optional classifier or System-1.
**Action:** Qualify natural request, discover exact narrow capabilities and recover after a classified miss.
**Observable:** Candidate descriptions and constraints survive; no broad fallback exposing whole registry or disabled capability.
**Adverse:** Unclassifiable request, missing tuple, low-quality classification, cancellation and schema mismatch.
**Owners:** `tool-discovery`, `actor`, `primitive-truth`; MCP public subset in `product-operability-parity`.
**Technical:** Registry/qualifier unit tests remain necessary even where public Story passes.

## US-A03 — Execute useful read-only work without authority escalation
**Actor/intent:** Agent reads/evaluates project data and may compute in a bounded scratch area.
**Initial:** Host read-only authorization and explicit scratch root.
**Action:** Inspect source, run permitted observations, attempt an unauthorized project mutation.
**Observable:** Observations available; project unchanged; scratch boundaries and cancellation respected.
**Adverse:** Direct store/registry writes, symlink scratch escape, script evaluation, nested/detached upgrade and project-root redirection refuse.
**Owners:** `os`, `pc1a-safety`, `actor-engine-boundaries`, `actor-prompts`, `p0-engineering`, `mcp-client-investigation`.

## US-A04 — Honor live model configuration and escalation without fabrication
**Actor/intent:** Developer configures task-appropriate routes, reloads them and wants honest failure/partial progress.
**Initial:** Project/global config with or without cloud/local providers.
**Action:** Inspect/change/reload default and task routes, execute a bounded Actor operation.
**Observable:** Same effective route as displayed config; configured locality and explicit caps honored; no fabricated provider and no double counting.
**Adverse:** Invalid credentials/URL, unavailable route, transport error, stalled discovery and cancellation.
**Owners:** `model-service`, `config`, `actor-runtime-refresh`, `actor-review-regressions`, `escalation`, `actor-budget-policy`, `execution-economics`.

## US-A05 — Discover and use project skills or synthesized capability truthfully
**Actor/intent:** Agent needs installed project knowledge or a genuinely available skill.
**Initial:** A project with optional skill bundles and registry state.
**Action:** Find, load, verify, activate and optionally synthesize source from grounded Ticket context.
**Observable:** Correct project isolation, source/provenance, exact failure when malformed/missing, no invented capability.
**Adverse:** Cross-project contamination, malformed SKILL, failing sync, missing dependency, ungrounded synthesis and provider failure.
**Owners:** `skill-manager-bridge`, `skill-synthesis-acceptance`, `kb`, `source-synthesis`, `structured-repair`, `compiler`.
**Technical:** Retired raw patch refusal remains a safety counterexample, not an ordinary feature Story.

## US-A06 — Initialize, configure and diagnose the actual installed application
**Actor/intent:** Developer sets up AIWF for a new or existing repository.
**Initial:** Empty project, prior install, malformed config, optional hosts and existing host permissions.
**Action:** Inspect/init/setup/check/doctor, invoke real CLI, repeat or recover.
**Observable:** Real discoverable installation, correct binary exit status, synchronized checked-in/generated Skill, no mutation from check/help and no replacement of unrelated host settings.
**Adverse:** Invalid TOML/JSON, missing host, filesystem failure and stale setup do not report success.
**Owners:** `setup`, `setup-truth`, `config`, `shell-config-setup`, `cli-help`, `mcp`.
**Gap:** Real CLI help subprocess failure needs a captured stdout/stderr/exit diagnostic rather than additional fake assertion layers.

## US-A07 — Inspect actionable traces and truthful execution economics
**Actor/intent:** Developer diagnoses an incomplete Actor/tool run and actual local-vs-remote costs.
**Initial:** A real sequence of observations/errors, optionally previously stored.
**Action:** Inspect trace, metrics and latest run after restart.
**Observable:** Partial failures stay failures, observations and provenance retained, secret/source content excluded from aggregates and unknown price not presented as free.
**Adverse:** Renderer error, transient telemetry writer failure, repeated/reloaded sessions and uncertain model locality.
**Owners:** `shell-trace`, `performance-metrics`, `execution-economics`, `actor-runtime-refresh`.

## US-A08 — Navigate and act through a bounded daily command surface
**Actor/intent:** Developer uses direct commands for Ticket/graph/status, optional interactive completion and explicit source reads.
**Initial:** Active project graph with eligible and ineligible work.
**Action:** Ask next/claim/status, inspect direct view, cancel or enter only missing arguments.
**Observable:** Shell and CLI share graph truth and command parser; no accidental Done, hidden LLM call or mutation during help.
**Adverse:** Foreign lease, invalid lane, flags-as-literals, missing input and noninteractive cancellation.
**Owners:** `shell-daily`, `shell`, `artifact-command`, `product-operability-commands`, `tools`.

## Technical/maintenance contracts — retain without made-up Stories
- `actor-prompts`, `actor-budget-policy`, `actor-engine-boundaries`: prompt authority, budget arithmetic and test override cleanup.
- `escalation`, `model-service`, `config`, `structured-repair`: specific provider contracts.
- `kb`, `skill-manager-bridge`, `source-synthesis`: checksum, lifecycle, source provenance.
- `os`, `debugger`: subprocess truncation/cancellation, path parsing and exact source locations.
- `performance-metrics`, `execution-economics`, `store-lifecycle`: persistence and faithful accounting.
- `radar`: existing separate Radar test suite stays untouched by P0 and remains separately scoped (unfinished Radar work was deliberately isolated).

## Cycle 4 overlap candidates
| Candidate | Retain/reconcile with | Materially different checks |
|---|---|---|
| `model-service`, `actor-runtime-refresh`, `actor-review-regressions`, `escalation` | One effective-route contract plus one real Actor reload/escalation Story | Cloud-vs-local, explicitly forced route, credentials and stalled discovery |
| `setup`, `setup-truth`, `config`, `shell-config-setup` | One setup/doctor host journey plus narrow config parser/failure contracts | Setup check truly inert, host permission preservation, malformed state and actual CLI |
| `shell`, `shell-daily`, `product-operability-commands` | Shared parser contract and one human/interactive Story | TTY prompts, cancellation, direct no-LLM path, command equivalence |
| `actor`, `tool-discovery`, `user-story-j24-sophisticated-goal` | Keep compound public goal plus small registry/discovery contract | Error recovery, disabled tool, bounded discovery and multi-stage composition |
| `tools` generic smoke vs specialist tests | Specialist owns behavior; generic smoke only proves registry wiring | Do not remove actual registry surface/integration proof |

### Cycle 4 double-check
All 13 Actor-category and six Capabilities-category files are assigned here; setup and Shell/public-interface files are cross-referenced with Cycle 1. Test count is not a target. Consolidate shared fixture/logic and delete exact duplicated expectations only where a stronger retained public oracle already proves the *same behavior and same failure boundary*.

### Follow-up double-check
The two local-only escalation cases are **not duplicates**: one completes normally, the other stalls with repeated observations. ModelService default reload and Actor task-route reload likewise protect different contracts. Retain all four until a stronger replacement proves both behaviors.

### Cycle 9 implementation-owner consolidation
`actor-review-regressions.test.ts` retired. Default/explicit model routes belong to `model-service.test.ts`; SOTA locality and fresh escalation discovery budget belong to `escalation.test.ts`. The disabled discovery matrix duplicate in `actor.test.ts` is represented by its stronger standalone counterexample. No new tests, fixtures or source paths.
