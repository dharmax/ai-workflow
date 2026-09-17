/**
 * Responsibility: Unified database store and AST+ Semantic Graph layer built on Semantika.
 * Scope: Entity persistence, predicate relationships, graph traversal, ticket leasing, and transactions.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Database } from 'bun:sqlite';
import {
  SemanticPackage,
  SqliteStore,
  AbstractEntity,
  EntityDcr,
  PredicateDcr,
  Predicate
} from '@dharmax/semantika';
import {
  graphOntology,
  semanticPredicates,
  entityDescriptors,
  Ticket,
  Epic,
  UserStory,
  ModuleNode,
  FileNode,
  SymbolNode,
  TestNode,
  Decision,
  Lesson,
  Artifact,
  Idea
} from './ontology.ts';
import type {
  TicketClaim,
  TicketLane,
  ProjectHealth,
  ModuleHealth,
  SemanticPredicateName
} from './types.ts';

export function findProjectRoot(startDir: string = process.cwd()): { root: string; marker: string } {
  let current = path.resolve(startDir);
  const home = os.homedir();
  const rootMarkers = ['.ai-workflow', '.git', 'bun.lock', 'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod'];

  while (true) {
    for (const marker of rootMarkers) {
      if (fs.existsSync(path.join(current, marker))) {
        return { root: current, marker };
      }
    }
    const parent = path.dirname(current);
    if (parent === current || current === home) break;
    current = parent;
  }

  return { root: path.resolve(startDir), marker: 'fallback:cwd' };
}

export class WorkflowStore {
  public readonly root: string;
  public readonly db: Database;
  public readonly sqliteStore: SqliteStore;
  public readonly sp: SemanticPackage;

  constructor(projectRoot?: string, inMemory: boolean = false) {
    this.root = projectRoot ? path.resolve(projectRoot) : findProjectRoot().root;

    if (inMemory) {
      this.db = new Database(':memory:');
    } else {
      const stateDir = path.join(this.root, '.ai-workflow', 'state');
      fs.mkdirSync(stateDir, { recursive: true });
      this.db = new Database(path.join(stateDir, 'graph.db'));
    }

    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    this.sqliteStore = new SqliteStore(this.db);
    this.sp = new SemanticPackage('aiwf', graphOntology, this.sqliteStore);
  }

  /**
   * Format entity ID into a fully qualified Semantika ID: aiwf_<TypeName>_<LocalId>.
   */
  formatId(typeOrDcr: string | EntityDcr, rawId: string): string {
    const dcr = this.getDescriptor(typeOrDcr);
    const prefix = `${this.sp.name}_${dcr.name}_`;
    if (rawId.startsWith(prefix)) return rawId;
    if (rawId.startsWith(`${this.sp.name}_`) && rawId.includes(`_${dcr.name}_`)) return rawId;
    // Semantika splits IDs on '_' and assumes idSegments[idSegments.length - 2] is the type name.
    // Replace underscores in local ID with hyphens to guarantee exactly 3 segments: <pkg>_<type>_<localId>
    const sanitizedLocalId = rawId.replace(/_/g, '-');
    return `${prefix}${sanitizedLocalId}`;
  }

  /**
   * Extract human-readable local ID from fully qualified Semantika ID.
   */
  localId(id: string): string {
    const prefix = `${this.sp.name}_`;
    if (id.startsWith(prefix)) {
      const rest = id.slice(prefix.length);
      const nextUnderscore = rest.indexOf('_');
      if (nextUnderscore !== -1) {
        return rest.slice(nextUnderscore + 1);
      }
    }
    return id;
  }

  /**
   * Run operations inside a SQLite transaction.
   */
  transaction<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }

  /**
   * Close the database connection safely.
   */
  close() {
    try {
      (this.db as any).exec = () => {};
      this.db.close();
    } catch {
      // Safe no-op on already closed database
    }
  }

  /**
   * Resolves descriptor by entity class or name.
   */
  getDescriptor(typeOrDcr: string | EntityDcr): EntityDcr {
    if (typeof typeOrDcr !== 'string') return typeOrDcr;
    const found = entityDescriptors.find(d => d.name.toLowerCase() === typeOrDcr.toLowerCase());
    if (!found) throw new Error(`Unknown entity descriptor: ${typeOrDcr}`);
    return found;
  }

  /**
   * Creates or updates an entity in the graph.
   */
  async upsertEntity<T extends AbstractEntity = AbstractEntity>(
    typeOrDcr: string | EntityDcr,
    data: Record<string, any>
  ): Promise<T> {
    const dcr = this.getDescriptor(typeOrDcr);
    const rawId = data.id || data._id;
    const formattedId = rawId ? this.formatId(dcr, rawId) : undefined;

    if (formattedId) {
      try {
        const existing = await this.getEntity<T>(formattedId, dcr);
        if (existing) {
          const updatePayload: Record<string, any> = { ...data, updatedAt: new Date().toISOString() };
          delete updatePayload.id;
          delete updatePayload._id;
          await existing.update(updatePayload, true, false);
          return existing;
        }
      } catch {}
    }

    const createPayload = {
      ...data,
      id: formattedId,
      _id: formattedId,
      status: data.status ?? 'implemented',
      createdAt: data.createdAt ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? new Date().toISOString()
    };
    return await this.sp.createEntity<T>(dcr, createPayload, true, false);
  }

  /**
   * Fetches an entity by ID (handles both local IDs and fully qualified IDs).
   */
  async getEntity<T extends AbstractEntity = AbstractEntity>(
    id: string,
    typeOrDcr?: string | EntityDcr
  ): Promise<T | null> {
    if (typeOrDcr) {
      const formattedId = this.formatId(typeOrDcr, id);
      try {
        return await this.sp.loadEntityById<T>(formattedId);
      } catch {
        return null;
      }
    }

    // Try directly if already fully qualified
    if (id.startsWith(`${this.sp.name}_`)) {
      try {
        return await this.sp.loadEntityById<T>(id);
      } catch {}
    }

    // Search across descriptors with candidate formatting
    for (const dcr of entityDescriptors) {
      try {
        const candidateId = this.formatId(dcr, id);
        const col = await this.sp.collectionForEntityType(dcr);
        const doc = await col.findById(candidateId);
        if (doc) {
          return this.sp.makeEntity<T>(dcr, candidateId, doc);
        }
      } catch {}
    }
    return null;
  }

  /**
   * Deletes an entity and all its connected predicates.
   */
  async deleteEntity(id: string): Promise<boolean> {
    const entity = await this.getEntity(id);
    if (entity) {
      await entity.erase();
      return true;
    }
    return false;
  }

  /**
   * Lists entities of a specific type matching an optional query.
   */
  async listEntities<T extends AbstractEntity = AbstractEntity>(
    typeOrDcr: string | EntityDcr,
    query: Record<string, any> = {},
    options: { sort?: Record<string, 1 | -1>; limit?: number; from?: number } = {}
  ): Promise<T[]> {
    const dcr = this.getDescriptor(typeOrDcr);
    const col = await this.sp.collectionForEntityType(dcr);
    const docs = await col.findSome<any>(query, options);
    return docs.map(doc => this.sp.makeEntity<T>(dcr, doc._id || doc.id, doc));
  }

  /**
   * Connects two entities via a semantic predicate.
   */
  async relate(
    source: AbstractEntity | string,
    predicateName: SemanticPredicateName | string,
    target: AbstractEntity | string,
    payload?: Record<string, any>
  ): Promise<Predicate> {
    const pDcr = (semanticPredicates as Record<string, PredicateDcr>)[predicateName] ||
      this.sp.ontology.pdcr(predicateName);
    if (!pDcr) throw new Error(`Unknown predicate: ${predicateName}`);

    const sourceEntity = typeof source === 'string' ? await this.getEntity(source) : source;
    const targetEntity = typeof target === 'string' ? await this.getEntity(target) : target;

    if (!sourceEntity) throw new Error(`Source entity not found: ${typeof source === 'string' ? source : source.id}`);
    if (!targetEntity) throw new Error(`Target entity not found: ${typeof target === 'string' ? target : target.id}`);

    try {
      return await this.sp.createPredicate(sourceEntity, pDcr, targetEntity, payload);
    } catch (err: any) {
      if (err.name === 'DuplicateKeyError' || String(err).includes('duplicate key')) {
        return null as any;
      }
      throw err;
    }
  }

  /**
   * Removes predicates between two entities.
   */
  async unrelate(
    sourceId: string,
    predicateName: string,
    targetId: string
  ): Promise<number> {
    const pCol = await this.sp.predicateCollection((semanticPredicates as Record<string, PredicateDcr>)[predicateName]);
    const src = await this.getEntity(sourceId);
    const tgt = await this.getEntity(targetId);
    return await pCol.deleteByQuery({
      sourceId: src?.id || sourceId,
      predicateName,
      targetId: tgt?.id || targetId
    });
  }

  /**
   * Finds incoming connections to an entity.
   */
  async getIncoming(
    targetId: string,
    predicateName?: string
  ): Promise<Predicate[]> {
    const entity = await this.getEntity(targetId);
    const resolvedId = entity ? entity.id : targetId;
    return await this.sp.findPredicates(true, predicateName, resolvedId);
  }

  /**
   * Finds outgoing connections from an entity.
   */
  async getOutgoing(
    sourceId: string,
    predicateName?: string
  ): Promise<Predicate[]> {
    const entity = await this.getEntity(sourceId);
    const resolvedId = entity ? entity.id : sourceId;
    return await this.sp.findPredicates(false, predicateName, resolvedId);
  }

  /**
   * Breadth-first graph traversal up to maxDepth hops.
   */
  async traverse(
    startId: string,
    options: {
      maxDepth?: number;
      predicateTypes?: string[];
      direction?: 'outgoing' | 'incoming' | 'both';
      limit?: number;
    } = {}
  ): Promise<{ entities: AbstractEntity[]; predicates: Predicate[] }> {
    const entity = await this.getEntity(startId);
    const resolvedId = entity ? entity.id : startId;
    return await this.sp.traverse(resolvedId, options);
  }

  // ---------------------------------------------------------------------------
  // Ticket Management & Atomic Leases
  // ---------------------------------------------------------------------------

  /**
   * Leases a ticket to an agent with a time-to-live (TTL).
   */
  async claimTicket(
    ticketId: string,
    agentId: string,
    durationMinutes: number = 30
  ): Promise<{ success: boolean; claim?: TicketClaim; message?: string }> {
    const ticket = await this.getEntity<Ticket>(ticketId, Ticket.dcr);
    if (!ticket) return { success: false, message: `Ticket not found: ${ticketId}` };

    const now = new Date();
    const existingClaim: TicketClaim | undefined = (ticket as any).claim;

    if (existingClaim && new Date(existingClaim.expiresAt) > now && existingClaim.agentId !== agentId) {
      return {
        success: false,
        claim: existingClaim,
        message: `Ticket ${ticketId} is actively leased by agent '${existingClaim.agentId}' until ${existingClaim.expiresAt}`
      };
    }

    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
    const claim: TicketClaim = {
      agentId,
      claimedAt: now.toISOString(),
      expiresAt
    };

    await ticket.update({ claim, lane: 'In Progress' }, true, false);
    return { success: true, claim };
  }

  /**
   * Releases an active ticket lease.
   */
  async releaseTicket(ticketId: string): Promise<boolean> {
    const ticket = await this.getEntity<Ticket>(ticketId, Ticket.dcr);
    if (!ticket) return false;
    await ticket.update({ claim: null }, true, false);
    return true;
  }

  /**
   * Checks if a ticket has an active unexpired lease.
   */
  async isTicketClaimed(ticketId: string): Promise<boolean> {
    const ticket = await this.getEntity<Ticket>(ticketId, Ticket.dcr);
    if (!ticket) return false;
    const claim: TicketClaim | undefined = (ticket as any).claim;
    if (!claim) return false;
    return new Date(claim.expiresAt) > new Date();
  }

  /**
   * Retrieves all currently active ticket claims.
   */
  async getActiveClaims(): Promise<Array<{ ticketId: string; claim: TicketClaim }>> {
    const tickets = await this.listEntities<Ticket>(Ticket.dcr, { lane: 'In Progress' });
    const now = new Date();
    const active: Array<{ ticketId: string; claim: TicketClaim }> = [];

    for (const t of tickets) {
      const claim: TicketClaim | undefined = (t as any).claim;
      if (claim && new Date(claim.expiresAt) > now) {
        active.push({ ticketId: this.localId(t.id), claim });
      }
    }
    return active;
  }

  /**
   * Computes overall project health and module matrix.
   */
  async getProjectHealth(): Promise<ProjectHealth> {
    const tickets = await this.listEntities<Ticket>(Ticket.dcr);
    const modules = await this.listEntities<ModuleNode>(ModuleNode.dcr);
    const lessons = await this.listEntities<Lesson>(Lesson.dcr);

    const byLane: Record<TicketLane, number> = {
      'Backlog': 0,
      'Todo': 0,
      'In Progress': 0,
      'Done': 0,
      'Blocked': 0
    };

    for (const t of tickets) {
      const lane = ((t as any).lane as TicketLane) || 'Backlog';
      if (byLane[lane] !== undefined) byLane[lane]++;
    }

    const totalTickets = tickets.length;
    const doneTickets = byLane['Done'];
    const completionPercent = totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 100;

    const moduleSummaries: ModuleHealth[] = [];
    for (const m of modules) {
      const containsPreds = await this.getOutgoing(m.id, 'contains');
      const fileIds = containsPreds.map(p => p.targetId);

      let symbolCount = 0;
      for (const fid of fileIds) {
        const symPreds = await this.getOutgoing(fid, 'contains');
        symbolCount += symPreds.length;
      }

      const bugsInModule = lessons.filter(l => (l as any).noteType === 'BUG' && fileIds.some(fid => (l as any).filePath?.includes(fid)));
      const activeTickets = tickets.filter(t => (t as any).lane !== 'Done' && fileIds.some(fid => (t as any).body?.includes(fid))).map(t => this.localId(t.id));

      moduleSummaries.push({
        name: (m as any).title || this.localId(m.id),
        path: (m as any).path || this.localId(m.id),
        completionPercent: (m as any).completionPercent || 0,
        symbolCount,
        bugsCount: bugsInModule.length,
        activeTickets
      });
    }

    const activeClaims = await this.getActiveClaims();

    return {
      totalTickets,
      byLane,
      completionPercent,
      modules: moduleSummaries,
      activeClaims
    };
  }
}
