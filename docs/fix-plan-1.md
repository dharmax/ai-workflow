# Fix plan 1 — superseded by Agency Restoration

Status: **superseded as implementation authority**.

The earlier plan correctly identified several execution-contract defects, but it still framed the problem too narrowly as “dependable composition around semantic discovery”. Repeated live failures proved the deeper architectural error: discovery had become a prerequisite for cognition.

Current authority:

1. `docs/agency-constitution.md`
2. `docs/agency-restoration-plan.md`
3. J2.4 in `docs/use-story-catalog.md`

Retain these concrete findings from the earlier investigation:

- `run_command` exists but is not guaranteed in the initial Actor surface;
- `run_command` needs cancellation propagation and explicit truncation/failure truth;
- `script_eval` exposes the global registry and must not be a default bootstrap primitive;
- codelet facilities exist but can themselves become unreachable behind discovery;
- multi-call trace/event truth must be preserved;
- public MCP and local Actor capability boundaries are separate;
- no query-specific ordinal/ranking/critical-path handlers are acceptable;
- real live actor journeys, not mocked tool-selection tests, are the acceptance boundary.

The correction is now broader and simpler:

> Start the existing Actor with discovery-independent universal competence, move specialization inside goal pursuit, preserve grounding, and prove adversarially that discovery can fail or disappear without making AIWF stupid.
