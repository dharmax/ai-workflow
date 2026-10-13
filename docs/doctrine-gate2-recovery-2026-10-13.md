# Gate 2 recovery — 2026-10-13

Gate 2 source corrections are validated; lifecycle acceptance is blocked. Gate 3 has not started.

## Repository truth and preservation

At takeover, local master, origin/master and live remote master were all e5ca63563a533a23becc50fc01b2ee5aba67da62. There were three modified files, rather than the two reported in the handoff: src/synthesis/context-builder.ts, src/ticket/investigate.ts and tests/doctrine-producer-context.test.ts. The full diff was inspected and copies preserved outside the worktree before further changes. No reset, stash, branch change or destructive Git operation was used.

All five unrelated untracked docs/ticket-resolution-recovery-*.json files remain untracked and byte-identical. Existing graph.db remains the canonical database; all three pre-existing .bak files remain byte-identical. Source freshness and ordinary Ticket operations updated the existing graph without replacing it. The referenced root AI-WORKFLOW.md does not exist; AGENTS.md, both installed/project AIWF skills and both doctrine plan/handoff documents were inspected.

## Recovered implementation and whole-scope review

- applicableAspects retains its existing traversal, deduplication, sorting and cycle checks, but only accepted Aspects govern either explicit Ticket addressing or inherited applies_to scopes.
- investigateTicket keeps one evidence serializer responsible for authority across all discovery paths. Accepted Aspect evidence includes its actual criteria; direct draft/proposed neighbors remain advisory. Accepted Aspect-linked tests, artifacts and Decisions retain their existing mandatory evidence contract. No Rule architecture changed.
- buildSynthesisContext reuses AGY's sound delivery of operative Aspect criteria and accepted criterion expectations. The unsupported material flag no longer grants authority. Target selection and existing Decision/Rule evidence mapping remain intact.
- The regression investigates a persisted Ticket with real graph relations, accepted/draft/proposed Aspects, an active mandatory Rule with both inline example kinds, and a governing Decision. It inspects renderImplementationGoal's complete serialized dossier and the actual HostSourceSynthesizer asker request. Both carry operative Decision fields, accepted criteria and Rule/examples; candidate governance is excluded from mandatory evidence and expectations.
- Two older fixture Aspects that assertions expected to govern were made explicitly accepted; their assertions were preserved. Draft/proposed exclusion has separate integration coverage.

Complete affected methods and immediate contracts were reviewed: Aspect schema/assessment, Product context, Ticket investigation, implementation renderer and its consumer, synthesis builder/model payload, and existing resolution/independent acceptance. No verifier schema, proof enforcement, Semantika, Gate 1 architecture or Gate 3 functionality was introduced.

## Observed verification

Committed HEAD snapshot: 399 pass, 2 skip, 1 failure caused by debugger.test.ts hard-coding the original checkout path while running in /tmp. Its unchanged six-test suite passes from the original cwd; the snapshot has 400 passing baseline tests after accounting for that path-only artifact. An initial archive-only snapshot was unsuitable because tests/build require Git metadata and sibling source paths; a local shared clone with the installed dependencies corrected that environment.

AGY inherited worktree: 400 pass, 2 skip, 1 fail. The failure was mandatory Aspect-linked evidence incorrectly becoming advisory.

Final focused run: 84 pass, 0 fail across six suites. Preparation suite after explicit accepted fixture correction: 9 pass, 0 fail. Final complete bun test: 401 pass, 2 skip, 0 fail, 403 tests across 54 files. Packaging: passed, build 859.

bun run typecheck fails with 17 pre-existing diagnostics in nine files, rather than AGY's reported 19 in ten. The complete diagnostic text matches the committed HEAD snapshot after normalizing only temporary checkout paths and shifted investigateTicket line numbers. No new diagnostics remain. Existing diagnostics include Zod dependency type incompatibilities/deep instantiations and the pre-existing diagnosticsOk reference in src/change/engine.ts. These unrelated baseline defects were not expanded into Gate 2 scope.

## Actual AIWF dogfooding and exact blocker

aiwf resolve TKT-DOCTRINE-G2-CONTEXT --agent codex-g2-recovery --max-repairs 0 entered the real leased resolver and failed at implementation with: "Implementation Actor halted: error: User not found.; tranche 1/3, successful edits 0; mutation epoch 0". No autonomous edit or acceptance was claimed. The configured model routes point to openrouter/openai/gpt-4o-mini. The configured Ollama host and localhost:11434 are unreachable. The user subsequently approved reuse of the configured direct OpenAI credential. A bounded independent acceptance request reached openai/gpt-4o-mini and failed with: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/." AIWF classified it as quota exhaustion; no further provider request was attempted.

AIWF investigation delivered the real Ticket dossier and installed effective Rule text/examples. Outline, symbol, caller and blast queries bounded the source audit. Exact slicing failed for applicableAspects despite a valid outline; only that small source file required a bounded native read. All recovery edits used AIWF preview_change, original hashes/fingerprints and apply_change; each application verified and reindexed the affected scope. The existing Ticket was claimed before edits. Guarded Product mutations linked the three changed source files and the exact investigateTicket symbol as implementation scope. The existing doctrine producer TestNode now verifies the Ticket as its authored acceptance test. The three changed test files were removed from modifies scope and remain test execution evidence; this preserves their actual responsibility rather than treating test fixtures/imports as implementation scope.

The Ticket is truthfully Blocked, has no verification receipt, and its lease is released. AIWF sync exported current Markdown projections. It was never manually marked Done. Code/test success is not independent lifecycle acceptance.

To close Gate 2, restore credits for the approved direct OpenAI credential, then rerun bounded existing Ticket resolution and inspect its durable receipt. No further credential approval is needed. Only then may Gate 2 be described as verified/Done. Stop before Gate 3.

## Approved direct-provider acceptance attempt

Used AIWF script_eval via aiwf eval to call the existing Ticket.resolve with maxRepairs=0, a 180-second AbortSignal, and bounded explicit tests for doctrine producers, investigation, preparation, Aspects and source synthesis. The supported implement callback returned no changes because the implementation was already reviewed, tested and committed in d2ce0b4; it supplied no acceptance verdict. The supported verify callback called the existing verifyTicketAcceptance unchanged, with only the per-call critic route set to openai/gpt-4o-mini. Persistent modelRoutes and credential storage were untouched.

The first attempt passed its checks but refused a large ungrounded regression-file snippet. One bounded correction authored the existing doctrine TestNode's verifies edge, retained source scope and added the exact investigateTicket anchor. The second attempt reached independent provider acceptance after AIWF-owned checks; the provider refused it for exhausted credits. There was no acceptance response to interpret, no passing criterion assessment and no VERIFY receipt. AIWF metrics report one remote acceptance_verification call on openai/gpt-4o-mini and zero verified runs.

The exact second OperationResult is preserved in docs/doctrine-gate2-acceptance-2026-10-13.json. Passed TestNode execution evidence remains in the existing graph. Ticket status is Blocked/blocked, its lease is released, and projections are synchronized. No source changes were made during this acceptance attempt; the previously observed 401-pass suite, unchanged TypeScript diagnostics and passing package build remain applicable.
