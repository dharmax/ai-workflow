# PC1b Commander commands and governed links — 2026-10-17

PC1b implementation only, pending independent review. Starting/current upstream before delivery: `8294fe0bc5a944c0658a4f84805eb13dd5a21c29`. Work remains on master. No PC2 authoring, S6, Gate 5 status change, synthetic verification receipt or Ticket acceptance is included.

## Recovery and specification

Before fetching, installing or editing, inspected branch, HEAD, staged/unstaged diff, untracked files and prior implementation processes. The interrupted run had staged PC1b domain/interface/tests, plus generated projection changes. Retained its useful Product/S2/native-batch implementation; replaced its handwritten argument parsing. Nothing was reset, stashed, discarded or force-pushed. Fetch and later `git pull --ff-only origin master` confirmed the expected upstream unchanged.

Read the canonical Dharmax-way design/plan, revised S5 Postcondition design/plan and PC1a audit/tests. Updated S5 design §4.1 and PC1b plan before installing Commander. Human grammar, Product model, authority and relation semantics remain as approved.

## Dependency and execution architecture

`commander` **15.0.0** is a pinned normal runtime dependency, installed with Bun. It requires Node >=22.12; this environment uses Bun 1.3.14 and Node 25.9.0. The actual compiled executable passes the same public command/link journeys, including stdio MCP; Commander is bundled by the existing build without externalization or a second binary/dispatcher.

Bun's install advanced Zod to 4.6.7, exposing incompatible public types against the existing local llm-utils dependency's Zod 4.6.6. Pinned the existing runtime dependency to **4.6.6**; no casts or schema weakening were used to hide that mismatch.

Committed `bun.lockb`, enabled lockfile saving and removed its ignore rule. Bun 1.3.14 and 1.4.3 text-lock generation produced unreadable local-file dependency peer entries in this sibling workspace. A supported binary lock was generated using ephemeral Bun 1.1.45, then consumed/updated by Bun 1.3.14. Both frozen lock-only validation and a clean `bun install --frozen-lockfile --ignore-scripts` succeeded (300 installed packages). Trial overrides/optional dependencies were removed; none remain in the manifest. No sibling dependency source or build was changed.

`createCommandTree` in artifact-command.ts is the reusable Commander syntax owner. CLI passes its OS argument array without joining/splitting. Shell lexes quoted/escaped text once and passes the tokens to the same async parser in user-arguments mode. Commander owns command registration, positional inputs, options, excess/unknown input, scoped help and controlled exits. Narrow adapters normalize command case/namespaces, refuse duplicate scalar options, check fixed to/from/as words and emit a typed discriminated intent. Zod/domain owners retain semantic validation. No custom argument parser, mini-framework, command bus or new registry remains beside Commander.

Help parses before database construction and before interactive missing-input facilitation. Shell uses exitOverride; help/errors cannot exit the hosting shell. Missing delegation IDs still use the existing facilitator. Existing specialist grammars retain their authoritative implementations and are dispatched once. The only new Product namespace reader is `product goal show ID`, equivalent to `product:goal show ID`; there is no PC2 Goal/Product authoring.

One exported PRODUCT_RELATIONS descriptor supplies validation, typed discovery and the link interfaces. It retains H/O/L directions, specialist proof ownership and remove-only legacy Feature contains Story. The five specification triples are discoverable; Product itself remains unavailable pending PC2. Existing indexed/runtime relationships remain readable with owner/unsupported information and cannot be manually authored.

Link previews/review/application use the existing Product owner, S2 engine, native Semantika predicate identity/revisions and conditional atomic batches. Existing note omission preserves payload; replacement/clear changes only the human note and retains system fields. Genuine no-ops preserve predicate identity/version. Duplicate physical rows refuse rather than being silently cleaned up. Endpoint revisions, payload-only changes, absence changes and delete/recreate ABA invalidate review. Native SQL rollback leaves no partial graph.

Interactive CLI/shell review presents the exact preview and confirms or cancels. Noninteractive commands default to inert preview. Local --yes applies that exact fingerprint after freshness revalidation. Actor adaptation strips local confirmation, and MCP schemas accept no yes/apply approval flag. Strict typed MCP JSON payload remains `{note?: string}` and normalizes through the same owner as CLI note text. Schema conversion failure prevents both exposure and invocation. PC1a execution authority, cancellation and proof-owner checks remain authoritative.

## Public proof and attributable red

Disposable projects and reopened canonical databases exercise executable CLI, shell processShellInput, real terminal stdin via a PTY, and actual stdio MCP. Tests cover discovery/inspection; fixed words/directions; quote/backslash/-- handling; preserved ID/note case; unknown/missing/excess/conflicting/duplicate input; scoped help without database/model/form calls; colon/space equivalence; no Actor fallback; H/O/L and indexed/protected endpoint refusal; payload replacement/clear/omission/system-field preservation; human accept/cancel; model confirmation refusal; read-only authority; no-op identity/version; ambiguity/cycles; stale endpoint/payload/absence/ABA; SQL rollback; pagination; restart; and fail-closed schema conversion.

The retained pre-Commander executable failed the new namespaced Goal public journey (0 pass / 1 fail / 7 filtered). A further red test proved interactive resolve --help accessed the database before help; parsing was moved before facilitation and the unchanged regression now passes. Existing parser tests were migrated to async expectations, scoped-help expectations now check scoped usage, and reserved explicit invalid prefixes now assert refusal. The Actor composition Story uses an unreserved natural-language wish while retaining its tool sequence and observable assertions. No safety assertion, timeout or opt-in condition was weakened.

## Verification results

Final tested source snapshot: `92f0cad0f4ebf9c30cc0fd1c66b233736fcc9577` (temporary detached validation commit, no implementation branch). Root implementation sources and tests match this snapshot. The validation checkout had a clean tracked tree, its own clean frozen dependency installation and tracked Workspace client/fixtures.

| Execution | Actual result |
| --- | --- |
| Every current test file, sorted, one fresh Bun 1.3.14 process per file, serialized; no retry within the run | **530 pass / 5 skip / 0 fail**, 535 tests, 68 files, 3480 assertions; every process exit 0 |
| Included PC1b command/link suites | **21 pass / 0 skip / 0 fail** |
| Included PC1a safety suite | **19 pass / 0 skip / 0 fail** |
| Included S1–S5 | **33 pass / 0 skip / 0 fail** |
| Included Ticket resolution suite | **54 pass / 0 skip / 0 fail** |
| Included controlled Gate 5 scope suite | **12 pass / 1 unchanged live-provider skip / 0 fail** |
| Final clean-checkout `bun run typecheck` | pass, zero errors |
| Final clean-checkout `bun run pack` | pass; compiled AIWF executable |
| `AIWF_PUBLIC_BINARY="$PWD/dist/aiwf" bun test --max-concurrency=1 tests/product-operability-commands.test.ts tests/product-operability-links.test.ts` | **21 pass / 0 fail**, 169 assertions, 8.46 seconds |
| `AIWF_WORKSPACE_BINARY="$PWD/dist/aiwf" bun test --max-concurrency=1 tests/dharmax-s3.test.ts` | **9 pass / 0 fail**, 38 assertions, 11.24 seconds |
| Final tracked-input audit, clean validation checkout, frozen lock and `git diff --check` | pass |

The complete per-file results are recorded in [pc1b-test-results-2026-10-17.json](pc1b-test-results-2026-10-17.json). Reproduce the full serialized process-isolated run from an installed checkout:

```bash
while IFS= read -r file; do
  bun test --max-concurrency=1 "$file" || exit $?
done < <(rg --files tests | rg '\.test\.ts$' | sort)
```

The five unchanged skips are two Skill/synthesis opt-ins, two live OpenRouter doctrine journeys and the configured live independent-verifier journey. They are not passing evidence.

### Single-process suite limitation

There is **no successful single-process full-suite gate to report**. Repeated `bun test --max-concurrency=1` runs on Commander candidates produced subprocess/browser launch or capture failures and timeouts. The last such run, before the final redundant-map removal, was **528 pass / 5 skip / 2 fail / 1 error**, 535 tests across 68 files: S3 Chromium stdio socket ENOENT and a TS6 Extract Function timeout. Other attempts observed S5 Chromium launch/hook timeout, S3 empty child stdout with exit 0, and native race-fixture SQLITE_PROTOCOL locking followed by a hook timeout. Their root causes were not established. Bun 1.4.3 default was interrupted after closed-client/dangling-process failures; its supported --isolate --parallel=1 full run still had one Doctrine hook timeout (**529 pass / 5 skip / 1 fail**).

All those files pass in the final complete fresh-process run; this does not establish that the single-process instability is fixed. Assertions, skips and timeouts remain unchanged. Independent review should decide whether that runner limitation blocks acceptance. Logs remain under /tmp/pc1b-*.log in this execution environment; they are not portable repository artifacts.

## Whole-method audit and changed artifacts

Reviewed complete affected methods and immediate contracts/callers: shared command factory, case/namespace normalization, lexer, typed adapters and facilitation; executable main routing and specialist switch; shell processShellInput and legacy specialist entrypoints; Actor execute/delegation; Product schema/descriptor/identity resolution, complete validateProductMutations/applyProductMutations and their Ticket/Aspect/legacy link callers; change preview/apply and postcondition verification; link discovery/inspection/preview/review; registry registration/surface; MCP list/call/schema export and host authority. No duplicate relation policy or domain execution choreography was added. Post-apply verification reads the committed final edge state directly rather than reconstructing a second relation map.

Changed runtime files: src/artifact-command.ts, src/cli.ts, src/shell.ts, src/actor/engine.ts, src/product/mutation.ts, new src/product/links.ts, src/change/engine.ts, src/tools/product.ts, src/tools/surface.ts and src/mcp.ts. Dependency/config: package.json, bun.lockb, bunfig.toml and .gitignore. Specifications: the S5 Postcondition design/plan. Tests: the two new product-operability suites plus async/help/explicit-prefix updates in artifact-command, actor, cli-help, shell-daily and doctrine-scope tests. Delivery artifacts: this audit, the recorded per-file results and generated kanban/modules projections.

## Authority, dependency and handoff limits

This remains assisted implementation. AIWF delegation was attempted before manual work, but provider authentication returned `User not found`; no provider retry or synthetic acceptance was used. Current Ticket metrics show two blocked preparation runs, one authentication failure, zero verified resolver runs, no measured tokens and unavailable cost. No savings or autonomous completion is claimed. TKT-PC1B remains In Progress pending independent acceptance; its implementation lease was released at handoff.

The installed Semantika sibling remains at `0d395ee2b2cef6a03a7cdee23b3a23fe9073e575`, preserving its seven modified files and untracked aspects.md. Installed native adapter hashes: sqlite-store.js `7baf22575fdc8b180a49b14316d6c94998aedc2986f7a185837853a4aec74928`; sqlite-basic-collection.js `b0befde69c2d63c8dd758adec8a9e3c0ab22385679e9f654e5a2af826dce49e9`. llm-utils HEAD is `f8222aaa155a0b86f50b7cacbe0701ed29d86840`. Clean AIWF source/install proof does not claim pristine source-to-dist equivalence for dirty sibling dependencies or a standalone ecosystem release.

MCP defaults to read-only. Trusted host project-write authority remains distinct from human review; the existing external-agent trust decision remains open. No provider qualification, Gate 5 certification, PC2, S6, future authoring surface, projection retirement or independent acceptance is claimed. Commit/push and independent remote-SHA verification are reported in the delivery message; stop for independent PC1b review.
