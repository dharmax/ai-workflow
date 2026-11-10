# AIWF folder responsibility audit

**Basis:** remote `master` at `b37f2a2`, 2026-11-10. Read-only source review; no local Bun run or canonical-DB inspection. This is an architectural map, **not** permission to refactor, acceptance evidence, or a second backlog.

**Question:** Do these folders satisfy [Dharmax Architecture](definitions/dharmax-architecture.md) and the [Prime Directive](definitions/prime-directive.md)—clear exclusive ownership, lean adapters, entity/service behavior in its proper home, and sensible delegation between deterministic code and AI?

## Judgment

**No, not consistently.** The six folders are not all wrong: Ticket, Product, and Rules are legitimate domains. The problem is that domain semantics, orchestration, transport adapters, generic infrastructure, and agent-execution facilities often share the wrong owners. Large line counts indicate a place to inspect, not proof of defects on their own.

### Current responsibilities → proper boundaries

| Location | Actual responsibility observed | Intended single responsibility / boundary | Assessment |
| --- | --- | --- | --- |
| **src/ticket/** | Resolution, preparation, implementation, verification, governance, source scope, prompts, reviewer support | Ticket domain lifecycle, with **one** transport-independent operation owner; delegated evidence, change, test and model services retain their own mechanisms | Legitimate domain; orchestration is too broad and some Ticket investigation lives elsewhere |
| **src/kb/** | External content-addressed GitHub knowledgebase/cache, SkillManager integration, generic canonical JSON hashing | Knowledge/skill *retrieval bridge* only, if both facilities earn their keep; generic hashing belongs to a shared utility owner | Mixed infrastructure and knowledge responsibilities |
| **src/ui/** | Human result formatting, entity views/editing, shell argument facilitation | Presentation and interaction only; no independently owned Product/Ticket policy | Legitimate UI helpers but fragmented across root CLI/Shell and ui |
| **src/product/** | Product mutations, proposals, relationships, context, impact, coverage, charter screening, Story-test lifecycle, manifest export/restore | Authored Product intent and its semantic invariants; testing/execution and portable serialization use their existing domain/service owners | Legitimate domain; several substantial unrelated responsibilities included |
| **src/tools/** | Registry and command projection **plus** Product operations, AST queries, debugger, tests, process execution, codelet compilation and dynamic JS evaluation | Thin command adapters to domain owners; separately identified internal agent capabilities where genuinely needed | **Largest boundary failure** |
| **src/rules/** | RuleStore, default Rule pack, Rule reference resolution, schema/exchange types | Rule definitions, effective layering and Rule-specific reference semantics; Ticket governance only *consumes* effective Rules | Legitimate domain; RuleStore likely has multiple operation-level responsibilities |
| **src/shell.ts** (root) | Full interactive REPL, command routing, interaction, presentation and domain invocations | A thin transport entrypoint is reasonable at root; interaction logic belongs with UI, domain operations with domain owners | **1,292 lines** in a transport entrypoint is a strong audit signal |
| **src/services/investigation-*.ts** | Ticket-specific investigation orchestration, evidence discovery and model routing | Ticket investigation should have one clear operation owner, reusing source/graph and AI services, not a competing general-purpose workflow | Ticket behavior lives outside the Ticket domain |
| **src/helpers/actor/** | General interactive cognitive execution, discovery and model-facing mechanics | Retain only AIWF-specific orchestration; let **llm-utils** own generic Actor/model runtime | Related boundary needs comparison when reviewing Ticket implementation |
| **src/graph/**, **src/model/**, **src/managers/** | Persistence, entity behavior, source/admission manager | Keep Semantika persistence, intrinsic entity invariants and operation-level authorization distinct | Relevant adjacent owners, **not audited completely here** |

### Folder map: representative current files

This is an evidence-backed inventory of the files inspected, **not a claimed exhaustive directory listing**. Counts below are source lines on the reviewed commit.

#### Ticket

| File | Lines | Observed work |
| --- | ---: | --- |
| [ticket/resolve.ts](../src/ticket/resolve.ts) | 585 | Dependency resolution, claims, mutations, repair, checks, governance and final receipt |
| [ticket/prepare.ts](../src/ticket/prepare.ts) | 309 | Calls investigation, computes enrichment/decomposition, critic, reviewed graph changes |
| [ticket/implementation.ts](../src/ticket/implementation.ts) | 279 | Synthesizer or bounded LLM Actor with an explicit eight-tool catalog and up to three tranches |
| [ticket/verification.ts](../src/ticket/verification.ts) | 453 | Tests/evidence, acceptance verification, current proof |
| [ticket/governance.ts](../src/ticket/governance.ts) | 150 | Applicable Rules, Aspects, Decisions, source/module ownership |
| [ticket/verification-contract.ts](../src/ticket/verification-contract.ts) | 72 | Rule acceptance contract and current verification signature |
| [ticket/source-scope.ts](../src/ticket/source-scope.ts) | 128 | Exact Ticket change-scope/fingerprint/admission relationship |
| [ticket/reviewer.ts](../src/ticket/reviewer.ts) | 58 | Reviewer eligibility and observed result |
| [ticket/eligibility.ts](../src/ticket/eligibility.ts) | 22 | Eligibility to enter execution |
| [services/investigation-service.ts](../src/services/investigation-service.ts) | 209 | Ticket-specific investigation coordinator |
| [services/investigation-evidence.ts](../src/services/investigation-evidence.ts) | 524 | Source/graph/evidence collection |
| [services/investigation-routing.ts](../src/services/investigation-routing.ts) | 267 | Advisory semantic candidate selection and judgment |

**Boundary finding:** The high-level Ticket operation is fragmented across ticket/, services/, tools/tickets.ts and some Product Story-test facilities. This may be sensible for reusable low-level services, but ticket-specific phase control should be owned once. The 585-line resolver contains both lifecycle coordination and embedded helper/control logic; inspect actual call graph before extracting anything.

**AI finding:** Investigation currently combines semantic review with deterministic duplicate-title/body matching and Feature-title substring matching. Those may be cheap candidate retrieval aids; **they must not become final semantic judgments**. Implementation uses a hand-selected tool list rather than the already-existing general discovery path; evaluate using AI for capability selection, while retaining deterministic authorization.

#### Knowledgebase

| File | Lines | Observed work |
| --- | ---: | --- |
| [kb/client.ts](../src/kb/client.ts) | 199 | Fetch/search/cache a raw-GitHub knowledge manifest and verify content |
| [kb/manager.ts](../src/kb/manager.ts) | 47 | Bridge to the existing @dharmax/skill-manager |
| [kb/types.ts](../src/kb/types.ts) | 49 | External knowledge item/manifest types |
| [kb/canonical.ts](../src/kb/canonical.ts) | 22 | Generic canonical serialization and hashing |
| [tools/kb.ts](../src/tools/kb.ts) | 122 | Knowledge and skill tool registration |

**Boundary finding:** Generic canonical hashing is used by Ticket/Product/graph and has no conceptual business in knowledge retrieval. Also assess whether the remote manifest/cache adds capability beyond skill-manager/semantic-registry; **overlap is suspected, not established**. Do not remove caching or change hash semantics without checking persisted fingerprints.

#### UI and Shell

| File | Lines | Observed work |
| --- | ---: | --- |
| [ui/result-view.ts](../src/ui/result-view.ts) | 360 | Human/result/JSON projection |
| [ui/entity-view.ts](../src/ui/entity-view.ts) | 298 | Entity display, elicitation and editing entrypoints |
| [ui/command-facilitation.ts](../src/ui/command-facilitation.ts) | 62 | Missing-argument interaction |
| [shell.ts](../src/shell.ts) | 1,292 | Interactive host, command dispatch, domain-specific cases, completion |
| [artifact-command.ts](../src/artifact-command.ts) | 703 | Shared Commander grammar and legacy command intents |
| [command-presentation.ts](../src/command-presentation.ts) | reviewed | Generated CLI/Shell projection from registered commands |

**Boundary finding:** Keeping shell.ts at the root as an **entrypoint** is fine; retaining over a thousand lines of interaction and application behavior in that entrypoint is not. UI should render/edit *views* through canonical manager/domain actions, not independently implement their policy. Avoid another terminal framework: the dependency @dharmax/shell-ui already exists.

#### Product

| File | Lines | Observed work |
| --- | ---: | --- |
| [product/mutation.ts](../src/product/mutation.ts) | 587 | Product relation/schema validation, approved mutation, alignment and identity constraints |
| [product/process.ts](../src/product/process.ts) | 380 | AI-supported proposal/decomposition, explicit bounded traversal and critic |
| [product/context.ts](../src/product/context.ts) | 285 | Product context and candidate meaning |
| [product/coverage.ts](../src/product/coverage.ts) | 435 | Structural graph coverage |
| [product/impact.ts](../src/product/impact.ts) | 310 | Bounded impact neighborhood |
| [product/story-tests.ts](../src/product/story-tests.ts) | 387 | Story-test preparation, activation, execution evidence/effective state |
| [product/links.ts](../src/product/links.ts) | 241 | Relations, typed graph reads, developer-review presentation |
| [product/change-operations.ts](../src/product/change-operations.ts) | 117 | Product preview/commit and post-commit evidence |
| [product/manifest.ts](../src/product/manifest.ts) | 472 | Product projection plus authored snapshot export/**restore** |
| [tools/product.ts](../src/tools/product.ts) | 900 | Public entity and Product tools, but substantial logic and orchestration |

**Boundary finding:** Product semantics should stay Product-owned. Story **meaning and acceptance contract** are Product-owned; generic test execution/evidence should have one Test/Verification owner. A portable state restore is an application/persistence operation, not intrinsically Product meaning. tools/product.ts should be an adapter, not a second domain implementation. The existing Product process currently constructs **inert proposals**; older architecture prose claiming automatic application is stale and must not be treated as current truth.

#### Tools and capabilities

| File | Lines | Observed work | Boundary question |
| --- | ---: | --- | --- |
| [tools/registry.ts](../src/tools/registry.ts) | 173 | Internal tool registration and public CommandRegistry contract | Two concepts coexist; ensure distinct semantics/authority |
| [tools/commands.ts](../src/tools/commands.ts) | 127 | Public command registration/projection metadata | Appropriate only if kept declarative |
| [tools/graph-queries.ts](../src/tools/graph-queries.ts) | 628 | AST queries and source/graph traversal algorithms | Should query services/graph owner own these operations? |
| [tools/product.ts](../src/tools/product.ts) | 900 | Product command schemas **and** substantive Product behavior | Split adapter from owner; not by line-count alone |
| [tools/test-runner.ts](../src/tools/test-runner.ts) | 271 | Test identification, execution and evidence | Test service owns mechanics; adapter should expose |
| [tools/debugger.ts](../src/tools/debugger.ts) | 230 | Trace parsing, AST diagnosis and impact | Reuse investigation/source services |
| [tools/os.ts](../src/tools/os.ts) | 198 | OS command execution/timeouts | One guarded execution provider, not domain-specific copy |
| [tools/compiler.ts](../src/tools/compiler.ts) | 208 | Store, execute and promote ad-hoc JavaScript codelets; retired patch operation | Why an AIWF-owned dynamic executor instead of existing extension packages? |
| [tools/scripting.ts](../src/tools/scripting.ts) | 43 | Evaluate arbitrary JavaScript in the host with store/registry access | Determine whether needed and what caller can reach it |
| [tools/discovery.ts](../src/tools/discovery.ts) | reviewed | Semantic-registry-backed tool classifier/refiner | Preserve one discovery/selection path |

**Concrete high-priority finding:** tools/compiler.ts describes synthesis through @dharmax/text-compiler but imports no compiler or LLM provider: it takes supplied JavaScript and executes it with **new Function**. A missing test triggers execution of the candidate with empty args; a stored **unverified** codelet can still be passed to run_codelet; promote_codelet checks the flag but not execution confinement. tools/scripting.ts similarly uses **AsyncFunction** with store and registry. These are demonstrable design/trust concerns. **Public reachability and exploitability have not been proved**; do not claim they are remotely exploitable. Check whether the capabilities are used, can safely be retired, or must be owned by an existing trusted execution facility. The public registry is opt-in and not all registered internal tools are externally exposed.

#### Rules

| File | Lines | Observed work |
| --- | ---: | --- |
| [rules/store.ts](../src/rules/store.ts) | 435 | Persist, import/preview/commit Rule packs, resolve layered applicability, bundled defaults |
| [rules/references.ts](../src/rules/references.ts) | 117 | Validate/pin Rule references, inspect authorized Git/symbol material |
| [rules/types.ts](../src/rules/types.ts) | 25 | Rule pack and effective-layer contracts |
| [rules/defaults.json](../src/rules/defaults.json) | 79 | Bundled default Rules |
| [model/rule.ts](../src/model/rule.ts) | linked | Intrinsic Rule schemas/entity types |
| [tools/rules.ts](../src/tools/rules.ts) | 55 | Rule operations, including review adapter |
| [ticket/governance.ts](../src/ticket/governance.ts) | 150 | Consumes applicable Rules along with Aspects, Decisions, module/source scope |

**Boundary finding:** A Rules domain **should** exist. Its persistence/effective layering are Rule responsibilities. Rule pack authoring/review and Rule reference resolution are legitimate, but may be distinct operation/service owners rather than all methods of RuleStore. Ticket governance applies the effective Rule contract to one Ticket—it must not become a second Rule definition/evaluation authority. Need whole-method and caller inspection before making this separation.

## Deterministic vs AI: the actual boundary

**Keep deterministic**: permissions, user approval, revisions/fingerprints, graph identity and persistence, test invocation/results, exact AST/LSP edits, scope checks, lease fencing, rollback and receipt truth. An LLM must not decide these facts or grant its own authority.

**Use AI for**: interpreting intent, diagnosing ambiguous failures, assessing whether evidence supports a hypothesis, deciding which capability to discover/use, conceptual impact, implementation approach, source generation, and independent semantic review where current evidence is insufficient. System-1 can do cheap advisory classification; a stronger model can reason when needed.

**Anti-pattern to test**: hand-coded title/substrings, rigid domain progression, fixed execution-tool menus and repeated ceremony that constrain reasoning instead of cheaply grounding it. Their presence alone does not prove wasted work; measure and compare against a correct simpler path.

## Boundary rules for any future correction

1. **One authoritative operation owner** for Ticket work, Product change, Rule management, source mutation, test evidence, and semantic discovery. An adapter translates transports; it does not implement the operation.
2. **Domain entities retain intrinsic behavior**; managers coordinate permissions, transactions and work. Helpers serve cross-entity algorithms; services own coherent reusable facilities. Don't manufacture classes just to match folder names.
3. Preserve Semantika, llm-utils, skill-manager, semantic-registry, text-compiler, Code Mutation Service and shell-ui ownership. Inspect existing APIs before adding AIWF-local copies.
4. Do not move all deterministic logic to AI. Remove unnecessary *decisions and process*, not checks protecting correctness.
5. Avoid mass file relocation. Prove the one concrete boundary violation and its actual consumers, then change a small coherent slice with unchanged public behavior and tests.

## Evidence limits / next investigation

- The map includes inspected representative files and direct code excerpts. **It is not an exhaustive full-tree, import-graph, runtime-reachability or security audit.**
- The local Semantika DB, installed Codex MCP surface, complete dependency versions, and user working tree were **not** inspected. No code was changed or tests run.
- Architectural **hypotheses** to prove, not accepted work: (a) direct internal dynamic-code execution authority, (b) whether codelet/KB facilities are genuinely needed, (c) Ticket-specific service/manager duplication, (d) Product vs Test/Restore owners, (e) root Shell business-logic leakage, (f) RuleStore composition, (g) actual AI-versus-deterministic latency/work savings.
- To decide whether a move/delete is warranted, first inspect runtime callers, acceptance episodes and negative invariants. Do not create Tickets, refactor, or declare G5 accepted from this audit.
