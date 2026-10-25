/** Shared deterministic Product Intent mutation rules for tools, decomposition, and change preview. */
import { z } from 'zod';
import {TechnicalProofSchema} from '../graph/test-proof-types.ts';
import type { WorkflowStore } from '../graph/store.ts';
import { Product, Epic, Feature, UserStory, Ticket, TestNode, Decision, ModuleNode, Aspect, Idea, Goal, Concept, Flow, Artifact, FileNode, SymbolNode } from '../graph/ontology.ts';
import { CompletenessSchema } from '../artifact-policy.ts';
import {AiArtifactCritic, CriticResultSchema, CharterAlignmentSchema} from '../artifact-critic.ts';
import { ticketState, assertTicketAuthoring, TicketKindSchema, TicketDefectSchema } from '../graph/ticket-state.ts';
import { canonical, computeHash } from '../kb/canonical.ts';
import type { ChangeRequest } from '../change/types.ts';
import type { TicketLane } from '../graph/types.ts';

const kinds = { Product, Aspect, Idea, Goal, Concept, Flow, Artifact, Epic, Feature, UserStory, Ticket, Test: TestNode, Decision, Module: ModuleNode, File: FileNode, Symbol: SymbolNode } as const;
export type ProductKind = keyof typeof kinds;
export const ProductRevisionSchema = z.object({ id: z.string().min(1), entityType: z.string().min(1), version: z.number().int().positive(), relationsHash: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export type ProductRevision = z.infer<typeof ProductRevisionSchema>;
const entityKind = z.enum(['Product', 'Goal', 'Concept', 'Flow', 'Epic', 'Feature', 'UserStory', 'Ticket', 'Aspect', 'Test', 'Module', 'Decision']);
const epicStatus = z.enum(['draft', 'planned', 'active', 'completed', 'cancelled']);
const intentStatus = z.enum(['draft', 'proposed', 'accepted', 'deprecated']);
const ticketLane = z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']);
const ticketPriority = z.enum(['P0', 'P1', 'P2', 'P3']);
const fields = z.object({
  title: z.string().min(1), body: z.string(), status: z.string(), priority: z.union([z.number(), ticketPriority]),
  acceptanceCriteria: z.array(z.string()), actor: z.string(), story: z.string(), context: z.string(),
  intent: z.string(), initialState: z.string(), action: z.string(), expectedResult: z.string(),
  exceptions: z.string(), bounds: z.string(), decision: z.string(), consequences: z.string(),
  purpose: z.string(), actors: z.array(z.string()), scope: z.string(), nonGoals: z.array(z.string()),
  outcomes: z.array(z.string()), boundaries: z.string(), behavioralRules: z.array(z.string()),
  responsibilities: z.array(z.string()), intentStatus: intentStatus,
  filePath: z.string(), framework: z.string(), command: z.array(z.string()), fixturePath: z.string(), interfaceName: z.string(),
  storyVersion: z.number().int().positive(), testState: z.enum(['skipped','not-run','expected-red','green','blocked']), testStateReason: z.string(), testSourceHash: z.string(), fixtureHash: z.string(), storyBasisHash: z.string(),
  technicalProofs: z.array(TechnicalProofSchema),
  kind: TicketKindSchema, defect: TicketDefectSchema,
  sla: z.string(), lane: ticketLane, completenessTarget: CompletenessSchema.nullable()
}).partial().strict().meta({id:'ProductFields'});

export const LinkPayloadSchema = z.object({note: z.string().max(4000).optional()}).strict();
export type LinkPayload = z.infer<typeof LinkPayloadSchema>;
export function normalizeLinkPayload(payload: LinkPayload): LinkPayload {
  LinkPayloadSchema.parse(payload);
  return payload.note ? {note: payload.note} : {};
}

export const ProductMutationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('product_create'), entityType: entityKind, id: z.string().min(1), fields }),
  z.object({ kind: z.literal('product_update'), entityType: entityKind, id: z.string().min(1), fields }),
  z.object({ kind: z.literal('product_delete'), entityType: entityKind, id: z.string().min(1) }),
  z.object({ kind: z.literal('product_link'), sourceId: z.string().min(1), predicate: z.string().min(1), targetId: z.string().min(1), payload: LinkPayloadSchema.optional() }).strict(),
  z.object({ kind: z.literal('product_unlink'), sourceId: z.string().min(1), predicate: z.string().min(1), targetId: z.string().min(1) }).strict()
]);
export type ProductMutation = z.infer<typeof ProductMutationSchema> & { source?: never };

/** Structured trace in the existing Decision.context text; no new graph fields. */
export const CharterWarningContextSchema = z.object({warning:z.string().trim().min(1), proposal:z.object({action:z.literal('product_change'),mutations:z.array(ProductMutationSchema),basis:z.array(ProductRevisionSchema).optional(),originalRequest:z.string().optional()}).strict(), reviewFingerprint:z.string().min(1),charterRevision:z.number().int().positive()});

const relationTriples: Array<[ProductKind, string, ProductKind]> = [
  ...(['Idea', 'Goal', 'Concept', 'Flow', 'Module', 'Epic', 'Feature', 'UserStory', 'File', 'Symbol', 'Ticket', 'Test', 'Artifact'] as const).map(target => ['Aspect', 'applies_to', target] as [ProductKind, string, ProductKind]),
  ['Ticket', 'addresses', 'Aspect'], ['Test', 'verifies', 'Aspect'], ['Artifact', 'verifies', 'Aspect'], ['Decision', 'governs', 'Aspect'],
  ['Idea', 'inspires', 'Goal'], ['Idea', 'inspires', 'Concept'], ['Idea', 'inspires', 'Flow'],
  ['Goal', 'inspires', 'Concept'], ['Flow', 'serves', 'Goal'],
  ['Concept', 'governs', 'Flow'], ['Concept', 'governs', 'UserStory'], ['Concept', 'governs', 'Feature'], ['Concept', 'governs', 'Epic'], ['Concept', 'governs', 'Ticket'],
  ['Flow', 'contains', 'UserStory'], ['Feature', 'enables', 'UserStory'],
  ['Epic', 'targets', 'Goal'], ['Epic', 'targets', 'Concept'], ['Epic', 'targets', 'Flow'], ['Epic', 'targets', 'Feature'], ['Epic', 'targets', 'UserStory'],
  ['Epic', 'contains', 'Ticket'],
  ['Ticket', 'implements', 'Feature'], ['Ticket', 'addresses', 'UserStory'],
  ['Ticket', 'targets', 'Module'],
  ['Ticket', 'contains', 'Ticket'], ['Ticket', 'depends_on', 'Ticket'],
  ['Artifact', 'verifies', 'Ticket'], ['Test', 'verifies', 'Ticket'],
  ['Ticket', 'modifies', 'File'], ['Ticket', 'modifies', 'Symbol'], ['Ticket', 'targets', 'File'], ['Ticket', 'targets', 'Symbol'],
  ['Test', 'verifies', 'Flow'], ['Test', 'verifies', 'Feature'], ['Test', 'verifies', 'UserStory'],
  ['Decision', 'governs', 'Goal'], ['Decision', 'governs', 'Concept'], ['Decision', 'governs', 'Flow'],
  ['Decision', 'governs', 'Epic'], ['Decision', 'governs', 'Feature'], ['Decision', 'governs', 'UserStory'],
  ['Decision', 'governs', 'Ticket']
];

/** One authorship policy; ontology registration alone never grants human authorship. */
export const PRODUCT_RELATIONS = [
  ...relationTriples.map(([sourceKind, predicate, targetKind]) => ({sourceKind, predicate, targetKind,
    mode: predicate === 'verifies' ? 'O' as const : 'H' as const,
    owner: predicate === 'verifies' ? 'Story-test, test-execution or independent completion owner' : 'Reviewed Product change'})),
  {sourceKind:'Feature',predicate:'contains',targetKind:'UserStory',mode:'L',owner:'Legacy relation; remove only'},
  {sourceKind:'Module',predicate:'serves',targetKind:'Goal',mode:'H',owner:'Reviewed Product change'},
  {sourceKind:'Concept',predicate:'governs',targetKind:'Module',mode:'H',owner:'Reviewed Product change'},
  {sourceKind:'Product',predicate:'contains',targetKind:'Goal',mode:'H',owner:'Reviewed Product change'},
  {sourceKind:'Product',predicate:'contains',targetKind:'Concept',mode:'H',owner:'Reviewed Product change'},
  {sourceKind:'Product',predicate:'contains',targetKind:'Feature',mode:'H',owner:'Reviewed Product change'},
  {sourceKind:'Aspect',predicate:'applies_to',targetKind:'Product',mode:'H',owner:'Reviewed Product change'}
] as const;
export function productRelation(sourceKind: string, predicate: string, targetKind: string) {
  return PRODUCT_RELATIONS.find(row => row.sourceKind === sourceKind && row.predicate === predicate && row.targetKind === targetKind);
}

export interface ProductEdgeRow extends Record<string, unknown> {
  _id: string;
  _version: number;
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  predicateName: string;
  payload?: Record<string, unknown>;
}
/** Native predicate identity, revision and all payload are the optimistic basis. */
export async function productEdgeRows(store: WorkflowStore, entityId: string): Promise<ProductEdgeRow[]> {
  const predicates = await store.sp.predicateCollection(store.sp.ontology.pdcr('applies_to'));
  const rows = [...await predicates.findSome<ProductEdgeRow>({sourceId:entityId}),
    ...await predicates.findSome<ProductEdgeRow>({targetId:entityId})];
  return [...new Map(rows.map(row => [row._id,row])).values()].sort((a,b)=>a._id.localeCompare(b._id));
}

export function productKind(entity: unknown): ProductKind | undefined {
  for (const [kind, ctor] of Object.entries(kinds)) if (entity instanceof ctor) return kind as ProductKind;
}

export function validateProductRelation(source: ProductKind, predicate: string, target: ProductKind): void {
  const relation=productRelation(source,predicate,target);
  if (!relation || relation.mode === 'L') {
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

const definitionFields: Record<ProductKind, string[]> = {
    Product: ['title', 'purpose', 'actors', 'scope', 'nonGoals', 'bounds', 'status'],
    Aspect: ['title', 'body', 'status', 'acceptanceCriteria'], Idea: [], Goal: ['title', 'body', 'status'],
    Concept: ['title', 'body', 'status'], Flow: ['title', 'body', 'status', 'actor', 'context'],
    Artifact: [], File: [], Symbol: [],
    Epic: ['title', 'body', 'status', 'priority', 'completenessTarget'],
    Feature: ['title', 'body', 'status', 'priority', 'acceptanceCriteria', 'completenessTarget', 'outcomes', 'scope', 'boundaries', 'behavioralRules'],
    UserStory: ['title', 'status', 'actor', 'intent', 'initialState', 'action', 'expectedResult', 'exceptions', 'bounds', 'story', 'context', 'acceptanceCriteria', 'sla', 'completenessTarget'],
    Ticket: ['title', 'body', 'status', 'lane', 'priority', 'acceptanceCriteria', 'kind', 'defect'], Test: ['technicalProofs','title','filePath','framework','command','fixturePath','interfaceName','storyVersion','testState','testStateReason','testSourceHash','fixtureHash','storyBasisHash'], Decision: ['title','decision','context','consequences','status'],
    Module: ['body', 'responsibilities', 'boundaries', 'intentStatus', 'completenessTarget']
};

/** Exact authored field schemas shared by Product validation and public adapters. */
export function productDefinitionFields(kind: ProductKind) {
  const shape:Record<string,z.ZodType>={};
  for(const key of definitionFields[kind]) shape[key]=fields.shape[key as keyof typeof fields.shape];
  if('status' in shape) shape.status=(kind==='Epic'?z.enum(['draft','planned','active','cancelled']):kind==='Ticket'?z.enum(['planned','in_progress','verified','blocked','rejected']):intentStatus).optional();
  if('priority' in shape) shape.priority=(kind==='Ticket'?ticketPriority:z.number()).optional();
  return z.object(shape).strict();
}

function validateFields(kind: ProductKind, input: Record<string, unknown>, create: boolean, previous: Record<string, unknown> = {}): void {
  fields.parse(input);
  for (const key of Object.keys(input)) if (!definitionFields[kind].includes(key)) throw new Error(`${kind} does not support '${key}'.`);
  if (kind === 'Module' && create) throw new Error("Module cannot be created via product_create. Edit an indexed module instead.");
  if (create && !input.title) throw new Error(`${kind} creation requires a title.`);
  if (input.status !== undefined) {
    if (kind === 'Epic') {
      epicStatus.parse(input.status);
      if(input.status==='completed' && previous.status!=='completed') throw Error('Epic completion belongs to delivery verification, not definition editing.');
    }
    if (kind === 'Product' || kind === 'Goal' || kind === 'Concept' || kind === 'Flow' || kind === 'Feature' || kind === 'UserStory' || kind === 'Aspect' || kind === 'Decision') intentStatus.parse(input.status);
    if (kind === 'Ticket') z.enum(['planned', 'in_progress', 'verified', 'blocked', 'rejected']).parse(input.status);
  }
  if (kind === 'Product') {
    const next = { ...previous, ...input };
    if (next.status === 'accepted') {
      const purpose = typeof next.purpose === 'string' ? next.purpose.trim() : '';
      const scope = typeof next.scope === 'string' ? next.scope.trim() : '';
      const actors = Array.isArray(next.actors) ? next.actors.filter(a => typeof a === 'string' && a.trim()) : [];
      if (!purpose || !scope || actors.length === 0) {
        throw new Error("Accepted Product requires purpose, scope, and at least one actor.");
      }
    }
  }
  if (kind === 'Decision') {
    const next={...previous,...input};
    if(next.status==='accepted' && (create || input.status==='accepted' || ['decision','context','consequences'].some(key=>key in input))
      && (typeof next.decision!=='string' || !next.decision.trim()))
      throw Error('Accepted Decision requires a nonblank decision.');
  }
  if (kind === 'Feature') {
    const next = { ...previous, ...input };
    if (next.status === 'accepted') {
      const responsibility = typeof next.body === 'string' ? next.body.trim() : '';
      if (!responsibility) {
        throw new Error("Accepted Feature requires nonblank responsibility (body).");
      }
    }
  }
  if (kind === 'Module') {
    const next = { ...previous, ...input };
    if (next.intentStatus === 'accepted') {
      const purpose = typeof next.body === 'string' ? next.body.trim() : '';
      if (!purpose) {
        throw new Error("Accepted Module intent requires a nonblank purpose (body).");
      }
    }
  }
  if (kind === 'Ticket') {
    assertTicketAuthoring(input, create ? undefined : previous);
    if (input.defect !== undefined && (input.kind ?? previous.kind ?? 'task') !== 'bug')
      throw Error('Defect fields belong to an explicitly typed Bug.');
  }
  if (kind === 'UserStory') {
    const next = { ...previous, ...input };
    const semanticFields = ['actor', 'intent', 'initialState', 'action', 'expectedResult', 'exceptions', 'bounds', 'story', 'context', 'acceptanceCriteria', 'sla'];
    // Historical acceptance survives metadata edits; accepting or revising its meaning requires a complete scenario.
    if (next.status === 'accepted' && (create || input.status === 'accepted' || semanticFields.some(key => key in input))) {
      const missing = ['actor', 'intent', 'initialState', 'action', 'expectedResult']
        .filter(key => typeof next[key] !== 'string' || !(next[key] as string).trim());
      if (missing.length) throw new Error(`Accepted UserStory requires complete Story fields: ${missing.join(', ')}.`);
    }
  }
  if ((kind === 'Epic' || kind === 'Feature') && input.priority !== undefined) z.number().parse(input.priority);
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

export async function validateProductMutations(store: WorkflowStore, mutations: ProductMutation[], basis: ProductRevision[] = []) {
  if (!mutations.length) throw new Error('Product change requires at least one mutation.');
  mutations.forEach(mutation => ProductMutationSchema.parse(mutation));
  const state = new Map<string, { kind: ProductKind; exists: boolean; lane?: TicketLane; fields: Record<string, unknown> }>();
  const edges = new Map<string, { sourceId: string; predicate: string; targetId: string; payload?: LinkPayload }>();
  const snapshot: Record<string, unknown> = {};
  const identities = new Map<string, string>();
  const rememberIdentity = (id: string, kind: ProductKind) => {
    const local = store.localId(store.formatId(kinds[kind].dcr, id));
    if (identities.has(local) && identities.get(local) !== id)
      throw new Error(`Ambiguous Product identity spellings for '${local}'. Use one canonical ID.`);
    identities.set(local, id);
  };
  const key = (s: string, p: string, t: string) => JSON.stringify([s, p, t]);
  async function load(id: string) {
    if (state.has(id)) return state.get(id)!;
    const entity = await resolveProductEntity(store, id);
    if (entity instanceof Artifact && /^(VERIFY-|GOVERNANCE-ADMISSION$)/.test(store.localId(entity.id)))
      throw Error('Verification receipts and admission records are owner-managed.');
    const kind = productKind(entity)!;
    rememberIdentity(id, kind);
    const fields = Object.fromEntries(['kind', 'defect', 'title', 'body', 'decision', 'consequences', 'status', 'priority', 'acceptanceCriteria', 'actor', 'intent', 'initialState', 'action', 'expectedResult', 'exceptions', 'bounds', 'story', 'context', 'sla', 'lane', 'claim', 'completenessTarget', 'filePath', 'framework', 'command', 'fixturePath', 'interfaceName', 'storyVersion', 'testState', 'testStateReason', 'testSourceHash', 'fixtureHash', 'storyBasisHash', 'technicalProofs', 'purpose', 'actors', 'scope', 'nonGoals', 'outcomes', 'boundaries', 'behavioralRules', 'responsibilities', 'intentStatus', 'version', 'updatedAt'].map(k => [k, (entity as any)[k] ?? null]));
    state.set(id, { kind, exists: true, fields, lane: kind === 'Ticket' ? (entity as Ticket).lane : undefined });
    const rows = await productEdgeRows(store, entity.id);
    snapshot[id] = { kind, fields, relations: rows };
    const triples = new Map<string, ProductEdgeRow>();
    for (const edge of rows) {
      const sourceId = store.localId(edge.sourceId), targetId = store.localId(edge.targetId);
      const triple = key(sourceId, edge.predicateName, targetId);
      if (triples.has(triple)) throw Error(`Duplicate relation rows: ${triples.get(triple)!._id}@${triples.get(triple)!._version}, ${edge._id}@${edge._version}.`);
      triples.set(triple, edge);
      edges.set(triple, { sourceId, predicate: edge.predicateName, targetId });
    }
    return state.get(id)!;
  }
  for (const revision of basis) {
    ProductRevisionSchema.parse(revision);
    const entity = await store.getEntity(revision.id, revision.entityType);
    if (!entity || entity.typeName() !== revision.entityType || entity.version !== revision.version)
      throw new Error(`Stale product source revision '${revision.id}'.`);
    if (productKind(entity)) {
      await load(revision.id);
      const observed=snapshot[revision.id] as {fields:{version:number};relations:ProductEdgeRow[]};
      if(observed.fields.version!==revision.version) throw new Error(`Stale product source revision '${revision.id}'.`);
      if(revision.relationsHash!==undefined&&computeHash(observed.relations)!==revision.relationsHash)
        throw new Error(`Stale product relations '${revision.id}'. Reload canonical data and review again.`);
    } else if(revision.relationsHash!==undefined) throw new Error('Relation basis requires a Product entity.');
  }
  const deleted: string[] = [];
  // Work containment and prerequisites share execution direction. Inspect their
  // existing closure so a batch cannot hide a cycle behind an untouched Ticket.
  const queue = mutations.flatMap(mutation => 'id' in mutation ? [mutation.id] : [mutation.sourceId, mutation.targetId]);
  const examined = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!; if (examined.has(id)) continue; examined.add(id);
    const ticket = await store.getEntity<Ticket>(id, Ticket.dcr); if (!ticket) continue;
    await load(id);
    for (const edge of await store.getOutgoing(ticket.id)) if (['contains', 'depends_on'].includes(edge.predicateName)) {
      const target = await store.getEntity<Ticket>(edge.targetId, Ticket.dcr);
      if (target) queue.push(store.localId(target.id));
    }
  }
  for (const mutation of mutations) {
    if ('entityType' in mutation && mutation.entityType === 'Test') store.assertTestArtifactWrite(mutation.id);
    if ('predicate' in mutation && mutation.predicate === 'verifies') store.assertTestArtifactWrite(mutation.sourceId);
    if (mutation.kind === 'product_create') {
      if (mutation.entityType === 'Product' && mutation.id !== 'PRODUCT') {
        throw new Error("Product entity ID must be 'PRODUCT'.");
      }
      rememberIdentity(mutation.id, mutation.entityType);
      if (state.has(mutation.id) || await store.getEntity(mutation.id)) throw new Error(`Entity '${mutation.id}' already exists.`);
      validateFields(mutation.entityType, mutation.fields, true);
      if (mutation.entityType === 'Ticket') ticketState(mutation.fields.lane ?? 'Todo', mutation.fields.status);
      state.set(mutation.id, { kind: mutation.entityType, exists: true, fields: { status: 'draft', ...mutation.fields }, lane: mutation.entityType === 'Ticket' ? mutation.fields.lane ?? 'Todo' : undefined });
      snapshot[mutation.id] = null;
    } else if (mutation.kind === 'product_update' || mutation.kind === 'product_delete') {
      const entity = await load(mutation.id);
      if (!entity.exists || entity.kind !== mutation.entityType) throw new Error(`${mutation.entityType} '${mutation.id}' is unavailable.`);
      if (mutation.kind === 'product_update') {
        validateFields(entity.kind, mutation.fields, false, entity.fields);
        entity.fields = { ...entity.fields, ...mutation.fields };
        if (entity.kind === 'Ticket' && (mutation.fields.lane || mutation.fields.status)) {
          const next = ticketState(mutation.fields.lane ?? entity.lane ?? 'Todo', mutation.fields.status);
          entity.lane = next.lane;
        }
      } else {
        if (entity.kind === 'Product') throw new Error("Physical deletion of Product singleton is not allowed. Use retire (status: deprecated) instead.");
        if (entity.kind === 'Module') throw new Error("Physical deletion of Module is not allowed.");
        entity.exists = false;
        deleted.push(mutation.id);
      }
    } else {
      const source = await load(mutation.sourceId), target = await load(mutation.targetId);
      if (!source.exists || !target.exists) throw new Error('Relation endpoint was deleted.');
      if (mutation.sourceId === mutation.targetId) throw Error('Self-links are not allowed.');
      const relation = productRelation(source.kind, mutation.predicate, target.kind);
      if (!relation) throw Error(`Invalid product relation: '${source.kind} ${mutation.predicate} ${target.kind}' is not allowed.`);
      if (relation.mode === 'O') {
        store.assertTestArtifactWrite(mutation.sourceId);
        if ('payload' in mutation) throw Error('Owner-managed proof does not accept human payload.');
      }
      if (relation.mode === 'L' && mutation.kind !== 'product_unlink') throw Error('New legacy relation authorship is not allowed; existing edges are removal-only.');
      const edgeKey = key(mutation.sourceId, mutation.predicate, mutation.targetId);
      if (mutation.kind === 'product_link' && !edges.has(edgeKey) && [source,target].some(entity=>entity.fields.status === 'deprecated'))
        throw Error('New links to retired endpoints are refused.');
      if (mutation.kind === 'product_link') {
        const payload = mutation.payload === undefined ? undefined : normalizeLinkPayload(mutation.payload);
        if (payload === undefined || payload.note || edges.has(edgeKey)) edges.set(edgeKey, {...mutation, payload:payload ?? edges.get(edgeKey)?.payload});
      } else edges.delete(edgeKey);
    }
  }
  const dependents = deleted.flatMap(id => [...edges.values()].filter(e => e.sourceId === id || e.targetId === id));
  if (dependents.length) throw new Error(`Delete blocked by dependents: ${JSON.stringify(dependents)}. Explicitly unlink them first.`);
  const visiting = new Set<string>(), visited = new Set<string>();
  const workEdge = (edge: { sourceId: string; targetId: string; predicate: string }) =>
    ['contains', 'depends_on'].includes(edge.predicate) && state.get(edge.sourceId)?.kind === 'Ticket' && state.get(edge.targetId)?.kind === 'Ticket';
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error(`Ticket containment/dependency cycle at '${id}'.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of edges.values()) if (edge.sourceId === id && workEdge(edge)) visit(edge.targetId);
    visiting.delete(id); visited.add(id);
  }
  for (const edge of edges.values()) if (workEdge(edge)) visit(edge.sourceId);
  // The current charter is causal input even for an unlinked Feature or UserStory. Including
  // absence/version in the snapshot also makes concurrent registration/revision stale.
  const alignmentTargets = [...new Set(mutations.flatMap(m =>
    (m.kind === 'product_create' || m.kind === 'product_update') && ['Feature', 'UserStory'].includes(m.entityType) ? [m.id] : []))]
    .filter(id => state.get(id)?.fields.status === 'accepted');
  const warningDecisions = [...state.values()].some(entity => entity.kind === 'Decision' && entity.fields.status === 'accepted' && typeof entity.fields.context === 'string' && entity.fields.context.includes('\"warning\"'));
  if ((alignmentTargets.length || warningDecisions) && !state.has('PRODUCT')) {
    const product = await store.getEntity('PRODUCT', Product.dcr);
    if (product) await load('PRODUCT');
    else snapshot.PRODUCT = null;
  }
  return { snapshot, dependents, state, edges, alignmentTargets };
}

/** A valid proposal still needs the host to review its exact fingerprint. */
export class ProductReviewRequired extends Error {}

/** A material charter warning is a question for the developer, never approval. */
export class ProductAlignmentRequired extends ProductReviewRequired {
  constructor(readonly warnings: string[], readonly required: Array<{question: string; artifactId: string}>) {
    super(warnings.join(' ') || required.map(item => item.question).join(' '));
  }
}

/** A warning-resolution Decision keeps the original warning/proposal basis in context,
 * the actual developer response in decision, and governs the affected Feature or UserStory.
 * Text proposed by an agent cannot attest that a developer supplied that response.
 */
async function assessCharterAnswers(store: WorkflowStore, mutations: ProductMutation[], validated: Awaited<ReturnType<typeof validateProductMutations>>, request?: Extract<ChangeRequest, {action: 'product_change'}>): Promise<void> {
  for (const [id, entity] of validated.state) {
    if (entity.kind !== 'Decision') continue;
    const previous = validated.snapshot[id] as {fields:Record<string,unknown>} | null;
    let previousContext: unknown;
    try { previousContext = JSON.parse(String(previous?.fields.context)); } catch { /* Ordinary Decision context is free text. */ }
    const hadWarning = !!previousContext && typeof previousContext === 'object' && 'warning' in previousContext;
    if (hadWarning && (!entity.exists || entity.fields.context !== previous?.fields.context || previous?.fields.status === 'accepted' && entity.fields.decision !== previous.fields.decision))
      throw new ProductAlignmentRequired([`Preserve the charter warning context of Decision ${id}; record a new reviewed Decision for a new basis.`],[{artifactId:id,question:'Preserve the warning and actual answer history.'}]);
    if (!entity.exists || entity.fields.status !== 'accepted') continue;
    const touched = mutations.some(m => 'id' in m ? m.id === id : m.sourceId === id && m.predicate === 'governs');
    if (!touched) continue;
    let context: unknown;
    try { context = JSON.parse(String(entity.fields.context)); } catch { continue; }
    if (!context || typeof context !== 'object' || !('warning' in context)) continue;
    const basis = CharterWarningContextSchema.safeParse(context);
    const requireAnswer = (message: string) => new ProductAlignmentRequired([message], [{artifactId:id,question:message}]);
    if (!basis.success) throw requireAnswer(`Decision ${id} must preserve the specific charter warning and its original proposal, fingerprint and charter revision.`);
    const {warning, proposal, reviewFingerprint, charterRevision} = basis.data;
    const original = await validateProductMutations(store, proposal.mutations, proposal.basis);
    const product = await store.getEntity<Product>('PRODUCT', Product.dcr);
    const affected = [...validated.edges.values()].filter(edge => edge.sourceId === id && edge.predicate === 'governs' && ['Feature', 'UserStory'].includes(validated.state.get(edge.targetId)?.kind ?? '')).map(edge => edge.targetId);
    if (!affected.length || !affected.every(feature => original.alignmentTargets.includes(feature)))
      throw requireAnswer(`Decision ${id} must govern the Feature or UserStory affected by its charter warning.`);
    if (product?.version !== charterRevision || computeHash({request:proposal,snapshot:original.snapshot}) !== reviewFingerprint)
      throw requireAnswer(`Stale charter warning basis for Decision ${id}; review the current charter and downstream proposal again.`);
    const fingerprint = request && computeHash({request,snapshot:validated.snapshot});
    if (!fingerprint || typeof entity.fields.decision !== 'string' || !store.canAnswerProduct(fingerprint,id,entity.fields.decision))
      throw requireAnswer(`Developer answer required for Decision ${id}: ${warning} The host must separately collect the developer response; ordinary Product approval and proposed Decision text do not answer it.`);
  }
}

export async function assessCharterAlignment(store: WorkflowStore, mutations: ProductMutation[], validated: Awaited<ReturnType<typeof validateProductMutations>>, request?: Extract<ChangeRequest, {action: 'product_change'}>): Promise<void> {
  await assessCharterAnswers(store,mutations,validated,request);
  if (!validated.alignmentTargets.length) return;
  const product = validated.state.get('PRODUCT');
  const ask = (warnings: string[]) => new ProductAlignmentRequired(warnings,
    validated.alignmentTargets.map(artifactId => ({artifactId, question: `Review ${artifactId} against the current accepted Product charter and explicitly answer the warning by revising the definition or leaving it unresolved.`})));
  if (!product?.exists || product.fields.status !== 'accepted')
    throw ask(['Feature/UserStory acceptance requires an actual current accepted Product charter (PRODUCT). Register or accept it through the governed Product path.']);
  const criterion = 'Review definition acceptance only, not implementation or verified behavior. The actual current and proposed definitions are the evidence for alignment; implemented functionality is not required here. Every proposed accepted Feature or complete UserStory aligns with PRODUCT purpose, actors, scope, non-goals and bounds. Material contradiction, ambiguity or drift requires a specific warning grounded in both definitions and an explicit developer answer. Critic approval, generic acknowledgment and decision: accept are not answers. A revised definition must resolve the warning; any proposed Decision must preserve its warning, substantive developer answer and revision context. Do not authorize charter amendments or exceptions in this review.';
  let review;
  try {
    review = CriticResultSchema.extend({alignment: CharterAlignmentSchema}).parse(await new AiArtifactCritic('auto', store.root).review({
      artifactId: 'PRODUCT', intent: criterion, charterAlignment: {artifactIds: validated.alignmentTargets},
      neighborhood: [...validated.state].map(([id, entity]) => ({id, entityType: entity.kind, ...entity.fields})),
      proposal: mutations, applicableAspects: [], candidateAspects: [], completeness: 'production', depth: 0,
      acceptanceCriteria: [criterion], evidence: [JSON.stringify({current: validated.snapshot, proposedDefinitions: validated.alignmentTargets})]
    }));
  } catch (error) {
    throw ask([`Cannot establish definition alignment with PRODUCT: ${error instanceof Error ? error.message : String(error)}`]);
  }
  const {alignment} = review;
  if (review.verdict !== 'accept' || alignment.status !== 'aligned' || alignment.conflicts.length || review.required.length)
    throw new ProductAlignmentRequired(
      alignment.conflicts.length ? alignment.conflicts.map(item => item.message) :
        review.required.length ? review.required.map(item => item.question) : [alignment.explanation],
      alignment.conflicts.length ? alignment.conflicts.map(({artifactId,question}) => ({artifactId,question})) :
        review.required.length ? review.required : validated.alignmentTargets.map(artifactId => ({artifactId, question: 'Please explicitly answer the charter warning by revising this definition or leaving it unresolved.'})));
}

function productOwnerWrite(store: WorkflowStore, mutations: ProductMutation[], state: Map<string, {kind: ProductKind}>): boolean {
  return mutations.every(m => {
    if ((m.kind === 'product_create' || m.kind === 'product_update') && m.entityType === 'Ticket')
      return m.kind === 'product_create' || m.fields.kind === undefined;
    if (m.kind === 'product_link' || m.kind === 'product_unlink') {
      const source = state.get(m.sourceId)?.kind, target = state.get(m.targetId)?.kind;
      // Ticket preparation and governed implementation own work ordering and source scope.
      if (source === 'Ticket' && (target === 'Ticket' || ['File','Symbol','Module'].includes(target ?? ''))) return true;
    }
    const id = 'entityType' in m && m.entityType === 'Test' ? m.id :
      (m.kind === 'product_link' || m.kind === 'product_unlink') && m.predicate === 'verifies' ? m.sourceId : undefined;
    if (!id) return false;
    try { store.assertTestArtifactWrite(id); return true; } catch { return false; }
  });
}

export async function applyProductMutations(
  store: WorkflowStore,
  mutations: ProductMutation[],
  reviewed?: { request: Extract<ChangeRequest, {action: 'product_change'}>; fingerprint: string }
) {
  store.assertCanWrite();
  // Validate once before admission so malformed/rejected input cannot mutate even admission state.
  const initial = await validateProductMutations(store, mutations, reviewed?.request.basis);
  const workOnly = mutations.every(m =>
    (m.kind === 'product_create' || m.kind === 'product_update') && m.entityType === 'Ticket' ||
    // The protected Story-test owner records activation/classification during governed work.
    // Definitions, test commands, technical proof bindings and relations remain exclusive.
    m.kind === 'product_update' && m.entityType === 'Test' &&
      Object.keys(m.fields).every(key => ['testState','testStateReason','testSourceHash','fixtureHash','storyVersion','storyBasisHash'].includes(key)));
  if (!productOwnerWrite(store, mutations, initial.state) && (!reviewed || !store.canReviewProduct(reviewed.fingerprint)))
    throw new ProductReviewRequired('Product mutation requires host-owned review of the exact preview fingerprint.');
  if (reviewed && canonical(reviewed.request.mutations) !== canonical(mutations))
    throw Error('Reviewed Product request does not match its mutations.');
  await assessCharterAlignment(store, mutations, initial, reviewed?.request);
  const token = await store.admitGovernance(workOnly ? 'governed' : 'governance');
  try {
    const { snapshot, state, edges } = await validateProductMutations(store, mutations, reviewed?.request.basis);
    if (reviewed && computeHash({request: reviewed.request, snapshot}) !== reviewed.fingerprint)
      throw new Error('Stale change preview: fingerprint mismatch at Product commit.');
    type Entry = Parameters<typeof store.sqliteStore.applyBatch>[0][number];
    const batch = new Map<string, Entry>();
    const put = (entry: Entry) => batch.set(JSON.stringify([entry.collectionName, entry.id]), entry);
    const changed = new Set(mutations.flatMap(m => 'id' in m ? [m.id] : []));
    for (const [id, entity] of state) {
      const dcr = kinds[entity.kind].dcr, fullId = store.formatId(dcr, id);
      const collection = await store.sp.collectionForEntityType(dcr);
      const old = await collection.findById<Record<string, unknown> & {_version: number}>(fullId);
      const original = snapshot[id] as {fields: {version: number}} | null;
      if ((old?._version ?? null) !== (original?.fields.version ?? null)) throw new Error('Stale product entity revision.');
      put({collectionName: collection.name, id: fullId, expectedVersion: old?._version ?? null});
      if (!changed.has(id)) continue;
      if (!entity.exists) {
        if (old) put({collectionName: collection.name, id: fullId, expectedVersion: old._version, record: null});
        continue;
      }
      const data: Record<string, unknown> = {...old};
      for (const mutation of mutations) {
        if (!('id' in mutation) || mutation.id !== id || mutation.kind === 'product_delete') continue;
        Object.assign(data, Object.fromEntries(Object.entries(mutation.fields).filter(([, value]) => value !== undefined)));
        if (mutation.kind === 'product_create') {
          data.status ??= entity.kind === 'Ticket' ? 'planned' : 'draft';
          if (entity.kind === 'Ticket') { data.lane ??= 'Todo'; data.priority ??= 'P2'; }
        }
        if (entity.kind === 'Ticket' && (mutation.kind === 'product_create' || mutation.fields.lane || mutation.fields.status))
          Object.assign(data, ticketState(data.lane as TicketLane, mutation.fields.status));
      }
      if (old && Object.entries(data).every(([key, value]) => canonical(old[key]) === canonical(value))) continue;
      const now = new Date().toISOString();
      put({collectionName: collection.name, id: fullId, expectedVersion: old?._version ?? null,
        record: {...data, createdAt: old?.createdAt ?? now, updatedAt: now}});
      // A local ID is unique across kinds, including when a concurrent client created a different kind.
      if (!old) for (const ctor of Object.values(kinds)) {
        if (ctor.dcr === dcr) continue;
        const other = await store.sp.collectionForEntityType(ctor.dcr);
        put({collectionName: other.name, id: store.formatId(ctor.dcr, id), expectedVersion: null});
      }
    }
    const predicates = await store.sp.predicateCollection(store.sp.ontology.pdcr('applies_to'));
    const existing = new Map<string, ProductEdgeRow>();
    for (const [id, entity] of state) {
      if (snapshot[id] === null) continue;
      const fullId = store.formatId(kinds[entity.kind].dcr, id);
      const rows = await productEdgeRows(store, fullId);
      if (canonical(rows) !== canonical((snapshot[id] as {relations: ProductEdgeRow[]}).relations))
        throw Error('Stale product relation revision.');
      for (const row of rows) {
        const key = JSON.stringify([store.localId(row.sourceId), row.predicateName, store.localId(row.targetId)]);
        if (existing.has(key) && existing.get(key)!._id !== row._id) throw Error('Duplicate relation rows.');
        existing.set(key, row);
        put({collectionName: predicates.name, id: row._id, expectedVersion: row._version});
      }
    }

    const touched = new Set(mutations.flatMap(m => 'sourceId' in m ? [JSON.stringify([m.sourceId, m.predicate, m.targetId])] : []));
    for (const key of touched) {
      const old = existing.get(key), edge = edges.get(key);
      if (old && !edge) put({collectionName: predicates.name, id: old._id, expectedVersion: old._version, record: null});
      if (old && edge && edge.payload !== undefined) {
        const payload = {...old.payload};
        delete payload.note;
        Object.assign(payload, edge.payload);
        if (canonical(old.payload ?? {}) !== canonical(payload))
          put({collectionName: predicates.name, id: old._id, expectedVersion: old._version, record: {...old, payload}});
      }
      if (!old && edge) {
        const source = state.get(edge.sourceId)!, target = state.get(edge.targetId)!;
        const id = predicates.createId();
        put({collectionName: predicates.name, id, expectedVersion: null, record: {
          sourceId: store.formatId(kinds[source.kind].dcr, edge.sourceId), sourceType: kinds[source.kind].dcr.name,
          targetId: store.formatId(kinds[target.kind].dcr, edge.targetId), targetType: kinds[target.kind].dcr.name,
          predicateName: edge.predicate, payload: edge.payload ?? {}, timestamp: Date.now()
        }});
      }
    }
    // Basis can include context outside mutable Product kinds, such as Rules.
    for (const revision of reviewed?.request.basis ?? []) {
      const collection = await store.sp.collectionForEntityType(store.sp.ontology.edcr(revision.entityType));
      const id = store.formatId(revision.entityType, revision.id);
      if (!batch.has(JSON.stringify([collection.name, id])))
        put({collectionName: collection.name, id, expectedVersion: revision.version});
    }
    const assertion = await store.governanceAssertion(token);
    store.assertCanWrite();
    if (!productOwnerWrite(store, mutations, state) && (!reviewed || !store.canReviewProduct(reviewed.fingerprint)))
      throw Error('Product review authority expired before commit.');
    await assessCharterAnswers(store,mutations,initial,reviewed?.request);
    const {ticketChangeEvents}=await import('../graph/journal.ts');
    const history=[];
    for(const entry of batch.values()) {
      const ticket=state.get(store.localId(entry.id));
      if(ticket?.kind!=='Ticket' || !entry.record) continue;
      const collection=await store.sp.collectionForEntityType(Ticket.dcr);
      const previous=await collection.findById<Record<string,unknown>>(entry.id);
      history.push(...await ticketChangeEvents(store,entry.id,previous??undefined,entry.record));
    }
    store.sqliteStore.applyBatch([assertion, ...batch.values(), ...history]);
    return {edges};
  } finally { await store.releaseGovernance(token); }
}
