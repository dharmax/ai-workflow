# Codex execution brief — toplevel1

Branch: `toplevel1`

Status: implementation handoff. **Start with Phase A only and stop for review before Phase B.**

Authoritative design sources, in order:

1. `docs/toplevel1-plan.md`
2. `docs/top-level-product-intent.md`
3. `docs/use-story-catalog.md`
4. `docs/fix-plan-1.md`
5. `docs/product-intent-graph.md`
6. `skills/ai-workflow/SKILL.md`
7. `skills/ai-workflow/AGENTS.md`

Do not replace these with generic Jira/user-story conventions.

## Prime directive for this work

Development starts from actor journeys, not capability lists.

A Story is a temporal actor episode with a beginning situation/intention, progression through the product, and useful observable end state. Capabilities, APIs, architecture, Tickets and tests are derived from journeys.

Technical maintenance that does not change meaningful actor behavior may remain direct Ticket work. Do not manufacture Goals/Flows/Stories for ceremony.

## Product semantic model

```text
actor reality / observations / motivations
                  │
                Idea
                  │ inspires
                  ▼
                Goal
                  │ inspires
                  ▼
              Concept
                  │ governs
                  ▼
                Flow ──serves──> Goal
                  │ contains
                  ▼
             UserStory
                  ▲
                  │ enables
               Feature
                  ▲
                  │ implements
               Ticket
                  │
              Code / Tests
```

This is many-to-many semantic lineage, not a rigid hierarchy.

Canonical Story semantics:

```text
Flow    --contains--> UserStory
Feature --enables---> UserStory
```

Legacy `Feature --contains--> UserStory` is compatibility only. Do not author new state that way.

Epic is orthogonal temporary work scope:

```text
Epic --targets--> Goal | Concept | Flow | UserStory | Feature
Epic --contains--> Ticket
```

## Execution philosophy

The local Actor should eventually have:

- a tiny dependable basic substrate from the first step;
- small specialized tools selected/discovered semantically;
- bounded later `discover_tools` additions.

Semantic discovery is specialization, not the sole gateway to competence.

Likely baseline hypothesis:

```text
discover_tools
+ one truthful general executor, probably run_command
```

This is not yet an API decision. Prove it from J2.4.

Do not:
- expose the full registry;
- make `script_eval` baseline while it can reach the global registry;
- add query-specific ranking/ordinal handlers;
- add a second execution engine;
- add a ProductDesignManager/planner/requirements DB;
- persist model-generated relevance/severity scores.

## Branch discipline

Work only on `toplevel1`. Do not create another branch.

Once Phase A is green and the branch is reduced to a justified stable state, report that it is ready to merge to `master`. Do not merge it yourself unless explicitly instructed.

After the later implementation phases reach a stable accepted state, the intended repository state is again `master` only; temporary branches should be deleted promptly.

## PHASE A — required first task

The current top-level implementation is exploratory/provisional. Before adding further functionality, establish whether it is mechanically healthy and shrink it to the smallest journey-justified delta.

### A1. Establish baseline

Run:

```sh
git status
git branch --show-current
git log --oneline --decorate -15

bun run typecheck
bun test --concurrency=1
```

If the repository defines a more canonical full-test command, use it in addition, not instead.

Do not repair failures blindly. First classify each failure as:
- inherited from current master;
- introduced by toplevel1;
- environment/provider-only.

### A2. Audit the entire master...toplevel1 diff

For every changed implementation/test file, classify the change:

```text
file / logical change | supporting actor journey | why needed | KEEP / COMPAT / REMOVE
```

Use the named journeys in `docs/use-story-catalog.md`, especially:
- J1.1, J1.2, J1.3;
- J2.1, J2.3, J2.4;
- J3.1;
- J4.1;
- J5.1;
- J6.1.

Rules:
- **KEEP** only when a concrete journey currently requires the behavior.
- **COMPAT** only when needed to read/preserve old project state without making it canonical.
- **REMOVE** when speculative, broad, duplicate, ceremony, or not needed by a journey.

Pay special attention to whether these broad changes are actually required:
- Aspect inheritance changes;
- completeness-policy changes;
- broad coverage/impact changes;
- projection rewrites;
- public MCP expansion;
- migration behavior beyond legacy read compatibility.

Do not preserve a change merely because tests already exist for it. Tests are downstream of the journey.

### A3. Shrink before extending

Remove REMOVE-classified changes and simplify COMPAT behavior.

Target shape:
- Goal / Concept / Flow DCR entities;
- minimal predicates/validation;
- minimal Product mutation/read support;
- Story-first authoring;
- bounded upstream Product Intent context where an existing journey requires it;
- real journey acceptance tests;
- legacy Feature→Story containment read compatibility only.

Prefer deleting code over introducing adapters/managers.

Do not begin TKT-8D3F execution-substrate implementation in Phase A.

### A4. Verify again

Run focused tests for changed areas, then:

```sh
bun run typecheck
bun test --concurrency=1
```

Run no sibling repository suite unless Phase A changed sibling source.

### A5. Stop and report

Stop before Phase B.

Return a compact report containing:

1. baseline test/typecheck result;
2. KEEP / COMPAT / REMOVE audit;
3. exact code removed/simplified;
4. final focused/full verification;
5. remaining known risks;
6. whether `toplevel1` is now safe to merge to `master`.

Do not claim product acceptance from component tests. Phase A only proves a clean minimal baseline.

## Later phases — do not execute yet

After human review:

### Phase B — J2.4 / TKT-8D3F
Use `docs/fix-plan-1.md`: audit execution contract, harden the smallest baseline primitive, expose it independently of discovery, make composition observable, then prove the exact live compound requests.

### Phase C — top-level Product Intent
Prove J1.1/J1.2/J1.3 through real proposal/review/apply behavior.

### Phase D — upward reasoning
Use Goal/Concept/Flow/Story context in investigation/review and prove semantic-conflict detection.

### Phase E — recommendation + MCP parity
Keep deterministic candidate eligibility authoritative; use semantic product meaning only as bounded evidence for ranking/explanation.

### Phase F — dogfood
Model AIWF itself and run the mandatory live journeys.

## Quality bar

The expected outcome is a **small mechanical implementation of a large conceptual improvement**.

If the solution grows another orchestration layer, registry, planner, policy system, workflow DB, or large generic abstraction, stop and reconsider.

A green component suite is necessary but insufficient. Real actor journeys are the acceptance boundary.
