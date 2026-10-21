# Epic

**Status:** Developer-agreed definition; one optional relationship rule remains under discussion.

An **organizational parent relating User/Actor Stories**. An Epic may define context and expectations **common to the USs under it**, avoiding needless repetition while preserving each US's own concrete episode.

## Relationships

- A US has **at most one designated primary Epic** (one, when assigned). It may have other graph relationships to other Epics, but those are **not additional parents for common-definition inheritance**. Whether a US may temporarily have no primary Epic remains open, pending the mandatory/default-Epic decision.
- **Open proposal, not approved:** make the primary Epic relationship mandatory and assign a simple `Default` Epic when the developer has not supplied one yet. Do not implement either the mandatory requirement or automatic assignment until the developer decides.

The common material a primary Epic may provide is:

- [Initial State](initial-state.md);
- **part of** [Expected Result](expected-result.md);
- [Domains](domains.md), as organizational tags;
- [Comments](comments.md), as a list.

When reading or deriving tests from a US, consider the relevant common primary-Epic material together with the US's own definition. The Epic does not replace the US's Actor, Intent or Action.

**Still undecided:** the exact mechanism for composing common and local Initial State / Expected Result, including handling an apparent conflict. Surface contradictions for developer resolution; do not assume mechanical overwrite or a generic inheritance engine.

An Epic is not a substitute for the concrete US or a license to infer unwritten product behavior.
