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
    expect(traversed.entities.length).toBeGreaterThanOrEqual(2);
    expect(traversed.predicates.length).toBeGreaterThanOrEqual(2);
    const entityIds = traversed.entities.map(e => e.id);
    expect(entityIds).toContain(ticket.id);
    expect(entityIds).toContain(file.id);
  });

  it('should atomically lease, reject concurrent leases, and allow expired lease takeover', async () => {
    await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-LEASE-1',
      title: 'Atomic Claim Test',
      lane: 'Todo'
    });

    // 1. Claim ticket with agent-alpha
    const claimRes = await store.claimTicket('TKT-LEASE-1', 'agent-alpha', 15);
    expect(claimRes.success).toBe(true);
    expect(claimRes.claim?.agentId).toBe('agent-alpha');
    expect(await store.isTicketClaimed('TKT-LEASE-1')).toBe(true);

    // 2. Concurrent claim by agent-beta while unexpired must be rejected
    const concurrentRes = await store.claimTicket('TKT-LEASE-1', 'agent-beta', 15);
    expect(concurrentRes.success).toBe(false);
    expect(concurrentRes.message).toContain("actively leased by agent 'agent-alpha'");

    // 3. Claiming non-existent ticket must fail cleanly
    const nonExistentClaim = await store.claimTicket('TKT-DOES-NOT-EXIST', 'agent-alpha', 10);
    expect(nonExistentClaim.success).toBe(false);
    expect(nonExistentClaim.message).toContain('Ticket not found');

    // 4. Releasing non-existent ticket must return false
    expect(await store.releaseTicket('TKT-DOES-NOT-EXIST')).toBe(false);

    // 5. Active claims list
    const active = await store.getActiveClaims();
    expect(active.length).toBe(1);
    expect(active[0].ticketId).toBe('TKT-LEASE-1');

    // 6. Expired lease takeover: simulate an expired lease for agent-alpha
    const ticket = await store.getEntity<Ticket>('TKT-LEASE-1', Ticket.dcr);
    await ticket!.update({
      claim: {
        agentId: 'agent-alpha',
        claimedAt: new Date(Date.now() - 3600000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString() // expired 1 sec ago
      }
    }, true, false);

    expect(await store.isTicketClaimed('TKT-LEASE-1')).toBe(false);

    // Now agent-beta can take over the expired lease
    const takeoverRes = await store.claimTicket('TKT-LEASE-1', 'agent-beta', 20);
    expect(takeoverRes.success).toBe(true);
    expect(takeoverRes.claim?.agentId).toBe('agent-beta');

    // Release claim
    const released = await store.releaseTicket('TKT-LEASE-1');
    expect(released).toBe(true);
    expect(await store.isTicketClaimed('TKT-LEASE-1')).toBe(false);
  });

  it('should export and import markdown projections with real disk mutation reconciliation', async () => {
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

      // Mutate kanban.md on disk (simulate human editing Obsidian Kanban)
      const editedContent = kanbanContent
        .replace('Export Validation', 'Obsidian Renamed Feature')
        .replace(/## Todo\n[\s\S]*?(?=## In Progress)/, '## Todo\n\n')
        .replace('## In Progress\n', '## In Progress\n- [ ] **[TKT-EXPORT-1]**: Obsidian Renamed Feature\n');

      fs.writeFileSync(kanbanFile, editedContent, 'utf8');

      // Fast forward mtime so sync detects disk modification (> lastExportedAt + 50ms)
      const futureTime = new Date(Date.now() + 5000);
      fs.utimesSync(kanbanFile, futureTime, futureTime);

      // Import projections into SQLite store
      const importResult = await importProjections(diskStore, tmpDir);
      expect(importResult.importedChanges).toBeGreaterThanOrEqual(1);

      // Verify the SQLite store reflected the exact human mutation
      const updatedTicket = await diskStore.getEntity<Ticket>('TKT-EXPORT-1', Ticket.dcr);
      expect(updatedTicket).not.toBeNull();
      expect((updatedTicket as any).title).toBe('Obsidian Renamed Feature');
      expect((updatedTicket as any).lane).toBe('In Progress');
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

  it('should discover and index exported symbols from local file: dependencies in package.json', async () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-ext-dep-'));
    const appDir = path.join(parentDir, 'app');
    const libDir = path.join(parentDir, 'lib');
    fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(libDir, 'src'), { recursive: true });

    const diskStore = new WorkflowStore(appDir);

    try {
      // 1. Setup external dependency package
      fs.writeFileSync(
        path.join(libDir, 'package.json'),
        JSON.stringify({
          name: '@test/mylib',
          version: '1.0.0',
          main: './src/index.ts'
        }, null, 2)
      );
      fs.writeFileSync(
        path.join(libDir, 'src', 'index.ts'),
        `export class SuperEngine {
  start(): void {}
}
export function helperUtil(): string { return 'ok'; }
function privateInternal(): void {}
`
      );

      // 2. Setup app package with file: dependency
      fs.writeFileSync(
        path.join(appDir, 'package.json'),
        JSON.stringify({
          name: 'my-app',
          dependencies: {
            '@test/mylib': 'file:../lib'
          }
        }, null, 2)
      );
      fs.writeFileSync(
        path.join(appDir, 'src', 'main.ts'),
        `import { SuperEngine } from '@test/mylib';
export function run(): void {
  const e = new SuperEngine();
  e.start();
}
`
      );

      const result = await indexCodebase(diskStore, appDir);
      expect(result.filesCount).toBeGreaterThanOrEqual(2); // main.ts + lib index.ts

      const symbols = await diskStore.listEntities<SymbolNode>(SymbolNode.dcr);
      const symbolNames = symbols.map(s => (s as any).title);

      // Exported external symbols must be indexed
      expect(symbolNames).toContain('SuperEngine');
      expect(symbolNames).toContain('helperUtil');
      // Private internal non-exported function must not be indexed
      expect(symbolNames).not.toContain('privateInternal');

      // Check external file metadata
      const files = await diskStore.listEntities<FileNode>(FileNode.dcr);
      const extFile = files.find(f => (f as any).id.includes('@test/mylib'));
      expect(extFile).toBeDefined();
      expect((extFile as any).metadata?.isExternal).toBe(true);
    } finally {
      diskStore.close();
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  });
});
