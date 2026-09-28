# Phase 1 — Deterministic Foundation

## Objective

Build the non-AI shell of digest: request model, source scanning, hashes, provenance state and preview structures.

## Work

1. Add a small `src/digest/` module owned by ai-workflow.
2. Define:
   - `DigestRequest`
   - `DigestSource`
   - `DigestCandidate`
   - `DigestChangeSet`
   - conflict/result types.
3. Implement deterministic source discovery for Markdown/text.
4. Normalize project-relative paths.
5. Hash files and produce heading/line-aware slices.
6. Add helpers to find the previous digest Artifact for the same source root.
7. Determine new/changed/unchanged/removed files from prior hashes.
8. Implement deterministic rendering of a ChangeSet preview.
9. Tests cover path safety, exclusions, stable ordering, hashing and changed-file detection.

## Constraints

- No LLM calls.
- No graph mutation except optional test-only fixtures.
- No new ontology entities.
- No generic ingestion framework.

## Gate

Given a folder, Phase 1 can say exactly which semantic inputs require work and can render an empty/mock ChangeSet deterministically.
