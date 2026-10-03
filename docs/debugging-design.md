# Debugging Design

**Status:** draft architecture for AIWF bug reporting, investigation, remediation handoff, and optional fixing.

## Purpose

AIWF debugging is not a patch finder.

Its job is to turn a messy symptom into a truthful, durable bug report, investigate it far enough to identify the violated invariant or responsibility that causally explains the defect, and derive ordinary engineering work whose completion restores that invariant.

Fixing itself remains ordinary Ticket resolution.

Core flow:

```text
messy symptom
  -> canonical Bug
  -> evidence-driven causal investigation
  -> violated invariant / root cause
  -> elegant ordinary engineering work
  -> Ticket.resolve()
  -> verify the original defect
```

## Artifact semantics

A bug is represented by a normal Ticket in the `Bug` Kanban lane. There is no Bug entity and no duplicate `kind: bug` field.

The intended board is:

```text
Bug | Backlog | Todo | In Progress | Done | Blocked
```

The Bug lane contains unresolved defect reports/investigations. Remediation work uses the ordinary workflow.

Priority should be a general actionable-artifact property. For bugs, optional severity is also useful:

```ts
severity?: 'low' | 'medium' | 'high' | 'critical'
```

- severity = product/system impact if the defect occurs
- priority = urgency/order of work

They must remain independent.

The current title/ID heuristics for recognizing bugs must disappear.

## Public interface

```bash
aiwf debug "<problem>"
aiwf debug --command "bun test ..."
cat error.log | aiwf debug

aiwf debug BUG-123

aiwf debug "<problem>" --fix
aiwf debug BUG-123 --fix

aiwf fix "<problem>"
aiwf fix BUG-123
```

`fix` is exactly an alias for `debug --fix`. There is one semantic debugging capability, not two engines.

The current low-level `debug_target` capability should become an internal investigation primitive and preferably be surfaced as:

```bash
aiwf inspect <symbol|file:line|stack>
```

Vocabulary:

- inspect = examine technical evidence or a code target
- debug = report/reuse bug, investigate it, derive remediation work
- fix = debug plus execute remediation and verify the original bug

## Intake

### Normalize evidence

Raw input may be a user description, output/stderr, stack trace, failing command, or an existing Bug ticket.

Separate what is actually known:

- observed behavior
- expected behavior, when inferable
- error/output/stack
- explicit reproduction
- environment/context
- direct evidence vs user/model inference

Do not turn guesses into facts.

### Correlate before creating

Before creating a new Bug, search existing open bugs using progressively more expensive evidence:

1. exact failure/reproduction signatures
2. common tests/files/symbols
3. semantic similarity
4. bounded reasoning over best candidates

Reuse only when equivalence is sufficiently supported. False merges are worse than duplicates.

### Create early

Once the report plausibly represents a project defect, create/reuse the Bug before deep investigation. The Bug is the durable investigation artifact; no DebugSession entity is needed.

A bug report may remain incomplete while investigation proceeds.

## Investigation objective

Investigation does not seek the nearest editable line. It seeks the causal explanation that identifies the violated design invariant or responsibility.

The progression is:

```text
symptom
  -> reliable observation
  -> affected mechanism
  -> proximate cause
  -> causal hypotheses
  -> discriminating evidence
  -> root cause / violated invariant
  -> remediation direction
```

Example:

```text
symptom:
  task remains RUNNING

proximate cause:
  completion branch does not persist terminal state

root cause:
  multiple execution paths independently own lifecycle transitions

violated invariant:
  exactly one component owns task-state transitions
```

A patch to the completion branch may suppress the symptom while leaving the defect intact. AIWF must prefer restoring the invariant.

## Investigation state

Maintain a typed working result approximately like:

```ts
interface BugInvestigation {
  observation: string
  expected?: string

  evidence: Evidence[]
  reproduction?: Reproduction

  affectedScope: Target[]
  hypotheses: Hypothesis[]

  mechanism?: string
  proximateCause?: string

  rootCause?: string
  violatedInvariant?: string

  verificationOracle?: VerificationOracle
  remediationDirection?: string

  severity?: Severity
}
```

This is an operation contract, not necessarily persistent ontology field-for-field.

Persist durable conclusions in the Bug body and useful semantic relations/evidence. Promote fields into the ontology only when querying or automation proves that structure useful.

## Investigation algorithm

Investigation is a bounded hypothesis/refutation loop, not an unconstrained Actor wandering through tools.

Each iteration asks:

1. What important uncertainty currently prevents an actionable diagnosis?
2. Which causal hypotheses remain plausible?
3. What evidence would discriminate between them?
4. What is the cheapest safe observation that meaningfully reduces that uncertainty?

Then execute one bounded probe and update the investigation state.

Available probes should mostly reuse existing AIWF capabilities:

- exact symbol/source inspection
- semantic/code search
- graph neighborhood, callers, dependencies and blast radius
- existing tests
- focused safe commands
- stack/error/output analysis
- git diff/history/blame when relevant
- related Tickets, Decisions, Aspects and Product Intent
- System-1 for cheap classification/triage
- bounded reasoning for causal interpretation
- Actor-style execution only when tool sequencing genuinely requires it

Evidence ordering should generally be:

```text
deterministic evidence
  -> cheap inspection/search
  -> safe focused experiment
  -> System-1 classification/triage
  -> bounded reasoning
  -> Actor only when necessary
```

Reproduction is not ritual. A deterministic failing test may already be sufficient evidence; destructive, expensive, or externally consequential failures should not be replayed merely for ceremony.

## Root-cause discipline

AIWF must explicitly distinguish:

- symptom
- proximate cause
- root cause
- violated invariant/responsibility

Before accepting a root cause, actively try to falsify it:

- Does it explain all important evidence?
- What evidence would contradict it?
- Are there sibling manifestations predicted by it?
- Is this merely where the failure becomes visible?
- Why was the system able to enter this invalid state?
- Would the obvious local patch leave the same underlying defect possible elsewhere?

The last two questions are especially important under the project's prime directive.

### Stopping criterion

Root-cause investigation is sufficiently deep when:

1. the explanation accounts for the observed defect;
2. important competing explanations have been eliminated or materially weakened;
3. evidence identifies the violated responsibility/invariant;
4. the proposed remediation follows naturally from restoring that invariant;
5. there is no concrete reason to believe the remedy merely suppresses this manifestation.

This avoids both shallow patching and endless archaeology.

## Prime-directive review gate

Before remediation work is emitted, independently challenge the diagnosis and proposed remedy.

A structured review may resemble:

```ts
{
  causalExplanationSupported: boolean
  violatedInvariantSupported: boolean
  remediationRestoresInvariant: boolean

  symptomPatchRisk: 'none' | 'possible' | 'likely'

  missingEvidence: string[]
}
```

If the review indicates a likely symptom patch, investigation continues.

The review should explicitly consider whether the correct repair is a small refactor or reengineering step that restores ownership, abstraction, lifecycle or data-model integrity, rather than a local conditional patch.

There is no separate "refactoring mode". Refactoring is simply the correct remediation when the root cause demands it.

## Investigation outcomes

A truthful investigation may end as:

- actionable: remediation Ticket(s) created
- needs_input: specific missing human information
- blocked: investigation cannot proceed with available capability
- not_bug: expected behavior/configuration/environment/external issue; close as rejected with evidence
- duplicate: canonical Bug identified and reused/linked

Root cause is not required before the Bug may exist. It is required only as far as necessary to derive trustworthy, prime-directive-compliant remediation.

## Remediation handoff

When the investigation is actionable, create ordinary Ticket(s). Prefer one atomic remediation Ticket unless independently verifiable work genuinely justifies decomposition.

Conceptually:

```text
Bug
  -> contains -> remediation Ticket
  -> contains -> additional Ticket only when independently useful
```

Each remediation Ticket should receive the useful contract established by debugging:

- problem context
- root cause
- violated invariant
- relevant evidence and targets
- required engineering direction
- acceptance criteria
- verification oracle

From that point, normal `Ticket.resolve()` owns engineering execution. Debugging must not introduce another repair engine.

## --fix / fix

`debug --fix` performs the exact same reporting and investigation path and then resolves the generated/reused remediation work through ordinary Ticket resolution.

After remediation Tickets pass, the Bug itself still owns final verification.

The original reproduction or verification oracle must pass, and the investigation's architectural invariant should be demonstrably restored where applicable.

A green remediation Ticket is not by itself sufficient to close the Bug.

Only then is the Bug moved to Done/verified.

## Claims and Kanban behavior

Bug investigation may lease/claim a Bug without moving it out of the Bug lane. The existing store already supports claiming without automatic move-to-In-Progress behavior.

Remediation Tickets use the normal lifecycle:

```text
Todo -> In Progress -> Done
```

The Bug lane therefore remains semantically honest: unresolved defects, not generic work in progress.

## Minimal architecture

Prefer a very small implementation surface:

```text
Ticket.reportBug(...)   // correlate/create intake
Ticket.debug(...)       // investigate existing Bug
Ticket.resolve(...)     // existing remediation executor

debug CLI/MCP           // report/reuse -> debug
debug --fix             // above -> resolve remediation -> verify bug
fix                     // alias only
inspect                 // low-level target/evidence inspection
```

Supporting additions:

- Bug lane semantics
- common actionable-artifact priority cleanup
- optional bug severity
- BugInvestigation/result schemas
- bounded hypothesis/refutation loop
- root-cause/remediation Critic contract
- MCP/SKILL exposure matching other high-level artifact operations

Do not introduce:

- Bug entity
- DebuggerService
- BugManager
- DebugSession
- RepairEngine
- RootCauseManager
- special Fix entity
- second agent framework

## Architectural invariant

The central rule is:

> Debugging does not search for a patch. It searches for the violated invariant that best explains the evidence. The fix is the smallest elegant engineering change that restores that invariant.

That is what makes debugging compatible with AIWF's prime directive rather than merely automating conventional patch-oriented agent behavior.
