# AI-Workflow — Product Charter

**ID:** `PRODUCT`  
**Title:** AI-Workflow (AIWF)  
**Status:** Accepted — developer-approved on 2026-10-22

> **Registration note:** This document preserves the explicitly approved charter text. It is the approval reference for registering the single `PRODUCT` entity via AIWF's reviewed canonical Product operation. This Git commit is **not** proof that the local Semantika graph was updated; inspect `aiwf product show` before registration and verify the resulting version/status after applying. Do not manually edit generated `product-manifest.md` or authored snapshots.

## 1. Purpose

AIWF aims to dramatically improve the **quality, speed and cost-efficiency of AI-assisted software engineering**.

It enables developers and AI coding agents to produce and maintain tight, production-quality software by combining semantically connected project knowledge, engineering intelligence, integrated work management, efficient execution and worthwhile verification.

**Performance ambition:** Achieve 20–90% reduction in LLM token consumption and 40–90% reduction in elapsed engineering time on comparable tasks, without compromising correctness or maintainability, but rather increasing them.

These are measurable product targets, not guaranteed outcomes. The ultimate measure of success is correctly engineered software, achieved with substantially less effort, time and avoidable technical debt.

## 2. Actors

- **Developer / Product Owner:** Defines intended product behavior, reviews proposals, makes decisions and authorizes consequential changes.
- **AI Coding Agent:** Uses AIWF to understand, investigate, plan, implement, test and verify engineering work within its delegated authority.
- **Maintainer:** Understands and evolves existing software, investigates defects, manages technical work and protects its integrity.
- **Verifier:** Independently assesses actual engineering outcomes against applicable requirements and evidence. May be human or AI.

A person or agent may fulfill more than one role, subject to applicable authorization and verification-independence requirements.

## 3. Scope

AIWF provides an integrated engineering environment encompassing:

**Product understanding**

- A canonical Product Charter and semantically connected Goals, Features, Aspects, User/Actor Stories and related knowledge.
- AI-assisted discovery, generation, reconciliation and controlled evolution of product definitions.
- Identification of conflicts, dependencies, inconsistencies and product drift.

**Engineering intelligence**

- A persistent semantic project graph connecting product intent, work, code, architecture, tests, decisions and evidence.
- Efficient, targeted retrieval, dependency and impact analysis, code intelligence and refactoring support.
- Intelligent selection and combination of deterministic operations, System-1 and LLM reasoning to optimize engineering economics.

**Work management and execution**

- Integrated Epics, Tickets, Bugs, priorities, dependencies, planning views and work lifecycle.
- Grounded investigation, planning, implementation, testing, correction and completion.
- Discovery, reuse, import and justified generation of capabilities and skills, combining knowledge and executable functionality where appropriate.

**Quality and verification**

- Dharmax-way as the governing engineering method, including US-driven test-first development and the Prime Directive.
- Correct, maintainable implementations with minimal justified complexity.
- Meaningful testing, independent current verification, truthful progress and durable evidence.

**Accessibility and continuity**

- Integration with external AI coding agents through MCP, skills and supported plugin interfaces.
- Direct operation through CLI, interactive shell and graphical interfaces.
- Persistent project context enabling work to continue across sessions, developers and agents.

AIWF supports new functionality, modification of existing behavior, Bug resolution, refactoring and justified technical maintenance.

## 4. Non-goals

AIWF is not intended to:

- Replace the developer's authority over product intent or consequential decisions.
- Become a general-purpose chatbot or content-generation application.
- Merely generate code, documentation, Tickets or other artifacts without advancing an actual engineering objective.
- Replace established development tools or suitable ecosystem capabilities unnecessarily.
- Impose rigid methodologies, unnecessary planning ceremonies or artificial product/work hierarchies.
- Optimize token consumption or speed at the expense of correctness, maintainability or safety.
- Treat passing internal tests, generated code, completed Ticket states or AI assertions as sufficient proof of product correctness.

## 5. Boundaries and Constraints

1. **Developer authority:** Product intent and material changes require appropriate review and approval. Every downstream product definition is examined against the charter; material conflicts or drift must be exposed and explicitly answered.

2. **Engineering quality:** Dharmax-way and its Prime Directive govern the work. The simplest correct solution wins. Avoid assumptions, unnecessary abstraction, duplicated ownership and accumulating avoidable technical debt.

3. **Grounded intelligence:** Investigation and engineering decisions must use relevant, attributable project knowledge and actual evidence. Unknown or uncertain information must not be represented as established fact.

4. **Efficiency:** Prefer inexpensive deterministic mechanisms where sufficient. Use AI reasoning when it adds value, with relevant context, appropriate capabilities and measurable resource consumption.

5. **Safety and integrity:** Respect authorization, project boundaries, existing work and guarded mutation contracts. Changes must not silently damage or overwrite unrelated work.

6. **Truthful verification:** Product acceptance requires relevant observed behavior and valid current evidence. Verification effort should be proportional to the actual obligations and risks, not performed merely for appearances.

7. **Durability and consistency:** Maintain connected, reusable project state without competing sources of truth. Preserve the distinction between intended product behavior, engineering progress and demonstrated implementation.

8. **Extensibility and simplicity:** Support varied projects, coding agents and development environments through reusable capabilities and justified integrations, without introducing unnecessary parallel infrastructure.
