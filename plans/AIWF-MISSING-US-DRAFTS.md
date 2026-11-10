# Candidate missing AIWF User Stories — review before canonical creation

**Status:** Draft proposals, NOT official accepted Stories, not canonical Product mutations. These are real actor episodes inferred from the charter and publicly observable capabilities; the present suite names are **supporting evidence only**, never the source of the oracle. Reconcile each proposal against the canonical graph and existing accepted US before creation. Merge proposals that describe the same effective episode.

**Charter alignment check:** each draft advances engineering quality, efficiency, safe execution or evidence; none delegates product acceptance to a model. Alignment remains subject to actual Product charter review and developer approval. A projected `accepted` status in `user-stories.md` is not enough to infer complete effective fields.

## P-READ · `US-AIWF-INSPECT-WORK`

**Title:** Inspect existing work and its current relationships

**Actor:** Developer or maintainer

**Intent:** Understand the state and constraints of existing project work before deciding what to do next.

**Initial State:** An AIWF project contains canonical Tickets, possibly blocked, historical, or partially verified, and directed relationships; a caller may have only read authority.

**Action:** Request a Ticket and its relevant status and relationships through one supported public read surface, possibly after restart.

**Expected Result:** Receive the same canonical identity, current lane, known verification state, and correctly directed, bounded relations on supported surfaces. Missing IDs, incomplete evidence and stale source state are distinguished explicitly; reads do not create or alter Product, graph, lease or source state.

**Related historical test evidence (not acceptance oracle):** `public-read-surfaces`, `public-api-s1`, `human-output`, `us/ticket-journal`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-CMD · `US-AIWF-USE-PUBLIC-COMMAND`

**Title:** Discover and invoke the same public command across supported interfaces

**Actor:** Developer or delegated engineering agent

**Intent:** Use AIWF without learning conflicting CLI, Shell and machine-interface conventions or accidentally executing a malformed request.

**Initial State:** A supported CLI, Shell and MCP adapter exposes the current command registry; the caller may lack write authority.

**Action:** Request scoped help, invoke an existing command using its supported syntax, and attempt a malformed or unauthorized variant.

**Expected Result:** CLI and Shell derive consistent help and normalization from the same command contract; machine schemas describe equivalent supported operations. Well-formed requests reach the proper domain owner with host-controlled authority; invalid, help-only and unauthorized requests remain inert, without falling through to a generative Actor or performing hidden writes.

**Related historical test evidence (not acceptance oracle):** `cli-help`, `artifact-command`, `command-registry`, `public-read-surfaces`, `mcp-public-surface`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-SOURCE · `US-AIWF-APPLY-REVIEWED-SOURCE-CHANGE`

**Title:** Apply a reviewed source change without damaging unrelated work

**Actor:** Developer or authorized coding agent

**Intent:** Make a bounded engineering change with confidence that only its approved effects are written.

**Initial State:** A real source work item has an explicit target and approval obligations; files may be dirty and other processes may edit them.

**Action:** Create an inert source-change preview, review its exact target/effects and scope, authorize it through the trusted host, then apply or cancel.

**Expected Result:** Preview does not write; cancellation and missing authority have no effects. Application respects the exact current Ticket scope, dirty-file approvals, expected source content and lease, rejects stale/ABA and escaped paths, attributes any committed edits and verifies their actual effects. Incomplete post-commit reconciliation is reported as incomplete, never falsely Done.

**Related historical test evidence (not acceptance oracle):** `source-change-authorization`, `change-engine`, `workspace-text`, `pc1a-safety`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-PRODUCT · `US-AIWF-REVIEW-PRODUCT-DEFINITION`

**Title:** Review and revise a Product definition while preserving its identity

**Actor:** Developer acting as Product Owner

**Intent:** Maintain accurate Product meaning through explicit, reviewable and durable changes.

**Initial State:** The accepted Product charter exists, and a Goal, Feature, Story, Aspect or other definition may be missing, draft, accepted or need revision.

**Action:** Propose a definition or revision, inspect charter-alignment warnings and exact effects, then accept, reject, revise or cancel the reviewed proposal.

**Expected Result:** Proposal generation is inert. Required User Story fields and charter conflicts are explicit and cannot be waved through by model self-approval. The trusted host can authorize only the exact current proposal; accepted changes persist atomically under stable identities and revisions. Rejection, cancellation, invalid or stale input leave existing meaning unchanged.

**Related historical test evidence (not acceptance oracle):** `product-operability-definition`, `product-authority`, `product-change`, `us/basic-product-intent`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-RULE · `US-AIWF-MAINTAIN-ENGINEERING-RULE`

**Title:** Inspect and revise effective engineering Rules safely

**Actor:** Maintainer with explicit Rule-authoring authority

**Intent:** Keep effective engineering obligations current without allowing a weaker local override to silently bypass stronger requirements.

**Initial State:** The project has potentially layered active, draft, disabled and scoped Rules with Decision/Aspect context and ongoing governed work.

**Action:** Inspect the effective Rule for a scope, preview a change, and authorize or reject it.

**Expected Result:** The correct layered applicability and provenance are visible. Drafts do not silently override active requirements; changing mandatory applicability requires the appropriate review and stale fingerprints are rejected. Authorized updates and audit identity persist atomically; existing source/receipt evidence becomes stale where the effective obligation changes.

**Related historical test evidence (not acceptance oracle):** `doctrine-management`, `doctrine-model`, `doctrine-scope`, `doctrine-verifier`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-MODEL · `US-AIWF-CONFIGURE-MODEL-ROUTES`

**Title:** Configure and inspect runtime model routing without hidden spending

**Actor:** Developer

**Intent:** Use suitable models for engineering work while controlling quality, locality and paid-inference costs.

**Initial State:** Global and project routes may differ, a provider may be unavailable, and cost information may be incomplete.

**Action:** Inspect effective routes, revise a model policy, and run a routed engineering request.

**Expected Result:** Effective current settings and chosen routes reflect precedence and available providers, with no invented default. Changes preserve unrelated settings and are visible on reuse/reload. Paid inference respects explicit authority and budget before requesting a provider; missing pricing, unavailable models and cancellation produce truthful observations rather than silent fallback or fictitious zero cost.

**Related historical test evidence (not acceptance oracle):** `model-service`, `actor-runtime-refresh`, `escalation`, `model-advice-story`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-SETUP · `US-AIWF-SETUP-PROJECT`

**Title:** Set up or inspect AIWF integration without corrupting a project

**Actor:** Developer

**Intent:** Install or inspect AIWF tooling safely in an existing or new repository.

**Initial State:** Project and host integrations may already contain configuration, absent providers and unrelated user changes.

**Action:** Run a non-writing check, review necessary setup, apply the explicitly requested installation, then inspect or repeat it.

**Expected Result:** Check mode leaves all files intact and reports actual state. Setup changes only authorized targets while preserving unrelated TOML/JSON and host settings, handles absent installations and malformed configuration explicitly, and is idempotent after success. Diagnostics distinguish incomplete or failed setup from a ready environment.

**Related historical test evidence (not acceptance oracle):** `setup`, `setup-truth`, `shell-config-setup`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-CAP · `US-AIWF-DISCOVER-ENGINEERING-CAPABILITY`

**Title:** Discover and use an existing engineering capability before inventing one

**Actor:** Coding agent using AIWF

**Intent:** Complete an engineering task with the least necessary new tooling while respecting execution authority.

**Initial State:** A project exposes a command registry, possibly local skills, packaged capabilities and optional dependencies.

**Action:** Search using actual task intent, inspect a matching capability and invoke it if suitable.

**Expected Result:** Discovery identifies real registered capabilities and their requirements, not invented commands or unsupported aliases. Missing, malformed or ambiguous candidates are surfaced accurately. Invocations honor host authority and scoped project context. A generated capability is not promoted without its verification and authorization; unrelated files remain unchanged.

**Related historical test evidence (not acceptance oracle):** `skill-manager-bridge`, `tool-discovery`, `compiler`, `skill-synthesis-acceptance`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-REPO · `US-AIWF-INSPECT-RELATED-REPOSITORY`

**Title:** Inspect a related repository without transferring write authority

**Actor:** Engineering agent

**Intent:** Use exact source evidence from a sibling or external project without mutating its contents or confusing it with the host repository.

**Initial State:** AIWF runs in a host project; a related repository may be non-pristine, unindexed or lack AIWF state.

**Action:** Specify the related project and request source discovery, symbols or slices through the supported read interface.

**Expected Result:** The requested repository is resolved exactly; invalid paths fail explicitly instead of silently falling back to the host. Results correctly identify their source and freshness, the host default scope remains unchanged, read-only inspection does not create sibling AIWF files or grant sibling write permission, and restart does not mix results.

**Related historical test evidence (not acceptance oracle):** `us/e01-investigate-sibling`, `ast-freshness-and-search`, `integration/graph-field-migration`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.

## P-METRICS · `US-AIWF-INSPECT-EXECUTION-ECONOMICS`

**Title:** Inspect attributable execution costs and outcomes

**Actor:** Developer or maintainer

**Intent:** Measure whether an engineering workflow actually improved speed, model spending and correctness.

**Initial State:** Previous AIWF runs may include local/remote inference, tool calls, failed attempts, partial prices and interruptions.

**Action:** Query or export metrics for a specific operation or comparison period.

**Expected Result:** Results correlate actual operations, model usage, test outcomes, elapsed time and guarded effects without duplicating counts. Unknown prices or missing timings remain unknown, not zero. Historical records are queryable after restart; exported diagnostics are bounded and omit prompts, credentials and private source. No improvement is claimed without comparable evidence.

**Related historical test evidence (not acceptance oracle):** `performance-metrics`, `execution-economics`

**Disposition:** `proposed` — check duplication/overlap with existing graph US; developer reviews intent and full expected outcome before canonical preview/accept.


## Adoption discipline

- Prioritize `US-AIWF-USE-PUBLIC-COMMAND` because of the recurring CLI/Shell help parity issue and `US-AIWF-APPLY-REVIEWED-SOURCE-CHANGE` because of the current refactoring/authority work.
- Each approved Story should be created or amended via canonical Product preview and trusted host acceptance. Do not write `status: accepted` into Markdown or a fixture as a substitute.
- Once accepted, establish its own US file(s) with real public behavior (including deliberate failure/safety outcomes), run an initial baseline and link TestNode verification. Existing technical tests remain supplemental until no longer useful.
- Do not create every proposal by default; a canonical equivalent may exist in graph despite being absent from the Markdown projection.
