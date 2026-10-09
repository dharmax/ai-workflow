# Phase 0 Actor audit handoff

Checkpoint: 2026-10-09. Repository: `/home/dharmax/work/ai-workflow`, branch **master**. This handoff was requested by the user; it does not authorize implementation.

## Read first and keep the scope

1. Read `docs/advanced-actor-plan.md`, especially the Prime Directive and J2.4/J2.5 journeys.
2. Read `docs/advanced-actor-phase-0-audit.md`: the authoritative completed audit, causal matrix, exact contracts, controlled experiments and limitations.
3. Read the current repository instructions and `/home/dharmax/.codex/skills/ai-workflow/SKILL.md`. Use AIWF as the primary investigation and work-management system. The user explicitly demanded AIWF “to the maximum,” including Kanban alignment.
4. Inspect current git status and the AIWF ticket dossier before changing anything. Revalidate source revisions; concurrent work is present.

The authorized scope was **Phase 0 plus initial falsification experiments only**. That work has stopped at its boundary. No production correction has been implemented or proven reliable across both hosts. Await the user's next instruction before implementation. Do not interpret the plan's predictions or this handoff as implementation authorization.

Hard constraints: no advanced-actor package/extraction, compiler integration, new routing abstraction, second planner/router, full model/capability catalogs in prompts, compiler-first policy, query-specific handling, fixed escalation count as architecture, or vendor/model names in shared decisions. Preserve existing good behavior and failed evidence. Provider choices belong in existing llm-utils configuration. Start from observed journeys and earliest causal defects, not a preferred architecture.

## AIWF lifecycle and ownership

- Ticket: `TKT-ADV-ACTOR-P0`, “Audit compound Actor failures and falsify minimal corrections.” It remains **Todo/planned, awaiting review**, not Done.
- Evidence Artifact: `AUDIT-ADV-ACTOR-P0-EVIDENCE`, status `observed`, action `phase-0-audit`, linked by `verifies` to the ticket. It includes report/evidence paths and hashes. It is **not** a `VERIFY-TKT-ADV-ACTOR-P0` acceptance receipt.
- AIWF investigation/preparation with production completeness, depth 0, maxArtifacts 8, critic auto returned complete/ready. Preparation applied no changes and ran no critic rounds. This established dossier readiness, not independent audit acceptance.
- The Artifact is visible in the latest investigation dossier. Ticket body records both initial audit and continuation.
- Audit/continuation leases were released and projections synchronized. The brief handoff-writing lease is also released after writing this file. No background experiment remains running.
- Prefer `aiwf investigate TKT-ADV-ACTOR-P0` for review. Do not invoke implementation resolution while the Phase 0 boundary remains in force. Claim the relevant ticket before manual edits; synchronize and release afterward.

## Evidence locations

All paths below are relative to the AIWF repository unless stated otherwise.

| Path | Purpose |
| --- | --- |
| `docs/advanced-actor-phase-0-audit.md` | Human-readable audit and detailed source-contract table |
| `.ai-workflow/state/advanced-actor-phase0/reviewed-runs.json` | Per-run capture index: requests, actual routes/models, context, steps, retries, timing, independent correctness; 29 records at checkpoint, including two excluded harness attempts |
| `.ai-workflow/state/advanced-actor-phase0/SHA256SUMS` | Integrity manifest; 79 files at checkpoint |
| `.ai-workflow/state/advanced-actor-phase0/aiwf-replay.ts` | Diagnostic copy of existing agency gate using actual current WorkflowActor; temporary config, `AUDIT_ARM` and optional route override |
| `.ai-workflow/state/advanced-actor-phase0/aicli-replay.ts` | Actual exported ai-cli `executeIsolatedAsk`, temporary config/session/workspace, connectors disabled |
| `.ai-workflow/state/advanced-actor-phase0/aicli-evidence-pair.ts` | Latest controlled native-model TurnExecutor evidence pair |
| `.ai-workflow/state/advanced-actor-phase0/historical-replay.ts` | Exact historical adapter-method replay against current text-compiler |
| `.ai-workflow/state/advanced-actor-phase0/runtime-contract-probe.ts` | Zero-inference saved-config versus running-Asker probe |
| `.ai-workflow/state/advanced-actor-phase0/index-evidence.py` | Capture-index construction and explicit independent review |
| `.ai-workflow/state/advanced-actor-phase0/record-audit.ts`, `record-continuation.ts` | Diagnostic ledger recording through existing graph/ticket primitives |

The evidence directory is ignored by git. A checkout or commit of the report alone will **not** transfer the raw evidence/scripts to another machine. Preserve/copy that directory explicitly if handing off elsewhere. Do not expose credentials or dump production configuration. Inspect scripts before rerunning; no new live runs are needed merely to resume review.

## Observed results and earliest defects

| Case | Result and causal interpretation |
| --- | --- |
| AIWF mini selector, two runs | Wrong beta-site answer instead of second eligible ticket ORCH-B; about 18/17 seconds. After seeing `project.md`, reads unrelated readings. Earliest defect: evidence acquisition/goal misunderstanding, not timeout. |
| AIWF live compound analysis | Mini exhausts ten steps (~29s), echoing summaries rather than acquiring governing/dependency evidence. Stronger routes complete (~24s/~19s) but substitute active tasks/epic for dependency critical path and miss concrete gaps. Earliest defect: evidence/tactic selection; budget is downstream. |
| AIWF live selector/comparison | Unsupported ranking/artifact claims; schema failure or repeated-observation halt follows the evidence defect. |
| ai-cli native local analysis | Configured Ollama qwen2.5-coder:7b takes ~62s; interpreter chooses answer + workspace_docs, retrieval empty, returns unsupported draft asking user for present files. Zero Actor steps. Earliest defect: host evidence/dispatch boundary; latency also material. |
| ai-cli equivalent ticket selector | Native ~76s, answer + skills_catalog, no workspace inspection; unsupported absence claim. Stronger routes clarify or use unrelated recent-artifact context, so no cross-host selector acceptance. |
| Historical compiler adapter | Exact old method manufactures successful no-op when provider unavailable. Current compiler reports success, zero evidence-service calls, no requested answer. Compiler misuse/false completion; replay limitations below. |

Classification vocabulary retained in the report: goal misunderstanding; model adequacy/latency; evidence acquisition; tactic selection; execution granularity; compiler misuse; tool/discovery defect; termination/budget.

## Controlled falsification and limits

- **Route only, AIWF selector:** existing tools/evidence unchanged. GPT-4o succeeds (~8.9s); Sonnet 4.6 succeeds twice (~10.8/24.1s). No compiler. Better routing materially helps, but faster is not guaranteed.
- **Same mini, metadata hint:** pointing the tool description at `project.md` still fails (~12.4s). Prompt metadata alone is insufficient.
- **Same mini, acquired document observation:** real authorized `cat project.md` observation placed in session yields grounded ORCH-B in one model turn twice (~2.3/2.1s). This is an experimental evidence oracle, not authorization for a query-specific loader.
- **Route only, ai-cli explicit local analysis:** mini/GPT-4o succeed using shell `ls`/`cat project.md` (~20.9/19.6s), through the full runtime. Routing changes the model's dispatch decision; native tools/evidence stay unchanged.
- **Latest same-native-model ai-cli pair:** actual existing TurnExecutor composition, identical shell-only resource surface, route, fresh session and workspace. Normal workspace_docs retrieval is empty: unsupported answer, zero Actor steps, 60,793ms. Only resolver output changed to the actual project document: correct goal, migration→validation→release, missing restore drill, zero Actor steps, 9,725ms. Both use Ollama qwen2.5-coder:7b. Files: `aicli-evidence-pair-baseline.json` and `aicli-evidence-pair-observed-document.json` in the evidence directory.
- The latest pair holds resource classification/catalog startup out of **both** arms; it is not another full `executeIsolatedAsk` acceptance run. One pair is not reliability evidence. Runner warmup/order were not controlled; do not claim evidence caused the entire latency difference or blame cold start without server evidence.
- **Granularity treatment not warranted yet:** ordinary mini helper already computes 25/61/64 and difference 39 via executed/deleted scratch code; comparison control also succeeds. Stronger live Actor already batches calls yet remains ungrounded. No demonstrated deterministic coordination defect justifies compiler integration.
- **Saved settings probe:** existing Actor retains old mini task target after config changes; reconstructing it sees the new target. Zero inference calls. Independent J2.5 runtime-refresh defect.

Do not hide failed or invalid experiments. The unchanged automated gate marks acquired-evidence success false because it requires observations inside Actor events; actual pre-acquired observation and independent review are preserved. No tests were weakened. Excluded harness attempts include missing scratch authority and a mislabeled repeat that did not activate the evidence hook; valid repeats are separate. Historical replay erases only TypeScript method-signature syntax and forces the unavailable branch, but uses **current** compiler dependencies: it is not a full historical checkout/live model run. Old transcript `fe73087` lacks adequate provider/tool trace and is not counted as live proof.

## Conclusions and candidate next steps

Observed evidence supports model adequacy/latency as a contributing factor and evidence acquisition/dispatch as a causal defect across both hosts. **Routing alone does not fix the tested class.** Same-model document observations succeed in both hosts, but a general correction and reliability remain unproven.

Existing shared `LLMActor`, `LLMSession`, `Asker` and `ModelRouter` are usable stable primitives. Higher-level shared policy is not proven: dispatch, discovery, context and execution authority differ. **`@dharmax/advanced-actor` is not justified.** Deterministic temporary computation is not justified by these failures. System-1 tactical benefit is unproven; it was absent/null in important runs and current ai-cli assessment primarily addresses safety/presentation.

If the user later authorizes implementation, the smallest J2.4 candidate is ai-cli's **empty-required-workspace-context boundary**: continue via existing Actor/resource/shell mechanisms instead of treating an unsupported draft as successful completion. Preserve direct-answer/simple controls and safety. This is a candidate, not an implemented fix; the successful experimental resolver is not a ready production design.

AIWF separately needs bounded qualification of governing/dependency evidence through existing discovery, keeping route unchanged. Do not combine routing, evidence and granularity changes to obtain green results. J2.5 settings/runtime refresh and executed-target display are an independently demonstrated host issue; qualify separately rather than bundling it with J2.4.

## Current source contracts worth revisiting

The audit has exact file/method references. Use AIWF outline/slice/callers in the correct project scope instead of whole-file dumps.

- llm-utils owns routing/fallbacks/provider options; explicit task routes outrank advice. Normal advice lookup does not refresh/research/pull. Failover excludes failed providers, not quality tiers within one provider.
- General AIWF Actor uses run_command and optional bounded discovery, ten-step default, mode task routes; no general System-1 tactical gate. Radar recommendations are not observed executed-target evidence.
- ai-cli's interpreter can return an answer before reaching shell-capable Actor. workspace_docs reads the workspace knowledge DB; empty retrieval does not establish missing files. Default Actor budget is four/eight steps depending on interpreted requirements.
- Current AIWF compiler tools accept Actor-authored source; they do not synthesize through text-compiler. Text-compiler execution/service binding is not an ambient-JS sandbox; its compile options have no caller AbortSignal contract.
- AIWF config changes do not rebuild the running Asker. Doctor/provider listing does not establish successful inference.

For sibling CLI graph queries, run from that repository, for example `bun /home/dharmax/work/ai-workflow/src/cli.ts outline src/executor.ts` with cwd `/home/dharmax/work/ai-cli`. Empty lookup under the wrong project is not evidence of absence. Current MCP may offer explicit `projectRoot`; inspect its actual schema first.

## Workspace preservation and validation

Audited revisions: AIWF `4e6e59a31937da8a52c23c25890b0bb8646bf72f`; ai-cli `34701c693629cc49eda59667a575c01938a2765a`; llm-utils `ba285434f14f20ad1662ea0924799a81c3394706`; text-compiler `4f76f5ad1a93fcea667da731be1324d4d5c0ec3c`. Both hosts resolve sibling llm-utils **source**, AIWF resolves text-compiler **source**. Recheck before interpreting new results.

At handoff writing, AIWF has modified `kanban.md`, `modules.md`, `skills/ai-workflow/SKILL.md`, `src/mcp.ts`, `src/setup.ts`; untracked audit report, `docs/agency-phase-0-audit.md`, `docs/client-investigation-guidance.md`, `package-lock.json`, `src/client-guidance.ts`, `tests/mcp-client-investigation.test.ts`. The client-guidance source/docs/tests belong to concurrent `TKT-CLIENT-GRAPH-FIRST` work, not this audit. The agency audit and package-lock were preexisting. Sibling ai-cli already had dirty bun.lock/Kanban/modules; llm-utils had dirty bun.lock. Preserve all of this; no reset, stash, broad staging or unrelated commit.

Our work: diagnostic evidence/scripts, `docs/advanced-actor-phase-0-audit.md`, this handoff, audit ticket/evidence graph and associated projection updates. No production source edits, commits, branches, or persistent production model settings were made by this audit. No full suite/typecheck was rerun for diagnostic-only work; verification was live black-box experiments, exact source contracts, independent grounding review, script execution, diff checks and synced ledgers. Do not represent that as production acceptance.
