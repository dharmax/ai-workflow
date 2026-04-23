---
kanban-plugin: board
---

# Kanban

_Generated from the workflow DB. Edit through `ai-workflow project ...` or `ai-workflow sync`._
_Core lanes are fixed. Rare lanes only render when they contain cards. `Archived` history lives in `kanban-archive.md`._

## Deep Backlog

- No items

## Backlog

- No items

## ToDo
<!-- canonical alias: ## Todo -->

- No items

## Bugs P1

- No items

## Bugs P2/P3

- No items

## Assessments

- [ ] a033eca2658f8b60ab98652005032aff355f323e Assessment: health on project:ai-workflow
  - Summary: Status: pending. Plan: Available
  - State: pending
- [ ] 39a24358aae17d63b2ca80e970d5008341146b34 Assessment: health on project:ai-workflow
  - Summary: Status: failed. Plan: Available
  - State: failed
- [ ] 059a79bf4ffb368f9e49627c8582a00047c90c74 Assessment: architecture on project:ai-workflow
  - Summary: Status: resolved. Plan: Available
  - State: resolved

## In Progress

- No items

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] TKT-PLAN-PERSISTENCE Implement DB storage for architectural plans and epics references ✅ 2026-04-22
  - Summary: When planning, the plan must be kept somewhere - both in md files and in the db with references in the epics and wherever relevant, or else plans disappear. Store the full plan on a special folder called 'design'.
  - State: archived
- [ ] TKT-AUTO-CREATE-STRING-UTILS-MODU-MO9WY7CS Create string-utils module with capitalizeFirstLetter function ✅ 2026-04-22
  - State: archived
- [ ] TKT-BIDIRECTIONAL-SYNC Ensure MD file edits sync correctly with DB using timestamp diffing ✅ 2026-04-22
  - Summary: Ensure that when the md files - e.g. kanban - are manually edited, what is edited is synced properly with the DB and not run over. Timestamp-based diff triggering should ensure sync between files to db. Ask the user via the new multi-choice module to solve sync confusions.
  - State: archived
- [ ] TKT-MANUAL-SYNC-TEST This ticket was added manually in the markdown file. ✅ 2026-04-22
  - State: archived
- [ ] TKT-SHELL-JS-001 Implement JS-based orchestration driver ✅ 2026-04-23
  - State: archived
- [ ] TKT-DOGFOOD-001 Reproduce and fix shell/metrics issues + Smart Programming Dogfood Harness ✅ 2026-04-23
  - State: archived
- [ ] echo-test-codelet Add echo-test codelet ✅ 2026-04-21
  - State: open
- [ ] 272af4783f188efd601c99883e18eca9320dee2d Initialize Project ✅ 2026-04-19
  - State: archived
- [ ] d90a89c1cc0ce2a2b88e14a1479d9abf96c6a752 Modular, Expandable 3D Canvas Space Invaders-style Game with Emoji Ships ✅ 2026-04-19
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
