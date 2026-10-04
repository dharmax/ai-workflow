# Consuela dogfood follow-up — 2026-10-03

This records AIWF infrastructure verification and read-only live evidence. It
does not prove that the ecosystem tickets are implemented.

## Recorded failures

The saved ai-cli run at revision a288f49c424abb2dbcb34772ce9cc44869877607 used
`ollama/qwen2.5-coder:7b-instruct-q4_K_M` on `http://lotus:11434`:

- Epic proposal: one call failed at 60,002 ms.
- TKT-CS-ALIGN-01: 16 model responses, 15 source reads, zero successful edits.

A read-only replay of the actual current Ticket dossier reproduced a 16-step loop
with `file_path` instead of the registered `filePath` and invented target paths.
The implementation Actor system prompt was 64,230 characters. Ollama's loaded
context capacity was 4,096 tokens; llm-utils sent no `num_ctx` option. Saved
original aggregate counts were only 2,050 prompt tokens per call.

## Changes

- llm-utils adds `ProviderConfig.contextWindow`, passed by the existing Ollama
  adapter as `options.num_ctx`. Its existing `maxTokens` is now honored as
  `num_predict`. Omitted settings retain the previous adapter defaults.
- AIWF requests 32,768 context tokens, configurable as `ollamaContextWindow`.
- The implementation Actor receives only code/file ChangeRequest schemas;
  public preview/apply tools still accept Product changes. Shared target schema
  references avoid repeating the same target definition in every action.
- The Actor receives the actual workspace root and a bounded graph-derived file
  index. The current Ticket contract is explicit, and previews are identified as
  read-only until an identical fingerprinted apply succeeds.
- A missing symbol slice (`code: null`) becomes an implementation tool error with
  grounded outline/read alternatives. The public primitive contract is preserved.
- Empty symbol matches and blocked previews also enter the existing Actor recovery
  path. Replacement fields explain unique existing anchors and show JSON insertion.
- Terminal Actor failures include the last three tool observations without source
  contents. No generic retry system, patch engine or persisted resume state was
  introduced. The 16-step/three-tranche bound and dirty-file guards remain.
- Actor preview observations explicitly say `applied: false` and supply the exact
  next fingerprinted apply call, instead of repeating the full internal mutation
  plan. The public preview result and mutation engine are unchanged. Actor thoughts
  are requested to stay short, with code confined to tool arguments.

## Verification and limitations

- AIWF: `bun run typecheck` passed; `bun test` passed 192 tests across 31 files,
  with 1,394 assertions after the final observation/schema corrections.
- llm-utils: `bun run typecheck` passed; `bun test` passed 104 tests, skipped the six
  explicitly gated live tests, and failed none.
- New transport regressions exercise real Asker/Actor/Ollama request paths using
  deterministic HTTP fixtures. They check context capacity, schema references,
  the forbidden Product surface, relative file grounding and successful edits.
- The exact read-only Qwen Epic proposal now passes the schema and returns all six
  existing Ticket IDs and criteria. This also passed with the original 2,048-token
  output limit and unchanged 60-second timeout. Critic acceptance and mutation
  were deliberately not run; this is proposal proof only.
- The initial grounded Qwen Ticket replays made no apply request and exhausted 16
  steps. Larger context alone did not fix the Actor's repeated discovery.
- User approved a same-dossier read-only comparison using local `gemma4:e4b`.
  Its cold and warm results are recorded below.

No ai-cli source files were edited. These infrastructure fixes must not be used to
claim TKT-CS-ALIGN-01 or the ecosystem Epic complete.

## Evidence

- `consuela-followup-observations.jsonl`: tool arguments and observations from the
  baseline and controlled read-only attempts, including failed attempts.
- `consuela-grounded-transport.jsonl` and `consuela-final-transport.jsonl`: actual
  prompt sizes, token counts and finish reasons for corrected Qwen transport.
- `consuela-epic-proposal.json`: schema-valid current proposal on the same model.

## Approved Gemma comparison

`gemma4:e4b` hit the 60-second timeout before producing its first Actor step.
A separate minimal direct `/api/chat` probe with thinking disabled, a 16,384-token
window and a 64-token output limit also failed to return within 60 seconds.
`/api/ps` reported no loaded model. The comparison is inconclusive: it does not
prove that Gemma would or would not implement this Ticket. No model route or
server configuration was changed.

These were cold-run observations, superseded by the warm comparison below.
No runtime timeout or Actor step limit was raised.

## Warm runtime and observation correction

A fresh Qwen tiny control also timed out before the host finished loading its
model. Once loaded, the identical control returned in about 107 ms. A separate
bounded empty-prompt load request made Gemma available; its warm tiny control
returned valid JSON in about 41 seconds. Cold loading contributed to the earlier
timeout evidence; it does not establish a Gemma implementation limitation.

The warm original Gemma Actor reached a valid package.json preview but then
claimed it had already added the dependency. Disk was unchanged. It later
exhausted the 2,048-token output limit and returned an empty structured response.
That trace motivated the explicit preview-only observation and concise-thought
instruction. With those changes, Gemma requested `apply_change` with the
preview's fingerprint. The diagnostic was stopped after its read-only guard
rejected the request. No ai-cli file was edited.

This proves movement at the Actor/tool boundary, not accepted implementation:
the proposed context-resolver replacement guessed sibling API details and
contains placeholder assumptions. Neither that code nor the Ticket is qualified.
The regression consumes the actual preview observation's next call and verifies
both zero preview writes and the subsequent guarded edit.

A user-approved hosted DeepSeek comparison returned `User not found` before any
tool call. The installed `deepseek-r1:8b` was loaded at 32,768 tokens, but both its
ordinary and thinking-disabled comparisons timed out before the first decision.
`consuela-runtime-followup.json` preserves the warm controls. These results do not
qualify DeepSeek or prove that its prompts would fail on a faster runtime.

## Final Qwen result and scope

The final read-only replay on the original Qwen model reached an authored-correct
dependency edit in four Actor decisions: unmatched symbol lookup, package.json
read, valid replacement preview, matching-fingerprint apply request. The proposed
manifest parses as JSON, adds `@dharmax/context-manager: file:../context-manager`,
and preserves every existing dependency. `consuela-qwen-successful-preview.json`
records these checks. The diagnostic stops at the apply boundary, before writes.

An experiment rejecting repeated unchanged reads did not improve the live run;
that Map and guard were removed. Only the existing in-memory edit ownership/hash
tracking remains. All failed attempts are retained for comparison.

The real Asker/Actor/Ollama HTTP regression executes the observed recovery cases,
consumes the preview observation's exact next call, applies through the existing
engine, reads the changed disk and passes an authored local-dependency assertion.
Existing tranche regressions still prove zero-edit failure, current-disk refresh,
ownership continuity and the hard three-tranche limit.

DeepSeek with AIWF's configured OpenRouter credential made two useful investigation
steps at a 2,048-token output bound, then stopped on the account's credit limit.
The earlier fallback-credential failure is preserved separately. No credentials,
provider routes, server configuration, Actor step limit or runtime timeout changed.

Infrastructure regressions and the original first-edit interaction are verified;
full implementation/acceptance of TKT-CS-ALIGN-01 and the ecosystem Epic remains
outside this evidence. No ecosystem Ticket is claimed complete here.

Ollama documents context capacity separately from output length and notes that
increasing it increases memory requirements:
https://docs.ollama.com/context-length
