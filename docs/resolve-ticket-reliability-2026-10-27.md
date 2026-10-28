# resolve_ticket reliability — 2026-10-28

**Bounded improvement, partial mission completion.** Two fresh native greeting runs completed implementation, real checks and independent acceptance. One recovered from a genuine incomplete edit. AIWF has not completed the broader task requiring source discovery. The separate verification of TKT-LIFECYCLE-STATE failed required checks, so that Ticket remains Blocked. Publishing these fixes does not mean those remaining tasks succeeded.

## Authority and authorship

Starting commits: AIWF `086ce8b`, llm-utils `86a17b0`. Reused `TKT-LIFECYCLE-STATE` and sibling `TKT-GKDN`. PRODUCT is accepted revision 1; the three universal engineering Rules remain revision 1. No Product semantics, global model configuration, historical Ticket dispositions or lifecycle framework were changed.

Production and regression repairs are **Codex-authored**, through existing claimed preview/fingerprint/apply facilities. Successful fixture implementations and the recovery correction are **native model-authored guarded edits**. Controlled Product/Story definition review is fixture setup; implementation and independent acceptance used real configured providers.

The earlier published lifecycle work remains the baseline: exact CAS execution leases, guarded source commit fencing, SDK cancellation, truthful cleanup, current Story baselines and source-derived runner metadata. This delivery does not redo those owners.

## Demonstrated mechanism and smallest remedies

| Observation | Cause / confidence | Correct owner | Remedy |
| --- | --- | --- | --- |
| Mandatory-only dossier omitted current source/test bodies; linked Story supplied little more than its title | Premature return and legacy narrative projection / high | ticket/investigate | Hydrate mandatory evidence before returning; include operative Story fields; keep optional S1/discovery optional |
| Repeated administrative context competed with the task | Full dossier serialization and verbose instructions / high | ticket/prompts | Project relevant evidence, scope and governance; retain exact constraints and actual failure feedback |
| Original Qwen edit uppercased the name but omitted `!`, then repeated observations | Semantic omission followed by no public-test feedback; not malformed arguments / high | implementation/resolve boundary | After attributable guarded edits, a strictly bounded navigation stall may hand off to existing real checks and repair |
| Navigation after source edits failed read-only or index-governance checks | Derived indexing attempted in the Actor's read-only context / high | host resolve context | Refresh through existing governed indexing authority before read-only navigation |
| Typed final result required a second string encoding | Unnecessary output serialization contract / high | llm-utils Actor | Accept direct JSON final values on typed runs; preserve actual output-schema validation and bounded correction |
| Rejected malformed final followed by repeated reads could trigger handoff | Handoff did not distinguish tool-only tranches / reproduced red | ticket/implementation | Require aborted, tool-call-only history; retain successful mutation epoch, no failed mutations and navigation-only final calls |
| GPT-4.1-mini returned `action:"safe_change"` | Model violated a schema carried as text after intentional adapter fallback / high | Actor/provider contract; parser behaved correctly | No alias, normalization shim, adapter rewrite or further model trial |

Single-target synthesis was not eligible: the greeting Ticket authorizes a FileNode, not one exact mandatory SymbolNode. Actor selection is conservative and correct; discovery does not grant mutation authority.

## One captured interactive exchange, replayed locally

Retained real engine request/response: `/tmp/aiwf-mission-cloud-{request,result}-699374-1.json`. The response's exact outer fields were `"action":"safe_change","toolCalls":[]`; its `finalAnswer` contained a source-change proposal. The supplied action enum was `["tool_call","final_answer"]`.

An offline replay through the actual OpenRouter OpenAIAdapter captured the outbound body: `response_format: {"type":"json_object"}`, with the entire pretty-printed schema appended to the user message. Optional Actor fields cause `hasDisallowedOpenAiSchema` to select the existing JSON-mode fallback. Thus the engine's `strict:true` was **not transmitted as provider-enforced schema constraints**. The replay preserved response text byte-for-byte; `createActorDecisionSchema` rejected the action. Tool-argument normalization occurs later and was unreachable.

Historical raw HTTP metadata was not retained; the outbound body is reconstructed by replaying the exact captured input through the adapter, not presented as a historical wire capture. Provider support for the rejected strict schema was not tested: that schema was never sent as a structured constraint. This is a model contract failure under unconstrained JSON mode, with an existing schema-capability mismatch, not evidence of adapter response corruption. Replay cost: zero. Evidence: `/tmp/aiwf-mission-exchange-replay.json`, `/tmp/aiwf-mission-outbound-replay.json`.

## Native results and economics

| Run | Actual outcome | Model calls / input-output tokens | Inference / elapsed / known cost |
| --- | --- | --- | --- |
| Narrow greeting with genuine recovery | First edit omitted punctuation; real public failure reached model; guarded correction; unchanged oracle and typecheck passed; independent verdict accepted; Ticket Done and effective Story done | 6 GPT-4o-mini implementation + 1 GPT-4.1-mini review; 37,718 / 1,242 | 34.547s / 37.576s including setup / $0.00539485 |
| Fresh-fixture repeat | Complete greeting edit; real public checks, independent accepted verdict, Ticket Done and effective Story done | 3 GPT-4o-mini implementation + 1 GPT-4.1-mini review; 19,735 / 715 | 14.853s / 16.965s including setup / $0.00324910 |
| Delegated interactive fixture | Source discovery succeeded, but failed mutations or invalid decision prevented completion | GPT-4o-mini: failed mutations; GPT-4.1-mini: invalid action on repeated attempts | Blocked; no independent acceptance; no successful repeat |
| Already-started GPT-4o interactive attempt | Stopped at shared 32-call experiment bound | 7 calls | 16.921s inference; $0.106165; not success |

The exact observed public result in both successes was `Hello, ADA!`. Each invocation used the existing in-memory MCP acceptance test and its unchanged 60-second resolution deadline. Receipt-backed effective Story done was asserted. An explicit `currentTicketReceipt` assertion was added afterward and has not itself been exercised in a successful live run. Independent reviewers took 2.615s and 2.268s respectively. Remaining non-inference time was about 3.03s and 2.11s, including setup; discovery, indexing, mutation and check durations were not separately retained and must not be inferred from those residuals.

Original chronological Qwen episode (responses 0–6 only): system 15,902 characters, goal 5,904, schema 1,755; first prompt 4,901 tokens, seven calls totaling 38,110 input / 703 output, 33.962s inference within 35.3s elapsed. All seven tool argument sets were valid. Later warmed local probe took 43.7s, including 21.8s load; fresh resolver first-call attempts still exceeded 60s. These observations establish a latency/capability boundary, not general local-model incapability. New interactive rejected exchange still had a 15,215-character system and 10,146-character outbound user message including schema/history: context/tool cost remains material.

Across all authorized cloud experiments: **known $0.12915145**, plus **$0.01056980 reserved for canceled inference with unknown final usage**; total accounted/reserved $0.13972125 under the shared $0.25 ceiling. The reservation is not known actual spend. No further paid trials were made after the contract diagnosis; no global settings or models were changed.

## Boundary and regression evidence

Navigation handoff is not acceptance. It requires a real successful guarded mutation in the current epoch, no failed safe_change results, tool-call-only history and a navigation-only terminal step. Caller cancellation takes precedence. The existing resolver then compares baseline/effect hashes, checks pinned governance, executes required tests and obtains independent acceptance under the exact lease before receipt/Done.

Eleven focused boundary cases pass: valid handoff, feedback-driven repair, cancellation, failed mutation, unauthorized mutation, rejected malformed final, unattributed source edit, repeated no-op mutations with/without an earlier edit, and two repeated-navigation cases. The malformed-final case was red before the added tool-only condition and green afterward. Existing lease replacement, stale synchronization and public MCP cancellation tests remain unchanged and pass in the aggregate. No test or graph obligation was weakened.

| Validation | Before | Final |
| --- | --- | --- |
| AIWF full suite | 685 pass / 6 skip / 3 fail | **693 pass / 6 skip / 3 fail**, 702 tests, 83 files, 5,281 assertions, 228.46s |
| llm-utils full suite | 201 pass / 6 skip / 3 fail | **202 pass / 6 skip / 3 fail**, 211 tests, 26 files, 952 assertions |
| Typechecks | — | Both pass |
| Definitions / whitespace | — | 21 concepts, 171 links, 9 exact US fields; diff checks pass |

AIWF retains both Dharmax S2 DW-02 INDEX-ADMISSION snapshot failures and the Actor final-prose assertion expecting two calls where the existing final-schema correction makes three. llm-utils retains the two unsupported-final assertions and the related history assertion. Aggregate failure counts are unchanged, not zero.

## Separately budgeted canonical verification

Inspected all eight acceptance requirements and the pinned 48-file scope: 86 graph TestNodes across 77 distinct file paths, including broad UI, packing, lifecycle and Actor checks. Native MCP `resolve_ticket(TKT-LIFECYCLE-STATE, verifyOnly:true, maxRepairs:0)` retained every graph-required obligation and requested typecheck. Budget: 480s overall, existing 60s per command; **observed 256.4s, blocked without timeout**.

Required checks retained the three baseline failures. Additional canonical-environment failures include browser executables missing under the isolated XDG cache, packing output denied by the read-only mount, a read-only database write, two bootstrap assertions observing 8,033 characters against an 8,000 limit, and TestNodes pointing at fixture files that Bun does not recognize as tests. These failures are visible in retained diagnostics; they were not suppressed, relabeled as acceptance, or repaired in this mission. Evidence: `/tmp/aiwf-mission-canonical-native-result.json`, `/tmp/aiwf-mission-canonical-inspection.json`.

The native run released its claim and minted no receipt. The same Ticket was briefly reclaimed only to consolidate this report, then returned to Blocked. No implementation Actor or independent acceptance was reached in that canonical run. The next canonical action requires separately addressing execution-environment/test-binding blockers and preserving the real aggregate failures.

## Publication and remaining limits

The greeting task succeeded twice, including recovery after a real test failure. The broader task requiring source discovery did not complete. TKT-LIFECYCLE-STATE failed its required verification checks and remains Blocked. Eight new AIWF regressions and one llm-utils regression support these fixes; two successes do not establish general reliability.

The developer accepted publishing the verified correction set with the unchanged baseline failures, overriding the zero-failure commit prerequisite in AGENTS.md:55 for this delivery. Both typechecks pass; neither aggregate introduced additional failures. Only the ten intended AIWF files and two llm-utils files are included; unrelated dirty/generated files remain excluded. Repository and remote master heads were `086ce8b` / `86a17b0` at publication preflight. Publication does not mark the blocked Ticket Done or establish that the broader source-discovery task succeeded.

Retained logs: `/tmp/aiwf-mission-cloud-native2.log`, `/tmp/aiwf-mission-cloud-repeat.log`, `/tmp/aiwf-mission-boundary-final.log`, `/tmp/aiwf-mission-publication-aggregate.log`, `/tmp/llm-mission-final-aggregate.log`, both `*-mission-publication-typecheck.log`, and the canonical/replay files above. Credentials are excluded from evidence.
