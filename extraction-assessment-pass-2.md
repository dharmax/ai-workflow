# Wise & Critical Extraction Assessment (Pass 2)

This pass applies a more critical lens, weighing internal project benefits against broader market utility, and includes the high-fidelity GoE and English->JS components.

---

## 1. `@ai-workflow/js-orchestrator` (The "English->JS" Engine)
*Source: `core/services/operator-brain.mjs` + `core/services/js-orchestrator.mjs`*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Internal Benefit** | **10/10** | This is the project's heart. Formalizing it as a package forces us to clean up the "Service Injection" mess and properly define the interface between the AI Brain and the OS/Filesystem. |
| **General Usefulness** | **10/10** | **Highest value.** There are many NL-to-Actions tools, but few that compile NL into *persistent, stateful, and resumable JavaScript functions* with built-in grounding. |
| **Improvement** | **High** | We can remove the tight coupling to `sync.mjs` and make the "Services" schema pluggable. |

**Critical View:** This is the project's "moat." Packing it would make `ai-workflow` just one of many clients, which is the ultimate architectural win.

## 2. `@ai-workflow/goe-governance` (The Governance Triad)
*Source: `docs/goe-triad-contract.md` + (upcoming implementation)*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Internal Benefit** | **8/10** | Encapsulating the "Suggester/Critic/Auditor" loop prevents the main loop from becoming an unreadable state machine of nested LLM calls. |
| **General Usefulness** | **9/10** | Multi-agent debate is a hot topic. A standalone engine that manages the *state and transitions* of a debate (dissatisfied -> revision -> escalation) is highly reusable. |
| **Improvement** | **Moderate** | The logic is mostly in docs/contracts. Implementing it as a clean, generic state-machine package would be a "gold standard" implementation. |

**Critical View:** Very strong, but only if it manages the *protocol* and *state*, not just the prompts. It needs to be a "Governed Workflow Engine."

## 3. `@ai-workflow/block-patcher`
*Source: `core/lib/patch.mjs`*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Internal Benefit** | **4/10** | Minimal. It's already working well. Moving it doesn't simplify much for *us*. |
| **General Usefulness** | **9/10** | High. Many AI projects struggle with `git apply` failing due to whitespace. This "Surgical Search/Replace" is a utility everyone needs. |
| **Improvement** | **Moderate** | Can be improved with smarter partial-match heuristics. |

**Critical View:** This is a "utility" package. High general value, but low "strategic" value for the `ai-workflow` architecture itself.

## 4. `@ai-workflow/codebase-parser`
*Source: `core/parsers/`*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Internal Benefit** | **7/10** | Standardizing the `ParserResult` across all languages would clean up our "Context Packing" and "Sync" logic significantly. |
| **General Usefulness** | **8/10** | A "Universal Lightweight Parser" that returns a standard JSON schema of symbols/notes/facts for 10+ languages is a great dev-tool. |
| **Improvement** | **High** | Currently a bit "regex-heavy." Could be moved to a hybrid approach (regex for speed, real parser for deep facts) while keeping the same schema. |

**Critical View:** Essential for RAG systems. Useful, but competes with more mature (though heavier) tools like `tree-sitter`.

## 5. `@ai-workflow/shell-proc-utils` (The Spawn Wrapper)
*Source: Fragmentation in `cli/lib/main.mjs`, `core/services/execution-planner.mjs`, etc.*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Internal Benefit** | **9/10** | Huge. We have inconsistent shell execution code everywhere. Fixing this once in a package and using it everywhere would eliminate a class of "stuck process" bugs. |
| **General Usefulness** | **6/10** | Useful, but Node.js has many spawn wrappers (like `execa`). Ours would only be special if it has specific "AI-first" features like auto-summary of long output. |
| **Improvement** | **Critical** | This code is currently the "weakest link" in terms of reliability. |

**Critical View:** This is an "Internal Debt" extraction. High value for us, lower value for the world compared to the Orchestrator or GoE.

---

## The "Wisest" Next Steps

1.  **Extract `@ai-workflow/js-orchestrator` first.** It defines the identity of the project. If we can't make this generic, we haven't truly solved the "AI Operating System" problem.
2.  **Implement `@ai-workflow/goe-governance` as a package from day one.** Since implementation hasn't peaked yet, building it as a separate library will keep the architecture pristine.
3.  **Extract `@ai-workflow/shell-proc-utils` for internal stability.** Don't even worry about making it public yet; do it to fix the internal fragmentation.
