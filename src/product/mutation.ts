/** Shared deterministic Product Intent mutation rules for tools, decomposition, and change preview. */
import { z } from 'zod';
import type { WorkflowStore } from '../graph/store.ts';
import { Epic, Feature, UserStory, Ticket, TestNode, Decision, ModuleNode, Aspect, Idea, Artifact } from '../graph/ontology.ts';
import { CompletenessSchema } from '../artifact-policy.ts';
import { ticketState } from '../graph/ticket-state.ts';
import type { TicketLane } from '../graph/types.ts';

const kinds = { Aspect, Idea, Artifact, Epic, Feature, UserStory, Ticket, Test: TestNode, Decision, Module: ModuleNode } as const;
export type ProductKind = keyof typeof kinds;
const entityKind = z.enum(['Epic', 'Feature', 'UserStory', 'Ticket', 'Aspect']);
const epicStatus = z.enum(['draft', 'planned', 'active', 'completed', 'cancelled']);
const intentStatus = z.enum(['draft', 'proposed', 'accepted', 'deprecated']);
const ticketLane = z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']);
const ticketPriority = z.enum(['P0', 'P1', 'P2', 'P3']);
const fields = z.object({
  title: z.string().min(1), body: z.string(), status: z.string(), priority: z.union([z.number(), ticketPriority]),
  acceptanceCriteria: z.array(z.string()), actor: z.string(), story: z.string(), context: z.string(),
  sla: z.string(), lane: ticketLane, completenessTarget: CompletenessSchema.nullable()
}).partial().strict();

export const ProductMutationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('product_create'), entityType: entityKind, id: z.string().min(1), fields }),
  z.object({ kind: z.literal('product_update'), entityType: entityKind, id: z.string().min(1), fields }),
  z.object({ kind: z.literal('product_delete'), entityType: entityKind, id: z.string().min(1) }),
  z.object({ kind: z.literal('product_link'), sourceId: z.string().min(1), predicate: z.string().min(1), targetId: z.string().min(1) }),
  z.object({ kind: z.literal('product_unlink'), sourceId: z.string().min(1), predicate: z.string().min(1), targetId: z.string().min(1) })
]);
export type ProductMutation = z.infer<typeof ProductMutationSchema> & { source?: never };

const relations: Array<[ProductKind, string, ProductKind]> = [
  ...(['Idea', 'Module', 'Epic', 'Feature', 'UserStory'] as const).map(target => ['Aspect', 'applies_to', target] as [ProductKind, string, ProductKind]),
  ['Ticket', 'addresses', 'Aspect'], ['Test', 'verifies', 'Aspect'], ['Artifact', 'verifies', 'Aspect'], ['Decision', 'governs', 'Aspect'],
  ['Epic', 'targets', 'Feature'], ['Epic', 'targets', 'UserStory'],
  ['Feature', 'contains', 'UserStory'], ['Epic', 'contains', 'Ticket'],
  ['Ticket', 'implements', 'Feature'], ['Ticket', 'addresses', 'UserStory'],
  ['Ticket', 'targets', 'Module'],
  ['Test', 'verifies', 'Feature'], ['Test', 'verifies', 'UserStory'],
  ['Decision', 'governs', 'Epic'], ['Decision', 'governs', 'Feature'], ['Decision', 'governs', 'UserStory'],
  ['Decision', 'governs', 'Ticket']
];

export function productKind(entity: unknown): ProductKind | undefined {
  for (const [kind, ctor] of Object.entries(kinds)) if (entity instanceof ctor) return kind as ProductKind;
}

export function validateProductRelation(source: ProductKind, predicate: string, target: ProductKind): void {
  if (!relations.some(([s, p, t]) => s === source && p === predicate && t === target)) {
    throw new Error(`Invalid product relation: '${source} ${predicate} ${target}' is not allowed.`);
  }
}

export async function resolveProductEntity(store: WorkflowStore, id: string) {
  const found = [];
  for (const ctor of Object.values(kinds)) {
    const entity = await store.getEntity(id, ctor.dcr);
    if (entity) found.push(entity);
  }
  if (found.length !== 1) throw new Error(found.length ? `Ambiguous entity ID '${id}'.` : `Entity '${id}' not found.`);
  return found[0];
}

function validateFields(kind: ProductKind, input: Record<string, unknown>, create: boolean): void {
  fields.parse(input);
  const allowed: Record<ProductKind, string[]> = {
    Aspect: ['title', 'body', 'status', 'acceptanceCriteria'], Idea: [], Artifact: [],
    Epic: ['title', 'body', 'status', 'priority', 'completenessTarget'],
    Feature: ['title', 'body', 'status', 'acceptanceCriteria', 'completenessTarget'],
    UserStory: ['title', 'status', 'actor', 'story', 'context', 'acceptanceCriteria', 'sla', 'completenessTarget'],
    Ticket: ['title', 'body', 'status', 'lane', 'priority', 'acceptanceCriteria'], Test: [], Decision: [], Module: ['completenessTarget']
  };
  for (const key of Object.keys(input)) if (!allowed[kind].includes(key)) throw new Error(`${kind} does not support '${key}'.`);
  if (create && !input.title) throw new Error(`${kind} creation requires a title.`);
  if (input.status !== undefined) {
    if (kind === 'Epic') epicStatus.parse(input.status);
    if (kind === 'Feature' || kind === 'UserStory' || kind === 'Aspect') intentStatus.parse(input.status);
    if (kind === 'Ticket') z.enum(['planned', 'in_progress', 'verified', 'blocked', 'rejected']).parse(input.status);
  }
  if (kind === 'Epic' && input.priority !== undefined) z.number().parse(input.priority);
  if (kind === 'Ticket' && input.priority !== undefined) ticketPriority.parse(input.priority);
}

export async function productDependents(store: WorkflowStore, id: string) {
  const entity = await resolveProductEntity(store, id);
  const incoming = await store.getIncoming(entity.id);
  const outgoing = await store.getOutgoing(entity.id);
  return [...incoming, ...outgoing].map(edge => ({
    sourceId: store.localId(edge.sourceId), predicate: edge.predicateName, targetId: store.localId(edge.targetId)
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export async function validateProductMutations(store: WorkflowStore, mutations: ProductMutation[]) {
  if (!mutations.length) throw new Error('Product change requires at least one mutation.');
  mutations.forEach(mutation => ProductMutationSchema.parse(mutation));
  const state = new Map<string, { kind: ProductKind; exists: boolean; lane?: TicketLane }>();
  const edges = new Map<string, { sourceId: string; predicate: string; targetId: string }>();
  const snapshot: Record<string, unknown> = {};
  const key = (s: string, p: string, t: string) => JSON.stringify([s, p, t]);
  async function load(id: string) {
    if (state.has(id)) return state.get(id)!;
    const entity = await resolveProductEntity(store, id);
    const kind = productKind(entity)!;
    const fields = Object.fromEntries(['title', 'body', 'status', 'priority', 'acceptanceCriteria', 'actor', 'story', 'context', 'sla', 'lane', 'claim', 'completenessTarget', 'updatedAt'].map(k => [k, (entity as any)[k] ?? null]));
    state.set(id, { kind, exists: true, lane: kind === 'Ticket' ? (entity as Ticket).lane : undefined });
    const incoming = await store.getIncoming(entity.id);
    const outgoing = await store.getOutgoing(entity.id);
    snapshot[id] = { kind, fields, incoming: incoming.map(e => [e.sourceId, e.predicateName, e.targetId]).sort(), outgoing: outgoing.map(e => [e.sourceId, e.predicateName, e.targetId]).sort() };
    for (const edge of [...incoming, ...outgoing]) {
      const sourceId = store.localId(edge.sourceId), targetId = store.localId(edge.targetId);
      edges.set(key(sourceId, edge.predicateName, targetId), { sourceId, predicate: edge.predicateName, targetId });
    }
    return state.get(id)!;
  }
  const deleted: string[] = [];
  for (const mutation of mutations) {
    if (mutation.kind === 'product_create') {
      if (state.has(mutation.id) || await store.getEntity(mutation.id)) throw new Error(`Entity '${mutation.id}' already exists.`);
      validateFields(mutation.entityType, mutation.fields, true);
      if (mutation.entityType === 'Ticket') ticketState(mutation.fields.lane ?? 'Todo', mutation.fields.status);
      state.set(mutation.id, { kind: mutation.entityType, exists: true, lane: mutation.entityType === 'Ticket' ? mutation.fields.lane ?? 'Todo' : undefined });
      snapshot[mutation.id] = null;
    } else if (mutation.kind === 'product_update' || mutation.kind === 'product_delete') {
      const entity = await load(mutation.id);
      if (!entity.exists || entity.kind !== mutation.entityType) throw new Error(`${mutation.entityType} '${mutation.id}' is unavailable.`);
      if (mutation.kind === 'product_update') {
        validateFields(entity.kind, mutation.fields, false);
        if (entity.kind === 'Ticket' && (mutation.fields.lane || mutation.fields.status)) {
          const next = ticketState(mutation.fields.lane ?? entity.lane ?? 'Todo', mutation.fields.status);
          entity.lane = next.lane;
        }
      } else {
        entity.exists = false;
        deleted.push(mutation.id);
      }
    } else {
      const source = await load(mutation.sourceId), target = await load(mutation.targetId);
      if (!source.exists || !target.exists) throw new Error('Relation endpoint was deleted.');
      validateProductRelation(source.kind, mutation.predicate, target.kind);
      const edgeKey = key(mutation.sourceId, mutation.predicate, mutation.targetId);
      if (mutation.kind === 'product_link') edges.set(edgeKey, mutation);
      else edges.delete(edgeKey);
    }
  }
  const dependents = deleted.flatMap(id => [...edges.values()].filter(e => e.sourceId === id || e.targetId === id));
  if (dependents.length) throw new Error(`Delete blocked by dependents: ${JSON.stringify(dependents)}. Explicitly unlink them first.`);
  return { snapshot, dependents };
}

export async function applyProductMutations(store: WorkflowStore, mutations: ProductMutation[]): Promise<void> {
  await validateProductMutations(store, mutations);
  for (const mutation of mutations) {
    if (mutation.kind === 'product_create') {
      await store.upsertEntity(kinds[mutation.entityType].dcr, { id: mutation.id, ...mutation.fields,
        status: mutation.fields.status ?? (mutation.entityType === 'Ticket' ? 'planned' : 'draft'),
        ...(mutation.entityType === 'Ticket' ? { ...ticketState(mutation.fields.lane ?? 'Todo', mutation.fields.status), priority: mutation.fields.priority ?? 'P2' } : {}) });
    } else if (mutation.kind === 'product_update') {
      const entity = await resolveProductEntity(store, mutation.id);
      const state = mutation.entityType === 'Ticket' && (mutation.fields.lane || mutation.fields.status)
        ? ticketState(mutation.fields.lane ?? (entity as Ticket).lane, mutation.fields.status) : {};
      await entity.update({ ...mutation.fields, ...state, updatedAt: new Date().toISOString() }, true, false);
    } else if (mutation.kind === 'product_delete') {
      await store.deleteEntity(mutation.id);
    } else {
      const source = await resolveProductEntity(store, mutation.sourceId);
      const target = await resolveProductEntity(store, mutation.targetId);
      if (mutation.kind === 'product_link') await store.relate(source, mutation.predicate, target);
      else await store.unrelate(source.id, mutation.predicate, target.id);
    }
  }
}
