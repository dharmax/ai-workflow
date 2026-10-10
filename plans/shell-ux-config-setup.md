# AIWF Shell UX, Configuration & Setup — Design and Execution Plan

> **Status:** temporary implementation brief.  
> **Authority:** AIWF's semantic graph and the repository remain the execution source of truth. This file defines the accepted design boundary and acceptance target; it must not become a parallel task database.  
> **Lifecycle:** delete this file when the work is complete, after durable architectural/operational truth has been folded into `docs/architecture.md`, `docs/journeys.md`, and `docs/operations.md`.

---

## AIWF enforcement preamble

This work **must be executed through AIWF**.

Before editing:

1. Inspect current AIWF state and existing Product Intent/Tickets relevant to shell UX, configuration, setup, diagnostics, and shell-ui migration.
2. Reuse existing artifacts when they already represent the work. Do **not** create duplicate Tickets because an existing artifact is stale, incomplete, leased, or inconvenient.
3. Ground the implementation in current source using AIWF's exact investigation tools. Narrow first: symbol/outline/source/references/blast/test evidence before broad file or repository scans.
4. For an existing Ticket, prefer `aiwf resolve <ticket>`; use `investigate` / `prepare` only when intentionally stopping before mutation or resolving missing evidence.
5. Claim the relevant Ticket before manual edits.
6. Use the canonical safe change path for source mutations: preview → fingerprint → apply. Do not bypass AIWF with generic whole-file edits when the required operation is supported.
7. Preserve unrelated user work. Do not reset, stash, overwrite dirty targets, or silently rewrite working state.
8. Verification must exercise the real production path. Unit tests are necessary but not sufficient where this plan names an end-to-end journey.
9. Keep branches temporary. At the first stable verified point: merge, delete the branch, continue. Use a tag only for an exceptional rollback landmark.
10. If AIWF itself blocks execution because of a real tool gap, record the exact blocker, use the smallest justified fallback, and return to AIWF. Do not abandon AIWF merely because a primitive is temporarily inconvenient.

### Prime Directive

The simplest correct solution wins.

Before adding any new abstraction, registry, command layer, service class, compatibility shim, state store, or workflow mechanism, identify the concrete duplication or ownership defect it removes. If the new mechanism does not make the system materially smaller or clearer, do not add it.

---

# 1. Goal

Make AIWF itself **pleasant, trustworthy, and fast to operate from the shell** while correcting the configuration/setup defects underneath it.

The shell should become the best human interface without becoming a second application with independent semantics.

The core behavioral contract is:

```text
explicit command + complete arguments
    → execute immediately

missing required human input in an interactive shell
    → facilitate only the missing input

inspection
    → structured, compact view

mutation
    → one canonical domain operation

ordinary CLI / non-TTY
    → deterministic, scriptable, never prompts

MCP
    → same underlying domain truth where intentionally public
```

The desired result is not merely prettier terminal output. The implementation should **remove duplicated behavior and presentation machinery** from AIWF.

---

# 2. Existing architectural boundaries

Preserve these ownership boundaries:

- **AIWF** owns Product Intent/work semantics, artifact operations, repository engineering lifecycle, and the human-facing command vocabulary.
- **`@dharmax/shell-ui`** owns renderer-neutral interaction/presentation: facilitation, views, review, progress/process presentation, and TTY-vs-plain behavior.
- **`@dharmax/llm-utils`** owns model/provider construction and routing semantics.
- **`@dharmax/semantic-registry`** owns semantic capability discovery.
- **`@dharmax/skill-manager`** owns skill lifecycle/discovery/activation/execution.
- **Semantika** owns durable semantic substrate/tag identity.
- **MCP** remains an intentionally bounded public surface; it is not required to mirror every shell convenience.

If this work causes AIWF to reimplement one of those responsibilities, stop and simplify.

---

# 3. Quality-pass baseline

Treat these as current baseline decisions, not work to rediscover unless a regression proves otherwise:

- Empty semantic-registry queries are misses, not “return everything”.
- Empty skill queries are misses.
- Missing requested skill activation is explicit failure.
- AIWF installation documentation reflects the current sibling-workspace/source-checkout reality.
- Setup no longer claims every environment was configured merely because setup returned.
- Doctor distinguishes configured providers from proven active/reachable providers.
- In-place global AIWF installation must never unlink itself.
- AIWF's installed/generated skill contract must stay synchronized with the checked-in canonical skill.

Do not reopen adjacent ecosystem architecture merely because this work touches related code.

---

# 4. Problem statement

The remaining defects are concentrated in AIWF integration and presentation.

## 4.1 Configuration correctness

Today, configuration loading resolves defaults/global/environment/project state into an effective `ProjectConfig`. The mutation path then risks writing that resolved state back as project configuration.

That destroys provenance:

```text
defaults + environment + global + project
                 ↓
             effective
                 ↓
          project config   ← wrong
```

A project override must contain only values explicitly overridden at project scope.

Malformed configuration must not silently become “default configuration” during a write or user-facing operation.

Secrets must not become ordinary project configuration values merely because they are needed to construct a provider.

## 4.2 Setup truthfulness

Setup currently spans several concerns: CLI installation, TypeScript runtime provisioning, MCP host configuration, skill synchronization, schema export, and host guidance.

The problem is not that setup has multiple steps. The problem is that detected hosts and write failures are not represented uniformly and some meaningful failures can disappear.

The user must be able to distinguish:

- already satisfied;
- change required;
- changed successfully;
- host absent / not applicable;
- failed.

Repeated setup must be harmless and truthful.

## 4.3 Runtime diagnostics

A real configuration/provider-construction error must not collapse into “no provider configured”.

Likewise, configured credentials are not proof of reachability and an unreachable optional provider is not proof that the entire cognitive runtime is broken.

## 4.4 Shell/CLI duplication

`src/cli.ts` and `src/shell.ts` contain substantial parallel parsing, defaults, validation, dispatch and rendering logic.

That is the largest ownership violation in this project slice.

`shell-ui` already contains the newer renderer-neutral primitives required to remove much of this duplication. AIWF should consume them rather than maintain an alternate UI framework.

---

# 5. Target design

## 5.1 Configuration: separate raw overrides from effective configuration

Keep the existing configuration representation where practical. Do not introduce a configuration database or migration framework.

Conceptually the API should separate:

```text
read raw global overrides
read raw project overrides
resolve effective configuration
write/remove explicit global override
write/remove explicit project override
```

`loadConfig(projectRoot)` may remain the primary effective-config API.

### Required invariant

Writing a project setting must never serialize inherited defaults, environment values, or global values into the project config.

Example:

```text
global model = X
project model = Y

effective = Y

reset project model

effective = X
project config does not contain X
```

### Setting metadata

Add only the smallest metadata required for user-facing configuration:

- stable setting id;
- type;
- short description;
- validation/choices when genuinely bounded;
- allowed scope: project/global;
- secret/sensitive status where relevant.

A small typed table is preferred.

This metadata is **not** a second configuration subsystem.

### Secrets

Credentials should be resolved from environment/global credential sources and must not be displayed in config views.

Do not migrate secret handling broadly unless required to prevent project-level secret persistence.

---

## 5.2 Setup: inspect → review/apply → verify

Do not build a generic setup workflow engine.

Represent concrete setup steps with a small common result shape, for example:

```ts
type SetupState =
  | 'satisfied'
  | 'needed'
  | 'changed'
  | 'skipped'
  | 'failed'

interface SetupStepResult {
  id: string
  state: SetupState
  message: string
}
```

Exact names may differ; semantics must remain this simple.

Existing concerns remain ordinary functions:

- inspect/install AIWF binary;
- inspect/provision TypeScript 7;
- inspect/provision TypeScript 6 sidecar;
- inspect/configure supported MCP hosts;
- sync canonical AIWF skill where applicable;
- export MCP schemas.

Desired lifecycle:

```text
inspect current state
        ↓
show what is satisfied / needed / absent / broken
        ↓
apply required changes
        ↓
verify resulting state
```

### Failure semantics

- host absent → `skipped`
- already correct → `satisfied`
- required change detected → `needed`
- write/provision succeeded → `changed`
- selected/detected host could not be configured → `failed`

No meaningful `catch {}` may convert a real setup failure into apparent success.

Optional discovery probes may degrade gracefully when absence is expected, but must not mislabel malformed detected configuration as normal absence.

---

## 5.3 One semantic execution path

The central architecture is:

```text
                ┌──────── shell-ui presentation/facilitation
AIWF operation ─┤
                └──────── ordinary CLI parsing/output
```

Not:

```text
shell business logic
CLI business logic
MCP business logic
```

For each migrated behavior, there must be one domain mutation/query path. Shell and CLI adapters may differ in how they obtain missing inputs and render the result, but not in business semantics.

Where an existing registry tool already expresses the operation and arguments correctly, reuse it rather than creating a second operation definition merely for the shell.

---

## 5.4 Use shell-ui, do not clone it

Investigate the current `shell-ui` API before designing new UI plumbing.

Prefer its newer renderer-neutral primitives, including where appropriate:

- `CommandDefinition`
- `ParameterFacilitator`
- `InteractionPort`
- `View`
- `Review`
- process/progress presentation

AIWF may define command-specific labels, choices, descriptions and domain calls. It should not own another renderer/prompt framework.

### Interaction rule

```text
claim TKT-37
→ execute immediately

claim
→ interactive shell may offer valid claimable tickets

aiwf claim
→ noninteractive/ordinary CLI reports missing argument; never secretly prompts
```

A complete command must always be the fastest path.

---

## 5.5 Shell UX principles

The shell remains a command shell, not a menu application.

Desired properties:

- terse prompt;
- known typed commands execute immediately;
- missing identifiers/options can be facilitated;
- structured entities use views rather than walls of ad-hoc `console.log`;
- long-running operations use appropriate progress/process presentation;
- errors say what actually failed;
- cancellation never mutates state;
- no interaction is triggered in non-TTY/plain mode.

Good candidates for facilitation:

- claim → currently claimable Tickets;
- release → currently leased Tickets;
- move → valid Ticket + lane;
- entity inspection → known matching entities;
- config → known settings/scopes;
- setup → detected applicable actions.

Do not add semantic selection where deterministic bounded choices already exist.

---

# 6. Execution plan

The work is intentionally vertical and deletion-biased.

## Milestone 1 — correctness foundation

### Ticket A — Configuration correctness

Scope:

1. Record the actual current precedence and credential sources before changing code.
2. Separate raw global/project overrides from effective config resolution.
3. Fix project/global mutation so each write changes only its own layer.
4. Add removal/reset semantics.
5. Make malformed relevant config visible rather than silently flattening to defaults during mutation.
6. Add minimal setting metadata/validation required by the next milestone.
7. Prevent secrets from being written/exposed as ordinary project config.

Acceptance:

- global override works;
- project override works;
- project reset reveals the underlying global/default/env value without copying it;
- project file contains only explicit project overrides;
- global file contains only explicit global values/credential structures already owned there;
- invalid user-provided config produces actionable failure;
- no credential is printed by config inspection;
- existing unaffected configuration remains compatible.

### Ticket B — Setup and runtime truthfulness

Scope:

1. Introduce the minimal setup step/result semantics.
2. Convert supported host setup to explicit satisfied/needed/changed/skipped/failed reporting.
3. Remove meaningful silent failure swallowing from detected/selected host mutation.
4. Keep repeated setup idempotent.
5. Fix provider/runtime construction diagnostics where a real construction error becomes “not configured”.
6. Preserve optional probe semantics; do not redesign provider routing.
7. Keep setup writes as local and non-destructive as practical; use safe replacement/backup where existing host formats require it.

Acceptance:

- fresh supported workspace setup is truthful;
- repeated setup makes no duplicate registrations/corruption;
- absent host is not an error;
- malformed or unwritable detected host is not reported as success;
- runtime construction error is distinguishable from missing provider configuration;
- `aiwf doctor` reports observed/configured state accurately.

### Milestone 1 gate

Run focused tests plus:

```bash
bun test
bun run typecheck
bun run pack
git diff --check
```

Do not continue if correctness requires introducing a parallel configuration/setup subsystem.

Merge and delete the temporary branch when green.

---

## Milestone 2 — prove the shared shell/CLI architecture

Migrate **only config and setup** first.

### Ticket C — Config vertical slice

Target behavior:

Interactive shell:

```text
> config
# compact structured view

> config set model X
# project override

> config set model X --global
# global override

> config reset model
# remove project override
```

Ordinary CLI/non-TTY exposes equivalent explicit operations and uses the same underlying mutation/query functions.

Requirements:

- no hidden prompt outside interactive shell;
- shell facilitation only supplies missing human input;
- cancellation leaves state untouched;
- effective value and source should be visible where useful;
- presentation code contains no config precedence/business rules.

### Ticket D — Setup vertical slice

Target behavior:

```text
> setup
# structured current state and required changes
# interactive review/application when useful

aiwf setup --check
# inspection only; no mutation; no prompt
```

Exact command spelling should follow the simplest compatible CLI shape discovered during implementation. Do not preserve an awkward spelling merely because this plan used an example.

Requirements:

- shell and CLI use the same setup inspection/application functions;
- plain mode renders useful text without semantic prompts;
- no setup business rules exist only in the shell renderer.

### Milestone 2 architectural gate

Before expanding further, answer with evidence:

1. Did shell and CLI duplication decrease?
2. Did shell-ui remain presentation-only?
3. Did AIWF avoid creating a second command framework?
4. Did config/setup semantics become easier to test directly?
5. Did the implementation delete old parsing/rendering paths rather than merely wrap them?
6. Is the resulting code no more complex than the problem?

If the answer to any material question is “no”, simplify before proceeding.

Merge and delete the branch when green.

---

## Milestone 3 — expand the proven pattern

Only begin after Milestone 2 passes the architectural gate.

Use a bounded duplication map of `src/shell.ts` and `src/cli.ts`. Migrate coherent families where both paths currently duplicate argument handling, validation, domain calls, or rendering.

Recommended order:

1. **Ticket flow**
   - claim
   - release
   - move
   - done
   - ticket selection/navigation

2. **Artifact flow**
   - investigate
   - prepare
   - resolve
   - process

3. **Entity inspection/editing**
   - Ticket/Epic/Feature/Story views
   - editing only where an existing safe domain mutation already exists

4. **Model/runtime inspection**
   - effective model/provider/runtime state
   - no model-routing redesign

5. **Common source/graph navigation**
   - only where structured shell presentation materially improves daily use

Do not mechanically migrate every one-line deterministic CLI command.

### Per-family acceptance

For each migrated family:

- complete explicit command executes immediately;
- missing interactive input is facilitated;
- noninteractive equivalent never prompts;
- both adapters call the same underlying domain operation;
- cancellation is mutation-free;
- superseded shell/CLI parsing/rendering code is deleted;
- focused tests exercise both interactive and plain behavior where practical.

---

## Milestone 4 — deletion, dogfooding, durable docs

### Delete superseded machinery

Once AIWF no longer consumes a legacy shell path, remove it.

If AIWF no longer requires `shell-ui`'s legacy API, remove that API in a **separate small verified shell-ui change**. Do not preemptively refactor shell-ui before proving AIWF no longer needs it.

Search explicitly for:

- duplicated argument parsing;
- duplicate validation/defaults;
- dead terminal/prompt helpers;
- stale setup policy copies;
- obsolete success strings;
- silent setup/config failure swallowing;
- compatibility paths with no remaining consumer.

### Dogfood acceptance journeys

#### Journey A — fresh setup

```text
supported sibling workspace
→ install dependencies
→ aiwf setup
→ aiwf doctor
→ truthful healthy/degraded state
```

Repeat setup and prove no duplication/corruption/false success.

#### Journey B — configuration provenance

```text
set global model X
→ effective X

set project model Y
→ effective Y

reset project model
→ effective X
→ project file does not contain X
```

#### Journey C — human shell

```text
aiwf
> claim
→ choose a valid Ticket

> resolve TKT-...
→ meaningful progress/result
```

#### Journey D — expert shell/CLI

```text
> claim TKT-42
→ immediate

aiwf claim TKT-42
→ same underlying mutation, noninteractive
```

#### Journey E — external coding agent

MCP + AIWF skill delegates work against the same authoritative graph/state. Shell convenience must not create a shadow state unavailable to MCP.

### Durable documentation

Only after behavior is real:

- update `docs/architecture.md` for durable ownership/boundary changes;
- update `docs/journeys.md` for durable actor acceptance if the shell/config/setup journeys materially extend the product contract;
- update `docs/operations.md` with verified command syntax and operational behavior;
- update README only with tested zero-to-working journeys.

Do not create additional permanent implementation diaries.

Finally, delete this plan file.

---

# 7. Explicit non-goals

Do **not** add:

- a generic `ConfigurationService` merely for layering;
- a generic `SetupService`;
- a universal `OperationDefinition` framework;
- a command bus;
- a second semantic registry;
- a second workflow/product graph;
- a second config database;
- a DI framework;
- an event bus for shell commands;
- a setup state database;
- another Actor/model router;
- full MCP exposure of shell conveniences;
- speculative SkillManager caching;
- a standalone npm/publication project;
- broad ecosystem modernization;
- TypeScript-version homogenization;
- a shell menu application.

Classes/functions/data structures are acceptable when they are the smallest implementation of a demonstrated need. Names in this plan are conceptual unless already present in the codebase.

---

# 8. Stop conditions

Stop and correct course if implementation begins to show any of these:

- a new abstraction exists alongside old duplicated paths instead of replacing them;
- config UI knows precedence rules;
- shell renderer performs business mutations directly;
- CLI and shell produce different domain outcomes;
- plain/non-TTY mode opens a prompt;
- setup reports success without verifying a detected host write;
- a malformed config is silently interpreted as “use defaults” during mutation;
- provider-construction failure is labeled “provider absent”;
- shell work causes a model-routing redesign;
- a second registry/state store appears;
- the patch grows substantially while old machinery remains;
- an agent creates duplicate Tickets instead of repairing/reusing existing work;
- a branch survives after its verified purpose is complete.

---

# 9. Definition of done

This initiative is complete only when all of the following are true:

- configuration provenance is correct and resettable;
- secrets are not ordinary project config/output;
- setup is inspectable, idempotent and truthful;
- runtime/provider failures are diagnosed accurately;
- config and setup prove one shared shell/CLI semantic path;
- the proven pattern covers the high-value daily shell workflows;
- explicit commands remain faster than interactive facilitation;
- noninteractive CLI remains deterministic and scriptable;
- shell-ui owns presentation rather than AIWF duplicating it;
- meaningful duplicated code in `src/shell.ts` / `src/cli.ts` is gone;
- no new shadow subsystem was introduced;
- real acceptance journeys pass;
- full repository gates pass;
- durable docs describe only implemented behavior;
- temporary branches are merged/deleted;
- this plan file is deleted.

The success metric is not “new shell features”. It is **a simpler AIWF that is easier to operate correctly**.
