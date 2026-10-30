# Public API — two-pass implementation evidence

Authority: [semantic contract](public-interface.md) and [delivery plan](../../plans/AIWF-PUBLIC-INTERFACE-IMPLEMENTATION-PLAN.md), fetched tip `243a17b1d47dbd2a60447eccf3d4e0a26fc42daa`. Both integrated documents match that tip's Git blobs exactly. This evidence does not redefine their scope or claim formal acceptance.

## Current continuation — 2026-10-30

The two-pass plan supersedes the historical six-stage slice described below. One existing CommandRegistry now distinguishes public CommandDefinition registrations from internal tools and drives Commander/help, installed shell-ui integration, semantic MCP families and dynamic routes/OpenAPI in the existing Workspace server. Existing useful owners are exposed where their authority is demonstrable; unavailable advanced Source/Knowledge/Git capabilities remain unadvertised.

Current observed baseline before this continuation: **732 passed / 6 skipped / 0 failed**, from a source-stable full run. This is regression evidence, not final API acceptance. The isolated entry snapshot had an archive-only packed-build failure caused by absent Git metadata; the affected suite passed after restoring fixture Git metadata. No fictitious full green entry run is claimed.

The public source adapter now carries the same normalized dirty-target proposal through preview/apply. Fingerprints bind source hashes, the owning Ticket lease, scope revision and governance. A client list or accept field grants no approval: only the existing trusted host's exact fingerprint context permits a dirty-target exception. Concurrent changes, scope expansion, stale review, wrong leases and read-only callers remain rejected. The one-time native bootstrap exception was limited to the four authorized owners plus focused authorization tests and expired after their verification. Subsequent Actor/Goal changes used public preview and exact developer-approved apply.

Actor explicit ticket show now dispatches the canonical command instead of looking up an internal tool with that name. Goal output includes its current canonical version. Independent probes confirm Goal identity/version parity across CLI, real Shell UI PTY, stdio MCP and live REST, plus default host refusal, host rejection, exact reviewed acceptance, stale refusal, client spoof refusal and restart persistence. REST GET remains read-only; a stale index conflicts instead of refreshing project state. Reviewed routes are omitted when no trusted host reviewer is present. Browser legacy paths retain their existing owner adapters.

Final source-stable full regression run: **740 passed / 6 existing opt-in skips / 0 failed**, 746 tests across 89 files, 5903 assertions, 374.48 seconds. Before/after source fingerprints match. Typecheck, definition consistency (21 concepts / 173 links / 9 exact US fields), native `bun run pack` and diff whitespace checks pass. Focused continuation checks also passed: 46 source/Product/authority regressions, 14 registry/public-transport checks and 26 Actor/Goal/authorization checks. The unchanged two independent probes now pass canonical Actor dispatch and all host authority/restart cases. A separate real four-transport Goal probe confirms identical ID and numeric version. Actual stdio discovery in the final suite: default **119 tools / 240704 serialized bytes**; compact **37 tools / 106021 bytes**. The catalog has **108 public command registrations** (108 CLI / 108 Shell / 107 MCP eligible / 108 REST eligible before host-review filtering). These counts are discovery coverage, not proof that every domain action or external-agent choice was accepted. Gate A representative transport and registration checks pass; Gate B remains unaccepted because real configured external-agent selection could not run.

Configured external-agent selection remains blocked by **ECONNREFUSED at the configured Ollama endpoint**, independently of deterministic interface results. No provider substitution or fabricated selection is claimed. Gate B / API completion remains unaccepted while required external evidence is unavailable. Ticket completion, current proof and publication remain separate.

The following sections preserve the earlier inventory and historical first-slice report. Their six-stage sequencing, older documentation tip and pending verification are superseded by the current contract, two-pass plan and this continuation.

## Governing context

Entry: local master `ebabf761e7e05a7a03e8a443cf3fcb29064836cc`; origin/master at inspected entry was `8b2e165`, an ancestor. Existing dirty parser/Ticket/link changes, Dharmax-way/checkpoint edits, projections/snapshot and an untracked public-read test were preserved. Accepted canonical `PRODUCT` revision 1 exists; no Features linked to its manifest. Existing work is technical transport implementation under EXT-SURFACE Tickets, not a newly invented Story. Applicable Aspects for EXT-SURFACE-01: none. Three universal Rules: abstraction placement, Extreme KISS, single responsibility/tightness. The proposed Bounded Autonomy charter amendment remains unaccepted. No new product meaning or acceptance is inferred here.

Reused Tickets: EXT-SURFACE-01 (registry/MCP), -02 (CLI/Shell parity), -08 (relation ergonomics), -10 (Product authority defect). Work leased under EXT-SURFACE-01; none is automatically Done. Canonical `AI-WORKFLOW.md` reference was unavailable in the checkout/ancestors; the bounded-completion policy in the installed AIWF skill was read and respected.

## Entry inventory and actual gaps

| Operation | Domain owner | CLI | Shell UI | MCP | REST | Entry gap |
|---|---|---|---|---|---|---|
| Ticket list | tools/tickets, Ticket/store | legacy list | legacy list | list_tickets | legacy catalog | bounded canonical list, version and strict schema absent |
| Ticket show/status | get_ticket | partial shared parser edits | same partial parser | get_ticket | catalog/entity only | --json, semantic family, canonical routes absent |
| Ticket investigate | Ticket.investigate | existing owner, partial verb-first entry | existing progress/facilitator | investigate_ticket | absent | canonical HTTP adapter; no resolver redesign needed |
| Predicate list/check | model/predicates + Product relation policy | legacy link types | same legacy parser | link.allowed | linkTypes in catalog | canonical namespace/check and finite read vocabulary absent |
| Link list/show | product/links, productEdgeRows, Semantika | legacy links | legacy links | link.inspect | legacy entity relations | canonical directed triple/filter reads absent |
| Scoped help/discovery | artifact-command Commander, shell-ui SmartCompleter, registry | deterministic legacy help | existing shell-ui input/rendering | existing default/compact views | absent OpenAPI | canonical S1 discovery missing |
| Freshness | ensureAstFresh, store execution context | existing owner | existing owner | read-only guard | GET could index | enforce read-only context for legacy GET too |
| Product review | reviewProductChange + fingerprint/store context | trusted local review | trusted local review | cannot self-approve | body accept called trusted local helper | token/body alone incorrectly crossed human-review boundary |

Ticket, Product, Source and Test owners already exist; this slice does not replicate them. Graph writes/generic references are S2; Product/Architecture parity S3; remaining Ticket/Test/Source parity (including calls/xray) S4; remaining catalog/agent/config/model/knowledge/Git breadth S5; investigation/prepare/resolve reliability S6. Those future catalog entries remain deferred, not advertised as newly supported S1 operations. Existing legacy capabilities retain their owners and authority.

## Implementation and limits

One Commander tree adapts canonical reads to the existing registry; shell-ui retains real TTY input, completion, missing Ticket-ID facilitation, process rendering and existing non-TTY errors. Safe established aliases are transitional; reversed resolve is rejected. Exact canonical IDs/kinds/predicates are never case guessed. Graph-link lists require an exact source scope (the existing provider's stricter bound); canonical triples are source/predicate/target. Runtime/index predicate names come from model/predicates; authorability and endpoint constraints come from the existing Product policy. Runtime descriptors without Product endpoint policy are explicitly qualified, never granted write authority.

MCP adds finite ticket, graph.predicate and graph.link families to the existing registry/surface. Default/compact are advertisement views; existing executable calls retain validation. REST projects the S1 vocabulary in the existing Workspace server. OpenAPI 3.1 at /api/v1/openapi.json uses the actual registered action schemas for inputs. Results retain owner identities/revisions and investigation blockers; an investigation complete result is not Ticket completion.

Structured read filters support --data-json and --data-file FILE|-; --json is output-only. Single-value --value-json and mutation --payload-json remain unadvertised because S1 has no such operations. Textual JSON is bounded to 64 KiB and 32 levels, rejects duplicate/prototype keys, non-finite/unsafe/rounded numbers, and then passes through the same action schemas as native MCP/HTTP. Named/JSON sources cannot mix. No universal argument bag or alternate schema validator.

All canonical REST calls and legacy GETs run with read-only execution authority. Freshness checks on a stale source index return a conflict without refreshing it. Canonical relation reads qualify source-index freshness as not assessed. Legacy apply now requires a trusted host callback that reviews the exact current preview before the existing review/apply owner runs; no callback means review_required/403. CLI Workspace supplies terminal human confirmation only with a real TTY. Browser tokens/client acceptance cannot supply that confirmation. No new REST writer is enabled. Host/Origin/token checks remain. Existing browser tests explicitly emulate the external host reviewer; the default untrusted-client refusal has a separate real HTTP test.

Source changes use the existing CausalChangeEngine preview/fingerprint/apply and active Ticket lease, preserving original dirty source in /tmp/aiwf-s1-originals. The public edit adapter initially refused a new path with Scope expansion requires input; no tool schema or authority check was weakened.

## Verification

Pending final execution. The first full-suite attempt overlapped edits and is excluded from baseline claims. An isolated copy of entry sources is being used for the actual baseline. New acceptance tests first failed for missing canonical commands, --json and observed GET-triggered database changes. No synthetic historical red, receipt or Story acceptance is asserted.
