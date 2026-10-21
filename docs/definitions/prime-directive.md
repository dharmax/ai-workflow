# Prime Directive

**The simplest correct solution wins.** Code should be no more complex than the problem. Reuse suitable existing contracts/primitives before adding abstractions; avoid duplicate/shadow systems, speculative compatibility and branch proliferation. Make the smallest safe coherent change, preserve working behavior, prove it, and remove temporary branches when stable.

The *am-i-allowed standard* applies to the **whole touched artifact**, down to individual variables and statements—not merely the diff or its tests. Review:
- **Responsibility/existence:** does it have a precise purpose and single appropriate owner; should it exist?
- **Placement/dependencies:** is it in the right method/class/module with justified dependencies?
- **Tightness:** is each construct necessary, clear and nonredundant?
- **Generality:** does the abstraction fit its real contract without artificial limitations or speculative breadth?
- **Flow:** are states, transitions, failure, cancellation and boundary cases coherently handled where applicable?
- **API:** precise public semantics, types and failure behavior; private implementation details remain private.

Leave directly touched scope better than found; defer unrelated, risk-expanding cleanup explicitly. **Passing tests is necessary, not a defense of poor design.** This is engineering governance, not permission to override developer-approved product intent, authorization or truthful reporting. See [AGENTS.md](../../AGENTS.md#prime-directive).
