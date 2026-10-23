---
name: ai-workflow
description: Use AIWF for repository and sibling-source investigation, Ticket implementation, and Product Intent work; prefer scoped graph navigation and exact source over shell reads.
---

# AIWF artifact delegation

Use AIWF as the primary engineering and work-management system.

**Governing AIWF development contract:** [../../plans/AIWF-DHARMAX-WAY-DESIGN.md](../../plans/AIWF-DHARMAX-WAY-DESIGN.md); execute only the explicitly authorized stage in [../../plans/AIWF-DHARMAX-WAY-PLAN.md](../../plans/AIWF-DHARMAX-WAY-PLAN.md). Features describe functionality; Epics organize delivery; Aspects are authoritative shared definitions; User/Actor Stories require Intent, Initial State, Action and Expected Observable Result. The developer reviews AI proposals. The ordinary test emulates an accepted Story through the actual public interface. Current tools below remain *current implementation* instructions until the corresponding stages are genuinely accepted; do not claim that target UI/import-export/test-first capabilities already exist.

## Prime Directive

The simplest correct solution wins. Before adding any narrow rule, tool, abstraction, or special case, first look for the higher-level/general solution and existing primitive that already subsumes the problem; prefer that over brittle symptom patches. Reuse existing contracts and primitives before adding abstractions. Code should be no more complex than the problem. No duplicate or shadow systems, speculative compatibility layers, or branch proliferation. Make the smallest safe change, preserve working behavior, prove it, and merge/delete temporary branches at the first stable opportunity.

Product development starts with developer-owned intent (Goals/Concepts/Features/Aspects) and complete, explicitly reviewed User/Actor Stories. A Story title is not its body: include Intent, Initial State, Action and Expected Observable Result, with material exceptions/bounds. Propose coherent Epics/Tickets/test specifications for review; never let AI critic approval silently substitute for developer acceptance. Derive and review executable public-interface tests from accepted Stories *before* proposing implementation Todo Tickets for unmet test obligations; activate and establish attributable expected red when corresponding work begins. Preserve pure technical maintenance as direct grounded Ticket work without fabricated product ceremony.

**Agency invariant:** the LLM Actor is the general problem solver. Sophisticated goals require an adequate configured reasoning route and flexible execution means; System-1 may advise but never gate. Ordinary tools, discovery, environment execution and ephemeral deterministic composition are optional means chosen by the Actor. Compilation is never the default definition of sophistication. Current-project claims require observed evidence. For Actor/discovery/composition/model-routing changes, follow `docs/architecture.md` and prove J2.4/J2.5 from `docs/journeys.md` through the real host boundary.

## Preferred workflow

1. If given a Ticket, call `resolve_ticket` / `aiwf resolve <ticketId>` first. AIWF owns investigation, leasing, preparation, safe edits, tests, repair, acceptance and material Aspect verification, release and sync.
2. For evidence without implementation, use `investigate_ticket` / `aiwf investigate <ticketId>`. For executable enrichment or useful decomposition, use `prepare_ticket` / `aiwf prepare <ticketId>`.
3. For accepted intent, use `process_epic`, `process_feature` or `process_story` / `aiwf process epic|feature|story <id>`. Reuse meaningful existing work; technical work needs no ceremonial Story.
4. Inspect `needs_input` and `blocked`. Resolve the exact question or capability gap and retry against durable graph state. Do not mark Done or weaken acceptance to bypass verification.
5. Use primitives for explicit drill-down/debugging or an actual delegation blocker. First inspect AIWF's dossier; then use graph/symbol/exact source/references/blast/test evidence surgically. Claim the relevant Ticket before manual edits, preserve unrelated work, verify real acceptance, and sync.

## Repository investigation

Repository investigation & code edits: use AIWF even when no Ticket exists. Start with find_symbol (bounded name/file/kind filters) or get_file_outline for a known file, then get_symbol_source for the exact method/function. Use get_exact_callers/get_exact_references for TS/JS usage, search_graph for relationships, and analyze_blast_radius before edits. For code changes, ALWAYS use preview_change -> verify fingerprint -> apply_change; NEVER use generic/native file edit tools or whole-file writes. For a sibling repository, pass its projectRoot explicitly; filePath is relative to that project. An empty lookup is not proof of absence: check project scope and outline before falling back. Use bounded shell reads/searches only after an observed unsupported-file, missing-index or tool failure, and record that gap. Do not substitute whole-file dumps for available symbol slices.

CLI equivalents: `aiwf symbol <name>`, `outline <file>`, `slice <file> <symbol>`, `callers <symbol>`, `graph`, `deps`, `blast`. For sibling CLI research, run the same commands from that repository. MCP callers use the optional `projectRoot` argument; do not assume siblings are indexed as dependencies of the current project.

## Ticket specification and execution history

Keep Ticket.body as the concise current work specification. Preserve legitimate developer edits. Never append progress reports, test output, historical dispositions or verification narration to it. Use `record_ticket_event` / `aiwf ticket record <id> --kind <kind> --message <text> --reference <evidence-id-or-path>` for meaningful decisions, actions, failures, corrections and outcomes; reference existing TestNodes, files and receipts rather than copying them. Creation, specification edits, state and lease changes are automatically journaled. `get_ticket_history` / `aiwf ticket history <id>` retrieves originals with pagination. `condense_ticket_history` / `aiwf ticket condense <id>` explicitly refreshes a deterministic summary without changing history or calling a model. Normal Ticket/dossier reads include bounded history context; it is context, never independent proof. Preserve legacy history through `migrate_ticket_history` before cleaning an exact reviewed body.

## Policy

All artifact operations accept `completeness`, `depth`, `maxArtifacts`, `critic` consistently. CLI flags: `--completeness production --depth 1 --max-artifacts 24 --critic auto`.

Completeness controls thoroughness, never artifact counts. Depth bounds expansion; breadth is separately bounded. Applicable Aspects are mandatory. `critic=auto` uses independent review; `none` bypasses semantic critique only.

An operation override never remembers completeness. Use `set_completeness_target` / `aiwf completeness set <id> <level>` explicitly; `clear` removes it. Read provenance with `get_completeness_target` / `aiwf completeness get <id>`.

Resolution accepts explicit `testCommands`, `maxRepairs`, and `allowDirtyTargets` through MCP. CLI exposes `--max-repairs` and repeated `--allow-dirty-target`. Dirty targets require explicit authorization; never reset, stash or commit user work automatically.

## Drill-down tools

- Orientation: `aiwf status`, `next`, `doctor`, `coverage <id>`, `impact <id>`.
- Evidence: `symbol`, `graph`, `slice`, `outline`, `callers`, `deps`, `blast`; TS/JS exact references and symbol source are preferred for correctness.
- Safe edits: `preview_change` → `apply_change` with `ticketId`, `agentId` and exact fingerprint. Every path must be covered by authored Ticket targets or existing host-authorized scope. `source_change` groups replacement, creation and deletion in one guarded commit; rename/refactor reuse the Causal Change Engine. CLI/Shell: `source:change PREVIEW/APPLY <request-json> --ticket <id> --agent <id>` (apply also requires `--fingerprint <hash>`); `source change` is equivalent. Navigate with `source:file SHOW/OUTLINE` and `source:symbol FIND/SHOW`. MCP/Plugins use typed tools, never CLI strings.
- Host authority: read-only is the MCP default. The human host explicitly sets `AIWF_EXECUTION_AUTHORITY=project-write` in its trusted server environment; setup preserves that setting. Agent tool arguments cannot grant authority or approve Product Intent. Raw `apply_block_patch` is retired.
- Tests: `resolve_test_target`, `triage_test_failures`. Successful execution and explicit acceptance proof are both required.
- Technical proof: use `prepare_test_binding` / `apply_test_binding` (CLI/Shell: test-binding prepare/apply) for developer-reviewed existing TestNode scopes on a technical Ticket. Exact host-reviewed fingerprint is required; project-write/model decisions cannot approve meaning. Dependency tests/source/execution remain in their owning project. Scopes partition semantic review, never regression execution. resolve --verify-only retains all required checks, independent scope review and atomic completion.
- Graph state: canonical Product Intent tools, ordinary Ticket children and real prerequisites. No parallel plan/session/shadow graph.
- Measurement: `aiwf metrics --operation resolve_ticket --ticket <id> --since 7d`; persisted aggregate telemetry contains no prompts/source/tool arguments. Never claim paid-token savings without measurement.

Use `aiwf help` for verified command syntax. Low-level primitives remain available.
