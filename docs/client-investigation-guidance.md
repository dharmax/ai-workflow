# Client investigation guidance and scoped MCP navigation

Ticket: TKT-CLIENT-GRAPH-FIRST. Implemented on master without touching the separate Actor Phase 0 audit.

## Observed causes

| Observed defect | Consequence | Small correction |
| --- | --- | --- |
| The skill description and preferred workflow emphasized Ticket/Product Intent delegation; standalone research had no actionable scope workflow. | A client could regard graph primitives as secondary and default to shell reads. This is a plausible selection cause, not proof of the model's internal reasoning. | Advertise repository investigation in the skill description and give locate/outline/exact-source/reference/blast guidance with bounded fallback after an observed gap. |
| MCP initialization and setup used different instruction strings; initialization repeated CLI help. | Connected clients and installed clients received different guidance. | Share plain instruction constants between MCP and setup, retain Ticket delegation, and leave CLI syntax in help. |
| MCP accepted an unadvertised projectRoot and inferred scope from file/path/target, ignoring filePath and resolving relative paths from process cwd. | Real sibling KnowledgeBase lookups returned empty outlines and code:null despite accessible source. | Advertise optional projectRoot on existing wire/exported schemas, resolve relative roots from the server project, recognize/rebase filePath, reject invalid explicit roots. |
| Closing a sibling WorkflowStore left Semantika's public package registry bound to its closed database. | A cold host's first indexing after sibling access failed with Cannot use a closed database; freshness swallowed this and returned no symbols. | Restore the existing host package registration when the scoped store closes. No new store/router abstraction. |
| Checked-in skill differed from setup's existing canonical agency paragraph. | The existing distribution consistency test failed before publication could be validated. | Synchronize the repository skill with the existing canonical text while adding research guidance. Actor implementation and routing remain untouched. |

## Plan and implementation

1. Prove failure through the existing MCP interface before changing it.
2. Correct discoverability and project scope through the existing bridge.
3. Publish concise shared instructions and targeted installed Codex guidance.
4. Verify actual sibling source extraction, default-project preservation, invalid scope rejection, setup distribution and existing artifact delegation.

Source changes are src/client-guidance.ts, src/mcp.ts and src/setup.ts; published skill is skills/ai-workflow/SKILL.md. Regression coverage is tests/mcp-client-investigation.test.ts.

The installed Codex skill was updated only in its description and new research section. The installed AI-WORKFLOW.md navigation bullet was updated. Existing unrelated instructions, host configurations and running MCP connections were preserved. Backups are under .ai-workflow/state/client-investigation/.

## Evidence

Before correction, real ai-cli KnowledgeBase discovery from the AIWF host returned an empty lookup, a zero-symbol outline and code:null. The first four new SDK regressions failed against the old bridge.

The first corrected run retained two guidance compatibility failures and an additional cold-host failure. Existing tests were preserved; the Ticket delegation wording and canonical distribution were corrected. The cold-host failure was reproduced directly through indexSingleFile, exposing the closed database before the later duplicate-key symptom. Both the initialized-host and sibling-first cold-host cases remain tested.

Fresh SDK MCP acceptance now:
- find_symbol with projectRoot: ../ai-cli finds KnowledgeBase in src/knowledge/knowledge-base.ts.
- get_symbol_source returns the exact 15-line KnowledgeBase.getContextSource method with source: typescript-lsp.
- The sibling filePath alone also yields the exact method.
- A subsequent default-host find_symbol still finds createMcpServer.

The first real sibling graph refresh took about 17.9 seconds; subsequent lookup took 164 ms. Exact method extraction took 380 ms and the subsequent filePath extraction 123 ms. These observations do not establish a general performance guarantee. The captured current requests/results/timings are .ai-workflow/state/client-investigation/acceptance.json.

Final verification:
- Focused MCP/setup/artifact compatibility: 22 pass, 0 fail.
- Full suite: 298 pass, 0 fail, across 37 files.
- bun run typecheck: exit 0.
- Both published and installed skills pass quick_validate.py.
- git diff --check: clean.

## Limits

Instructions improve discoverability and state the intended workflow; they cannot enforce an external client's choices. No independent client behavior evaluation was performed in this side conversation. The actual mechanism and real sibling-source journey are verified.

Existing MCP connections must reconnect to receive the new initialization instructions and tool schema. They were deliberately left running to preserve ongoing work.

Scope preservation was validated with sequential requests. Semantika still resolves semantic artifacts through a process-global package-name registry; concurrent cross-project graph operations are not qualified by these checks. The restoration fixes the demonstrated scoped-store lifecycle failure, not that wider sibling-library contract.

Read-only research still needs bounded shell fallback for an observed unsupported-file, missing-index or tool failure. It does not need a ceremonial Ticket. Code mutation continues to require a lease and verified change primitives.
