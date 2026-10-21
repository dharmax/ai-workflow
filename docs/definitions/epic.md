# Epic

An Epic groups delivery and relates User/Actor Stories, and may hold material **common to the USs under it**, avoiding repetition. Every proposed/revised Epic is checked against the mandatory [Product charter](product.md); material conflict or drift requires a warning and explicit developer answer before it is considered aligned/approved.

## Agreed relationship

A US has **at most one designated primary Epic** (one when assigned). It may relate to other Epics, but these are not additional parents for inheritance.

A primary Epic may supply:
- common **Initial State**;
- common **parts of Expected Result**;
- **Domains** (organizational tags);
- **Comments** (list).

The effective US definition includes the relevant common Epic material and its own specific content. The Epic does not replace the US's Actor, Intent or Action. A [sub-US](sub-user-story.md) inherits the resulting effective parent US definition.

## Open questions

Whether an Epic assignment is mandatory (automatically assigning a simple `Default` Epic if missing) is **not yet decided**. Nor is the exact precedence/editing mechanism for overlapping or contradictory Epic and US text. Do not silently choose or implement these behaviors.
