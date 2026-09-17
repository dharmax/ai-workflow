import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import {
  Ticket,
  Epic,
  ModuleNode,
  FileNode,
  SymbolNode,
  Lesson
} from '../src/graph/ontology.ts';
import { indexCodebase } from '../src/graph/indexer.ts';
import { exportProjections, importProjections } from '../src/graph/projections.ts';

describe('AST+ Semantic Graph (Semantika)', () => {
  let store: WorkflowStore;

  beforeEach(() => {
    store = new WorkflowStore(undefined, true); // in-memory
  });

  afterEach(() => {
    store.close();
  });

  it('should create and retrieve typed entities with localId resolution', async () => {
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-001',
      title: 'Initialize Semantika Graph',
      lane: 'Todo',
      body: 'Verify that ontology nodes are correctly persisted.'
    });

    expect(ticket).toBeDefined();
    expect(store.localId(ticket.id)).toBe('TKT-001');

    // Retrieve by local ID
    const byLocal = await store.getEntity<Ticket>('TKT-001', Ticket.dcr);
    expect(byLocal).not.toBeNull();
    expect((byLocal as any).title).toBe('Initialize Semantika Graph');
    expect((byLocal as any).lane).toBe('Todo');

    // Retrieve by qualified ID
    const byQualified = await store.getEntity<Ticket>(ticket.id);
    expect(byQualified).not.toBeNull();
    expect((byQualified as any).title).toBe('Initialize Semantika Graph');
  });

  it('should connect entities via semantic predicates and traverse hops', async () => {
    const epic = await store.upsertEntity<Epic>(Epic.dcr, {
      id: 'EPIC-CORE',
      title: 'Core Engine Architecture'
    });

    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-GRAPH-1',
      title: 'Graph Traversal Implementation',
      lane: 'In Progress'
    });

    const file = await store.upsertEntity<FileNode>(FileNode.dcr, {
      id: 'src/graph/store.ts',
      title: 'store.ts',
      path: 'src/graph/store.ts'
    });

    // Relate: Ticket implements Epic
    const pred1 = await store.relate(ticket, 'implements', epic);
    expect(pred1).toBeDefined();
    expect(pred1.predicateName).toBe('implements');

    // Relate: Ticket modifies File
    const pred2 = await store.relate(ticket, 'modifies', file);
    expect(pred2).toBeDefined();

    // Query outgoing & incoming
    const outgoing = await store.getOutgoing(ticket.id);
    expect(outgoing.length).toBe(2);

    const incomingToFile = await store.getIncoming(file.id, 'modifies');
    expect(incomingToFile.length).toBe(1);
    expect(incomingToFile[0].sourceId).toBe(ticket.id);

    // Traverse from Epic (depth 2)
    const traversed = await store.traverse(epic.id, { maxDepth: 2 });
    expect(traversed.entities.length).toBeGreaterThan(0);
    expect(traversed.predicates.length).toBeGreaterThan(0);
  });

  it('should atomically lease and release tickets', async () => {
    await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-LEASE-1',
      title: 'Atomic Claim Test',
      lane: 'Todo'
    });

    // Claim ticket
    const claimRes = await store.claimTicket('TKT-LEASE-1', 'agent-alpha', 15);
    expect(claimRes.success).toBe(true);
    expect(claimRes.claim?.agentId).toBe('agent-alpha');

    expect(await store.isTicketClaimed('TKT-LEASE-1')).toBe(true);

    // Concurrent claim by another agent should fail
    const concurrentRes = await store.claimTicket('TKT-LEASE-1', 'agent-beta', 15);
    expect(concurrentRes.success).toBe(false);

    // Active claims list
    const active = await store.getActiveClaims();
    expect(active.length).toBe(1);
    expect(active[0].ticketId).toBe('TKT-LEASE-1');

    // Release claim
    const released = await store.releaseTicket('TKT-LEASE-1');
    expect(released).toBe(true);
    expect(await store.isTicketClaimed('TKT-LEASE-1')).toBe(false);
  });

  it('should export and import markdown projections', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-proj-'));
    const diskStore = new WorkflowStore(tmpDir);

    try {
      await diskStore.upsertEntity<Ticket>(Ticket.dcr, {
        id: 'TKT-EXPORT-1',
        title: 'Export Validation',
        lane: 'Todo',
        body: 'Validate Obsidian Kanban format'
      });

      await diskStore.upsertEntity<Epic>(Epic.dcr, {
        id: 'EPIC-EXP',
        title: 'Export Epic',
        body: 'Epic summary'
      });

      await exportProjections(diskStore, tmpDir);

      const kanbanFile = path.join(tmpDir, 'kanban.md');
      expect(fs.existsSync(kanbanFile)).toBe(true);
      const kanbanContent = fs.readFileSync(kanbanFile, 'utf8');
      expect(kanbanContent).toContain('TKT-EXPORT-1');
      expect(kanbanContent).toContain('Export Validation');

      // Now create a new store and import projections
      const freshStore = new WorkflowStore(tmpDir);
      await importProjections(freshStore, tmpDir);

      const imported = await freshStore.getEntity<Ticket>('TKT-EXPORT-1', Ticket.dcr);
      expect(imported).not.toBeNull();
      expect((imported as any).title).toBe('Export Validation');

      freshStore.close();
    } finally {
      diskStore.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should index codebase AST symbols and modules', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-idx-'));
    const diskStore = new WorkflowStore(tmpDir);

    try {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'math.ts'),
        `// TODO: add multiply function
export function add(a: number, b: number): number {
  return a + b;
}
`,
        'utf8'
      );

      const result = await indexCodebase(diskStore, tmpDir);
      expect(result.filesCount).toBe(1);
      expect(result.symbolsCount).toBeGreaterThanOrEqual(1);
      expect(result.notesCount).toBe(1);

      const files = await diskStore.listEntities<FileNode>(FileNode.dcr);
      expect(files.length).toBe(1);

      const symbols = await diskStore.listEntities<SymbolNode>(SymbolNode.dcr);
      expect(symbols.some(s => (s as any).title === 'add')).toBe(true);

      const notes = await diskStore.listEntities<Lesson>(Lesson.dcr);
      expect(notes.some(n => (n as any).noteType === 'TODO')).toBe(true);
    } finally {
      diskStore.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
