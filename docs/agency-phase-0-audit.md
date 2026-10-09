# Agency Phase 0 audit — 2026-10-08

Audit only, on `master`. Production code is unchanged. Phase 1 has not begun.
Gate 0 is **STOP: safety baseline requires a plan correction**. Existing authority
metadata is not an enforcement boundary shared by all tools; deterministic block
patching also bypasses ChangeEngine. Do not integrate around these facts.

Inspected revisions: AIWF `967c90f`; skill-manager
`d8a12c433e4ee83b028d2217e4b8900a727147c3`; text-compiler
`4f76f5ad1a93fcea667da731be1324d4d5c0ec3c`; llm-utils
`ba285434f14f20ad1662ea0924799a81c3394706`. Current local sources, including
working changes, were authoritative. The unrelated untracked package-lock.json
was preserved. No branches, production edits, commits or Done claims.

## Actual integration map

| Boundary | Actual local contract and implication |
| --- | --- |
| Skill sources | `SkillManager({sources, store, author?, advisor?})`; source `{id,path?,url?,writable?}`. `sync()` scans local source paths, or clones/pulls configured URLs, imports summaries/payloads and refreshes its own semantic-registry-backed Registry. Use an explicit local read-only source; `writable` governs authoring destinations, not an OS sandbox. |
| Find/activate | `retrieve(query, {limit?,recentContext?,recentSkillIds?}) -> SkillSummary[]`; `activate(string[] \| SkillSummary[]) -> ActivatedSkill[]`. Activation needs an array, even for a known ID. Unknown IDs are skipped. Retrieve uses summaries; full context/tools load through `getPayload` only on activation, although sync reads payloads for storage. Recent IDs can expand results beyond limit. |
| Skill metadata | Summary contains keys, declared `requires.capabilities`, tool summaries and source revision/hash/path. Activated skills contain Markdown context and full tool schemas. Requirements are metadata, not capability acquisition or permission enforcement. The existing classifier tokenizes query text; do not assume an LLM-backed semantic understanding of arbitrary paraphrases. No second AIWF index is needed. |
| Codelet synthesis | `TextCompiler.compileCodelet(intent, CompileOptions)`. Core synthesizes function source, generates tests by default, runs self-healing, returns `{id,sourceCode,meta,execute,test?}`. `meta.testSourceCode` and verification survive. An optional repository caches/registers codelets; omit it for ephemeral helpers. `bypassCache` does not suppress registration if a repository exists. |
| Generic synthesis hooks | Exported `CompilerToolkitContract` includes `compileFunction`, `analyzeIntent`, `generateWorkflowSource`, optional `synthesizeCodelet`, `synthesizeMock`, `synthesizeService`. Public `PromptExecutor.prompt(text,jobType,systemPrompt?)` and exported critique/recovery primitives exist. These are function/workflow/service synthesis contracts, not an adequate bounded declaration/module source API. `compileCodeletCore` directly invokes its core synthesizer. |
| Repository source API | No public `compileSource` or equivalent bounded repository declaration/module synthesis API found in local exports/implementation. This validates the plan's conditional source-API extension; do not coerce declarations into executable codelets. |
| Dynamic probes | `DynamicJudge.probe(source,test,title?,isAsync?,services?)` constructs callable source/test functions and executes in-process. `runWithServices` isolates service dispatch/mocks, not ambient process/filesystem access. Generated tests, caller acceptance, critic, independent verification and bounded repair are available, but no injected sandbox execution hook exists. Cached verification and returned `test()` also call probe. Returned `execute()` independently invokes in-process compiled code. |
| Routing/recovery/cancellation | `LlmUtilsRouter` delegates to Asker with task/system; RecoverySession uses explicit model-bound executors, identities, request budget, optional verifier and caller escalation. No AbortSignal contract appears in text-compiler sources; PromptExecutor has no signal argument. llm-utils Asker/Actor support signals. Existing stock compiler/router cannot be assumed to propagate AIWF cancellation/provider restrictions automatically. |
| Exact resolver producer | `Ticket.resolve`, `src/graph/ontology.ts:894-907`: grounded exact method/function evidence -> direct `asker.json(ExactImplementationSchema)` -> replacement/rename proposal. SystemOne currently can select interactive instead and influence configured model tier. This is existing binding behavior to migrate, not the proposed advisory contract. |
| Navigational producer | `ontology.ts:909-973`: implementation LLMActor gets navigation/read/preview/apply tools, may author replacement/new source in generic CodeChangeRequests or final ResolutionProposal. Up to three 16-step tranches; successful mutations qualify continuation. This is a second repository source producer. |
| Deterministic mutation | Resolver-local apply closure leases the Ticket, previews through ChangeEngine, checks dirty/owned hashes, applies fingerprint, records migrations/files and verifies. Rename/source-action/refactor requests are deterministic ChangeEngine operations. Dirty protection and lease ownership live in resolver, not all tool execution. |
| Repair | Bounded loop reinvestigates current source and sends test/acceptance findings through the same current implementation callback: exact direct synthesis or navigational Actor. Final tests/TestNodes, authored acceptance, freshness signature and verification receipt remain distinct proof stages. |
| AIWF codelet usages | `src/tools/compiler.ts` registers compile/run/promote; tests/compiler.test.ts exercises them; tool-discovery tests verify compile is not public MCP. Searches found no direct production callers of these names beyond registration. General bootstrap does not include them. `compile_codelet` accepts Actor-authored source/tests; it does not invoke text-compiler despite the file header. It persists even failed verification. `run_codelet` executes stored source without checking verified. Promotion requires verified and registers the stored function in the live registry. No evidence establishes these paths obsolete yet. |
| Authority | ToolContext has signal, authority, scratch. ToolRegistry.execute only validates schema and dispatches. WorkflowActor restricts tools in read-only mode; run_command enforces declared filesystem authority via its existing executor. Compiler tools, direct registry calls and generic apply_change do not share that enforcement. CausalChangeEngine has path/fingerprint/structural protections, but no ToolContext authority/cancellation check. |
| Packaging | AIWF package files include src/README only; build compiles src/cli.ts into dist/aiwf with version defines. Neither deliberately packages built-in skills. skill-manager scans filesystem skill folders, not compiled embedded assets. Add deliberate asset distribution/resolution for both source package and compiled executable before shipping a built-in definition; Markdown alone is supported, skill.json is needed for explicit capability metadata. No production skill added. |

Source anchors: sibling skill-manager `src/index.ts`, `types.ts`, `source.ts`,
`text-compiler-author.ts`; text-compiler `src/compiler.ts`, `types.ts`,
`text-compiler.ts`, `codelet-compiler.ts`, `critic.ts`, `toolkit.ts`, `recovery.ts`;
AIWF `src/graph/ontology.ts`, `src/tools/registry.ts`, `compiler.ts`, `change.ts`,
`actor/engine.ts`, `package.json`, `scripts/build.ts`.

## Reproductions and classifications

Ordinary configured Actor route, unchanged fixture requests and budgets:

| Case | Current observed outcome | Classification |
| --- | --- | --- |
| Preserved J2.4 B-hidden-selector | `bun scripts/agency-gate.ts B-hidden-selector`: exit 1, 18,077 ms, 5 calls. Reads readings.json after missing tickets.txt and listing files; answers that the second ticket has average reading 5.33, never reads the visible project policy. Independent trace comparison rejects the answer; correct policy result is ORCH-B. | Tactic selection and evidence/provenance; incorrect goal/evidence selection. Model decision failure, not inaccessible evidence. Missing know-how remains a hypothesis, not a proven cause. |
| Preserved J2.4 E-self-extension | `bun scripts/agency-gate.ts E-self-extension`: exit 1, 42,563 ms, 10 calls. Reads actual inputs, repeatedly writes Python with literal backslash-n using echo, receives SyntaxError, exhausts steps without requested totals 25/61/64 and difference 39. | Missing composition and model quality in source construction/recovery. Native shell behavior is observed, not a demonstrated executor defect. A compiler's benefit is still unproven. |
| Current J3.1 generative route | `bun test tests/ticket-resolution.test.ts -t 'binds synthesis to the exact authored target'`: 1 pass, 7 assertions, 548.92 ms test time. Real default resolver, temporary graph/repository and real project tests, controlled provider returns replacement; two prompt calls prove direct exact-source synthesis then independent acceptance. | Duplicate source producer confirmed. This is a controlled provider mechanism reproduction, not live model quality or restored J3.4 acceptance. |
| Authority/cancellation probe | Temporary directory, actual initialized registry, read-only ctx and already-aborted signal: compile persists verified codelet, run reports ambient process object, block patch changes `export const value = 1` to 2. Fixture removed after observation. | Execution-contract defect. Existing metadata cannot be reused as if it were universal enforcement; deterministic block patch is a mutation outside ChangeEngine. |

Replay archives:
- `.ai-workflow/state/agency-evidence/runs/2026-10-08T19-57-17-735Z/B-hidden-selector.json`
- `.ai-workflow/state/agency-evidence/runs/2026-10-08T19-57-18-903Z/E-self-extension.json`

The gate's keyword checks were not treated as independent acceptance; current
traces were compared with fixture facts and observed command failures. Historical
archives were retained. Replays also update the harness's latest-case snapshots.
An initial test-name filter matched zero tests; it was corrected to the actual
test name before claiming resolver evidence.

## Stop and required plan correction

The reuse instructions in code-writing-design sections 5/7 and restoration-plan
section 8 must distinguish **authority metadata** from **mechanical enforcement**.
The latter currently exists at selected host/executor/resolver boundaries, not
throughout ToolContext/ToolRegistry. Read-only plus aborted execution succeeding
in the actual compiler tools falsifies any universal-enforcement baseline.

The cleanup instruction to retain deterministic block patching must also account
for its direct disk writes: current apply_block_patch is not a ChangeEngine route.
Keeping its functionality unchanged cannot satisfy the stated sole-mutation-
authority invariant. The plan must explicitly choose its migration/removal after
parity proof rather than assume it already meets that invariant.

Smallest proposed sibling delta, subject to corrected plan: a generic bounded
source-synthesis API reusing prompt/critique/recovery; a host execution delegate
covering every dynamic probe, cached probe, returned test and helper execution;
an explicit cancellation contract covering compiler/model/probe work. Keep the
existing sandbox and mutation engine. Do not add a compiler, executor, index,
planner or persistence system. No implementation or plan rewrite performed.

Phase 0 inspection/reproduction deliverables are recorded. Gate 0 remains failed
pending correction of the safety baseline and mutation-path plan. Full Agency
Gate, full suites, typechecks and phases 1–7 have not been run or claimed.
