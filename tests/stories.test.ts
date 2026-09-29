import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Epic, Ticket, TestNode, UserStory } from '../src/graph/ontology.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { exportProjections, importProjections } from '../src/graph/projections.ts';

describe('User stories as first-class graph entities', () => {
  let tempDir: string;
  let store: WorkflowStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-stories-'));
    store = new WorkflowStore(tempDir, true);
    initializeTools();
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('models Epic -> Story <- Ticket and Test -> Story relations', async () => {
    const epic = await store.upsertEntity<Epic>(Epic.dcr, {
      id: 'EPIC-STORY',
      title: 'Story support'
    });
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-STORY',
      title: 'Implement story support',
      lane: 'Todo'
    });
    const test = await store.upsertEntity<TestNode>(TestNode.dcr, {
      id: 'TEST-STORY',
      title: 'Story acceptance test',
      targetPath: 'tests/stories.test.ts'
    });

    const created = await registry.execute('create_user_story', {
      id: 'STORY-001',
      title: 'See implementation coverage',
      actor: 'developer',
      story: 'see whether a requested behavior is implemented and verified',
      acceptanceCriteria: ['Implementation tickets are visible', 'Verification tests are visible'],
      epicId: 'EPIC-STORY'
    }, { store, projectRoot: tempDir });

    expect(created.epicIds).toEqual(['EPIC-STORY']);
    expect(created.implemented).toBe(false);
    expect(created.verified).toBe(false);

    const linked = await registry.execute('link_user_story', {
      storyId: 'STORY-001',
      ticketIds: ['TKT-STORY'],
      testIds: ['TEST-STORY']
    }, { store, projectRoot: tempDir });

    expect(linked.ticketIds).toEqual(['TKT-STORY']);
    expect(linked.testIds).toEqual(['TEST-STORY']);
    expect(linked.implemented).toBe(true);
    expect(linked.verified).toBe(true);

    const epicStories = await store.getOutgoing(epic.id, 'contains');
    expect(epicStories.some(p => p.targetId === store.formatId(UserStory.dcr, 'STORY-001'))).toBe(true);

    const ticketStories = await store.getOutgoing(ticket.id, 'addresses');
    expect(ticketStories.some(p => p.targetId === store.formatId(UserStory.dcr, 'STORY-001'))).toBe(true);

    const testStories = await store.getOutgoing(test.id, 'verifies');
    expect(testStories.some(p => p.targetId === store.formatId(UserStory.dcr, 'STORY-001'))).toBe(true);
  });

  it('queries unimplemented and unverified story coverage', async () => {
    await registry.execute('create_user_story', {
      id: 'STORY-A',
      title: 'Unimplemented behavior'
    }, { store, projectRoot: tempDir });

    await registry.execute('create_user_story', {
      id: 'STORY-B',
      title: 'Implemented but unverified'
    }, { store, projectRoot: tempDir });

    await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-B',
      title: 'Implement B',
      lane: 'Done'
    });
    await registry.execute('link_user_story', {
      storyId: 'STORY-B',
      ticketIds: ['TKT-B']
    }, { store, projectRoot: tempDir });

    const unimplemented = await registry.execute('list_user_stories', {
      coverage: 'unimplemented'
    }, { store, projectRoot: tempDir });
    expect(unimplemented.map((s: any) => s.id)).toEqual(['STORY-A']);

    const unverified = await registry.execute('list_user_stories', {
      coverage: 'unverified'
    }, { store, projectRoot: tempDir });
    expect(unverified.map((s: any) => s.id).sort()).toEqual(['STORY-A', 'STORY-B']);
  });

  it('round-trips user-stories.md with graph relations', async () => {
    const diskStore = new WorkflowStore(tempDir);

    try {
      await diskStore.upsertEntity<Epic>(Epic.dcr, {
        id: 'EPIC-PROJ',
        title: 'Projection epic'
      });
      await diskStore.upsertEntity<Ticket>(Ticket.dcr, {
        id: 'TKT-PROJ',
        title: 'Projection ticket',
        lane: 'Todo'
      });
      await diskStore.upsertEntity<TestNode>(TestNode.dcr, {
        id: 'TEST-PROJ',
        title: 'Projection test',
        targetPath: 'tests/projection.test.ts'
      });

      const story = await diskStore.upsertEntity<UserStory>(UserStory.dcr, {
        id: 'STORY-PROJ',
        title: 'Projection story',
        actor: 'user',
        story: 'edit the behavioral projection',
        context: 'prove bidirectional story sync',
        acceptanceCriteria: ['Story survives sync'],
        sla: 'fast'
      });
      await diskStore.relate('EPIC-PROJ', 'contains', story);
      await diskStore.relate('TKT-PROJ', 'addresses', story);
      await diskStore.relate('TEST-PROJ', 'verifies', story);

      const exported = await exportProjections(diskStore, tempDir);
      expect(exported.exportedFiles).toContain('user-stories.md');

      const storyPath = path.join(tempDir, 'user-stories.md');
      const markdown = fs.readFileSync(storyPath, 'utf8');
      expect(markdown).toContain('## STORY-PROJ: Projection story');
      expect(markdown).toContain('**Epic**: `EPIC-PROJ`');
      expect(markdown).toContain('**Tickets**: `TKT-PROJ`');
      expect(markdown).toContain('**Tests**: `TEST-PROJ`');

      fs.writeFileSync(storyPath, markdown.replace('Projection story', 'Projection story edited'), 'utf8');
      const futureTime = new Date(Date.now() + 5000);
      fs.utimesSync(storyPath, futureTime, futureTime);

      await importProjections(diskStore, tempDir);
      const updated = await diskStore.getEntity<UserStory>('STORY-PROJ', UserStory.dcr);
      expect((updated as any).title).toBe('Projection story edited');

      const epicLinks = await diskStore.getIncoming('STORY-PROJ', 'contains');
      const ticketLinks = await diskStore.getIncoming('STORY-PROJ', 'addresses');
      const testLinks = await diskStore.getIncoming('STORY-PROJ', 'verifies');
      expect(epicLinks).toHaveLength(1);
      expect(ticketLinks).toHaveLength(1);
      expect(testLinks).toHaveLength(1);

      const withoutTicket = fs.readFileSync(storyPath, 'utf8')
        .replace(/^- \*\*Tickets\*\*:.*\n/m, '');
      fs.writeFileSync(storyPath, withoutTicket, 'utf8');
      const laterTime = new Date(Date.now() + 10000);
      fs.utimesSync(storyPath, laterTime, laterTime);
      await importProjections(diskStore, tempDir);
      expect(await diskStore.getIncoming('STORY-PROJ', 'addresses')).toHaveLength(0);
    } finally {
      diskStore.close();
    }
  });
});
