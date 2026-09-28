# Phase 5 — Acceptance and Review

## Objective

Prove the feature is trustworthy before using it as substrate for refactoring.

## Automated acceptance

Cover:

- deterministic scanning;
- changed-file selection;
- extraction validation;
- stable identity;
- duplicate reconciliation;
- provenance;
- source rename/heading edit behavior;
- removed-source retirement;
- human-state preservation;
- code-target resolution;
- unresolved ambiguity;
- transaction failure/no partial apply;
- projection sync;
- CLI/MCP parity.

## Real acceptance

Run digest on a real ai-workflow design/planning folder.

Review manually:

1. Did it identify the actual epics rather than headings?
2. Are tickets executable and sensibly scoped?
3. Did it avoid duplicates across overlapping documents?
4. Are dependencies useful?
5. Are decisions distinguished from ideas?
6. Are code targets correct?
7. Does every non-obvious graph fact have inspectable provenance?
8. Can one changed document be re-digested cheaply?
9. Did it preserve existing human workflow state?
10. Would an AI coding agent now need materially less folder-reading/context to execute the plan?

## Performance evidence

Record:

- number of source files;
- number reused without LLM;
- changed files interpreted;
- model calls;
- approximate input/output tokens;
- graph operations;
- wall-clock time.

The purpose is not an arbitrary benchmark. It is to verify that incremental graph-backed digestion is actually cheaper than rereading the planning corpus.

## File-by-file review

Before further work, review every new digest source file for:

- one responsibility;
- minimal methods;
- no duplicate graph/store abstractions;
- no hidden state machine;
- no generic framework invented for one feature;
- deterministic operations implemented as code;
- semantic uncertainty isolated to explicit LLM calls.

## Stop condition

After Phase 5, stop.

The next design step is graph-native refactoring primitives consuming digest output and the existing AST graph. Do not implement that during the digest feature unless explicitly approved after review.
