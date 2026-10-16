# PC1a canonical safety — 2026-10-16

Scope: PC1a only, S5 Postcondition Execution Plan §3. Starting and pulled master: `46fcd79b7dacd75a4b558bc16db53a8dc99f3e33`; fast-forward-only pull was already current and the checkout began clean. No PC1b/PC2 functionality, S6 work, Gate 5 closure or Markdown migration is included.

## Concepts, owners and engineering flow

Unauthorized or cancelled execution cannot write canonical records. Definition authoring cannot manufacture independently verified completion or execution proof. A Decision proposal is an inert value.

The existing WorkflowStore owns canonical admission. ToolRegistry and the Actor's discovered-tool execution pass the host's existing execution authority and AbortSignal through callback-scoped context. Missing tool/Actor authority defaults to read-only; a nested call cannot upgrade a read-only or expired context. The existing Semantika adapter checks that context immediately before both conditional batches and native collection writes. This closes cancellation between an earlier domain check and actual native persistence. No new authorization package, role/delegation model, class, graph, database or transaction mechanism was introduced.

Ticket authoring checks live at the existing Ticket state/store owners and are reused by Product validation. Generic create, update, lane changes, legacy done/move, Product JSON, returned-entity update and projection import cannot introduce Done/verified. Retaining historical terminal state is distinct from manufacturing it: even a rejected historical Done row cannot be promoted to verified by repeating its lane. Returned-entity writes check persisted previous state rather than trusting a caller-mutated object.

The existing Story-test and test-artifact owners receive a narrow callback capability for one Test identity. They retain S4 materialization/linking, S5 activation/classification, actual runner evidence and derived verification relationships. The capability expires with its callback, including detached descendants before persistence. It is never a tool argument, owner flag or force field. Generic Product Test mutations, Test execution/hash fields, verifies links and VERIFY/admission records are refused. Independent Ticket completion retains its existing verifier and atomic store completion batch.

propose_decision returns the complete proposed content with status proposed and persisted false. Generic Decision creation/editing is unavailable until PC2, including legacy implemented status that existing governance readers treat as effective. Existing Decisions remain readable. This does not add a Decision editor or acceptance operation.

Existing local CLI/shell entry points explicitly supply their trusted project-write context. MCP defaults to read-only; a trusted host can explicitly configure McpServerOptions.executionAuthority or AIWF_EXECUTION_AUTHORITY=project-write. A tool argument cannot grant that authority. This explicit full-write host option is not evidence of human approval or bounded delegation; the separate D1 external-agent trust decision remains unresolved.

The cancelled-operation cleanup exception is limited to releasing an existing exact governance-admission token. It cannot create new work or proof. S2 still uses Semantika's public conditional atomic batch; source-file creation and canonical linking remain separate S4/S5 outcomes.

## Public evidence

All new journeys use disposable real project directories and reopened canonical databases. The safety suite is tests/pc1a-safety.test.ts.

| Initial state / public action | Observed result |
| --- | --- |
| Read-only create_ticket with lane Done | Refused; no Ticket, proof or canonical-row change after reopen |
| Read-only and authorized propose_decision | Inert proposed value; no persisted Decision |
| Missing authority, model-supplied authority and nested upgrade | No privilege upgrade or canonical write |
| Read-only legacy content/state/lease/relation and Product writers | Refused; full canonical-row snapshot retained |
| Aborted Ticket write, aborted native create, abort at Product batch commit | Refused; no partial accepted records; admission released |
| Generic Ticket, returned-entity, Test/hash, receipt and verifies mutations | Refused; actual stored previous state remains authoritative |
| Historical verified/rejected Done records | Preserved; rejected cannot be promoted by a lane-only write |
| Legacy done/move and real CLI create/Done/Product JSON calls | Unsafe completion refused without invoking a provider or releasing the existing claim |
| Real stdio MCP with absent versus explicit host authority | Default writer refused; authorized Todo creation works; Done refused in both cases |
| Actual read-only Actor invoking a discovered read-labelled capability that attempts a write | Capability runs, canonical write is refused |
| Detached Test-owner proof operation | Expired scope refused before persistence |
| Imported Markdown Done / accepted Decision | Refused; no manufactured Ticket/Decision after reopen |
| Generic evaluation attempting Decision statuses absent/accepted/implemented/proposed | Refused without canonical-row changes |

The original baseline was attributable red: `bun test tests/pc1a-safety.test.ts` produced **0 pass / 6 fail** before implementation. It reproduced both reported persisted bypasses through the real registry, then reopened each DB. Later native-persistence cancellation also reproduced a resolved write after abort before the storage-boundary correction. No historical red is invented for already implemented S1–S5 behavior.

Existing tests that formerly authored completion or proof generically now assert the intentional refusal, or seed clearly historical fixture records through native test setup / the internal Test-owner scope. Their coverage and behavioral assertions remain. No failing expectation was weakened, timeout raised, skip added or acceptance bypass introduced.

## Verification

Final frozen-source commands:

- `bun test --max-concurrency=1`: **509 pass / 5 skip / 0 fail**, 514 tests across 66 files, 3310 assertions.
- The full run includes all **19 PC1a cases**, affected S1–S5 browser/public journeys, Product/S2 atomic/stale/conflict tests, Ticket preparation/resolution and Gate 5 scope/batch/verifier/producer regressions.
- `bun run typecheck`: pass.
- `bun run pack`: pass.
- `AIWF_WORKSPACE_BINARY=/home/dharmax/work/ai-workflow/dist/aiwf bun test tests/dharmax-s3.test.ts`: **9 pass / 0 fail**, 38 assertions; actual compiled CLI, Workspace browser and MCP consistency.
- `git diff --check`: pass.
- Tracked-input audit confirms the Workspace client and DW-04 fixture are tracked; all runtime changes modify existing tracked owners.

The five unchanged opt-in skips are two Skill/synthesis production journeys, two OpenRouter doctrine journeys and the configured live Gate 5 independent-verifier journey. Controlled independent-verifier tests execute actual project assertions and prove coherent completion and injected SQL rollback. They do not qualify a live provider or certify Gate 5.

Earlier exploratory full runs encountered a Playwright socket-launch ENOENT and browser timeouts, including S5. Their infrastructure root cause was not established. Focused S5 and the final frozen-source full serialized gate passed without changing assertions or timeouts.

Installed Semantika remains at sibling HEAD `0d395ee2b2cef6a03a7cdee23b3a23fe9073e575`, with its same seven modified files and untracked aspects.md preserved. No sibling build/install/edit was performed. Installed adapter hashes:

- sqlite-store.js: `7baf22575fdc8b180a49b14316d6c94998aedc2986f7a185837853a4aec74928`
- sqlite-basic-collection.js: `b0befde69c2d63c8dd758adec8a9e3c0ab22385679e9f654e5a2af826dce49e9`

These pin the installed artifacts used, not pristine source-to-dist equivalence for the dirty sibling.

## Whole-scope audit and disposition

Reviewed complete affected methods and immediate callers: registry execution and Actor execution/delegation; CLI/shell/MCP host construction; WorkflowStore execution/Test scopes, native adapter, entity wrappers/upsert/delete, relation methods and admission cleanup; Ticket state and existing completion caller; Product validation/application and source change entry; Decision proposal, scripting/test execution owners; Story preparation/application/activation/run and test-artifact reconciliation/outcome recording. The existing independent resolveTicket acceptance checks and completeTicket batch remain authoritative. Only explicit host authority was added to Ticket verification's nested tool context.

Reviewed dharmax/am-i-allowed's public contract: no role/delegation engine or dependency is needed for this bounded correction. Deferred defects such as the Module projection identity/rendering issue, new relation payload/fingerprint work and convenient authoring surfaces remain outside PC1a.

This is **assisted implementation**, not AIWF-owned Ticket acceptance. The initial resolve_ticket attempt was blocked because its proposal only restated metadata/criteria; no implementation was accepted from it. Current aggregate metrics report one blocked_preparation run, 7010 model tokens and known remote cost $0.02122815; there is no claimed savings or verified resolver run. TKT-PC1A remains pending independent acceptance and its lease is released at handoff. No synthetic VERIFY-PC1A receipt is authored.

Existing S4 TKT-RF0W, S5 TKT-7MI2, Gate 5 and its Semantika prerequisite retain their prior In Progress states and no claims. Gate 5 still depends_on its prerequisite. Historical records are not migrated or reopened.

Limitations: read-only cold/stale graph requests can refuse freshness writes rather than silently indexing canonically. Host code with deliberately granted arbitrary project-write execution remains trusted; this is not a sandbox for hostile host code or raw SQL/filesystem access. D1 human-review/delegation policy, live-provider qualification, complete Decision authoring and PC1b remain pending.

PC1a implementation stops here. No push or advancement is performed.
