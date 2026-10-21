# AI-Workflow (AIWF)

**AI-Workflow is the AI-assisted engineering workflow, and the software that operates it, built to follow [Dharmax-way](dharmax-way.md).** It takes developer-approved product intent through concrete [User/Actor Stories](user-story.md), executable [tests](test.md), justified [Tickets](ticket.md), engineering operations and independent verification to working product behavior.

AIWF maintains connected project state in the [Project Graph](project-graph.md) and repository, so its work and evidence can be inspected and resumed without reconstructing a chat. Its operations include investigating, preparing, processing and resolving work. They serve the workflow; they do not define product intent or turn creating records into the goal.

The central obligation is **to make the approved US test pass through correctly engineered work**, while preserving the developer's authority, applicable Aspects, Rules, authorization and valid evidence. For a multi-component US, an optional separate full-flow skeleton test may demonstrate the connected path using temporary internal stubs. Every such stub immediately has a coding Ticket for its real replacement/removal; the skeleton's success is never US acceptance. Other smaller coding Tickets remain justified by actual missing work.

Dharmax-way is the governing approach; AIWF implements and supports it. The current code is being brought into alignment with this target: this definition does not claim every stage is already implemented. See [current architecture](../architecture.md) and [governing design](../../plans/AIWF-DHARMAX-WAY-DESIGN.md).
