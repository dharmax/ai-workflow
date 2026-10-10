# Operating AIWF

This is the practical companion to the architecture. It describes how humans and coding agents should use AIWF without bypassing its state, duplicating its workflow, or turning investigation into an endless repository scan.

## 1. Default workflow

For an existing Ticket, start high-level:

```bash
aiwf investigate TKT-ID
aiwf prepare TKT-ID --critic auto
aiwf resolve TKT-ID --completeness production --critic auto
```

Usually, prefer `resolve` directly and let AIWF investigate/prepare internally. Use the separate stages when you deliberately want to inspect evidence or stop before mutation.

For accepted higher-level intent:

```bash
aiwf process epic EPIC-ID --completeness production --depth 1 --max-artifacts 24
```

Do not manually reproduce these lifecycles with a sequence of primitive calls unless a concrete blocker requires drill-down.

## 2. Before changing code

Use AIWF state first.

A good execution assessment is short:

```text
work item
current phase
exact slice
likely targets
verification gate
```

Then act.

Check existing Tickets, dependencies, Decisions, Aspects and exact source/test anchors before inventing work. Reuse existing entities. Expired leases are execution metadata, not reasons to duplicate Tickets.

Use graph/index/codelet/language tools to narrow context before reading large files or scanning the repository.

## 3. Drill-down

The CLI exposes exact tools for cases where the high-level operation needs help:

```bash
aiwf symbol NAME -e
aiwf slice src/file.ts symbolName
aiwf outline src/file.ts
aiwf callers symbolName
aiwf deps src/file.ts
aiwf blast src/file.ts
aiwf graph QUERY
aiwf debug TARGET
```

The principle is **narrow first**. A full repository scan should have a concrete reason.

`debug` is diagnostic drill-down, not a second Ticket-resolution lifecycle.

## 4. Changes

Preview/apply machinery is the canonical mutation path. Prefer exact deterministic operations whenever the desired transformation is known.

Examples include symbol replacement/rename, exact text replacement, file creation/rename, language refactors/quick fixes and Product Intent graph changes.

An `apply_change` operation can mutate either code or product/graph state depending on its action. A `product_change` with no files touched is legitimate graph bookkeeping; a source mutation should report the affected files.

Generated source follows the same change path. Synthesis does not gain privileged write access.

Do not overwrite dirty target files without explicit authorization.

## 5. Skills and knowledge

Project skills live under the project's `skills/` layout and are handled by `@dharmax/skill-manager`. Additional repositories must be configured explicitly.

CLI knowledge lookup, Actor discovery and runtime skill access should converge on the canonical registry/SkillManager path rather than maintaining separate lookup behavior.

Useful commands:

```bash
aiwf kb list
aiwf kb search "query"
aiwf kb show ITEM-ID
aiwf kb sync
```

Absence of an optional skill source is normal. Sync, parsing, activation or execution failures are not “no result”; surface them.

## 6. Cognitive execution

For free-form work:

```bash
aiwf exec "explain the critical path and missing work"
```

or use the interactive shell.

Natural-language execution uses bounded semantic capability discovery. It should not dump the entire internal registry into the model context. System-1 may advise classification/tactics; the Actor must remain able to recover when that advice is weak or unavailable.

If a request needs a reasoning model, use configured task routing. Do not hard-code provider strategy into feature logic.

When a model probe fails because the probe itself assumed the wrong API shape, fix the probe—not the runtime. Treat observations as evidence, not invitations for adjacent refactors.

## 7. Traces

Execution traces exist to answer concrete questions:

- what capability was discovered;
- what tools were actually exposed;
- what calls ran;
- what observations came back;
- which model/route actually executed;
- where time or steps were spent;
- why execution stopped.

Use traces to find the **earliest evidenced defect**. A later timeout or malformed final answer may be downstream of an earlier wrong evidence choice.

Do not persist one-off trace narratives as permanent design documents. Durable conclusions belong in code, tests, AIWF state or the small architecture documentation.

## 8. Testing

During implementation:

1. run the narrowest realistic affected tests;
2. fix the root cause, not the assertion;
3. run the broader relevant suite;
4. run repository gates.

Current standard gates are:

```bash
bun test
bun run typecheck
bun run pack
git diff --check
```

Never weaken a test merely to accept the implementation.

For model/Actor behavior, distinguish:

- deterministic unit/integration tests;
- opt-in live configured acceptance.

Live acceptance should verify actual tool observations and external effects, not final narration such as “I used skill X”.

## 9. Verification and blockers

A task is complete only when implementation, relevant tests, architectural consistency, AIWF state and Git state agree.

`needs_input` means a material human/product decision or required information is missing.

`blocked` means AIWF has a concrete execution/evidence blocker it cannot safely resolve within bounds.

Neither should be converted into speculative implementation.

When independent verification is required, it must use current evidence. Obsolete verification receipts must not substitute for current code and authored assertions.

## 10. Git discipline

Keep branches temporary and purposeful. Merge and delete them at the first stable verified opportunity; use a tag for exceptional rollback landmarks rather than accumulating dead branches.

Do not commit generated execution diaries or temporary acceptance traces as permanent documentation.

AIWF itself does not automatically commit engineering work.

## 11. External coding agents

An external agent using AIWF should:

1. inspect AIWF state;
2. delegate the existing artifact operation;
3. use primitives only for a concrete gap;
4. keep AIWF state synchronized with real work;
5. verify before claiming completion.

The operational contract for agents is `skills/ai-workflow/SKILL.md`. If that contract and this document disagree about a live tool schema, the implemented schema/help and current AIWF state win; fix the stale documentation rather than inventing compatibility behavior.

## 12. Failure patterns to stop early

Stop and correct course when an agent:

- repeatedly rediscovers the same state;
- performs broad scans despite exact graph/index tools;
- creates duplicate Tickets because a lease expired;
- treats a failed exploratory command as a new architectural problem;
- adds compatibility layers for APIs the project does not need;
- silently catches runtime failures;
- creates a new branch/file/abstraction to look organized rather than solve the task;
- reports tests without exercising the production path;
- continues to the next Ticket after being asked for a bounded repair.

AIWF is supposed to reduce uncertainty and work. If using it creates process theater, the workflow is being used incorrectly.

## 13. Shell configuration and setup

Use complete commands for the fastest deterministic path:

```sh
aiwf setup --check                 # inspect only; no writes or prompts
aiwf setup                         # provision runtimes, install CLI, configure detected hosts
aiwf setup --mcp                   # runtimes and detected MCP hosts
aiwf config get                    # effective values with provenance; no credentials
aiwf config set model X --global
aiwf config set model Y            # explicit project override
aiwf config reset model            # remove project override and reveal X
aiwf config reset model --global   # remove global override
aiwf model set dev ollama/qwen2.5-coder:7b
aiwf claim TKT-42 --agent operator --minutes 30
aiwf release TKT-42
aiwf move TKT-42 "In Progress"
aiwf ticket TKT-42
```

Config settings use their declared string, boolean, number or JSON-object type. `config get` lists supported setting IDs. Unknown settings and credential settings are rejected. Global writes preserve unrelated credential/provider structures; project writes never copy inherited defaults or global values. Legacy global `providers.ollama.host` and `plannerModel` remain readable, and an explicit top-level update/reset removes the corresponding legacy alias.

Setup reports each step as satisfied, needed, changed, skipped or failed. `--check` exits nonzero for detected failures and performs no mutation. Applying setup also exits nonzero when a required step fails. Existing host files are backed up once as `.bak`; repeated unchanged setup preserves file contents and modification times. An absent host is skipped. Repair a malformed detected JSON/TOML file before retrying; setup preserves its original contents.

Launch `aiwf` or `aiwf shell` for the interactive shell. `claim`, `release`, `move`, entity inspection and artifact operations can facilitate missing identifiers using bounded graph choices. `config set` can facilitate a missing setting/value. Config/model/entity inspection uses shell-ui views when available. Interactive setup reviews needed changes before application; cancellation changes nothing. `setup --check` remains noninteractive even inside the shell.

Plain shell sessions and ordinary CLI calls never prompt. Claim accepts both `--agent`/`--minutes` and the shell's positional agent/minutes syntax. The configured default agent and lease duration apply consistently. Complete commands skip elicitation. Model/provider inspection describes configuration, not proven reachability; doctor separately probes local Ollama and reports construction failures.
