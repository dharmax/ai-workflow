# Research Spike: Candidate Extraction Analysis

Following a deep scan of `ai-workflow`, here is the "honest rating" of candidates for extraction into generic packages. Ratings are from 1-10 (10 = highest/best).

---

## 1. `@ai-workflow/block-patcher`
*Source: `core/lib/patch.mjs`*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Usefulness** | **10/10** | Surgical "Search/Replace" is the hardest part of LLM coding. A robust, standalone library for this is extremely valuable for any AI agent project. |
| **Encapsulation** | **9/10** | Already fully decoupled. It takes strings and returns strings. No dependencies on the rest of `ai-workflow`. |
| **Improvement Potential** | **7/10** | Can be improved with smarter partial-match heuristics, line-number anchoring, and multi-threaded application for large files. |

## 2. `@ai-workflow/codebase-parser`
*Source: `core/parsers/`*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Usefulness** | **9/10** | Most AST parsers are too heavy for quick context gathering. A fast, regex-based multi-language parser is a "goldilocks" tool for RAG and context-packing. |
| **Encapsulation** | **6/10** | Mostly generic, but currently returns `facts` and `notes` that are styled specifically for our internal sync logic. Needs a more neutral schema. |
| **Improvement Potential** | **9/10** | High. We can add more languages (Rust, Go, Python) and improve the "Fact" extraction to be more architecturally aware without needing a full AST. |

## 3. `@ai-workflow/shell-utils`
*Source: `core/services/execution-planner.mjs`, `cli/lib/main.mjs`, etc.*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Usefulness** | **8/10** | Every Node.js CLI project reinvents the `spawn` wrapper with "real-time output" and "timeout" handling. Consolidating this saves everyone time. |
| **Encapsulation** | **4/10** | Currently smeared across 5+ files with varying levels of quality. One uses `readline`, another uses `child_process` events. It is NOT encapsulated yet. |
| **Improvement Potential** | **9/10** | High. Creating a single, high-quality, typed `TaskExecutor` that handles signals, buffering, and JSON-detection correctly would be a major upgrade. |

## 4. `@ai-workflow/dual-surface-protocol`
*Source: `core/contracts/dual-surface-protocol.mjs`*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Usefulness** | **6/10** | Niche, but critical if you want to build "Remote Brains" that can talk to "Local Hosts" (like a cloud-hosted LLM agent controlling a local terminal). |
| **Encapsulation** | **10/10** | It is already a formal contract file. Pure logic/validation. |
| **Improvement Potential** | **5/10** | Mostly "done" in terms of version 1.0, but could grow as we add more complex negotiation (e.g., file-streaming protocol). |

## 5. `@ai-workflow/sqlite-sugar`
*Source: `core/db/sqlite-store.mjs` (partial)*

| Metric | Rating | Rationale |
| :--- | :--- | :--- |
| **Usefulness** | **7/10** | `node:sqlite` is great, but raw SQL is verbose. A tiny "document-like" or "entity-based" wrapper over it is very useful for local tool-state. |
| **Encapsulation** | **5/10** | Currently mixed with project-specific schema and metrics logic. |
| **Improvement Potential** | **6/10** | Could become a very clean "Local-first Data Store" utility. |

---

## Recommended Priority

1.  **Block Patcher**: Low effort (already encapsulated), High impact.
2.  **Codebase Parser**: Medium effort (needs schema normalization), Very High impact.
3.  **Shell Utils**: High effort (fragmented right now), but fixes "technical debt" across the whole project.
