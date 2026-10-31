# AIWF Public Interface — Canonical Semantic API Contract

**Canonical repository path:** `docs/api/public-interface.md`  
**Status:** Approved semantic *target* (2026-10-30); each operation's implementation and availability must be independently verified; this is not a shipped-API inventory  
**Date:** 2026-10-30  
**Surfaces:** CLI, MCP, interactive Shell UI (`@dharmax/shell-ui`) and REST for Workspace/web clients, over shared TypeScript domain operations  
**Source basis:** Original approved interface design and the publicly accessible repository snapshot, which may lag the developer's local checkout. This contract specifies behavior; it does not certify runtime support, tests, or current Git ancestry. The local baseline must be checked before implementation.

## 1. Design decision

**Resource first, action second.** No syntax exceptionalism for Tickets or graph links. One canonical public grammar, a finite semantic catalog, an explicit approval boundary, and thin adapters reusing existing owners.

```text
aiwf <topic>[:<subtopic>] <action> [operands] [options]
```

- `topic` and optional `subtopic`: lowercase **kebab-case**, separated by **one colon**. `arch:module`, `graph:link`, `product:feature`. The colon is CLI notation, *not* a hierarchy of stores or MCP tools. No nested `a:b:c` chains.
- `action`: lowercase kebab-case, *always before operands*. Examples: `ticket resolve T1`, `product:feature update F1`, `graph:link delete F1 enables S1`. **Never** `ticket T1 resolve`, `link`, `links`, or `unlink` as canonical syntax.
- `aiwf product feature show F1` MAY be a documented space-form alias for `aiwf product:feature show F1` if unambiguous; only one underlying Commander parser and one normalized intent. **Colon form is normative.** Shell tokens are identical without `aiwf`; an explicit command never falls through to conversational Actor routing.
- `aiwf --help`, `aiwf --version`, `<family> --help`, `<family> <action> --help` are standard global/help flags rather than extra verbs. `aiwf shell start` and `aiwf mcp serve` start host transports (CLI only).
- Exact identifiers are **not** lowercased or guessed. If a bare ID is ambiguous, require an explicit kind or full typed reference; a source file/symbol is resolved through the real source-index owner. Quoted values preserve spaces. Output of `list` is bounded (`--limit`, `--cursor`), and `--json` has consistent machine-readable semantics.
- Use consistent actions: **`list`, `show`, `find`, `create`, `update`, `delete`, `status`, `history`, `run`, `analyze`, `export`, `import`** where their meanings apply. Domain actions such as `investigate`, `prepare`, `resolve`, `claim`, `release`, `retire`, `assess`, `preview`, `apply`, `activate` are permitted when they express genuinely distinct behavior. Do **not** force `create`/`delete` onto naturally non-CRUD operations or invent synonyms merely to fill a table.
- **Delete is not synonymous with retire/cancel.** `graph:link delete` removes an authorized edge; `product:feature retire` preserves authored identity/history while marking it deprecated; `ticket cancel` records cancellation; source deletions use guarded source changes. No generic protected-record deletion.

### Idiomatic examples

```bash
aiwf project status
aiwf product:manifest show
aiwf product:feature list --limit 25
aiwf product:feature create --data-file feature.json  # validated, reviewed intent; not an automatic apply
aiwf product:story show S1
aiwf arch:module show mod:src/ticket
aiwf flow plan story S1
aiwf flow:epic show E1
aiwf ticket investigate T1
aiwf ticket resolve T1  # bounded workflow; behavior only once actually verified
aiwf test:story run S1
aiwf source:symbol callers REF  # exact symbol reference; not a guessed name or invented path syntax
aiwf graph:predicate list
aiwf graph:link create F1 enables S1 --note 'Accepted behavior'  # reviewed mutation; excluded from API Pass A
aiwf graph:link update F1 enables S1 --clear-note
aiwf graph:link delete F1 enables S1
aiwf rule effective src/ticket
aiwf knowledge:skill find 'source navigation'
```

**These examples show target grammar, not a promise that every action is available.** Mutating commands produce an inert preview or perform an authorized apply only when the specialist owner and host review actually permit it.

`graph:link` operand order is a **directed triple** `SOURCE PREDICATE TARGET`, in every command. Never `A to B as P`, never `P from A to B`, never option-dependent reversal. This is simpler and more precise than the previous proposed `link/unlink` syntax.

### 1.1 One `CommandRegistry` — mandatory architecture

**Single registration, four generated/adapted public surfaces.** Rename the existing `ToolRegistry` **class** in `src/tools/registry.ts` to **`CommandRegistry`**, migrating active type references and preferably the singleton export to `commandRegistry` (avoid permanent compatibility aliases where not needed). Refine that **same registry**, its existing tool/owner references and public operation metadata; **do not create a new registry or execution engine, duplicate domain schemas, or maintain four command lists**.

**Terminology matters:** A *command* is the registered public `topic[:subtopic] action` contract. A *tool* retains its distinct AIWF/Actor/internal capability meaning, and in MCP means a protocol tool. Existing `ToolDefinition`/`ToolContext` abstractions may continue to represent genuine internal tools; **they must not be confused with public `CommandDefinition`**. An internal tool/domain owner can implement several public commands, but a registered tool alone grants no public exposure. Rename the class/command registry, **not** every occurrence of `tool` in the ecosystem. The source file need not move merely for nomenclature.

Every advertised public **command** has a `CommandDefinition` (or equivalently narrow metadata on the existing registration) supplying or referencing. One canonical command ID is the exact normalized `topic[:subtopic] action`; it is unique within the registry:

| Field | Meaning |
|---|---|
| `topic`, optional `subtopic`, `action` | Canonical resource/action identity, e.g. `graph:link show` |
| `description`, argument/option presentation | Human help, scoped `--help`, shell-ui completion/facilitation, errors |
| `parameters` | Existing exact typed/Zod action schema; positional CLI tokens and native JSON normalize to it |
| `owner` / executor | Reference to the existing domain method or genuine internal tool, not new or copied business logic; one internal tool may support several distinct public commands |
| `exposure` | Explicit eligible public channels (CLI, Shell UI, MCP, REST); actual owner support, host availability and authorization determine invocability. Mere registration never proves implementation or safety |
| `authority` | Existing host-owned permissions/review mechanism; never an AI-supplied `approved` field |
| Optional presentation/transport hints | CLI positional-to-field mapping, HTTP verb/query/path binding for IDs or triples, and MCP grouping where necessary; never separate action semantics or copied schemas |

**Dynamic REST generation is mandatory by default.** At server setup, enumerate the **eligible commands with real available handlers and supported authorization** from `CommandRegistry`; derive the exact `method + /api/v1/topic[/subtopic][/{id}][/{action}]` route table, validate conflicts deterministically and attach the registered request/response schema, executor, authority and HTTP mapping. A route is not a manually maintained switch entry in `src/workspace/server.ts`. Registered actions that are unsupported, internal-only, or require unavailable host authorization must not become callable merely because they have metadata. Use the same operation descriptors to derive or verify **OpenAPI 3.1**. HTTP route generation must be deterministic, scoped, safe for restart and testable without launching another server.

**HTTP verb derivation:** `list/show` → GET; `create` → POST; `update` → PATCH; `delete` → DELETE; other named domain actions use an explicit generic policy based on read-only vs computational/mutating semantics (cheap side-effect-free `status`/ `history` can GET, `investigate`/`resolve`/`run` POST). If the method cannot be safely determined from trusted action metadata, fail closed at registration time; never guess from free-form action strings. Exact triple identity, path encoding, query filtering, revision/precondition and body validation still use the owner schema.

**Route overlap is not automatically a conflict.** Some legitimate commands intentionally share a method/path and are distinguished by **strict disjoint input shape**: `graph:link list` and `graph:link show` both map to `GET /api/v1/graph/link`; a fully specified `sourceId + predicate + targetId` triple means `show`, while bounded/incomplete filters mean `list`. Registration must prove deterministic dispatch/validation from declared query/body schemas; reject any ambiguous overlap, duplicate exact command or shadowed route. Never choose a handler based on registration order or catch-all fallback. Distinct `CommandDefinition`s may deliberately project to the same HTTP route **only with an explicit, validated discriminator**. This same principle applies to MCP semantic family grouping: finite discriminated actions, never an arbitrary `args` bag.

**Legacy Workspace routes** are temporary *explicit compatibility adapters* to the generated operation routes/domain owners—not a second public API. UI-specific presentation routes such as serving the page, startup/session and asset loading need not be generated; they remain transport infrastructure. Keep the actual user-visible Workspace functional during migration. Runtime authentication, host-owned approval, rate/size limits, error mapping and streaming are shared transport concerns, not per-operation route handlers.

**Initialization and freshness:** all four transport projections must use the **same completed, deterministic registration snapshot** after current domain handlers and public command descriptors have been registered. Keep registration idempotent, define bootstrap order, and prevent import cycles or partial startup exposures. CLI `--help` must not miss commands because the registry wasn't initialized; MCP/REST must not publish a different list from a later initialization. Dynamic changes to registration, if supported, require explicit validated regeneration/refresh (not silently divergent stale routes).

**Registration-versus-runtime distinction:** `CommandRegistry` describes supported public commands, not a new authorization oracle. Preserve existing internal tool `register/get/getAll/execute` semantics used by the Actor and existing MCP integrations during migration; adding public command descriptors must not alter internal tool enumeration or implicitly expose them. Registry initialization validates duplicate canonical IDs, conflicting CLI/REST route shapes, incompatible argument schemas and unknown exposed actions; it fails closed. Request dispatch validates the same owner schema, project scope, host approval, freshness and cancellation **again at invocation time**. MCP hosts may see a curated compact subset, and Shell/CLI/REST may differ in capability only when their explicit exposure policy requires it. Do not advertise an action as fully operational merely because it has metadata or a handler name.

**Generated from the same declarations:**

- **CLI:** Commander resource/action tree, argument/options parsing and `--help` text. Existing parse/lexer/Commander integration remains the parser; avoid manual command lists.
- **Shell UI:** command discovery, completion, parameter facilitation, and the same deterministic grammar; preserve `@dharmax/shell-ui` rendering/TTY/progress.
- **MCP:** public tool descriptors/input JSON schemas and compact profiles. Semantic tool grouping may differ from CLI grouping *only as a projection of registered operations*, not another source of truth.
- **REST:** dynamically generated resource/action routes from eligible registered operations and supported HTTP methods; OpenAPI generated or validated from those same descriptors, with unchanged owner and schemas.
- **TypeScript:** directly callable existing owner contracts; this registry describes them and does not wrap them in a generic `execute(any)` architecture.

**Discovery is data, not handwritten documentation:** CLI `--help`, scoped help, Shell UI completion, MCP `tools/list`, REST route inventory and OpenAPI MUST all derive from `CommandRegistry` eligibility and real owner support, while respecting channel-specific exposure. Do not advertise future catalog entries merely because this file describes them. Internal AIWF tools remain accessible internally but not automatically public.

**Present implementation gap, verified from accessible remote source:** `src/tools/registry.ts` still declares the class `ToolRegistry` and currently registers internal tools; `src/tools/surface.ts` separately hard-codes `PUBLIC_MCP_TOOL_NAMES`; `src/artifact-command.ts` constructs a separate Commander tree/handwritten help; `src/workspace/server.ts` manually routes HTTP. These are the integration seams to **converge**, not four new systems to implement. Retire duplicated enumerations only after confirming parity and safe compatibility.

**Architecture acceptance:** adding or changing one eligible `CommandDefinition` in `CommandRegistry`, backed by a real owner and schema, must update CLI command parsing/`--help`, Shell UI completion, MCP discovery and REST routing/OpenAPI consistently **without writing separate command/router/schema entries**. Verify that a newly registered operation appears automatically in the REST route inventory and OpenAPI, that removal/disablement removes it, and that collisions or unrepresentable schemas fail closed rather than silently shadowing a route. A representative read, write-preview and authorization-denied path proves this; the latter does not imply every operation must be publicly writable. Validate old behavior while migrating.

## 2. Domain and ownership boundaries

| Namespace | Meaning and existing authority |
|---|---|
| `agent` | AI executor, sessions and actual agent runtime status/metrics; existing Actor/ModelService/registry |
| `project` | Repository, setup, canonical authored state, diagnostics, sync, export/recovery |
| `config`, `model` | Project/global configuration and real provider/model route state; separate from an execution request |
| `artifact` | Cross-kind typed **discovery/read/reference** over product, workflow, documents, files/classes/symbols, tests; no universal privileged CRUD |
| `product` | Canonical Product charter+manifest, intent definitions, impact/coverage. Stored Product Flow is publicly `product:journey` |
| `arch` | Indexed Modules plus reviewed authored module intent; no second Module database |
| `flow` | Delivery planning, Epics, next work, progress; not Product actor journeys |
| `ticket` | First-class bounded work item; Bug is `ticket --kind bug`, not a replacement for Story or a separate database |
| `test` | Story acceptance tests, test cases, observed runs and test evidence; no arbitrary verified/pass editor |
| `source` | File/symbol inspection and guarded source changes; no generic unreviewed write |
| `graph` | Discover typed predicates, read/traverse relationships and index state; governed `graph:link` writes |
| `rule` | Specialist engineering policy and effective scopes; different from Product Aspects |
| `knowledge` | Search/retrieve project knowledge; explicit authored notes and SkillManager lifecycle where supported |
| `git` | Actual Git facts and explicitly governed local repository actions; Git does not own Product truth |
| `shell`, `mcp` | Launch transports; not parallel business implementations |

**Core** below means *reuse-first semantic candidate*, NOT “currently implemented” or “must be delivered immediately.” **Conditional** means a significant missing capability or prerequisite that requires verification/approval before advertising. **Later** means deliberately deferred, but specified for taxonomy completeness. No command is advertised in `--help` or MCP `tools/list` before it genuinely works.

## 3. Full command catalog

Each row is the complete set of **action names** for that resource. The specific operand schema is subsequently defined or constrained in §4. Command combinations are `aiwf <resource> <action> ...`; shell omits `aiwf`.

### 3.1 Agent, project, setup, configuration and models

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `agent` | `exec`, `status`, `doctor`, `metrics` | `cancel` (conditional) | Run a bounded user instruction; **agent** health distinct from project health; report unavailable telemetry honestly |
| `agent:capability` | `list`, `find`, `show` | — | Discover executable *permitted* capabilities, not internal methods or forbidden tools |
| `agent:session` | — | `list`, `show`, `resume`, `cancel` (later) | Real persisted session semantics only, never invented continuity |
| `project` | `init`, `status`, `doctor`, `metrics`, `sync`, `export` | `restore` (conditional; only after atomic, verified recovery) | Canonical project and authored snapshot; `sync` refreshes/indexes with explicit authority |
| `project:host` | `list`, `setup`, `check` | `remove` (later) | Real host integration/installation health and permissions; no fabricated activation |
| `config` | `list`, `get`, `set`, `reset`, `check` | — | Scoped configuration reads/writes; no exposing secrets; `check` validates effective config |
| `model` | `list`, `show`, `check` | `test` (conditional live inference) | Model catalog and actual reachability; `check` is not necessarily an inference success |
| `model:provider` | `list`, `show`, `check` | — | Provider configuration/availability without exposing credentials or inventing live inference |
| `model:route` | `list`, `show`, `set`, `reset` | `explain` (conditional) | Configured task-role routes, user overrides and restrictions |
| `model:advice` | — | `show`, `refresh` (conditional) | Authority advice/Radar evidence, not per-command self-authorization or invented measurements |

### 3.2 Artifact: cross-kind discovery, never generic protected writing

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `artifact` | `types`, `list`, `find`, `show`, `history` | `assess`, `export` (later) | Resolve typed refs through real domain owners; `history` only if owner records it |
| `artifact` | — | `tag`, `untag` (conditional) | Authored tags with scope/provenance/version, distinct from derived Semantika/index facts |

Relations are owned canonically by `graph:link`; `artifact show REF` may *display* links, but a second artifact-link write API is prohibited.

### 3.3 Product: one charter+manifest and authored meaning

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `product:manifest` | `show`, `create`, `update`, `export` | `assess` (conditional) | **One** Product singleton and view of linked definitions; no separate editable Charter/Manifest |
| `product:goal` | `list`, `show`, `create`, `update`, `retire` | `history`, `assess` (later) | Accepted intended outcomes |
| `product:concept` | `list`, `show`, `create`, `update`, `retire` | `history`, `assess` (later) | Shared domain meaning |
| `product:feature` | `list`, `show`, `create`, `update`, `retire` | `history`, `assess` (later) | Distinct capability; no auto-created Story or accepted implementation |
| `product:aspect` | `list`, `show`, `create`, `update`, `retire`, `applicable`, `assess` | `history` (later) | Cross-cutting product expectations, independent from engineering Rules |
| `product:story` | `list`, `show`, `create`, `update`, `retire`, `assess` | `history` (later) | Full Actor/Intent/Initial State/Action/Expected Result/Exceptions/Bounds; not a Ticket |
| `product:journey` | `list`, `show`, `create`, `update`, `retire` | `history` (later) | Public name for existing *Product Flow* entity; never delivery `flow` |
| `product:idea` | `list`, `show`, `create`, `update` | `retire`, `promote` (later, approval/semantics needed) | Idea is a **proposal** and does not become accepted Feature by creation |
| `product:decision` | `list`, `show` | `propose`, `review`, `retire` (conditional) | Decisions require explicit developer authority; do not generic-create an approved Decision |
| `product:coverage` | `show` | — | Structural traceability and **unknown** gaps, not automatically passed test evidence |
| `product:impact` | `analyze` | — | Source-backed effect on definitions, work, code and tests, including uncertainty |

**`product:manifest create/update` changes the canonical Product charter/accepted membership through the existing governed owner; it never creates or edits a second manifest document or generated Markdown projection.** `show/export` read the existing Product projection of that single identity. **Every Product writer** goes through the real S2 host-owned proposal/review/apply path. A successful preview is not accepted meaning. A Product mutation bypass (including legacy methods) blocks enabling writers until fixed at their real domain owner. `retire` is a reviewed, non-destructive state transition.

### 3.4 Architecture

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `arch:manifest` | `show`, `export` | — | View over indexed Modules + their authored intent; no separate manifest entity |
| `arch:module` | `list`, `show`, `update` | `clear-intent`, `assess` (later) | `update` changes **authored purpose/responsibilities/bounds only**; indexed path/facts not generic-editable |
| `arch:impact` | `analyze` | — | Source-linked dependency/impact evidence and incomplete-coverage warnings |

### 3.5 Delivery flow, Epic and Ticket

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `flow` | `status`, `next`, `plan`, `metrics` | — | Delivery activity; `plan KIND ID` reconciles new/changed accepted intent into an *inert* work proposal |
| `flow:epic` | `list`, `show`, `create`, `update`, `assess`, `cancel` | `history` (later) | Epic groups work; no automatic Story approval or fabricated sprint semantics |
| `flow:observation` | — | `list`, `show`, `record` (**later: ontology NOT approved**) | Provenance-bound observed fact; no arbitrary acceptance proof or fabricated persistence |
| `flow:rfc` | — | `list`, `show`, `propose`, `review`, `close` (**later: ontology NOT approved**) | Distinct deliberation/proposal, not a disguised Ticket |
| `ticket` | `list`, `show`, `create`, `update`, `status`, `history`, `investigate`, `prepare`, `resolve`, `claim`, `release`, `move`, `reopen`, `cancel` | `refresh`, `assess`, `export`, `deliberate`, `elaborate`, `refine`, `simplify` (later) | All actions use `ticket ACTION ID` except creation/list; Bug is `create --kind bug` |
| `ticket:history` | — | `record`, `condense` (conditional specialist) | Journal facts attached to existing Ticket, not updates to `Ticket.body` |

`ticket resolve ID` is the primary end-to-end execution entry: internal triage → baseline → investigate → optional prepare → guarded implementation → test → independent acceptance, or an exact blocker. An expert may invoke read-only `ticket investigate ID`; it is **not** a prerequisite public ritual. `ticket move ID --lane Done` **must not** bypass verification/receipt. No `ticket promote/demote` until developer defines meaning.

### 3.6 Tests and evidence

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `test` | `list`, `show`, `status`, `target`, `triage` | `run` (conditional generic target) | Test discovery and existing failure triage; no fictitious accepted run |
| `test:story` | `prepare`, `materialize`, `status`, `run`, `assess` | `history` (later) | Reviewed US acceptance test; honest skipped/expected-red/already-green/infrastructure/unknown states |
| `test:case` | `list`, `show`, `status`, `run` | `create`, `update`, `activate`, `skip`, `unskip`, `history` (conditional) | Real individual test lifecycle; case edits must not rewrite accepted Story oracle |
| `test:ticket` | `evidence`, `assess` | — | Current evidence / independent acceptance view; not a manual `verified=true` setter |
| `test:run` | — | `list`, `show`, `logs` (later) | Real execution records only if runner persists them |

### 3.7 Source navigation, editing and improvement

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `source` | `find` | — | `find --kind file|symbol QUERY` through existing source/index owners |
| `source:file` | `find`, `show`, `read`, `outline`, `deps`, `blast`, `debug` | `move`, `scaffold`, `improve`, `test`, `observe` (later) | `find` is scoped `source find --kind file`; existing file outline may contain only the indexed portion, not all source declarations |
| `source:symbol` | `find`, `show`, `outline`, `callers`, `references`, `deps`, `blast`, `debug` | `calls` (outgoing; needs verified support), `xray` (composed analysis), `rename`, `move`, `extract`, `inline`, `improve`, `test`, `observe` (conditional/later) | Exact scoped symbol identity. Distinguish outgoing calls, incoming calls, all references, structural outline and synthesized analysis; no invented dynamic-call coverage |
| `source:change` | `preview`, `apply` | `status` (conditional) | Existing guarded Causal Change Engine; precise file/symbol scope, baseline/fingerprint/review, independent verification |

**Symbol analysis contract** (the semantics are authoritative; actual support is independently verified):

| Command | Scope and actual meaning |
|---|---|
| `source:symbol find QUERY` | Search indexed symbols with explicit kind/file/project filters; `source find --kind symbol` is the same owner, not a second search system |
| `source:symbol show REF` | Exact declaration, identity, signature, location, source excerpt, language and freshness/coverage |
| `source:symbol outline REF` | **Inside** the selected symbol: class methods/properties, nested declarations, relevant signatures and containment hierarchy; not merely the whole-file outline |
| `source:symbol calls REF` | **Outgoing** calls/callees: destinations invoked by this function/method; call sites, exact target refs where resolvable, unresolved/dynamic calls explicitly qualified |
| `source:symbol callers REF` | **Incoming** call edges: functions/methods that invoke the selected symbol and actual call-site locations |
| `source:symbol references REF` | All references to the selected symbol, including imports, type mentions, reads/writes, address-taking, and call sites when discoverable; not a synonym for `callers` |
| `source:symbol deps REF` | Broader direct dependencies (types/imports/referenced symbols/modules where established), distinguished from call hierarchy |
| `source:symbol blast REF` | Potential effect on dependents, source/test evidence and uncertainty; not equivalent to proven test coverage |
| `source:symbol xray REF [--depth N] [--limit N]` | Bounded **composed read-only inspection**: definition + outline + calls/callers/references + dependencies + available linked tests/impact. Every section reports provenance, freshness, completeness, limits and blockers; missing capabilities stay `unsupported`/`unknown`, never fabricated |

**Symbol identity:** `REF` is an exact canonical source-index symbol ID or a validated locator including project scope, file and an unambiguous declaration position/qualified symbol. Accepting `--file` plus `--symbol` as a convenience requires deterministic disambiguation; overloads, same-name methods and stale renames must return candidates or a precise error, never guess a target. Show/calls/callers/references/outline/xray use one resolved identity and report freshness. REST URL-encodes it; MCP receives its typed representation, not free-form `code` text. `outline` is structural and fast; `xray` is broader and potentially expensive. Neither silently applies refactoring or builds a private graph. `calls` is the canonical outgoing spelling (not ambiguous `called`); `callers` is the inverse. Call edges are distinct from *all references*, and exact TypeScript/JavaScript LSP results are distinct from heuristic indexed graph edges. Library coverage, source freshness, non-TS/JS languages, dynamic dispatch and unresolved symbols must be honestly qualified.

**Observed implementation basis (remote inspection, not proof of current local support):** `src/tools/graph-queries.ts` already exposes `get_exact_callers`, `get_exact_references`, `get_file_outline` and other source navigation. `src/change/ts-lsp.ts` has `getIncomingCalls` and `getReferences`, but no verified outgoing-call method; `source:symbol calls` requires a real source-owner implementation and may not be advertised until proven. A true symbol-scoped hierarchical `outline` must be distinguished from existing file outline. `xray` composes these owners only when real output is available; optional deeper analysis is deferred, not implied by the API name.

`source:file read` is read-only; `source:file observe` may gather actual observation but **instrumentation is a mutation** and must use `source:change`. `source:* improve` returns reviewed proposed changes, never a self-approved refactor. No invented extract/inline implementation.

### 3.8 Graph and index

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `graph:predicate` | `list`, `show`, `check` | — | Single finite predicate descriptor: valid source/predicate/target triples and payload |
| `graph:link` | `list`, `show`, `create`, `update`, `delete` | — | Exact directed triple operations. `update` changes only authorized edge payload, not endpoints |
| `graph:query` | `search`, `traverse` | `path` (conditional) | Bounded typed graph queries; no generalized SQL/raw mutation tool |
| `graph:index` | `status`, `refresh` | `rebuild` (conditional) | Source-derived index authority, not user-authored Product mutation; refresh/rebuild may write and require host permission |

**Directed triple contract** (required everywhere):

```bash
aiwf graph:predicate check Feature enables UserStory
aiwf graph:link list --source F1 --direction outgoing
aiwf graph:link show F1 enables S1
aiwf graph:link create F1 enables S1 --note 'Implements reviewed behavior'
aiwf graph:link update F1 enables S1 --clear-note
aiwf graph:link delete F1 enables S1
```

Only declared authorable predicate/endpoint combinations can be changed. O/evidence/index-derived relations are not generally writable. Strict `note` payload is supported only where the descriptor permits it; missing note preserves, explicit `--clear-note` clears, and `--note` / `--clear-note` cannot coexist. Apply checks edge revision, absence and ABA/fingerprint; stale or unapproved changes are inert.

### 3.9 Rules, knowledge, skills and Git

| Resource | Core actions | Conditional / later actions | Semantics |
|---|---|---|---|
| `rule` | `list`, `show`, `effective`, `export` | `resolve-ref` (conditional) | Effective scope and specialist Rule authority; never changed through `artifact update` |
| `rule:change` | `preview`, `apply` | — | Existing RuleStore proposal/apply machinery, with explicit host review and refusal of weakening where forbidden |
| `knowledge` | `find`, `show` | `remember`, `revise`, `forget` (conditional) | Provenance-bound authored note lifecycle, without deleting underlying files/history |
| `knowledge:skill` | `list`, `find`, `show` | `create`, `import`, `review`, `test`, `activate` (conditional); `deactivate`, `run`, `sync` (later) | Reuse real `@dharmax/skill-manager` APIs and testing/isolation; never build another skills registry |
| `git` | `status`, `diff`, `log` | `checkpoint`, `stage`, `commit`, `push`, `hotspots`, `pr-summary` (later/local privileged) | Explicit user-host authority; no implicit push, no staging SQLite/WAL/cache/secrets |
| `shell` | `start` (CLI only) | — | Enter existing interactive shell |
| `mcp` | `serve` (CLI only) | — | Start existing stdio MCP host; not a public MCP tool itself |

## 4. Exact operand and action conventions

| Action / resource | Required form | Important distinction |
|---|---|---|
| `list` | `[--filter KEY=VALUE] [--limit N] [--cursor TOKEN]` | Bounded result with next cursor; never fabricated complete inventory |
| `find` | `QUERY [--kind KIND] [--limit N]` | Bounded search; candidate matches vs exact ID are distinguished |
| `show`, `status`, `history` | `REF [--json]` | Current facts, version and freshness where available |
| `create` | Typed named flags, `--data-json JSON`, or `--data-file FILE|-` **where the action schema supports them** | One strict source of input; reviewed proposal for governed definitions, not silent commit |
| `update` | `REF` plus named fields, `--data-json JSON`, or `--data-file FILE|-` | Strict typed fields; optimistic revision/fingerprint and no unapproved widening |
| `delete` | `REF` or exact resource identity | **Only** for legitimately deletable resources such as governed graph edges; no blanket entity deletion |
| `retire` | `REF` with reviewed status transition | Keeps identity, history and relationships |
| `cancel` | `REF` | Halts/cancels operation or work; distinct from deleting a work item |
| `flow plan` | `flow plan feature F1` / `flow plan story S1` / `flow plan epic E1` | Existing processIntent reconciliation and inert reviewed proposed work; not Ticket implementation |
| `ticket create` | `--kind task|bug`, validated specification/defect fields | Bug remains typed Ticket; no separate arbitrary Bug store |
| `ticket resolve` | `TICKET_ID [--verify-only] [--max-repairs N] ...` | Existing bounded Actor/synthesis/test/proof path; no invented Done |
| `graph:link list` | `[--source REF] [--target REF] [--predicate P] [--direction incoming|outgoing]` | At least one scoped endpoint or tight bound; provider may enforce stricter filter |
| `graph:link show/create/update/delete` | `SOURCE PREDICATE TARGET` | Same exact order and type validation for every action |
| `graph:predicate check` | `SOURCE_KIND PREDICATE TARGET_KIND` | Reports valid triples and payload; declaration does not grant mutation permission |
| `source:change apply` | Bound reviewed change receipt/fingerprint | Existing source-change owner remains sole writer |
| `rule:change apply` | Bound reviewed rule-change receipt/fingerprint | Existing RuleStore remains sole writer |
| `project restore` | Validated authored snapshot + explicit trusted local approval | **Unavailable until atomic restore verified**; never copy active SQLite/WAL blindly |

**Shared option policy:** typed JSON inputs per §4.1, output-only `--json`, `--limit`, `--cursor`, `--project` only where supported and permitted, `--expected-revision` / exact fingerprint for mutations, and `--help` consistently. No general-purpose `--force` bypassing domain authorization. A local `--yes` is allowed *only for an exact, deterministic, host-authorized human operation*; it cannot impersonate acceptance of Product meaning or an external agent. `--dry-run` may be a standard alias for an existing inert preview only where it genuinely previews the same operation; don't claim transactions for unsupported actions.

### 4.1 JSON input, typed values and machine output — normative

**Structured JSON is a first-class input whenever an operation accepts structured or non-string data.** The CLI must not flatten an object, array, number, boolean or null into a string, invent shell-specific field semantics or require a new command for every optional field. All accepted JSON is validated against the *same action-specific runtime contract* as TypeScript and MCP; JSON support never authorizes fields the domain owner forbids.

| Input form | Applies to | Meaning |
|---|---|---|
| `--data-json '<JSON-object>'` | Resource `create`/`update` and other actions whose contract accepts a structured request | Exact, schema-validated fields for that action, never unrestricted JSON CRUD |
| `--data-file PATH` / `--data-file -` | Same structured requests | Read UTF-8 JSON from a file or standard input; enables large data and avoids shell-quoting problems |
| `--value TEXT` / `--value-json '<JSON-value>'` | An action with a **single typed value**, such as a supported `config set` field | Explicit plain string versus exact JSON value; no heuristic conversion of `"false"` to `false` |
| `--payload-json '<JSON-object>'` | Operations with a dedicated typed payload, initially `graph:link create/update` | Only the declared predicate/action payload schema; not arbitrary edge metadata |
| `--json` | Machine **output** on supported commands | A structured result with the domain's real IDs/revisions, status, evidence, cursor and error details; never an input switch |

These are **common conventions**, not evidence that every catalog action supports each option. The command's scoped help and strict schema must declare the forms it actually accepts. When the action has no meaningful JSON input, it must not expose a decorative `--data-json`.

**Input equivalence and unambiguous precedence:**

- For a single request, use **either** named field flags **or** `--data-json` **or** `--data-file`; mixing structured request sources is rejected, except normal positional identity, output flags, authorization transport and explicit revision/fingerprint flags. Do not silently merge or override duplicated fields. `--value` and `--value-json` are mutually exclusive.
- `--payload-json`, `--note` and `--clear-note` are mutually exclusive for a single `graph:link` operation. `--note TEXT` is ergonomic sugar for a payload with a `note` string. On **update**, `--clear-note` explicitly removes the note; JSON payload `{"note":""}` normalizes to the same clear where the current relation schema supports it. On **create**, omitted note means absent note. No unsupported payload properties are permitted.
- **Missing / null / empty / clear are distinct.** Omission preserves an existing value on partial update; JSON `null` is accepted only for an explicitly nullable field or a documented clear operation. `[]`, `{}`, `""`, `false` and `0` remain their real typed values. Never interpret `null` as universal deletion.
- Strict JSON parsing must reject malformed input, duplicate keys at any object level, unknown/protected fields, non-finite numbers, invalid integer ranges, prototype-dangerous keys and excessive nesting or size. Reject unsupported BigInt/decimal precision rather than rounding silently; use explicitly documented decimal/string representations where exactness matters.
- The terminal lexer may remove quoting **once**; JSON values are parsed **once** after lexical normalization. No JS evaluation, environment expansion, string interpolation, shell command substitution, raw SQL or injection of `executionAuthority`, `approved`, verification hashes or source-write permissions through a JSON body.
- File/stdin input is bounded and reads only the declared source; no hidden import of unrelated directories. A secret-capable operation should prefer stdin/secure config handling, avoid logging values and reject writing secrets into project projections.
- MCP and TypeScript callers submit **native JSON-typed fields**, not JSON-text strings inside an `args` bag. Identity, schema, domain validation, protected-field checks and host approval match the CLI path. Schema conversion to MCP must fail closed on unrepresentable unions.
- Machine output `--json` contains neither decorative terminal text nor implicit success on preview. For errors, preserve the existing domain status/category and actionable details in a consistent transport representation. Do not invent a second global response model.

Illustrative syntax (actual action/field availability remains schema-gated):

~~~bash
aiwf product:story create --data-json '{"id":"S1","actor":"Customer","intent":"Save an avatar","initialState":"Avatar filtered","action":"Save","expectedResult":"Avatar persisted","exceptions":"","bounds":""}'
aiwf product:story update S1 --data-file story-change.json --expected-revision 3
aiwf graph:link create F1 enables S1 --payload-json '{"note":"Accepted scope"}'
aiwf graph:link update F1 enables S1 --payload-json '{"note":""}' --expected-revision 2
aiwf config set example.boolean-key --value-json 'false'
aiwf config set example.list-key --value-json '["fast","safe"]'
aiwf artifact show S1 --json
~~~

The example configuration keys are intentionally illustrative, **not** promised settings. Review/authorization remains mandatory even for syntactically valid JSON.

## 5. Shared TypeScript domain API and all transport adapters

### 5.1 One operation meaning, not one giant dispatcher

The domain-owner TypeScript methods remain canonical. Each public action has **one normalized, strongly validated request and semantic result** that CLI, Shell UI, MCP and REST adapt without reimplementing behavior. Normalization must use existing owner schemas and adapters: do not invent a global command dispatcher just to enforce transport parity. This specification does **not** demand a new generic `executeOperation()` framework, new entity registry, parallel REST server (reuse `src/workspace/server.ts`), or shadow persistence layer.

For example, conceptual normalized requests:

```ts
// Examples, NOT asserted exported types. Use existing domain types and Zod contracts.
type GraphLinkAction =
  | { action: 'list'; sourceId?: string; targetId?: string; predicate?: string; limit?: number }
  | { action: 'show'; sourceId: string; predicate: string; targetId: string }
  | { action: 'create'; sourceId: string; predicate: string; targetId: string;
      payload?: { note?: string }; expectedAbsence?: string }
  | { action: 'update'; sourceId: string; predicate: string; targetId: string;
      change: { note: { kind: 'set'; value: string } | { kind: 'clear' } }; expectedRevision: string }
  | { action: 'delete'; sourceId: string; predicate: string; targetId: string; expectedRevision: string };

type TicketAction =
  | { action: 'show' | 'status' | 'investigate' | 'prepare' | 'resolve'; id: string }
  | { action: 'list'; lane?: string; limit?: number; cursor?: string };
```

Every action, including `create` with a note versus `show`, has a distinct runtime schema. Use exact `z.discriminatedUnion` or equivalent finite contracts where helpful; do not publish `args: any` or accept unknown extra fields. For graph read `sourceId` is **not** graph write authority; for all mutations host approval, ownership/scope, version/fingerprint and approved Product meaning remain independent checks.

### 5.2 MCP naming: flat semantic families

MCP tool names use **dots**, not CLI colons; dots are *just names*. They need not be 1:1 with each CLI action, but each supported action must map unambiguously to one owner. Compact default and legacy compatibility/advanced are **views of the same registry**, measured for real agent usability, not arbitrary tool quotas.

| CLI resources | Candidate MCP family | Schema boundary |
|---|---|---|
| `agent`, `agent:capability` | `agent.exec`, `agent`, `agent.capability` | Strict intent and authorized capability discovery |
| `project`, `project:host` | `project`, `project.host` | Project/snapshot actions vs host setup |
| `config`, `model`, `model:provider`, `model:route`, `model:advice` | `config`, `model`, `model.route`, `model.advice` | Locally safe configuration; no automatic secrets or spending |
| `artifact` | `artifact` | Typed cross-kind *reads*; protected writes excluded |
| `product:manifest`, `product:*` definitions | `product.manifest`, `product.definition` | Discriminated kind/action; S2 review before authored writes |
| `product:coverage`, `product:impact` | `product.analysis` | Bounded scope and honest evidence |
| `arch:manifest`, `arch:module`, `arch:impact` | `arch.manifest`, `arch.module`, `arch.impact` | Indexed facts vs authored module intent |
| `flow`, `flow:epic`, future `flow:observation`, `flow:rfc` | `flow`, `flow.epic` (future kinds not advertised) | Inert planning, no auto-approval |
| `ticket`, `ticket:history` | `ticket`, `ticket.history` | Explicit bounded work, honest blockers/proof |
| `test`, `test:story`, `test:case`, `test:ticket` | `test`, `test.story`, `test.case`, `test.ticket` | Test activation/run/receipt authority separate |
| `source`, `source:file`, `source:symbol`, `source:change` | `source.find`, `source.inspect`, `source.change` | Query exactness/language limitations; guarded changes |
| `graph:predicate`, `graph:link`, `graph:query`, `graph:index` | `graph.predicate`, `graph.link`, `graph.query`, `graph.index` | Finite predicates, typed triples; index refresh may need write authority |
| `rule`, `rule:change` | `rule`, `rule.change` | Owner-specific policy review |
| `knowledge`, `knowledge:skill` | `knowledge`, `knowledge.skill` | Provenance and installed SkillManager truth |
| `git` | `git` | Read-only default; mutating actions require trusted host policy |
| `shell`, `mcp` | **No MCP tool** | Transport launchers |

Do not advertise absent actions via permissive `action: string`; each tool must expose only actually implemented supported literal actions. A big `product.definition` union may warrant narrower specialist tools if measured real agent selection/schema size demonstrates benefit. No false “nested MCP” presentation or 150 individual tools.

### 5.3 Shared outcome categories

Use existing domain result types, retaining exact canonical values where established. Across transports preserve: `ok/read`, **`preview` (inert)**, `applied`, `needs_input`, `blocked`, `stale/conflict`, `not_found`, `unsupported`, `cancelled`, `failed`. These are **semantic categories**, not a demand to add a competing global status enum.

A result includes: exact affected kind/ID and revision where relevant; evidence/provenance/currentness or bounded discovery limits; for failures an actionable reason and next safe action. Domain truth supersedes presentation aliases: `complete` inside investigation does not mean resolved Ticket, `Done` never follows merely from a passed test, and an index hit is not proven source freshness. Provider/infrastructure errors are not product failures.

### 5.4 Review/approval and safety invariants

- **No model self-consent:** read ≠ propose ≠ approve ≠ apply. MCP caller flags, AI-selected JSON, `--yes`, or an LLM message cannot create developer authorization.
- One existing S2 Product/relation review boundary, one guarded Causal Change Engine, one RuleStore, one Semantika store, one test/proof owner. Explicit review is binding to current exact target, version, source basis and fingerprint; rejection/stale/cancel leaves state unchanged.
- Product charter and Story definition require developer approval; no silent auto-accept or manufacture of missing criteria. `product:manifest` is not a separate mutable store.
- `graph:predicate` descriptor is central, finite and reused by CLI/MCP/help/validation; valid endpoint triples do not grant write permission. Verification evidence remains protected by its proof operation; historical Feature containment is removal-only. No generic `graph:link create` proof/verification edges.
- Source write scoped by actual Ticket/host, dirty targets and independent acceptance; no producer-set `Verified` or receipt hash. `ticket resolve` still owns actual completion.
- Read-only queries may inspect a **fresh** index without writing it. Stale state must fail or present a clearly stale result; `graph:index refresh` is a separate controlled write-capable operation.
- Project recovery is *not* advertised until atomic/validated restore and fresh independent replay are demonstrated. Authored snapshots are portable; active SQLite/WAL/cache are not Git artifacts.

### 5.5 Four public interfaces: CLI, MCP, Shell UI and REST (normative)

All four interfaces are first-class **adapters to the same typed domain methods**, authorization, JSON semantics and observable results. TypeScript is the underlying domain API, not another independent business implementation.

| Interface | Public contract | Extra duties |
|---|---|---|
| CLI | `aiwf topic[:subtopic] ACTION ...` | Shared Commander grammar; typed flags/JSON; deterministic exit and `--json` output |
| MCP | Flat, compact semantic tool names; strict action/kind JSON | Existing registry/owners; discoverability; no caller self-approval |
| Shell UI | Identical command grammar without `aiwf` | Real `@dharmax/shell-ui` completion, TTY input, facilitation, rendering, human review, progress, cancellation and non-TTY handling; no second parser or behavior engine |
| REST | Versioned `/api/v1/...` HTTP/JSON; OpenAPI 3.1 for actually implemented routes | Workspace and other authorized browser/web clients; server adapts canonical owners, not per-page domain logic |

**Existing HTTP host:** `src/workspace/server.ts` already runs the Bun Workspace HTTP server and legacy `/api/catalog`, `/api/entity`, `/api/links`, test, derive and review routes. **Reuse it**. Canonical `/api/v1` routes and Workspace migration must retain existing UI functionality until it is safely moved. No second HTTP server, tool registry, DB, authorization framework or routing domain engine. Browser layout/state is presentation; Product mutations, graph operations, Tests and evidence remain their current canonical owners.

**REST is a direct, dynamically generated projection of the command resource/action contract, not a separate taxonomy.** Routes are compiled from the central public-operation descriptors when the existing Workspace server starts; do not maintain a per-action HTTP route list.

```text
CLI:  aiwf <topic>[:<subtopic>] <action> [operands] [options]
REST:      /api/v1/<topic>[/<subtopic>][/<id>][/<action>]
```

The topic is the REST resource; the optional subtopic is the next path segment **without renaming or pluralizing** it: `ticket` → `/api/v1/ticket`, `graph:link` → `/api/v1/graph/link`, `product:feature` → `/api/v1/product/feature`. This applies mechanically to *all* catalog families in §3. Do not maintain another REST naming table.

Action mapping: `list` = collection GET, `show` = item GET, `create` = collection POST, `update` = item PATCH, `delete` = item DELETE. For non-CRUD actions, preserve the action name as a path suffix: side-effect-free `status`, `history`, `check` use GET; `investigate`, `prepare`, `resolve`, `run`, `analyze` and comparable work operations use POST. **GET must not mutate or auto-reindex.** A Product `retire` is a reviewed action, not a deletion; Ticket `resolve` isn't a status PATCH.

| Canonical operation | REST |
|---|---|
| `ticket list` | `GET /api/v1/ticket?limit=25` |
| `ticket show T1` | `GET /api/v1/ticket/T1` |
| `ticket status T1` | `GET /api/v1/ticket/T1/status` |
| `ticket investigate T1` | `POST /api/v1/ticket/T1/investigate` |
| `ticket resolve T1` | `POST /api/v1/ticket/T1/resolve` (only when implemented and authorized) |
| `product:feature list` | `GET /api/v1/product/feature` |
| `product:feature show F1` | `GET /api/v1/product/feature/F1` |
| `product:feature update F1` | `PATCH /api/v1/product/feature/F1` (governed review) |
| `graph:predicate list` | `GET /api/v1/graph/predicate` |
| `graph:predicate check Feature enables UserStory` | `GET /api/v1/graph/predicate/check?sourceKind=Feature&predicate=enables&targetKind=UserStory` |
| `graph:link list --source F1` | `GET /api/v1/graph/link?sourceId=F1` |
| `graph:link show F1 enables S1` | `GET /api/v1/graph/link?sourceId=F1&predicate=enables&targetId=S1` |
| `graph:link create F1 enables S1` | `POST /api/v1/graph/link` with strict JSON `{sourceId,predicate,targetId,payload?}` |
| `graph:link update/delete F1 enables S1` | `PATCH`/`DELETE /api/v1/graph/link?sourceId=F1&predicate=enables&targetId=S1` with revision/fingerprint |
| `source:symbol outline REF` | `GET /api/v1/source/symbol/{encodedRef}/outline` |
| `source:symbol calls/callers/references REF` | `GET /api/v1/source/symbol/{encodedRef}/calls`, `/callers`, `/references` (each only when verified implemented) |
| `source:symbol xray REF` | `POST /api/v1/source/symbol/{encodedRef}/xray` with bounded typed JSON parameters; read-only computation, no project-state mutation |

A directed relation is identified by the exact typed `(sourceId,predicate,targetId)` triple. Complete GET triple = show; incomplete filters = bounded list. The same typed fields apply to CLI, MCP and REST; query params carry list filters and cursors, JSON bodies carry accepted native values and payloads. All IDs are exact and URL-encoded. Routes must disambiguate static subtopics/actions from literal IDs rather than guessing.

Only **verified supported, eligible** registered operations get generated HTTP routes and OpenAPI entries. URL path segments for topic/subtopic and known action names have precedence over variable identifiers; an ID matching a reserved action must be encoded through an explicit, documented unambiguous identity form (e.g. a validated query/typed reference), never silently reinterpreted as the action. Do not generate endpoints indiscriminately for the entire taxonomy, introduce a generic RPC framework or create another resource registry. Reuse the Workspace server and its canonical domain owners.

**Results:** same canonical ID/version, `preview` vs `applied`, `needs_input`, `blocked`, `stale`, `cancelled`, evidence/provenance and next action. HTTP codes reflect transport: 200 read/result/preview, 201 actual create, 202 actual asynchronous acceptance (**never developer approval**), 400 malformed, 401/403 unauthenticated/unauthorized, 404 absent, 409 stale/conflict, 422 domain invalid/needs-input where appropriate and 5xx actual service failure. Do not infer domain success from HTTP 200.

**Existing-implementation warning:** the inspected `src/workspace/server.ts` has GET handlers calling `ensureAstFresh`, and `/api/apply` accepts a request-body `decision` using the request's Workspace context. This is evidence of a **freshness/authorization boundary requiring inspection**, not proof of an exploitable bypass in every host scenario. Pass A must avoid adding GET-triggered writes; before exposing or expanding any REST writer, trace and prove actual trusted developer consent independently of client-controlled JSON and of simple possession of the page token. Retain legacy UI compatibility only with this authority invariant; a known legacy bypass must be corrected at the owner, not copied into `/api/v1`.

**Web safety:** retain local-only server by default. Verify Host/Origin, CSRF protections, authentication, project scope, read/write permissions and request cancellation. A session/token or JSON `decision:"accept"` is **not itself Product approval**. Only a genuine host-owned human review of the exact fingerprint/version may apply accepted meaning; unattended REST/MCP callers cannot spoof that review. Audit the existing Workspace launch token and keep it out of logs, referrers and unintended URLs. Remote exposure requires separately approved secure transport and authentication.

**Long operations:** if a real asynchronous execution owner exists, 202 returns its actual operation reference with truthful status, cancellation and optional event streaming through its existing owner. Runtime operation controls are transport infrastructure, not a new competing domain resource taxonomy. Avoid inventing a scheduler, durable job store or fake progress. Shell UI can render existing progress via `ProcessViewport`; CLI and MCP preserve truth according to their host affordances.

**Proof and documentation:** publish OpenAPI 3.1 for supported REST routes, generated or validated from the same typed action contracts. A real public acceptance slice must execute CLI subprocess, actual `@dharmax/shell-ui` TTY interaction, stdio MCP and live HTTP requests; verify affected Workspace browser calls, authorizations, stale/denied/cancel/restart, JSON fidelity, lifecycle cleanup and exact same domain results. A route list or a mocked fetch test is not acceptance.


## 6. Implementation boundaries — two work passes, not domain-by-domain stages

1. **Unify and externalize.** Inspect the latest local code; rename `ToolRegistry` to `CommandRegistry`, carefully preserving genuine internal tool semantics, and extend the existing registry as the *one public command catalog*. Derive CLI `--help`, Shell UI commands/completion, MCP descriptions/schemas and mechanically mapped REST/OpenAPI from registered supported operations. Migrate existing implemented actions and aliases without inventing handlers. Prove at least one real operation through all four surfaces, no duplicated declaration, and protect existing Workspace/MCP/CLI behavior. Fix trust/freshness defects encountered in this common path.
2. **Complete essential gaps and accept.** Expose the remaining **already-implemented, useful and safe** operations through this catalog, then implement only missing capabilities required for basic API usefulness and safety. Validate representative read, governed mutation and long-running actions across eligible surfaces, typed JSON, real UI and agent discovery, denial/stale/cancel/restart and absence of bypass. Unsupported or merely aspirational catalog actions remain undiscoverable and explicitly deferred.

**API work is finished** once `CommandRegistry` owns public command discovery/dispatch metadata, existing useful capabilities are properly exposed where eligible, help/CLI/Shell UI/MCP/REST agree, security is proven, and tests pass. **Full implementation of every item in §3 is not the API completion criterion.**

**Ticket `investigate/prepare/resolve` internal algorithmic reliability and advanced source Xray are separate product work** after the interface parity. They are not prerequisite "API stages." Preserve their meaningful public entry points and honest status; do not conflate public exposure with repair of their internals.

**Trusted approval:** a public operation description never grants authorization. A caller-created `decision:'accept'`, arbitrary CLI `--yes`, schema-valid JSON or MCP parameter is not sufficient to impersonate developer consent. Public writers may be preview-only until a genuine independent host authorization path exists. Do not add an unsafe shortcut for uniformity.

## 7. Developer decisions and remaining constraints

**Approved (2026-10-30):** Resource/action-first CLI grammar, exactly one colon subtopic, command-action before operands, no separate `unlink` or reversed Ticket grammar; `graph:link ACTION SOURCE PREDICATE TARGET`; one typed domain owner across CLI/Shell UI/MCP/REST/TypeScript; an extensive documented taxonomy **without pretending all actions ship**; JSON typed input wherever applicable; incremental reuse-first implementation.

**Approved registry-first architecture:** rename the existing `ToolRegistry` class to `CommandRegistry` and use it as the single public-command catalog over existing domain owners/internal tools; help, CLI, shell-ui completion, MCP schemas and REST routes are derived, not independently reimplemented. **Approved transport scope:** CLI, MCP, interactive shell-ui compatibility and REST for Workspace and authorized web interfaces. Existing `/api/...` routes are reuse candidates, not proof of new contract parity. **REST routes derive directly from topic/subtopic/action** (with standard HTTP methods); there is no independent resource naming catalog.

**Accepted as the public vocabulary, with factual runtime support still to be verified:** `ticket` as a first-class resource, `flow` as delivery, `product:journey` as the public spelling of Product Flow, single `product:manifest`, and semantic MCP families rather than one tool per CLI action.

**Not authorization for new domain concepts:** Observation and RFC ontology, Ticket promote/demote, general tagging persistence, advanced source transformations and autonomous host write approval remain deferred or conditional. Only existing supported behaviors may be advertised. A concise scoped help response must reveal what *actually* works.

**Implementation sequencing, concrete gates, test matrix and safe integration procedure:** [Public Interface Implementation Plan](../../plans/AIWF-PUBLIC-INTERFACE-IMPLEMENTATION-PLAN.md). This spec governs **what the API means**; that plan governs **what to build next**. Historical examples in older plans are non-normative where they conflict with this contract.
