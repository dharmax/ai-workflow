/**
 * Responsibility: Unified database store and AST+ Semantic Graph layer built on Semantika.
 * Scope: Entity persistence, predicate relationships, graph traversal, ticket leasing, and transactions.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { canonical } from '../kb/canonical.ts';
import { Database } from 'bun:sqlite';
import { ticketState } from './ticket-state.ts';
import {
  SemanticPackage,
  SqliteStore,
  AbstractEntity,
  EntityDcr,
  PredicateDcr,
  Predicate,
  type IPredicateRecord
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
  Idea,
  Rule
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

const admissionSchema = z.array(z.object({token: z.string(), mode: z.enum(['governed', 'governance']), expiresAt: z.number()}));
type BatchEntry = Parameters<SqliteStore['applyBatch']>[0][number];
type AdmissionLease = z.infer<typeof admissionSchema>[number];

export class WorkflowStore {
  private readonly indexing = new AsyncLocalStorage<{token: string; files: readonly string[]; active: boolean}>();

  /** Project-wide shared/exclusive admission. The public conditional batch is the atomic boundary. */
  async admitGovernance(mode: 'governed' | 'governance', durationMinutes = 30): Promise<string> {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw Error('Admission requires a positive lease duration.');
    const token = crypto.randomUUID();
    await this.updateGovernanceAdmission(leases => {
      if (leases.some(lease => mode === 'governance' || lease.mode === 'governance'))
        throw Error('Governance admission conflict: governed work and governance mutation cannot overlap.');
      return [...leases, {token, mode, expiresAt: Date.now() + durationMinutes * 60_000}];
    });
    return token;
  }

  /** An expired owner cannot commit after another process has recovered its admission. */
  async governanceAssertion(token: string): Promise<BatchEntry> {
    const collection = await this.sp.collectionForEntityType(Artifact.dcr);
    const id = this.formatId(Artifact.dcr, 'GOVERNANCE-ADMISSION');
    const row = await collection.findById<{body: string; _version: number}>(id);
    if (!row || !admissionSchema.parse(JSON.parse(row.body)).some(lease => lease.token === token && lease.expiresAt > Date.now()))
      throw Error('Governance admission expired or was recovered; retry with a fresh scope.');
    return {collectionName: collection.name, id, expectedVersion: row._version};
  }

  async renewGovernance(token: string, durationMinutes = 30): Promise<void> {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw Error('Admission requires a positive lease duration.');
    await this.updateGovernanceAdmission(leases => {
      if (!leases.some(lease => lease.token === token)) throw Error('Governance admission expired or was recovered.');
      return leases.map(lease => lease.token === token ? {...lease, expiresAt: Date.now() + durationMinutes * 60_000} : lease);
    });
  }

  async releaseGovernance(token: string): Promise<void> {
    await this.updateGovernanceAdmission(leases => leases.some(lease => lease.token === token)
      ? leases.filter(lease => lease.token !== token) : undefined);
  }

  /** One CAS owner for the canonical admission row; abandoned leases never become active again. */
  private async updateGovernanceAdmission(update: (leases: AdmissionLease[]) => AdmissionLease[] | undefined): Promise<void> {
    const collection = await this.sp.collectionForEntityType(Artifact.dcr);
    const id = this.formatId(Artifact.dcr, 'GOVERNANCE-ADMISSION');
    for (let attempt = 0; attempt < 32; attempt++) {
      const row = await collection.findById<{body: string; _version: number}>(id);
      const leases = update(admissionSchema.parse(row ? JSON.parse(row.body) : []).filter(lease => lease.expiresAt > Date.now()));
      if (!leases) return;
      try {
        this.sqliteStore.applyBatch([{collectionName: collection.name, id, expectedVersion: row?._version ?? null,
          record: {title: 'Project governance admission', body: JSON.stringify(leases), status: 'active'}}]);
        return;
      } catch (error) { if (!String(error).includes('Stale batch revision')) throw error; }
    }
    throw Error('Governance admission contention; retry the operation or recover after lease expiry.');
  }

  /** Rule and applicability writes share exclusive admission with their optimistic commit. */
  async commitGovernance(changes: readonly BatchEntry[]): Promise<Array<Record<string, unknown>>> {
    const token = await this.admitGovernance('governance');
    try {
      const assertion = await this.governanceAssertion(token);
      return this.sqliteStore.applyBatch([assertion, ...changes]);
    } finally { await this.releaseGovernance(token); }
  }

  /** Index-derived ownership is part of the guarded file effect, never an operator governance edit. */
  async withGovernedIndexing<T>(token: string, files: readonly string[], fn: () => Promise<T>): Promise<T> {
    await this.governanceAssertion(token);
    const context = {token, files: [...files], active: true};
    try { return await this.indexing.run(context, fn); }
    finally { context.active = false; }
  }

  private indexingContext() {
    const context = this.indexing.getStore();
    return context?.active ? context : undefined;
  }

  private async commitIndexedOwnership(changes: readonly BatchEntry[]): Promise<Array<Record<string, unknown>>> {
    const context = this.indexingContext();
    if (!context) return this.commitGovernance(changes);
    const assertion = await this.governanceAssertion(context.token);
    if (!context.active) throw Error('Index-derived authority ended before persistence.');
    return this.sqliteStore.applyBatch([assertion, ...changes]);
  }

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

  /** Keep one current in-progress scope on its canonical Ticket; completion moves authority to VERIFY. */
  async saveGovernedScope(ticketId: string, agentId: string, admission: string, scope: import('../ticket-operation-types.ts').GovernedChangeScope): Promise<void> {
    const collection = await this.sp.collectionForEntityType(Ticket.dcr);
    const id = this.formatId(Ticket.dcr, ticketId);
    const old = await collection.findById<Record<string, unknown> & {_version: number; claim?: TicketClaim; metadata?: Record<string, unknown>}>(id);
    if (!old || old.claim?.agentId !== agentId || Date.parse(old.claim.expiresAt) <= Date.now()) throw Error('Scope requires an active owning Ticket claim.');
    this.sqliteStore.applyBatch([await this.governanceAssertion(admission), {collectionName: collection.name, id, expectedVersion: old._version,
      record: {...old, metadata: {...old.metadata, governedScope: scope}}}]);
  }

  /** Rebind an existing code anchor as a guarded source effect; never create new governing authority. */
  async migrateCodeAnchor(sourceId: string, predicateName: string, oldId: string, target: SymbolNode | FileNode, admission?: string): Promise<void> {
    if (!['modifies', 'targets', 'governs'].includes(predicateName)) throw Error('Unsupported durable code anchor.');
    if (oldId === target.id) return;
    const source = await this.getEntity(sourceId);
    if (!source) throw Error('Durable anchor owner disappeared during guarded change.');
    const collection = await this.sp.predicateCollection((semanticPredicates as Record<string, PredicateDcr>)[predicateName]);
    const old = (await collection.findSome<IPredicateRecord & {_id: string; _version: number}>({sourceId: source.id, predicateName, targetId: oldId}))[0];
    if (!old) throw Error('Durable code anchor changed during guarded mutation.');
    const present = (await collection.findSome<IPredicateRecord & {_id: string; _version: number}>({sourceId: source.id, predicateName, targetId: target.id}))[0];
    if (present && canonical(present.payload) !== canonical(old.payload)) throw Error('Conflicting durable anchor provenance.');
    const changes: BatchEntry[] = [{collectionName: collection.name, id: old._id, expectedVersion: old._version, record: null}];
    if (present) changes.push({collectionName: collection.name, id: present._id, expectedVersion: present._version});
    else changes.push({collectionName: collection.name, id: collection.createId(), expectedVersion: null,
      record: {...old, targetId: target.id, targetType: target.typeName()}});
    if (admission) this.sqliteStore.applyBatch([await this.governanceAssertion(admission), ...changes]);
    else await this.commitGovernance(changes);
  }

  /** Replace current verification and transition the leased Ticket in one conditional DB commit. */
  async completeTicket(ticket: Ticket, agentId: string, admission: string, body: string): Promise<void> {
    const tickets = await this.sp.collectionForEntityType(Ticket.dcr);
    const artifacts = await this.sp.collectionForEntityType(Artifact.dcr);
    const predicates = await this.sp.predicateCollection(semanticPredicates.verifies);
    const record = await tickets.findById<Record<string, unknown> & {claim?: TicketClaim; _version: number; metadata?: Record<string, unknown>}>(ticket.id);
    if (!record || record._version !== ticket.version || record.claim?.agentId !== agentId || Date.parse(record.claim.expiresAt) <= Date.now())
      throw Error('Ticket or claim changed before coherent completion.');
    const proofId = this.formatId(Artifact.dcr, `VERIFY-${this.localId(ticket.id)}`);
    const previous = await artifacts.findById<{_version: number}>(proofId);
    const link = (await predicates.findSome<IPredicateRecord & {_id: string; _version: number}>({sourceId: proofId, predicateName: 'verifies', targetId: ticket.id}))[0];
    const assertion = await this.governanceAssertion(admission);
    const changes: BatchEntry[] = [assertion,
      {collectionName: artifacts.name, id: proofId, expectedVersion: previous?._version ?? null,
        record: {title: `Verified acceptance for ${this.localId(ticket.id)}`, body, status: 'verified'}},
      {collectionName: tickets.name, id: ticket.id, expectedVersion: ticket.version,
        record: {...record, metadata: {...record.metadata, governedScope: undefined}, ...ticketState('Done', 'verified'), updatedAt: new Date().toISOString()}}];
    if (link) changes.push({collectionName: predicates.name, id: link._id, expectedVersion: link._version});
    else changes.push({collectionName: predicates.name, id: predicates.createId(), expectedVersion: null, record: {
      sourceId: proofId, sourceType: 'Artifact', predicateName: 'verifies', targetId: ticket.id, targetType: 'Ticket', timestamp: Date.now()}});
    this.sqliteStore.applyBatch(changes);
  }

  /** Hydrate committed DTOs with the same owned entity API as ordinary reads. */
  makeEntity<T extends AbstractEntity>(dcr: EntityDcr, id: string, record: Record<string, unknown>): T {
    return this.ownEntity(this.sp.makeEntity<T>(dcr, id, record));
  }

  /** Returned governance entities retain their public update/erase API without bypassing this store. */
  private ownEntity<T extends AbstractEntity>(entity: T): T {
    const governed = ['Rule', 'Decision', 'Aspect', 'ModuleNode', 'Goal', 'Concept', 'Flow', 'Epic', 'Feature', 'UserStory'].includes(entity.typeName());
    if (!governed) {
      if (!(entity instanceof FileNode || entity instanceof SymbolNode)) return entity;
      const nativeUpdate = entity.update.bind(entity);
      Object.defineProperty(entity, 'erase', {configurable: true, value: () => this.deleteEntity(entity.id, entity.version)});
      Object.defineProperty(entity, 'update', {configurable: true, value: async (fields: Record<string, unknown>, superSet = false, cutExtra = false, rawOperations = {}) => {
        if (!Object.entries(fields).some(([key, value]) => ['path', 'filePath', 'language'].includes(key) && canonical((entity as unknown as Record<string, unknown>)[key]) !== canonical(value)))
          return nativeUpdate(fields, superSet, cutExtra, rawOperations);
        if (Object.keys(rawOperations).length) throw Error('Applicability changes do not support raw storage operations.');
        const collection = await this.sp.collectionForEntityType(entity.descriptor);
        const old = await collection.findById<Record<string, unknown>>(entity.id);
        const entry = {collectionName: collection.name, id: entity.id, expectedVersion: entity.version, record: {...old, ...fields}};
        const indexed = this.indexingContext();
        const filePath = entity instanceof FileNode ? this.localId(entity.id) : entity.filePath;
        const rows = filePath && indexed?.files.includes(filePath) ? await this.commitIndexedOwnership([entry]) : await this.commitGovernance([entry]);
        Object.assign(entity, this.sp.makeEntity(entity.descriptor, entity.id, rows[0]));
        return entity;
      }});
      return entity;
    }
    Object.defineProperty(entity, 'update', {configurable: true, value: async (fields: Record<string, unknown>, _superSet = false, _cutExtra = false, rawOperations = {}) => {
      if (Object.keys(rawOperations).length) throw Error('Governance mutations do not support raw storage operations.');
      const fresh = await this.upsertEntity(entity.descriptor, {id: entity.id, ...fields}, entity.version);
      Object.assign(entity, fresh);
      return entity;
    }});
    Object.defineProperty(entity, 'erase', {configurable: true, value: () => this.deleteEntity(entity.id, entity.version)});
    return entity;
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
    data: Record<string, any>,
    expectedVersion?: number
  ): Promise<T> {
    const dcr = this.getDescriptor(typeOrDcr);
    const rawId = data.id || data._id;
    const formattedId = rawId ? this.formatId(dcr, rawId) : undefined;
    if (dcr.name === 'Artifact' && formattedId === this.formatId(Artifact.dcr, 'GOVERNANCE-ADMISSION'))
      throw Error('Admission state is owned by governance admission operations.');
    if (['Rule', 'Decision', 'Aspect', 'ModuleNode', 'Goal', 'Concept', 'Flow', 'Epic', 'Feature', 'UserStory'].includes(dcr.name)) {
      if (!formattedId) throw Error('Governance entities require an explicit identity.');
      const collection = await this.sp.collectionForEntityType(dcr);
      const old = await collection.findById<Record<string, unknown> & {_version: number}>(formattedId);
      if (expectedVersion !== undefined && old?._version !== expectedVersion) throw Error('Stale governance entity revision.');
      const payload = {...old, ...data, title: data.title ?? old?.title, status: data.status ?? old?.status ?? (['Epic', 'Feature', 'UserStory'].includes(dcr.name) ? 'draft' : 'implemented'),
        updatedAt: new Date().toISOString(), createdAt: old?.createdAt ?? new Date().toISOString()};
      if (old && Object.entries(data).every(([key, value]) => ['id', '_id'].includes(key) || canonical(old[key]) === canonical(value)))
        return this.ownEntity(this.sp.makeEntity<T>(dcr, formattedId, old));
      const indexed = this.indexingContext();
      const {resolveModulePath} = await import('./indexer.ts');
      const generatedModule = dcr.name === 'ModuleNode' && !old && indexed?.files.some(file =>
        formattedId === this.formatId(ModuleNode.dcr, `mod:${resolveModulePath(file)}`)) &&
        Object.keys(data).every(key => ['id', 'title', 'path', 'status'].includes(key));
      const entry = {collectionName: collection.name, id: formattedId, expectedVersion: old?._version ?? null, record: payload};
      const rows = generatedModule ? await this.commitIndexedOwnership([entry]) : await this.commitGovernance([entry]);
      return this.ownEntity(this.sp.makeEntity<T>(dcr, formattedId, rows[0]));
    }

    if (formattedId) {
      const existing = await this.getEntity<T>(formattedId, dcr);
      if (existing) {
        const state = dcr.name === 'Ticket' && (data.lane || data.status)
          ? ticketState(data.lane ?? (existing as unknown as Ticket).lane, data.status) : {};
        const updatePayload: Record<string, any> = { ...data, ...state, updatedAt: new Date().toISOString() };
        delete updatePayload.id;
        delete updatePayload._id;
        await existing.update(updatePayload, true, false);
        return existing;
      }
    }

    const defaultStatus = (dcr.name === 'Epic' || dcr.name === 'Feature' || dcr.name === 'UserStory')
      ? 'draft'
      : 'implemented';

    const createPayload = {
      ...data,
      id: formattedId,
      _id: formattedId,
      status: data.status ?? defaultStatus,
      createdAt: data.createdAt ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? new Date().toISOString(),
      ...(dcr.name === 'Ticket' ? ticketState(data.lane ?? 'Backlog', data.status) : {})
    };
    return this.ownEntity(await this.sp.createEntity<T>(dcr, createPayload, true, false));
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
        return this.ownEntity(await this.sp.loadEntityById<T>(formattedId));
      } catch {
        return null;
      }
    }

    // Try directly if already fully qualified
    if (id.startsWith(`${this.sp.name}_`)) {
      try {
        return this.ownEntity(await this.sp.loadEntityById<T>(id));
      } catch {}
    }

    // Search across descriptors with candidate formatting
    for (const dcr of entityDescriptors) {
      try {
        const candidateId = this.formatId(dcr, id);
        const col = await this.sp.collectionForEntityType(dcr);
        const doc = await col.findById(candidateId);
        if (doc) {
          return this.ownEntity(this.sp.makeEntity<T>(dcr, candidateId, doc));
        }
      } catch {}
    }
    return null;
  }

  /**
   * Deletes an entity and all its connected predicates.
   */
  async deleteEntity(id: string, expectedVersion?: number): Promise<boolean> {
    const entity = await this.getEntity(id);
    if (entity?.id === this.formatId(Artifact.dcr, 'GOVERNANCE-ADMISSION')) throw Error('Admission state cannot be deleted.');
    if (entity) {
      if (expectedVersion !== undefined && entity.version !== expectedVersion) throw Error('Stale governance entity revision.');
      if (['Rule', 'Decision', 'Aspect', 'ModuleNode', 'Goal', 'Concept', 'Flow', 'Epic', 'Feature', 'UserStory', 'FileNode', 'SymbolNode'].includes(entity.typeName())) {
        const collection = await entity.getCollection();
        const changes: BatchEntry[] = [{collectionName: collection.name, id: entity.id, expectedVersion: entity.version, record: null}];
        for (const edge of [...await this.getIncoming(entity.id), ...await this.getOutgoing(entity.id)]) {
          const pDcr = (semanticPredicates as Record<string, PredicateDcr>)[edge.predicateName];
          const predicates = await this.sp.predicateCollection(pDcr);
          const row = await predicates.findById<{_version: number}>(edge.id);
          if (row) changes.push({collectionName: predicates.name, id: edge.id, expectedVersion: row._version, record: null});
        }
        const indexed = this.indexingContext();
        const filePath = entity instanceof FileNode ? this.localId(entity.id) : entity instanceof SymbolNode ? entity.filePath : undefined;
        if (filePath && indexed?.files.includes(filePath)) await this.commitIndexedOwnership(changes);
        else await this.commitGovernance(changes);
        return true;
      }
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
    return docs.map(doc => this.ownEntity(this.sp.makeEntity<T>(dcr, doc._id || doc.id, doc)));
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

    const governanceEdge = ['Rule', 'Decision', 'Aspect', 'ModuleNode', 'Goal', 'Concept', 'Flow', 'Epic', 'Feature', 'UserStory']
      .includes(sourceEntity.typeName()) || sourceEntity instanceof Ticket ||
      ['Rule', 'Decision', 'Aspect', 'Goal', 'Concept', 'Flow', 'Epic', 'Feature', 'UserStory'].includes(targetEntity.typeName()) ||
      predicateName === 'contains' && (sourceEntity instanceof FileNode || sourceEntity instanceof SymbolNode) && targetEntity instanceof SymbolNode;
    if (governanceEdge) {
      const collection = await this.sp.predicateCollection(pDcr);
      const old = (await collection.findSome<IPredicateRecord>({sourceId: sourceEntity.id, predicateName, targetId: targetEntity.id}))[0];
      if (old) return new Predicate(this.sp, old);
      const indexed = this.indexingContext();
      const {resolveModulePath} = await import('./indexer.ts');
      const file = this.localId(targetEntity.id);
      const generatedOwnership = predicateName === 'contains' && (
        sourceEntity instanceof ModuleNode && targetEntity instanceof FileNode && indexed?.files.includes(file) &&
          sourceEntity.id === this.formatId(ModuleNode.dcr, `mod:${resolveModulePath(file)}`) ||
        targetEntity instanceof SymbolNode && indexed?.files.includes(targetEntity.filePath!) &&
          (sourceEntity instanceof FileNode && this.localId(sourceEntity.id) === targetEntity.filePath ||
            sourceEntity instanceof SymbolNode && sourceEntity.filePath === targetEntity.filePath));
      const id = collection.createId();
      const record: IPredicateRecord = {sourceId: sourceEntity.id, sourceType: sourceEntity.typeName(), predicateName,
        targetId: targetEntity.id, targetType: targetEntity.typeName(), payload, timestamp: Date.now()};
      const entry = {collectionName: collection.name, id, expectedVersion: null, record};
      const rows = generatedOwnership ? await this.commitIndexedOwnership([entry]) : await this.commitGovernance([entry]);
      return new Predicate(this.sp, {...record, ...rows[0]});
    }
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
    const query = {sourceId: src?.id || sourceId, predicateName, targetId: tgt?.id || targetId};
    if (src instanceof Ticket || [src, tgt].some(entity => entity && ['Rule', 'Decision', 'Aspect', 'ModuleNode', 'Goal', 'Concept', 'Flow', 'Epic', 'Feature', 'UserStory'].includes(entity.typeName())) ||
      predicateName === 'contains' && (src instanceof FileNode || src instanceof SymbolNode) && tgt instanceof SymbolNode) {
      const rows = await pCol.findSome<{_id: string; _version: number}>(query);
      if (!rows.length) return 0;
      const changes = rows.map(row => ({collectionName: pCol.name, id: row._id, expectedVersion: row._version, record: null}));
      const indexed = this.indexingContext();
      if (predicateName === 'contains' && tgt instanceof SymbolNode && indexed?.files.includes(tgt.filePath!)) await this.commitIndexedOwnership(changes);
      else await this.commitGovernance(changes);
      return rows.length;
    }
    return await pCol.deleteByQuery(query);
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
    durationMinutes: number = 30,
    moveToInProgress: boolean = true
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

    await ticket.update({ claim, ...(moveToInProgress ? ticketState('In Progress') : {}) }, true, false);
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
        completenessTarget: m.completenessTarget,
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
