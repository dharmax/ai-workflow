# Prime Directive

**The simplest *correct* solution wins.** The complexity, design and amount of code must be justified by the actual problem—not by an impressive-looking architecture, a small diff, a passing suite or a framework convention. Reuse good existing contracts and primitives; avoid shadow systems, duplicated ownership, speculative compatibility and unnecessary abstraction. Simplify the directly affected scope before adding more machinery when its present complexity obstructs correctness.

The quality reference is [**dharmax/am-i-allowed**](https://github.com/dharmax/am-i-allowed): a small, generic, dependency-light library that handles real-world sophistication without making its implementation complicated. This is a **code/design quality benchmark**, not a claim that its permission-checking API enforces the Prime Directive.

## Whole-scope review

Apply the standard before and after engineering work to the **entire touched methods/artifacts and their immediate contracts**, down to statements and variables—not only the added lines:

1. **Responsibility and existence:** one precise purpose/owner; should this entity, method, layer or variable exist at all?
2. **Placement:** correct existing class/module/API boundary and dependency direction; avoid fragmentation and duplicated responsibility.
3. **Tightness:** every branch, statement, variable and syntactic construct earns its place; remove unnecessary indirection, dead work, redundant state and misleading names.
4. **Generality:** fit real requirements and legitimate consumers—neither hard-coded special cases nor an overly broad speculative framework.
5. **Algorithm and execution flow:** one coherent path/owner; account for meaningful state transitions, invariants, failures, concurrency, cancellation and restart where applicable. Don't paper over a root cause.
6. **API and contracts:** precise names/types, small useful surface, clear failure semantics and isolation; do not leak internals or hidden side effects.

**Prove behavior and inspect design.** Passing tests are necessary but not sufficient. A green US test cannot excuse incoherent methods; a beautiful implementation cannot excuse incorrect product behavior. Preserve existing working contracts and safety; leave touched scope better than found. Defer unrelated risky refactors visibly rather than smuggling them into a patch. Prefer quick merger/cleanup of stable temporary branches over a forest of stale branches.

The Prime Directive is the engineering standard inside [Dharmax-way](dharmax-way.md); it never overrides the mandatory developer-approved [Product charter](product.md), an unanswered charter-alignment warning, actual authorization, or truthful verification. See the current [repository guidelines](../../AGENTS.md#prime-directive).
