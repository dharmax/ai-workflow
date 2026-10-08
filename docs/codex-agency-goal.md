# Codex/AGY goal — restore AIWF agency and canonical code writing

**Work on `master`. Do not create a branch.**

This goal supersedes the older shell-centric restoration instructions. Preserve the useful 2026-10-08 checkpoint work unless a reproduced defect requires changing it.

Read first, in order:

1. `skills/ai-workflow/SKILL.md` — Prime Directive
2. `skills/ai-workflow/AGENTS.md`
3. `docs/use-story-catalog.md` — J2.4, J3.1, J3.2, J3.4, J5.1
4. `docs/agency-constitution.md`
5. `docs/code-writing-design.md`
6. `docs/agency-restoration-plan.md`
7. `docs/agency-checkpoint.md` only as preserved evidence/current-baseline history
8. actual local sibling sources for `../skill-manager`, `../text-compiler`, `../llm-utils`

## Goal

Produce the smallest coherent architecture in which:

- the Actor understands/pursues goals;
- System-1 provides cheap non-binding tactical advice;
- skill-manager provides reusable know-how;
- text-compiler provides bounded deterministic helper composition and the canonical repository source synthesis;
- `write_code` is the single AIWF-generated repository source producer;
- CausalChangeEngine remains the only repository mutation authority;
- `resolve_ticket` uses that writer internally;
- tests/TestNodes + authored acceptance remain proof.

The architectural sentence is:

> Actor decides. System-1 advises. Skill guides. Capabilities provide hands. text-compiler composes/writes. ChangeEngine mutates. Tests and acceptance prove.

## Prime Directive constraints

- Start from the actor journeys; do not implement capability-first.
- Reuse existing contracts/primitives before adding anything.
- No second planner/orchestrator/workflow engine.
- No second skill/capability registry.
- No second compiler.
- No second repository mutation engine.
- No phrase-specific critical-path/ranking/ordinal handlers.
- No giant generic coding prompt disguised as a skill.
- No branch forest.
- No speculative compatibility layer.
- Delete/subordinate duplicate source-producing paths only after replacement is proven.

## Mandatory sequence

### Phase 0 — AUDIT ONLY, then report

Do not mutate production code before finishing this audit.

Inspect the **actual local** APIs and produce a concise integration map for:

1. `SkillManager.retrieve/activate`, source configuration and capability metadata.
2. text-compiler:
   - `compileCodelet`;
   - existing generic synthesis hooks;
   - dynamic test/probe execution;
   - cancellation/recovery/model routing;
   - whether a public repository-source synthesis API already exists.
3. `Ticket.resolve`:
   - exact-target direct source synthesis;
   - implementation Actor source-producing routes;
   - deterministic ChangeEngine routes;
   - repair path.
4. usages of AIWF `compile_codelet/run_codelet/promote_codelet`.
5. current ToolContext execution authority and generated-code safety.
6. package/build implications for shipping built-in skills.

Reproduce/classify:
- at least two preserved J2.4 failures;
- one current J3.1 generative code route.

Classify each failure as tactic selection, missing know-how, missing composition, duplicate source producer, model quality, evidence/provenance, or execution-contract defect.

**STOP and report if any authoritative-plan assumption is false.** Correct the docs before coding rather than forcing implementation to fit them.

### Phase 1 — skill runtime

Integrate `@dharmax/skill-manager` with the smallest explicit source configuration.

Add the concise built-in `software-implementation` instructional skill specified in `docs/code-writing-design.md`.

Do not implement durable skill authoring/promotion.

Gate:
- find/activate works;
- full context remains lazy;
- no duplicate index;
- skill failure cannot bypass hard safety.

### Phase 2 — text-compiler boundaries

Implement the smallest text-compiler support required for:

A. ephemeral behavior-level helper compilation with generated execution delegated through existing authority/sandbox;  
B. repository source synthesis for exact symbol/new-file code writing.

If text-compiler already has an adequate public source-synthesis API, use it. Otherwise add the smallest generic `compileSource`-style API in text-compiler; keep it independent of AIWF/Tickets/filesystem mutation.

Do not misuse executable codelets for repository methods/classes/modules merely to avoid the API correction.

Gate:
- helper execution is ephemeral/sandboxed/provenant;
- source synthesis returns bounded source/diagnostics without repository mutation.

### Phase 3 — canonical `write_code`

Add one internal AIWF capability following `docs/code-writing-design.md`.

Requirements:
- grounded exact target only;
- fresh target source/context read by the capability;
- text-compiler generates source;
- CausalChangeEngine previews/applies;
- existing dirty-target/lease/cancellation rules preserved;
- no parallel persistence/codelet store;
- compiler/source-generation failure is explicit;
- deterministic rename/refactor bypasses synthesis.

Do **not** add `write_code` to public MCP yet.

Gate:
- exact symbol;
- new file;
- deterministic rename control;
- dirty target;
- abort;
- compiler failure.

### Phase 4 — migrate `resolve_ticket`

Replace duplicate source producers:

1. exact-target direct `asker.json` source synthesis -> `write_code`;
2. implementation Actor:
   - keeps navigation/references/inspection;
   - gets `write_code`;
   - gets deterministic mutation operations;
   - cannot hand-author arbitrary replacement/new source through generic `apply_change`;
3. repair feeds current failure evidence back through `write_code`;
4. preserve existing tests/TestNodes/acceptance/lease/proof lifecycle.

After parity:
- delete the old direct source-synthesis branch;
- simplify any now-obsolete implementation schema/path.

Gate:
- realistic J3.4 exact-target Ticket;
- realistic J3.1 multi-target Ticket;
- J3.2 failing implementation repaired through the same writer;
- deterministic rename without writer;
- MCP `resolve_ticket` proves internal canonical path.

### Phase 5 — tactical System-1 + general Actor

Add one bounded cheap advisory tactical assessment using existing llm-utils routing.

It may suggest:
- direct;
- capability;
- skill;
- compile-helper;
- write-code;
- environment;
- external knowledge.

It may not choose a binding route or shrink powers.

General Actor gets:
- capability discovery;
- skill find/activate;
- ephemeral helper compilation;
- environment execution;
- `write_code` when write authority/grounded implementation makes it appropriate.

Simplify shell-centric prompts.

Gate:
- wrong advice recovery;
- discovery failure recovery;
- skill-guided fixture;
- compilation-heavy fixture;
- code-writing fixture;
- simple lookup does not overcompile.

### Phase 6 — full integrated Agency Gate

Run all cases in `docs/agency-restoration-plan.md`.

Mandatory live requests:

- “what's on the critical path of this project? what's the goal of the project? what's missing?”
- “give me the 2nd most recommended next ticket?”
- “give me the most recommended and the least recommended tickets and see if they are related to the same main artifacts”

Mandatory coding journeys:

- J3.4 exact-target source generation;
- J3.1 multi-target implementation;
- J3.2 bounded repair;
- deterministic rename control;
- J5.1 MCP `resolve_ticket`.

Independent review must verify grounding/correctness. HTTP 200, schema validity, green component tests or model self-review are not acceptance.

Measure before/after:
- Actor steps;
- shell calls;
- model calls;
- elapsed time;
- compiler attempts.

### Phase 7 — cleanup only after Gate 6

Audit/remove:
- obsolete direct exact-source synthesis;
- resolver Actor source-generation bypass;
- old actor-authored codelet generation paths superseded by behavior-level compiler use.

Keep still-useful deterministic ChangeEngine/block patching.

Update current-behavior README/docs only after implementation is real.

## Hard stop conditions

Stop and redesign rather than adding complexity if implementation introduces:

- a new planner/strategy state machine;
- deterministic prompt routing as a competence gate;
- a second registry/search index;
- an AIWF-specific fork of text-compiler;
- generated source applied outside ChangeEngine;
- generated code executed outside existing authority;
- durable auto-promotion of one-off helpers;
- public MCP expansion without an actor journey;
- query-specific acceptance hacks;
- prompts carrying safety that should be enforced mechanically.

## Final report contract

When the complete Gate is genuinely green, stop and report:

1. proven root causes from source/runtime;
2. final architecture in <=10 lines;
3. exact System-1 contract and measured overhead;
4. exact skill-manager integration + built-in skill size/source;
5. exact text-compiler API used/added;
6. exact `write_code` contract and safety boundary;
7. Ticket.resolve paths removed/replaced;
8. adversarial + live journey results;
9. before/after steps/tool calls/model calls/latency;
10. full AIWF + affected sibling tests/typechecks;
11. remaining risks.

If a gate fails, keep it failed. Do not weaken it, special-case the prompt, or declare success from lower-level tests.
