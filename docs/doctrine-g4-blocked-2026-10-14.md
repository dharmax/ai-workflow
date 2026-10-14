# Doctrine Gate 4 — circuit-breaker stop, 2026-10-14

Ticket: `TKT-DOCTRINE-G4-REFS-SURFACE`. Master remains
`56fb827a623829efa406d71f96315eb6b0108577`.
[Machine-readable failure, attempted patch and exact diagnostics](doctrine-g4-blocked-2026-10-14.json).

Gate 4 is **Blocked**, not implemented or independently accepted. Gate 5 is untouched.
The existing plan and Ticket acceptance criteria were not changed.

## Observed stop

One native Ticket.resolve attempt used the configured
`openrouter/openai/gpt-4o-mini` producer in a fresh Fish shell without the stale
inherited key. It had a 120,000-token budget, zero repairs and a 240-second
timeout. Seven successful remote calls used 87,548 tokens. After two guarded
edits the next provider-call reservation exceeded the remaining budget:
estimated input 38,428; reservation 40,476; remaining 32,452. Native resolution
returned blocked_implementation. No retry, model substitution or budget increase followed.

The Actor added imports for nonexistent resolvePinnedReferences and
executeAtomicBatch exports and invoked the nonexistent batch function from
CLI sync. That broke startup without implementing either capability.
The exact attempted patch is retained in the JSON evidence and
/tmp/g4-native-attempt.patch.

A bounded recovery claim and native AIWF preview/fingerprint/apply reversed
only those two edits. CLI source is byte-for-byte equal to master afterward;
startup works and all four CLI help regression tests pass. No Gate 4 source
implementation remains.

## Baseline and preservation

- Complete baseline suite: 426 passed, 3 skipped, zero failures.
- Packaging baseline: passed, build 863.
- Typecheck before and after recovery: exactly the same 19 primary diagnostic
  headers in 10 files, zero introduced diagnostics. Both sets are recorded.
- Consistent canonical DB backup: /tmp/g4-preflight/graph-before.db.
- Preservation checksums: /tmp/g4-preflight/preserved-hashes.json.
- Gate 2/3 exact receipt bodies remain unchanged and both Tickets remain Done.
- No Gate 4 acceptance receipt exists. No independent acceptance was reached.
- Unrelated projection edits, bug_report.txt, recovery JSON files and existing
  database backups are preserved.

The existing RuleStore.saveRule uses asynchronous WorkflowStore.upsertEntity;
WorkflowStore.transaction is a synchronous SQLite wrapper. This does not prove
atomic async Rule imports. The required Semantika-native batch operation,
failure injection and fresh-instance contract remain unimplemented. No unsafe
async transaction wrapper or alternative Rule store was introduced.

## Remaining canonical scope

All three authored criteria remain outstanding: pinned Git reference resolution
with honest inventory/sampling; governed atomic import/export with rollback
proof; shared CLI/MCP/shell-ui Rule management. Reference snapshots must also
reach existing Gate 3 independent verification without weakening its boundary.

Any future attempt must start from the unchanged canonical scope, inspect the
actual existing owners and bound source context before implementation. This
report is failure evidence, not a completion receipt. No implementation commit
or push was made because independent acceptance did not succeed.
