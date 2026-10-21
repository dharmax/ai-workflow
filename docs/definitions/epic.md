# Epic

**Status:** Developer-agreed scope; composition details remain explicitly unresolved.

An **organizational parent relating User/Actor Stories**. An Epic may define context and expectations **common to the USs under it**, avoiding needless repetition while preserving each US's own concrete episode.

The common material an Epic may provide is:

- [Initial State](initial-state.md);
- **part of** [Expected Result](expected-result.md);
- [Domains](domains.md), as organizational tags;
- [Comments](comments.md), as a list.

When reading or deriving tests from a US, consider the relevant common Epic material together with its US-specific definition. The Epic does not replace the US's Actor, Intent or Action.

**Do not invent:** exactly-one-Epic cardinality, multiple-Epic precedence, overwrite/override behavior, mechanical merge semantics or automatic copying. Those were discussed as possible design choices, **not decided**. If common and local definitions appear contradictory, surface the contradiction for developer resolution rather than choosing silently.

An Epic is not a substitute for the concrete US or a license to infer unwritten product behavior.
