# Mission

`ai-workflow` should make messy repo work operational instead of theatrical.

## Current Goal

Build a workflow layer that can:

- keep canonical state in the workflow DB
- project honest human-readable status into markdown
- route work through explicit commands and guarded shell behavior
- prefer cheap capable models without hiding capability gaps
- require real verification before operator-facing closure

## Current Priorities

1. Keep the DB-first workflow truthful and easy to inspect.
2. Make shell, provider, workflow, and init surfaces reliable under dogfood.
3. Keep docs compact enough that active guidance stays usable.
4. Reuse sibling packages where they are the canonical implementation instead of duplicating them in-tree.
5. Improve local client bridges such as Gemini without creating parallel state models.

## Definition Of Better

- Fewer duplicate implementations.
- Fewer stale docs and one-off artifacts.
- More honest status output.
- Faster, cheaper bounded context extraction.
- Clean installer/bootstrap flows that leave a repo ready to use immediately.
