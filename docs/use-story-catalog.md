# AIWF User-Story Catalog

**Status:** product-level acceptance authority for AIWF development.

This document defines AIWF from the outside in: what a human developer, maintainer, product/architecture owner, or external coding agent must be able to accomplish.

## Development rule

**No AIWF development without an explicit user story.**

Every change must identify the user story it serves before implementation starts. Tests must be derived from the story and include at least one realistic path through the actual public/runtime stack whenever that path exists. Unit/component tests may localize behavior; they do not establish that the story works.

A feature is not complete because internal components are green. It is complete only when the relevant user story succeeds with realistic inputs, state, routing, and boundaries.

Regression rule: every defect found in real use becomes a permanent user-story acceptance scenario.

Status markers:

- **NOW** — behavior is part of the current implemented product surface.
- **ACCEPTED** — accepted design exists, implementation may be incomplete.
- **DRAFT** — design exists but is not yet accepted as implemented product truth.

The catalog intentionally describes user-observable behavior rather than implementation classes, helpers, prompts, or tool names unless the public interface itself matters.

---

# EPIC US-01 — Start and trust AIWF in a real repository

Goal: a developer can install AIWF, initialize a project, understand its state, and trust that the graph/projections reflect the repository rather than stale chat/session state.

### Stories

**US-01.01 [NOW] — Install AIWF globally**  
As a developer, I can run the setup flow once and obtain a working global `aiwf` command plus supported MCP host configuration, so I do not hand-configure every integration.

**US-01.02 [NOW] — Initialize an existing codebase**  
As a developer, I can run `aiwf init` in a repository and get the semantic graph, AST/code index, test artifacts, project state, config, and projections without restructuring the repository.

**US-01.03 [NOW] — Verify installation/project health**  
As a developer, I can run `aiwf doctor` and receive an actionable health report covering runtime, Git, graph, projections, leases, model availability, and integrations.

**US-01.04 [NOW] — Inspect current project status**  
As a developer, I can quickly see branch/dirty state, active leases, and basic AIWF state before starting work.

**US-01.05 [NOW] — Refresh semantic truth after repository changes**  
As a developer, I can reconcile/index the current repository and know that code/test graph queries use current source rather than stale derived state.

**US-01.06 [NOW] — Keep Markdown as projections, not competing truth**  
As a developer, I can use readable project projections while AIWF preserves the graph/database as canonical state and avoids a second conflicting workflow store.

**US-01.07 [NOW] — Diagnose an unhealthy setup without destructive repair**  
As a developer, when AIWF detects missing/broken runtime, graph, model, MCP, or projection state, I receive the concrete problem without AIWF resetting unrelated project state.

---

# EPIC US-02 — Use AIWF naturally every day

Goal: ordinary English and deterministic commands both provide fast, unsurprising access to the same underlying capabilities.

### Stories

**US-02.01 [NOW] — Ask a simple operational question in ordinary English**  
As an AIWF shell user, I can ask a simple everyday question such as “what’s the next recommended ticket?” and receive the correct answer promptly, without tool hallucination, empty capability surfaces, or exhausting the Actor budget.

**US-02.02 [NOW] — Express the same intent with varied wording**  
As a shell user, I can phrase the same supported intent naturally without memorizing one magic sentence or depending on regex phrase matching.

**US-02.03 [NOW] — Use deterministic commands for known operations**  
As a power user, I can use explicit commands such as `next`, `tickets`, `status`, `symbol`, or `resolve` and obtain deterministic behavior without unnecessary cognition.

**US-02.04 [NOW] — Delegate compound natural-language work**  
As a shell user, I can ask for a goal that requires multiple existing capabilities, and AIWF composes those capabilities rather than requiring a bespoke workflow tool for each phrase.

**US-02.05 [NOW] — Recover one genuinely missing capability semantically**  
As a shell user, when the selected small tool surface lacks one capability that is clearly required, AIWF can perform bounded semantic recovery without exposing the global registry.

**US-02.06 [NOW] — Fail quickly on a semantic miss**  
As a shell user, when AIWF cannot find a relevant capability, it does not wander for many Actor steps inventing plausible tools; it returns a truthful, actionable failure.

**US-02.07 [NOW] — See what AIWF actually selected**  
As a developer debugging AIWF behavior, I can enable trace/expanded output and inspect the discovered capability surface, steps, and outcomes.

**US-02.08 [NOW] — Preserve conversational context across turns**  
As a shell user, I can refer to the immediately preceding interaction without restating all context, while durable project facts still come from repository/graph state.

**US-02.09 [NOW] — Switch cognitive mode intentionally**  
As a shell user, I can explicitly select design/dev/triage/product mode when I want to constrain the kind of reasoning being performed.

**US-02.10 [NOW] — Use automatic semantic mode selection safely**  
As a shell user, when I do not force a mode, AIWF may select an appropriate mode from intent without changing artifact truth or making mode itself a workflow state.

**US-02.11 [NOW] — Get truthful termination information**  
As a shell user, when work stops because of model failure, tool failure, cancellation, or step budget, I can distinguish those causes and see partial progress rather than a misleading generic message.

**US-02.12 [NOW] — Cancel active work**  
As a user, I can cancel an in-progress natural-language operation and have cancellation propagate into active model calls, nested operations, tools, and spawned verification processes rather than only being noticed between Actor steps.

---

# EPIC US-03 — Find and choose the right work

Goal: a developer or agent can understand the board and choose meaningful work without manual archaeology.

### Stories

**US-03.01 [NOW] — List Tickets by lane**  
As a developer, I can list Ticket work by Backlog, Todo, In Progress, Done, Blocked, or Bug semantics.

**US-03.02 [NOW] — Get the next recommended Ticket**  
As a developer, I can ask AIWF to recommend the next actionable Ticket using the canonical selection policy and receive the same answer through deterministic and natural-language surfaces.

**US-03.03 [NOW] — Prefer an active lease when resuming work**  
As an agent, when I already own active work, `next` can recommend resuming it before unrelated work.

**US-03.04 [NOW] — Respect priority and blocker truth**  
As a developer, recommendation does not choose work that is durably blocked or lower-priority when a higher-priority actionable item exists.

**US-03.05 [NOW] — Inspect a Ticket before acting**  
As a developer, I can inspect the Ticket contract, lane/status, acceptance, relations, and relevant context before deciding what to do.

**US-03.06 [NOW] — Distinguish operation failure from Ticket state**  
As a developer, a failed/blocked operation does not falsely imply that the Ticket itself moved to the Blocked lane.

---

# EPIC US-04 — Coordinate concurrent human/agent work safely

Goal: multiple actors can work without silently colliding or stealing ownership.

### Stories

**US-04.01 [NOW] — Claim work atomically**  
As an agent, I can claim a Ticket with a bounded lease so another agent can see that the work is owned.

**US-04.02 [NOW] — Refuse conflicting claims**  
As an agent, I cannot silently claim a Ticket actively leased by someone else.

**US-04.03 [NOW] — Release work explicitly**  
As an agent, I can release my lease when I stop or finish work.

**US-04.04 [NOW] — Release AIWF-owned leases on non-success**  
As a caller, if an operation returns needs_input or blocked, leases acquired by that operation are released rather than leaving the project accidentally locked.

**US-04.05 [NOW] — Recover from expired leases**  
As a maintainer, stale/expired claims do not permanently orphan work.

**US-04.06 [NOW] — Preserve Kanban semantics while investigating**  
As a maintainer, claiming or investigating work does not arbitrarily rewrite Ticket lane/status merely because an operation is running.

---

# EPIC US-05 — Investigate a Ticket without changing it

Goal: an agent can understand a Ticket deeply enough to act without performing repository archaeology itself.

### Stories

**US-05.01 [NOW] — Obtain a grounded Ticket dossier**  
As an external coding agent, I can delegate `investigate_ticket` and receive the Ticket contract, relevant Product Intent, Decisions, Aspects, dependencies, code targets, tests, and freshness context.

**US-05.02 [NOW] — Use deterministic evidence before reasoning**  
As a caller, investigation first uses graph/code/test evidence and only spends cognition where meaning remains unresolved.

**US-05.03 [NOW] — Refresh stale derived code evidence safely**  
As a caller, investigation may refresh derived indexing/freshness without mutating canonical Ticket/Product intent.

**US-05.04 [NOW] — Return precise ambiguity instead of guessing**  
As a caller, if ownership, intent, acceptance, or another material fact is missing, investigation returns `needs_input` with the exact durable fact that must be supplied.

**US-05.05 [NOW] — Return real capability/environment blockers truthfully**  
As a caller, if investigation cannot proceed because of a provider/tool/environment limitation, I get `blocked`/error evidence rather than fabricated project state.

**US-05.06 [NOW] — Avoid duplicate investigation work**  
As a caller, nested preparation/resolution reuses the grounded investigation when still fresh rather than repeatedly rediscovering the same repository evidence.

---

# EPIC US-06 — Prepare a Ticket into executable work

Goal: ambiguous/broad work becomes one coherent executable unit or a small justified dependency-ordered set.

### Stories

**US-06.01 [NOW] — Add the minimum missing execution contract**  
As a developer, if a Ticket is already atomic but lacks executable acceptance, AIWF can clarify only what is necessary.

**US-06.02 [NOW] — Decompose genuinely independent work**  
As a developer, if a Ticket contains independently verifiable work, AIWF can create ordinary child Tickets instead of inventing a SubTask type.

**US-06.03 [NOW] — Avoid ceremonial decomposition**  
As a developer, AIWF does not split work merely to satisfy hierarchy, token size, line count, or an arbitrary artifact count.

**US-06.04 [NOW] — Preserve real dependency ordering**  
As a developer, child Tickets may depend on one another only where actual execution order exists.

**US-06.05 [NOW] — Make preparation idempotent**  
As a developer, rerunning preparation reuses valid children/relations rather than generating duplicate parallel work.

**US-06.06 [NOW] — Review structure before applying it**  
As a developer, generated Ticket structure/acceptance is independently reviewed before canonical mutation.

**US-06.07 [NOW] — Require a lease before preparation mutates project state**  
As a developer, standalone preparation claims the Ticket before applying durable changes.

---

# EPIC US-07 — Resolve a Ticket end-to-end

Goal: AIWF can own the normal engineering lifecycle from grounded contract to verified completion.

### Stories

**US-07.01 [NOW] — Delegate an ordinary Ticket to resolution**  
As a coding agent, I can call `resolve_ticket` and let AIWF investigate, prepare, implement, test, repair, verify, release, and synchronize without reconstructing the lifecycle externally.

**US-07.02 [NOW] — Resolve child work in dependency order**  
As a caller, parent Ticket resolution executes ready child Tickets in valid order and then verifies the parent contract.

**US-07.03 [NOW] — Reuse unchanged verified proof**  
As a caller, if the Ticket contract, relevant code, tests, and verification evidence are unchanged, resolution can reuse valid proof without rerunning expensive implementation/review.

**US-07.04 [NOW] — Invalidate stale proof**  
As a caller, any material change to authored scope, acceptance, relevant source, tests, Aspects, or verification obligations causes old proof to be rejected.

**US-07.05 [NOW] — Choose the least complex implementation mechanism**  
As a developer, exact one-target work can use exact synthesis/change primitives, while genuinely interactive code work can use a bounded Actor.

**US-07.06 [NOW] — Continue implementation only after real progress**  
As a developer, bounded Actor continuation occurs only when prior work made successful edits; repeated unchanged navigation cannot consume the entire resolution.

**US-07.07 [NOW] — Repair within a bounded budget**  
As a caller, failing implementation/tests/acceptance may trigger a small bounded repair cycle rather than endless autonomous retries.

**US-07.08 [NOW] — Stop and ask when human input is materially required**  
As a caller, AIWF returns a concrete `needs_input` instead of guessing or weakening acceptance.

**US-07.09 [NOW] — Stop on a real blocker without corrupting Ticket state**  
As a caller, provider, lease, unsupported runner, or environment blockers stop the operation truthfully without falsely rewriting the Ticket to a durable blocked state.

**US-07.10 [NOW] — Mark Done only after explicit acceptance proof**  
As a developer, a Ticket becomes Done/verified only when current test evidence and every authored acceptance/material Aspect are positively verified.

---

# EPIC US-08 — Protect the developer’s workspace

Goal: AIWF never achieves automation by destroying or hiding existing human work.

### Stories

**US-08.01 [NOW] — Preserve unrelated dirty files**  
As a developer, unrelated uncommitted changes do not get reset, stashed, overwritten, or committed by AIWF.

**US-08.02 [NOW] — Require permission for dirty mutation targets**  
As a developer, if AIWF must edit a file I already changed, it requires explicit authorization for that target.

**US-08.03 [NOW] — Detect target drift before applying an edit**  
As a developer, AIWF fingerprints previewed changes so an edit is not applied to source that changed underneath it.

**US-08.04 [NOW] — Never auto-commit engineering work**  
As a developer, resolution may edit and verify my workspace but does not silently commit those changes.

**US-08.05 [NOW] — Fail closed when Git safety cannot be inspected**  
As a developer, if AIWF cannot establish workspace safety, mutation stops rather than proceeding optimistically.

---

# EPIC US-09 — Navigate code and causal dependencies precisely

Goal: a developer/agent can answer “where?”, “who uses this?”, “what will this affect?”, and “what proves this?” with bounded evidence.

### Stories

**US-09.01 [NOW] — Find a symbol**  
As a developer, I can find a function/class/interface/symbol in the indexed codebase.

**US-09.02 [NOW] — Read exact symbol source**  
As a developer, I can obtain the actual source range/body of a symbol rather than a misleading fixed window.

**US-09.03 [NOW] — Inspect a file outline**  
As a developer, I can see source-ordered declarations without reading the whole file.

**US-09.04 [NOW] — Find callers and references**  
As a developer, I can inspect callers/references and know when evidence is exact language tooling vs heuristic graph evidence.

**US-09.05 [NOW] — Inspect dependencies/imports**  
As a developer, I can see a file/module’s static dependency relationships.

**US-09.06 [NOW] — Traverse the semantic graph**  
As a developer, I can query bounded graph neighborhoods and relations rather than dumping the entire project.

**US-09.07 [NOW] — Analyze blast radius**  
As a developer, I can ask what files/symbols/tests are affected by a proposed code target change.

**US-09.08 [NOW] — Find tests that verify a code target**  
As a developer, AIWF can use TestNode verification edges to identify relevant tests before resorting to filename heuristics.

**US-09.09 [NOW] — Drill down without forcing artifact orchestration**  
As an expert, I can use precise code/graph primitives directly when I explicitly want inspection rather than high-level Ticket execution.

---

# EPIC US-10 — Change code safely and minimally

Goal: code mutations reuse one safe causal-change path rather than ad-hoc editors.

### Stories

**US-10.01 [NOW] — Preview a semantic change before applying it**  
As a developer, I can request a code change and inspect its bounded preview/fingerprint before mutation.

**US-10.02 [NOW] — Apply only the previewed change**  
As a developer, applying a change requires the matching fingerprint so stale previews cannot silently mutate newer source.

**US-10.03 [NOW] — Replace one exact function/method cleanly**  
As an agent, I can replace the implementation of a known symbol without supplying brittle copied old text.

**US-10.04 [NOW] — Rename a symbol with semantic support**  
As a developer, AIWF can perform a supported semantic rename while preserving verification/proof identity where authorized.

**US-10.05 [NOW] — Patch a known deterministic block**  
As a power user, I can use deterministic patching for a precise known replacement without invoking an Actor.

**US-10.06 [NOW] — Reject ambiguous/unsafe edits**  
As a developer, AIWF refuses non-unique, stale, unsupported, or otherwise unsafe mutations rather than guessing.

---

# EPIC US-11 — Run and reason about tests as first-class evidence

Goal: tests are graph-connected verification artifacts, not just command output.

### Stories

**US-11.01 [NOW] — Index test files as TestNodes**  
As a developer, test files appear as durable graph artifacts with stable identity.

**US-11.02 [NOW] — Derive file/symbol verification relationships**  
As a developer, static test imports/calls derive `verifies` edges to exercised files/symbols while preserving authored verification relations.

**US-11.03 [NOW] — Select tests graph-first**  
As a resolver, I choose tests from current verification relationships before using fallback discovery.

**US-11.04 [NOW] — Run targeted supported checks**  
As a developer, AIWF can run bounded Bun tests, typecheck/build checks, and Playwright where supported.

**US-11.05 [NOW] — Record actual execution evidence**  
As a developer, TestNodes record current pass/fail execution evidence, command, timing, and freshness hashes.

**US-11.06 [NOW] — Never treat a passing unrelated test as proof**  
As a developer, producer-suggested or passing decoy tests cannot substitute for graph obligations.

**US-11.07 [NOW] — Distinguish skipped/no-test output from passing evidence**  
As a developer, skipped-only or filtered-empty runs cannot fabricate successful TestNode evidence.

**US-11.08 [NOW] — Refuse unsupported runners explicitly**  
As a developer, if the required framework cannot be run safely by AIWF, I get a precise needs-input/blocker instead of a bogus Bun command.

**US-11.09 [NOW] — Use failures to drive bounded repair**  
As a resolver, current failing tests become concrete repair feedback rather than being summarized away.

---

# EPIC US-12 — Verify completion independently

Goal: AIWF proves required behavior rather than equating activity with success.

### Stories

**US-12.01 [NOW] — Verify every exact Ticket acceptance criterion**  
As a developer, final verification checks every authored criterion exactly once and cites concrete evidence.

**US-12.02 [NOW] — Verify every material applicable Aspect**  
As a developer, cross-cutting obligations such as security/reliability/compatibility are part of completion where applicable.

**US-12.03 [NOW] — Keep producer and verifier independent**  
As a developer, the implementation agent’s claim of completion is not itself accepted as proof.

**US-12.04 [NOW] — Review bounded relevant context**  
As a developer, semantic acceptance uses graph-derived outlines/snippets/test evidence rather than dumping whole repositories into a model.

**US-12.05 [NOW] — Fail closed on insufficient evidence**  
As a developer, absent/ambiguous verification context results in failure/needs-input rather than optimistic acceptance.

**US-12.06 [NOW] — Reject contract changes during verification**  
As a developer, if the Ticket contract or relevant source/tests change during review, AIWF does not persist stale acceptance.

**US-12.07 [NOW] — Persist reusable acceptance proof**  
As a developer, successful current verification creates a durable receipt tied to the exact contract/code/test evidence.

---

# EPIC US-13 — Manage Product Intent without Scrum ceremony

Goal: Epics, Features, UserStories, Tickets, Decisions, and Aspects explain why work exists without forcing artificial hierarchy.

### Stories

**US-13.01 [NOW] — List and inspect Epics**  
As a product/architecture owner, I can inspect initiatives and the capabilities/behaviors/work they target.

**US-13.02 [NOW] — List and inspect Features**  
As a product/architecture owner, I can inspect stable capabilities, related Stories, Tickets, tests, and code impact.

**US-13.03 [NOW] — List and inspect UserStories**  
As a product owner, I can inspect observable behaviors and their implementation/verification relationships.

**US-13.04 [NOW] — Create an Epic from intent**  
As a product/architecture owner, I can create an initiative with semantic decomposition/review instead of manually wiring every relation.

**US-13.05 [NOW] — Keep Features durable across Epics**  
As a product owner, new initiatives target/reuse existing stable capabilities rather than creating duplicate Features owned by each Epic.

**US-13.06 [NOW] — Allow technical work without fake UserStories**  
As an architect, purely technical work can be represented directly by Tickets when no meaningful user-observable Story exists.

**US-13.07 [NOW] — Preserve canonical relation semantics**  
As a maintainer, Product Intent mutations reject incoherent relation types rather than silently degrading the graph.

**US-13.08 [NOW] — Edit Product Intent through canonical mutation paths**  
As a user, shell views/editing and programmatic mutations update graph truth through validated operations rather than directly editing projection text.

---

# EPIC US-14 — Turn accepted Product Intent into actionable work

Goal: an accepted Epic/Feature/Story can be processed into the smallest coherent next layer while reusing existing work.

### Stories

**US-14.01 [NOW] — Process an Epic**  
As a product/architecture owner, I can ask AIWF to reconcile an Epic against existing capabilities/behaviors/work and create/reuse only the meaningful next layer.

**US-14.02 [NOW] — Process a Feature**  
As a product owner, I can turn a stable capability into meaningful Stories or direct Tickets depending on the actual nature of the work.

**US-14.03 [NOW] — Process a UserStory**  
As a product owner, I can turn an accepted observable behavior into missing implementation Tickets without duplicating already valid work.

**US-14.04 [NOW] — Reuse existing intent/work before creating new artifacts**  
As a maintainer, processing searches for stable reusable artifacts and does not inflate the graph with duplicates.

**US-14.05 [NOW] — Bound recursive expansion**  
As a caller, I can choose completeness/depth/maxArtifacts so a broad initiative is processed coherently without uncontrolled graph explosion.

**US-14.06 [NOW] — Review proposed structure independently before mutation**  
As a caller, product/work decomposition is critiqued before canonical apply.

**US-14.07 [NOW] — Return remaining work honestly when bounds stop expansion**  
As a caller, hitting depth/breadth bounds is reported as remaining work rather than being misrepresented as completeness.

---

# EPIC US-15 — Understand coverage and impact

Goal: users can move causally from intent to work to code to evidence and back.

### Stories

**US-15.01 [NOW] — Inspect structural coverage**  
As a product/architecture owner, I can ask whether an Epic/Feature/Story has meaningful implementation and verification coverage.

**US-15.02 [NOW] — Inspect code impact of Product Intent**  
As a developer, I can ask which code anchors are implicated by a Feature/Story and understand bounded causal impact.

**US-15.03 [NOW] — Explain why code exists**  
As a maintainer, I can traverse from code/work to the Product Intent or Decision that justifies it.

**US-15.04 [NOW] — Explain what proves a behavior**  
As a maintainer, I can traverse from Product Intent/work/code to current TestNode/acceptance evidence.

**US-15.05 [NOW] — Avoid counting artifacts as completeness**  
As a product owner, coverage/completeness is based on actual required behavior/evidence, not number of generated Stories/Tickets.

---

# EPIC US-16 — Control completeness and cross-cutting quality

Goal: callers can request an appropriate level of rigor without turning policy into bureaucracy.

### Stories

**US-16.01 [NOW] — Override completeness for one operation**  
As a caller, I can ask for poc/functional/advanced/production rigor for one operation without silently persisting that choice.

**US-16.02 [NOW] — Persist a completeness target deliberately**  
As a product/architecture owner, I can explicitly set/clear durable completeness policy on supported Product Intent scopes.

**US-16.03 [NOW] — Understand where effective completeness came from**  
As a caller, I can inspect whether completeness came from an override, explicit target, inherited Feature policy, or project fallback.

**US-16.04 [NOW] — Apply Aspects only where materially relevant**  
As a caller, cross-cutting concerns are discovered/assessed semantically rather than blindly attached everywhere.

**US-16.05 [NOW] — Require Aspect evidence before production completion**  
As a caller, a material applicable Aspect cannot be ignored merely because functional tests pass.

**US-16.06 [NOW] — Avoid Aspect ceremony**  
As a product owner, irrelevant or weakly justified Aspects do not force artificial work or acceptance burden.

---

# EPIC US-17 — Preserve architecture Decisions and project doctrine

Goal: automated work respects durable architectural intent rather than optimizing locally against one Ticket.

### Stories

**US-17.01 [NOW] — Discover governing Decisions during work**  
As a coding agent, investigation/resolution includes relevant accepted Decisions in the evidence that constrains implementation.

**US-17.02 [NOW] — Prevent proposals that violate known architecture**  
As an architect, AIWF critique/validation can reject or revise work that conflicts with governing project Decisions.

**US-17.03 [NOW] — Relate Decisions to intent/code/work**  
As an architect, I can navigate which artifacts a Decision governs and which implementation is affected.

**US-17.04 [NOW] — Treat project instructions as evidence**  
As a maintainer, repository doctrine, agent instructions, and accepted architectural constraints influence work rather than being ignored as incidental prose.

---

# EPIC US-18 — Diagnose and fix defects from symptoms

**Status:** DRAFT design.

Goal: a messy symptom becomes a truthful durable Bug, causal root-cause diagnosis, ordinary remediation work, and verified original-defect closure.

### Stories

**US-18.01 [DRAFT] — Report a bug from ordinary language**  
As a developer, I can give AIWF a symptom/error description and get a canonical Bug Ticket without manually authoring a perfect report.

**US-18.02 [DRAFT] — Report a bug from failing command/output**  
As a developer, I can provide a failing command, stderr, stack trace, or log and AIWF separates observations from inference.

**US-18.03 [DRAFT] — Correlate with an existing Bug before creating another**  
As a maintainer, AIWF checks exact signatures, shared tests/code, and semantic evidence before deciding whether a new Bug is distinct.

**US-18.04 [DRAFT] — Create/reuse the Bug before deep investigation**  
As a maintainer, investigation has a durable artifact even when root cause is not yet known.

**US-18.05 [DRAFT] — Investigate causal hypotheses rather than hunt patches**  
As a developer, AIWF iteratively asks what evidence best distinguishes plausible causes and uses the cheapest safe probe.

**US-18.06 [DRAFT] — Distinguish symptom, proximate cause, root cause, and violated invariant**  
As a maintainer, diagnosis explains why the system could enter the bad state rather than stopping at the nearest failing line.

**US-18.07 [DRAFT] — Falsify the preferred diagnosis before accepting it**  
As a maintainer, AIWF actively checks competing explanations and evidence that could contradict its root-cause hypothesis.

**US-18.08 [DRAFT] — Review remediation against the Prime Directive**  
As an architect, proposed remediation is challenged for symptom-patch risk and must restore the violated responsibility/invariant.

**US-18.09 [DRAFT] — Turn an actionable diagnosis into ordinary Tickets**  
As a developer, debugging creates the smallest useful remediation Ticket set and hands execution to normal Ticket resolution.

**US-18.10 [DRAFT] — Fix through the exact debugging path**  
As a developer, `debug --fix` / `fix` performs the same intake/investigation and then resolves the remediation work rather than invoking a second repair engine.

**US-18.11 [DRAFT] — Verify the original defect after remediation**  
As a developer, the Bug closes only when its original reproduction/oracle passes and the violated invariant is demonstrably restored.

**US-18.12 [DRAFT] — Classify not-a-bug and duplicate outcomes truthfully**  
As a maintainer, expected behavior/config/environment/external issues and duplicates are closed with evidence rather than converted into unnecessary code work.

---

# EPIC US-19 — Reconcile substantial designs/requirements before execution

**Status:** ACCEPTED design; implementation pending.

Goal: users can feed AIWF messy substantial engineering/product material and receive a coherent, evidence-grounded synthesis before canonical mutation.

### Stories

**US-19.01 [ACCEPTED] — Digest substantial material**  
As an architect/product owner, I can provide a design, proposal, requirements set, or other substantial material and have AIWF analyze/reconcile it against project truth.

**US-19.02 [ACCEPTED] — Ground digestion in authoritative project evidence**  
As a caller, Digest incorporates relevant Product Intent, Decisions, Aspects, code/work evidence, and authoritative supplied material without replacing them with generic model knowledge.

**US-19.03 [ACCEPTED] — Distinguish source facts from inference**  
As a reviewer, the synthesis preserves provenance and does not silently turn model interpretation into source truth.

**US-19.04 [ACCEPTED] — Detect contradictions, gaps, redundancies, and unresolved questions**  
As a reviewer, Digest surfaces material semantic conflicts and missing decisions rather than merely summarizing text.

**US-19.05 [ACCEPTED] — Reconcile revisions with bounded critique**  
As a caller, independent review can request a bounded revision pass before the synthesis is accepted.

**US-19.06 [ACCEPTED] — Return needs-input when material ambiguity remains**  
As a caller, Digest asks the precise unresolved question rather than inventing a decision.

**US-19.07 [ACCEPTED] — Keep Digest read-only**  
As a caller, Digest does not itself mutate Product Intent, code, or work; explicit downstream acceptance/change operations own mutation.

**US-19.08 [ACCEPTED] — Compose Digest into normal AIWF work**  
As a caller, an accepted synthesis can feed canonical Product Intent mutation, `process_*`, or `resolve_ticket` rather than creating a parallel workflow system.

---

# EPIC US-20 — Measure AIWF honestly

Goal: maintainers can assess cost, latency, quality, failure modes, and usefulness without invented metrics or prompt/source surveillance.

### Stories

**US-20.01 [NOW] — Inspect operation metrics**  
As a maintainer, I can query recent metrics by operation, Ticket, trace, time window, and tags.

**US-20.02 [NOW] — Attribute nested cognition to one operation**  
As a maintainer, I can correlate Actor/System-1/LLM work to the high-level artifact operation that caused it.

**US-20.03 [NOW] — Distinguish termination causes**  
As a maintainer, metrics distinguish provider timeout/quota/rate-limit/invalid-response from Actor budget/error/completion.

**US-20.04 [NOW] — Measure phase-level cognition when relevant**  
As a maintainer, high-level operations can tag semantic phases so I can see where tokens/latency were spent without persisting workflow state.

**US-20.05 [NOW] — Never infer zero cost from unavailable pricing**  
As a maintainer, missing provider cost data remains unavailable rather than being reported as free.

**US-20.06 [NOW] — Export durable benchmark evidence**  
As a maintainer, I can export a sanitized benchmark bundle tied to exact revisions/configuration without prompts/source/model outputs.

**US-20.07 [NOW] — Run comparable benchmark studies**  
As a maintainer, I can tag controlled variants/trials and compare correctness, time, cognition, tests, repairs, and intervention honestly.

**US-20.08 [NOW] — Refuse unsupported marketing claims**  
As a maintainer, AIWF does not claim token/cost/quality improvements where the underlying measurement is unavailable or incomparable.

---

# EPIC US-21 — Configure models and cognition without coupling product semantics to providers

Goal: model routing is replaceable infrastructure; artifact semantics stay stable.

### Stories

**US-21.01 [NOW] — Use configured local/cloud providers**  
As a maintainer, I can configure supported providers/models and have AIWF route calls accordingly.

**US-21.02 [NOW] — Preserve explicit model overrides**  
As a power user, when I explicitly choose a model/route, that choice remains authoritative.

**US-21.03 [NOW] — Let ordinary workloads use learned/configured routing advice**  
As a user, I do not need to choose a model manually for every request.

**US-21.04 [NOW] — Bound context/output/model-native parameters**  
As a maintainer, I can configure context/output limits and provider-native knobs without pretending all providers share one parameter taxonomy.

**US-21.05 [NOW] — Use cheap cognition for classification/routing**  
As a maintainer, simple semantic decisions can use System-1/cheap local models rather than invoking an expensive Actor.

**US-21.06 [NOW] — Escalate semantic/reasoning work when warranted**  
As a caller, materially difficult design/review work can use a stronger configured route without changing the domain operation.

**US-21.07 [NOW] — Do not make a model guess canonical truth by itself**  
As a maintainer, cheap classification/routing may narrow work, but canonical project facts require appropriate deterministic/semantic confirmation.

---

# EPIC US-22 — Use AIWF from external coding agents and IDEs

Goal: external agents can delegate meaningful work rather than recreating AIWF’s internals through dozens of primitive calls.

### Stories

**US-22.01 [NOW] — Connect over MCP**  
As an external agent, I can use AIWF through a stable stdio MCP surface.

**US-22.02 [NOW] — Delegate Ticket lifecycle through high-level tools**  
As an external agent, I can call investigate/prepare/resolve without reconstructing internal sequencing.

**US-22.03 [NOW] — Delegate Product Intent processing**  
As an external agent, I can process Epic/Feature/Story artifacts through the same canonical domain operations.

**US-22.04 [NOW] — Use bounded drill-down primitives when needed**  
As an external agent, I can inspect graph/source/references/blast/tests/change/Git/knowledge when a real blocker requires it.

**US-22.05 [NOW] — Keep internal implementation tools private**  
As a maintainer, adding internal tools does not automatically expose them to every MCP client.

**US-22.06 [NOW] — Use the installed AIWF skill as operational doctrine**  
As a coding agent, I can read concise project instructions that teach artifact-first delegation, safety, verification, and the Prime Directive.

**US-22.07 [NOW] — Receive the same operation semantics across CLI/shell/MCP**  
As a caller, complete/needs_input/blocked and completeness/critic/depth semantics remain consistent across interfaces.

---

# EPIC US-23 — Inspect and edit structured project artifacts interactively

Goal: humans can work directly with Product Intent/work state without abandoning canonical graph mutation paths.

### Stories

**US-23.01 [NOW] — Open structured artifact views in the shell**  
As a developer, I can open Ticket/Epic/Feature/Story/Aspect views and inspect their canonical relationships.

**US-23.02 [NOW] — Edit supported artifact fields interactively**  
As a developer, I can edit an artifact in the shell and save through validated canonical mutation tools.

**US-23.03 [NOW] — Return cleanly from modal views to the shell**  
As a shell user, opening/closing interactive views does not leave terminal mouse/raw-mode corruption.

**US-23.04 [NOW] — Keep projections synchronized after canonical edits**  
As a developer, successful artifact mutations update readable projections without making projection text the source of truth.

---

# EPIC US-24 — Use advanced escape hatches without undermining the core model

Goal: experts can inspect/evaluate/customize AIWF without forcing those mechanisms into ordinary workflows.

### Stories

**US-24.01 [NOW] — Evaluate short code against the live project context**  
As a power user, I can run bounded `eval` code against available store/registry context for one-off expert inspection.

**US-24.02 [NOW] — Execute a one-off cognitive request**  
As a power user, I can invoke the Actor directly for an explicitly autonomous one-off task.

**US-24.03 [NOW] — Search project knowledge**  
As a developer, I can search/show/synchronize durable knowledge items when repository knowledge is relevant to work.

**US-24.04 [NOW] — Scaffold a small typed source/test pair**  
As a developer, I can scaffold a conventional source file and test harness when that is the actual requested work.

**US-24.05 [NOW] — Audit graph/architecture integrity**  
As a maintainer, I can run an audit that surfaces structural/project-health problems without silently mutating them.

**US-24.06 [NOW] — Configure project settings explicitly**  
As a maintainer, I can inspect/update supported AIWF configuration without editing hidden runtime state.

---

# EPIC US-25 — Preserve Prime-Directive quality under autonomous execution

Goal: AIWF remains simple, re-entrant, evidence-driven, and resistant to “sophisticated-looking” accidental complexity.

### Stories

**US-25.01 [NOW] — Prefer existing primitives over narrow special cases**  
As a maintainer, a new user story is implemented by composing/generalizing existing capabilities where possible instead of adding phrase-specific tools or brittle branches.

**US-25.02 [NOW] — Keep recursive operations re-entrant**  
As a caller, nested artifact/Actor operations can safely reuse durable project state and inherited cancellation/metrics without hidden continuation sessions.

**US-25.03 [NOW] — Preserve one owner for each kind of truth**  
As a maintainer, code indexing, Product Intent, test evidence, safe change, metrics, and workflow state do not acquire shadow duplicate subsystems.

**US-25.04 [NOW] — Bound autonomy rather than pretending it is infallible**  
As a user, AIWF uses explicit step/repair/artifact/context bounds and returns truthful non-success instead of wandering indefinitely.

**US-25.05 [NOW] — Keep deterministic work deterministic**  
As a maintainer, simple selection, validation, graph traversal, state transitions, and other deterministic operations do not consume LLM calls merely because AI is available.

**US-25.06 [NOW] — Use cognition only at genuine semantic boundaries**  
As a maintainer, System-1/reasoning/Actor calls are used according to the actual uncertainty/tool-use requirement, not as generic orchestration.

**US-25.07 [NOW] — Preserve partial failure evidence**  
As a maintainer, recovered tool/model failures remain observable in the operation result/metrics rather than disappearing after a later success.

**US-25.08 [NOW] — Let real daily workflows define regressions**  
As a maintainer, a green component suite cannot close a change if its representative user-story scenario fails through the real stack.

---

# Acceptance-suite rule

Every Epic must have at least one **realistic user-story suite** that runs through the same public/runtime boundary a user or external agent actually uses.

Examples:

- US-02 must execute real shell/natural-language routing with the real semantic registry/tool catalog; mocking the classifier and preselecting the expected tools does not prove the story.
- US-03 must compare natural-language “next recommended ticket” behavior with canonical deterministic `next` behavior against the same project state.
- US-07 must exercise real `resolve_ticket` lifecycle boundaries; isolated helper tests are insufficient.
- US-11/12 must prove current TestNode selection/execution and semantic acceptance against realistic repository fixtures.
- US-22 must test the actual MCP/public surface, not merely internal registry calls.
- US-18/19, when implemented, must begin from their user stories before internal APIs are designed.

Component/unit tests remain valuable after these story-level contracts exist.

## Definition of done for any AIWF change

A change is done only when:

1. it names the User Story/Stories it serves;
2. the story has observable acceptance behavior;
3. a realistic acceptance test exists or is deliberately added;
4. focused internal tests cover important mechanisms/negative cases;
5. typecheck/full suite remain green;
6. the actual user-story path has been exercised;
7. no Prime-Directive violation or shadow subsystem was introduced.

