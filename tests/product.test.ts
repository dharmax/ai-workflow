import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import {
  Flow,
  Epic,
  Feature,
  UserStory,
  Ticket,
  TestNode,
  Decision,
  FileNode,
  SymbolNode
} from '../src/graph/ontology.ts';
import { initializeTools, registry, type ToolContext } from '../src/tools/index.ts';
import { exportProjections, importProjections } from '../src/graph/projections.ts';
import { getCoverage } from '../src/product/coverage.ts';
import { getProductImpact } from '../src/product/impact.ts';

describe('Product Intent Graph — Deterministic Substrate (Ticket 1)', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: ToolContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-product-test-'));
    store = new WorkflowStore(tempDir, true);
    initializeTools();
    ctx = { store, projectRoot: tempDir };
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // 1. Entity Lifecycles & Default Statuses
  // ===========================================================================
  it('correctly defaults statuses to draft and prevents silent generic implemented inheritance', async () => {
    const epic = await registry.execute('create_epic', {
      id: 'EPIC-DEFAULT',
      title: 'Default Epic'
    }, ctx);
    expect(epic.status).toBe('draft');

    const feature = await registry.execute('create_feature', {
      id: 'FEAT-DEFAULT',
      title: 'Default Feature'
    }, ctx);
    expect(feature.status).toBe('draft');

    const story = await registry.execute('create_user_story', {
      id: 'STORY-DEFAULT',
      title: 'Default Story'
    }, ctx);
    expect(story.status).toBe('draft');

    // Direct store entities
    const directFeat = await store.upsertEntity<Feature>(Feature.dcr, {
      id: 'FEAT-RAW',
      title: 'Raw Feature'
    });
    expect((directFeat as any).status).toBe('draft');
  });

  // ===========================================================================
  // 2. Constrained Canonical Product Relations (link_product / unlink_product)
  // ===========================================================================
  it('permits canonical product relations and rejects invalid combinations', async () => {
    await registry.execute('create_epic', { id: 'EPIC-1', title: 'Epic 1' }, ctx);
    await registry.execute('create_feature', { id: 'FEAT-1', title: 'Feature 1' }, ctx);
    await registry.execute('create_user_story', { id: 'STORY-1', title: 'Story 1' }, ctx);
    await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'TKT-1', title: 'Ticket 1', lane: 'Todo' });
    await store.upsertEntity<TestNode>(TestNode.dcr, { id: 'TEST-1', title: 'Test 1', targetPath: 't.ts' });
    await store.upsertEntity<Decision>(Decision.dcr, { id: 'ADR-1', title: 'ADR 1', decision: 'Decided' });

    // Permitted: Epic targets Feature
    const l1 = await registry.execute('link_product', {
      sourceId: 'EPIC-1', predicate: 'targets', targetId: 'FEAT-1'
    }, ctx);
    expect(l1.success).toBe(true);

    // Permitted: Epic targets UserStory
    const l2 = await registry.execute('link_product', {
      sourceId: 'EPIC-1', predicate: 'targets', targetId: 'STORY-1'
    }, ctx);
    expect(l2.success).toBe(true);

    await registry.execute('create_goal', { id: 'GOAL-1', title: 'Goal 1' }, ctx);
    await registry.execute('create_concept', { id: 'CONCEPT-1', title: 'Concept 1' }, ctx);
    await registry.execute('create_flow', { id: 'FLOW-1', title: 'Flow 1', actor: 'Developer' }, ctx);

    const g1 = await registry.execute('link_product', {
      sourceId: 'FLOW-1', predicate: 'serves', targetId: 'GOAL-1'
    }, ctx);
    expect(g1.success).toBe(true);
    const g2 = await registry.execute('link_product', {
      sourceId: 'CONCEPT-1', predicate: 'governs', targetId: 'FLOW-1'
    }, ctx);
    expect(g2.success).toBe(true);
    const g3 = await registry.execute('link_product', {
      sourceId: 'FLOW-1', predicate: 'contains', targetId: 'STORY-1'
    }, ctx);
    expect(g3.success).toBe(true);

    // Permitted: Feature enables UserStory; it does not own the Story.
    const l3 = await registry.execute('link_product', {
      sourceId: 'FEAT-1', predicate: 'enables', targetId: 'STORY-1'
    }, ctx);
    expect(l3.success).toBe(true);

    // Permitted: Epic contains Ticket
    const l4 = await registry.execute('link_product', {
      sourceId: 'EPIC-1', predicate: 'contains', targetId: 'TKT-1'
    }, ctx);
    expect(l4.success).toBe(true);

    // Permitted: Ticket implements Feature
    const l5 = await registry.execute('link_product', {
      sourceId: 'TKT-1', predicate: 'implements', targetId: 'FEAT-1'
    }, ctx);
    expect(l5.success).toBe(true);

    // Permitted: Ticket addresses UserStory
    const l6 = await registry.execute('link_product', {
      sourceId: 'TKT-1', predicate: 'addresses', targetId: 'STORY-1'
    }, ctx);
    expect(l6.success).toBe(true);

    // Permitted: Test verifies Feature
    const l7 = await registry.execute('link_product', {
      sourceId: 'TEST-1', predicate: 'verifies', targetId: 'FEAT-1'
    }, ctx);
    expect(l7.success).toBe(true);

    // Permitted: Test verifies UserStory
    const l8 = await registry.execute('link_product', {
      sourceId: 'TEST-1', predicate: 'verifies', targetId: 'STORY-1'
    }, ctx);
    expect(l8.success).toBe(true);

    // Permitted: Decision governs Epic/Feature/Story
    const l9 = await registry.execute('link_product', {
      sourceId: 'ADR-1', predicate: 'governs', targetId: 'FEAT-1'
    }, ctx);
    expect(l9.success).toBe(true);

    // Rejected: Ticket implements Epic
    expect(registry.execute('link_product', {
      sourceId: 'TKT-1', predicate: 'implements', targetId: 'EPIC-1'
    }, ctx)).rejects.toThrow('Invalid product relation');

    // Rejected: Epic contains UserStory (Flow owns Story containment)
    expect(registry.execute('link_product', {
      sourceId: 'EPIC-1', predicate: 'contains', targetId: 'STORY-1'
    }, ctx)).rejects.toThrow('Invalid product relation');

    // Rejected: Arbitrary relation
    expect(registry.execute('link_product', {
      sourceId: 'FEAT-1', predicate: 'modifies', targetId: 'STORY-1'
    }, ctx)).rejects.toThrow('Invalid product relation');

    // Unlink permitted
    const un = await registry.execute('unlink_product', {
      sourceId: 'EPIC-1', predicate: 'targets', targetId: 'FEAT-1'
    }, ctx);
    expect(un.success).toBe(true);
    const epicView = await registry.execute('get_epic', { epicId: 'EPIC-1' }, ctx);
    expect(epicView.targetedFeatures).not.toContain('FEAT-1');
  });

  // ===========================================================================
  // 3. Structural Coverage Engine (src/product/coverage.ts)
  // ===========================================================================
  describe('Structural Coverage Engine', () => {
    it('returns facts for draft stories without failing as project errors', async () => {
      await registry.execute('create_user_story', {
        id: 'STORY-DRAFT',
        title: 'Draft story',
        status: 'draft'
      }, ctx);

      const cov = await getCoverage(store, 'STORY-DRAFT');
      expect(cov.complete).toBe(true);
      expect(cov.gaps).toHaveLength(0);
      expect(cov.related.stories).toEqual(['STORY-DRAFT']);
    });

    it('identifies independent coverage gaps for an accepted UserStory', async () => {
      // 1. Accepted story with no parent, no criteria, no work, no tests
      await registry.execute('create_user_story', {
        id: 'STORY-GAP',
        title: 'Gapped story',
        status: 'accepted',
        acceptanceCriteria: []
      }, ctx);

      let cov = await getCoverage(store, 'STORY-GAP');
      expect(cov.complete).toBe(false);
      const gapKinds = cov.gaps.map(g => g.kind);
      expect(gapKinds).toContain('missing_parent');
      expect(gapKinds).toContain('missing_acceptance_contract');
      expect(gapKinds).toContain('missing_work');
      expect(gapKinds).toContain('missing_verification');

      // 2. Add containing Flow, enabling Feature, and criteria
      await registry.execute('create_flow', { id: 'FLOW-PARENT', title: 'Parent Flow', actor: 'Caller' }, ctx);
      await registry.execute('create_feature', { id: 'FEAT-PARENT', title: 'Enabling Feature' }, ctx);
      await registry.execute('link_product', { sourceId: 'FLOW-PARENT', predicate: 'contains', targetId: 'STORY-GAP' }, ctx);
      await registry.execute('link_product', { sourceId: 'FEAT-PARENT', predicate: 'enables', targetId: 'STORY-GAP' }, ctx);
      await registry.execute('update_user_story', {
        storyId: 'STORY-GAP',
        acceptanceCriteria: ['Valid response returned']
      }, ctx);

      cov = await getCoverage(store, 'STORY-GAP');
      const updatedKinds = cov.gaps.map(g => g.kind);
      expect(updatedKinds).not.toContain('missing_parent');
      expect(updatedKinds).not.toContain('missing_acceptance_contract');
      expect(updatedKinds).toContain('missing_work');

      // 3. Add Ticket without code grounding -> triggers missing_code_grounding
      await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'TKT-WORK', title: 'Work ticket', lane: 'In Progress' });
      await registry.execute('link_product', { sourceId: 'TKT-WORK', predicate: 'addresses', targetId: 'STORY-GAP' }, ctx);

      cov = await getCoverage(store, 'STORY-GAP');
      expect(cov.gaps.map(g => g.kind)).toContain('missing_code_grounding');

      // 4. Ground ticket in code
      const codeFile = await store.upsertEntity<FileNode>(FileNode.dcr, {
        id: 'src/handler.ts', title: 'handler.ts', path: 'src/handler.ts'
      });
      await store.relate('TKT-WORK', 'modifies', codeFile);

      cov = await getCoverage(store, 'STORY-GAP');
      expect(cov.gaps.map(g => g.kind)).not.toContain('missing_code_grounding');
      expect(cov.gaps.map(g => g.kind)).toContain('missing_verification');

      // 5. Add test verification
      const test = await store.upsertEntity<TestNode>(TestNode.dcr, {
        id: 'TEST-HANDLER', title: 'Handler test', targetPath: 'tests/handler.test.ts'
      });
      await registry.execute('link_product', { sourceId: 'TEST-HANDLER', predicate: 'verifies', targetId: 'STORY-GAP' }, ctx);

      cov = await getCoverage(store, 'STORY-GAP');
      expect(cov.complete).toBe(true);
      expect(cov.gaps).toHaveLength(0);
      expect(cov.related.code).toContain('src/handler.ts');
      expect(cov.related.tests).toContain('TEST-HANDLER');
    });

    it('detects Epic missing_target_path invariant', async () => {
      await registry.execute('create_epic', { id: 'EPIC-TGT', title: 'Targeted Epic' }, ctx);
      await registry.execute('create_feature', { id: 'FEAT-TGT', title: 'Targeted Feature' }, ctx);
      await registry.execute('create_user_story', { id: 'STORY-TGT', title: 'Targeted Story' }, ctx);

      await registry.execute('link_product', { sourceId: 'EPIC-TGT', predicate: 'targets', targetId: 'FEAT-TGT' }, ctx);
      await registry.execute('link_product', { sourceId: 'EPIC-TGT', predicate: 'targets', targetId: 'STORY-TGT' }, ctx);

      // Epic targets Feature and Story, but has no contained tickets reaching them
      let cov = await getCoverage(store, 'EPIC-TGT');
      expect(cov.complete).toBe(false);
      expect(cov.gaps.filter(g => g.kind === 'missing_target_path')).toHaveLength(2);

      // Add contained ticket implementing Feature
      await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'TKT-IMPL', title: 'Impl', lane: 'In Progress' });
      await registry.execute('link_product', { sourceId: 'EPIC-TGT', predicate: 'contains', targetId: 'TKT-IMPL' }, ctx);
      await registry.execute('link_product', { sourceId: 'TKT-IMPL', predicate: 'implements', targetId: 'FEAT-TGT' }, ctx);

      cov = await getCoverage(store, 'EPIC-TGT');
      // Feature target is now satisfied; Story target still missing path
      const remainingTargetGaps = cov.gaps.filter(g => g.kind === 'missing_target_path');
      expect(remainingTargetGaps).toHaveLength(1);
      expect(remainingTargetGaps[0].relatedIds).toContain('STORY-TGT');

      // Add ticket addressing the Story
      await registry.execute('link_product', { sourceId: 'TKT-IMPL', predicate: 'addresses', targetId: 'STORY-TGT' }, ctx);
      cov = await getCoverage(store, 'EPIC-TGT');
      expect(cov.gaps.filter(g => g.kind === 'missing_target_path')).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 4. Bounded Product Impact (src/product/impact.ts)
  // ===========================================================================
  describe('Bounded Product Impact', () => {
    it('bounds context surgically and excludes sibling stories and unrelated nodes', async () => {
      // Setup one capability enabling 2 stories: Target Story and Sibling Story
      await registry.execute('create_feature', { id: 'FEAT-AUTH', title: 'Authentication' }, ctx);
      await registry.execute('create_user_story', { id: 'STORY-LOGIN', title: 'User Login', status: 'accepted' }, ctx);
      await registry.execute('create_user_story', { id: 'STORY-LOGOUT', title: 'User Logout', status: 'accepted' }, ctx);

      await registry.execute('link_product', { sourceId: 'FEAT-AUTH', predicate: 'enables', targetId: 'STORY-LOGIN' }, ctx);
      await registry.execute('link_product', { sourceId: 'FEAT-AUTH', predicate: 'enables', targetId: 'STORY-LOGOUT' }, ctx);

      // Active Epic targeting Login
      await registry.execute('create_epic', { id: 'EPIC-AUTH', title: 'Auth Epic', status: 'active' }, ctx);
      await registry.execute('link_product', { sourceId: 'EPIC-AUTH', predicate: 'targets', targetId: 'STORY-LOGIN' }, ctx);

      // Historical completed Epic targeting Login (must be excluded by default)
      await registry.execute('create_epic', { id: 'EPIC-OLD', title: 'Old Epic', status: 'completed' }, ctx);
      await registry.execute('link_product', { sourceId: 'EPIC-OLD', predicate: 'targets', targetId: 'STORY-LOGIN' }, ctx);

      // Work & Code for Login
      await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'TKT-LOGIN', title: 'Login Tkt', lane: 'Done' });
      await registry.execute('link_product', { sourceId: 'TKT-LOGIN', predicate: 'addresses', targetId: 'STORY-LOGIN' }, ctx);

      const codeSym = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
        id: 'loginFn', title: 'loginFn', filePath: 'src/auth.ts', kind: 'function', line: 10, column: 0
      });
      await store.relate('TKT-LOGIN', 'modifies', codeSym);

      // Test for Login
      await store.upsertEntity<TestNode>(TestNode.dcr, { id: 'TEST-LOGIN', title: 'Login test', targetPath: 't.ts' });
      await registry.execute('link_product', { sourceId: 'TEST-LOGIN', predicate: 'verifies', targetId: 'STORY-LOGIN' }, ctx);

      // Decision governing containing Feature
      await store.upsertEntity<Decision>(Decision.dcr, { id: 'ADR-JWT', title: 'JWT Tokens', decision: 'Use JWT' });
      await registry.execute('link_product', { sourceId: 'ADR-JWT', predicate: 'governs', targetId: 'FEAT-AUTH' }, ctx);

      // Unrelated Subgraph
      await registry.execute('create_feature', { id: 'FEAT-BILLING', title: 'Billing' }, ctx);
      await registry.execute('create_user_story', { id: 'STORY-INVOICE', title: 'Invoice', status: 'accepted' }, ctx);

      // Calculate Impact for STORY-LOGIN
      const impact = await getProductImpact(store, 'STORY-LOGIN');

      expect(impact.entityId).toBe('STORY-LOGIN');
      expect(impact.features).toContain('FEAT-AUTH');
      expect(impact.epics).toContain('EPIC-AUTH');
      expect(impact.epics).not.toContain('EPIC-OLD'); // Historical epic excluded
      expect(impact.tickets).toContain('TKT-LOGIN');
      expect(impact.code).toContain('loginFn');
      expect(impact.tests).toContain('TEST-LOGIN');
      expect(impact.decisions).toContain('ADR-JWT');

      // NEGATIVE PROOF: Sibling story and unrelated nodes STAY OUT
      expect(impact.stories).toEqual(['STORY-LOGIN']);
      expect(impact.stories).not.toContain('STORY-LOGOUT');
      expect(impact.features).not.toContain('FEAT-BILLING');
      expect(impact.stories).not.toContain('STORY-INVOICE');
    });
  });

  // ===========================================================================
  // 5. Single-Owner Round-Trip Safe Projections (features.md, epics.md, user-stories.md)
  // ===========================================================================
  describe('Single-Owner Round-Trip Projections', () => {
    it('round-trips features.md and epics.md while keeping relation ownership strict', async () => {
      const diskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-proj-rt-'));
      const diskStore = new WorkflowStore(diskDir);

      try {
        await diskStore.upsertEntity<Epic>(Epic.dcr, { id: 'EPIC-P', title: 'Epic P', status: 'planned' });
        await diskStore.upsertEntity<Feature>(Feature.dcr, {
          id: 'FEAT-P',
          title: 'Feature P',
          status: 'accepted',
          acceptanceCriteria: ['Must be fast', 'Must be reliable']
        });
        await diskStore.upsertEntity<UserStory>(UserStory.dcr, {
          id: 'STORY-P1',
          title: 'Story P1',
          status: 'accepted',
          story: 'first story'
        });
        await diskStore.upsertEntity<UserStory>(UserStory.dcr, {
          id: 'STORY-P2',
          title: 'Story P2',
          status: 'accepted',
          story: 'second story'
        });

        // Initial links: Epic targets Feature P; Feature P enables Story P1 and Story P2.
        await diskStore.relate('EPIC-P', 'targets', 'FEAT-P');
        await diskStore.relate('FEAT-P', 'enables', 'STORY-P1');
        await diskStore.relate('FEAT-P', 'enables', 'STORY-P2');

        // 1. Export projections
        const exported = await exportProjections(diskStore, diskDir);
        expect(exported.exportedFiles).toContain('features.md');
        expect(exported.exportedFiles).toContain('epics.md');
        expect(exported.exportedFiles).toContain('user-stories.md');

        const featPath = path.join(diskDir, 'features.md');
        const epicPath = path.join(diskDir, 'epics.md');
        const storyPath = path.join(diskDir, 'user-stories.md');

        const featMd = fs.readFileSync(featPath, 'utf8');
        expect(featMd).toContain('## FEAT-P: Feature P');
        expect(featMd).toContain('- [ ] Must be fast');
        expect(featMd).toContain('- **STORY-P1**: Story P1');
        expect(featMd).toContain('- **STORY-P2**: Story P2');

        // 2. Modify features.md on disk: remove STORY-P2 (owned relation modification)
        const modifiedFeatMd = featMd.replace(/- \*\*STORY-P2\*\*:.*\n/, '');
        fs.writeFileSync(featPath, modifiedFeatMd, 'utf8');
        const futureTime = new Date(Date.now() + 5000);
        fs.utimesSync(featPath, futureTime, futureTime);

        // 3. Import projections
        const imp = await importProjections(diskStore, diskDir);
        expect(imp.importedChanges).toBeGreaterThanOrEqual(1);

        // Verify STORY-P2 was removed from Feature P enables relation in graph
        const outgoingEnables = await diskStore.getOutgoing('FEAT-P', 'enables');
        const enabledIds = outgoingEnables.map(p => diskStore.localId(p.targetId));
        expect(enabledIds).toContain('STORY-P1');
        expect(enabledIds).not.toContain('STORY-P2');

        // 4. Verify user-stories.md edits do NOT destroy graph links
        const storyMd = fs.readFileSync(storyPath, 'utf8');
        fs.writeFileSync(storyPath, storyMd.replace('first story', 'first story rewritten'), 'utf8');
        const laterTime = new Date(Date.now() + 10000);
        fs.utimesSync(storyPath, laterTime, laterTime);

        await importProjections(diskStore, diskDir);
        const refreshedStory = await diskStore.getEntity<UserStory>('STORY-P1', UserStory.dcr);
        expect((refreshedStory as any).story).toBe('first story rewritten');

        // Feature enables Story P1 edge still intact.
        const recheckEnables = await diskStore.getOutgoing('FEAT-P', 'enables');
        expect(recheckEnables.some(p => diskStore.localId(p.targetId) === 'STORY-P1')).toBe(true);

        // 5. Idempotent export and import without changes
        const reExport = await exportProjections(diskStore, diskDir);
        expect(reExport.exportedFiles.length).toBeGreaterThan(0);
        const reImport = await importProjections(diskStore, diskDir);
        expect(reImport.importedChanges).toBe(0);
      } finally {
        diskStore.close();
        fs.rmSync(diskDir, { recursive: true, force: true });
      }
    });
  });

  // ===========================================================================
  // 6. Ticket 1 Acceptance Fixture (Calendar + Unrelated Contact Graph)
  // ===========================================================================
  describe('Ticket 1 Acceptance Fixture (Calendar & Contact Graphs)', () => {
    it('proves complete causal coverage and bounded context for the calendar acceptance fixture', async () => {
      // --- Setup Calendar Subgraph ---
      const epic = await store.upsertEntity<Epic>(Epic.dcr, {
        id: 'EPIC-CALENDAR', title: 'Calendar Overhaul', status: 'active'
      });
      const feat = await store.upsertEntity<Feature>(Feature.dcr, {
        id: 'FEAT-EVENT-CREATE', title: 'Event Creation', status: 'accepted',
        acceptanceCriteria: ['Valid start and end time required']
      });
      const storyCreate = await store.upsertEntity<UserStory>(UserStory.dcr, {
        id: 'STORY-CREATE', title: 'Create event', status: 'accepted',
        acceptanceCriteria: ['Event created in store']
      });
      const storyAttendees = await store.upsertEntity<UserStory>(UserStory.dcr, {
        id: 'STORY-ATTENDEES', title: 'Invite attendees', status: 'accepted',
        acceptanceCriteria: ['Attendee email invited']
      });
      const calendarFlow = await store.upsertEntity<Flow>(Flow.dcr, {
        id: 'FLOW-CALENDAR', title: 'Create and share a calendar event', actor: 'Calendar user',
        body: 'The user creates an event and may invite attendees.', status: 'accepted'
      });
      const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
        id: 'TKT-CONTRACT', title: 'Implement attendee contract', lane: 'Done'
      });
      const testAttendees = await store.upsertEntity<TestNode>(TestNode.dcr, {
        id: 'TEST-ATTENDEES', title: 'Attendee test', targetPath: 'tests/attendees.test.ts'
      });
      const adr = await store.upsertEntity<Decision>(Decision.dcr, {
        id: 'ADR-CALENDAR', title: 'Calendar schema design', decision: 'RFC 5545 format'
      });
      const codeInput = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
        id: 'CalendarCreateInput', title: 'CalendarCreateInput', filePath: 'src/calendar/types.ts',
        kind: 'type', line: 15, column: 0
      });

      // Relations:
      // EPIC-CALENDAR targets FEAT-EVENT-CREATE & STORY-ATTENDEES
      await store.relate(epic, 'targets', feat);
      await store.relate(epic, 'targets', storyAttendees);

      // The Flow contains the Stories; the Feature enables them.
      await store.relate(calendarFlow, 'contains', storyCreate);
      await store.relate(calendarFlow, 'contains', storyAttendees);
      await store.relate(feat, 'enables', storyCreate);
      await store.relate(feat, 'enables', storyAttendees);

      // EPIC-CALENDAR contains TKT-CONTRACT
      await store.relate(epic, 'contains', ticket);

      // TKT-CONTRACT implements FEAT-EVENT-CREATE & addresses STORY-ATTENDEES & modifies CalendarCreateInput
      await store.relate(ticket, 'implements', feat);
      await store.relate(ticket, 'addresses', storyAttendees);
      await store.relate(ticket, 'modifies', codeInput);

      // TEST-ATTENDEES verifies STORY-ATTENDEES
      await store.relate(testAttendees, 'verifies', storyAttendees);

      // ADR-CALENDAR governs FEAT-EVENT-CREATE
      await store.relate(adr, 'governs', feat);

      // --- Setup Unrelated Contact Subgraph ---
      const featContact = await store.upsertEntity<Feature>(Feature.dcr, {
        id: 'FEAT-CONTACT-SEARCH', title: 'Contact Search'
      });
      const storyContact = await store.upsertEntity<UserStory>(UserStory.dcr, {
        id: 'STORY-CONTACT-NAME', title: 'Search by name'
      });
      const tktContact = await store.upsertEntity<Ticket>(Ticket.dcr, {
        id: 'TKT-CONTACT', title: 'Contact search query', lane: 'Todo'
      });
      await store.relate(featContact, 'enables', storyContact);
      await store.relate(tktContact, 'addresses', storyContact);

      // --- Assertions ---
      // 1. Story Coverage on STORY-ATTENDEES must be complete
      const storyCov = await getCoverage(store, 'STORY-ATTENDEES');
      expect(storyCov.complete).toBe(true);
      expect(storyCov.gaps).toHaveLength(0);
      expect(storyCov.related.features).toContain('FEAT-EVENT-CREATE');
      expect(storyCov.related.tickets).toContain('TKT-CONTRACT');
      expect(storyCov.related.code).toContain('CalendarCreateInput');
      expect(storyCov.related.tests).toContain('TEST-ATTENDEES');

      // 2. Epic Coverage on EPIC-CALENDAR: target paths to FEAT-EVENT-CREATE and STORY-ATTENDEES are verified
      const epicCov = await getCoverage(store, 'EPIC-CALENDAR');
      expect(epicCov.complete).toBe(true);
      expect(epicCov.gaps).toHaveLength(0);
      expect(epicCov.related.features).toContain('FEAT-EVENT-CREATE');
      expect(epicCov.related.stories).toContain('STORY-ATTENDEES');
      expect(epicCov.related.tickets).toContain('TKT-CONTRACT');

      // 3. Product Impact starting from STORY-ATTENDEES
      const impact = await getProductImpact(store, 'STORY-ATTENDEES');
      expect(impact.entityId).toBe('STORY-ATTENDEES');
      expect(impact.features).toContain('FEAT-EVENT-CREATE');
      expect(impact.epics).toContain('EPIC-CALENDAR');
      expect(impact.tickets).toContain('TKT-CONTRACT');
      expect(impact.code).toContain('CalendarCreateInput');
      expect(impact.tests).toContain('TEST-ATTENDEES');
      expect(impact.decisions).toContain('ADR-CALENDAR'); // Governs containing feature

      // NEGATIVE ASSERTION: Unrelated contact-search nodes stay out
      expect(impact.features).not.toContain('FEAT-CONTACT-SEARCH');
      expect(impact.stories).not.toContain('STORY-CONTACT-NAME');
      expect(impact.tickets).not.toContain('TKT-CONTACT');
    });
  });
});
