import { z } from 'zod';
import { registry } from './registry.ts';
import { Aspect, Idea, ModuleNode, Epic, Feature, UserStory, Ticket } from '../graph/ontology.ts';
import type { WorkflowStore } from '../graph/store.ts';
import { exportProjections } from '../graph/projections.ts';

const fields = z.object({ title: z.string().min(1), body: z.string().optional(), status: z.enum(['draft', 'proposed', 'accepted', 'deprecated']).optional(), acceptanceCriteria: z.array(z.string()).optional() });
async function loadAspect(store: WorkflowStore, id: string): Promise<Aspect> {
  const aspect = await store.getEntity<Aspect>(id, Aspect.dcr);
  if (!aspect) throw new Error(`Aspect '${id}' not found.`);
  return aspect;
}
async function loadScope(store: WorkflowStore, id: string) {
  const scope = await store.getEntity(id);
  if (!(scope instanceof Idea || scope instanceof ModuleNode || scope instanceof Epic || scope instanceof Feature || scope instanceof UserStory || scope instanceof Ticket)) throw new Error(`Unsupported Aspect scope '${id}'.`);
  return scope;
}

export function registerAspectTools(): void {
  registry.register({ name: 'create_aspect', description: 'Create explicit cross-cutting intent through canonical Product mutation.', category: 'planning',
    parameters: fields.extend({ id: z.string().optional() }), execute: async (params, ctx) => {
      const aspect = await Aspect.create(ctx.store, { ...params, id: params.id ?? `ASP-${crypto.randomUUID().slice(0, 8).toUpperCase()}` });
      await exportProjections(ctx.store, ctx.projectRoot); return aspect.view(ctx.store);
    } });
  registry.register({ name: 'update_aspect', description: 'Update Aspect intent; satisfaction is never persisted.', category: 'planning',
    parameters: fields.partial().extend({ id: z.string() }), execute: async ({ id, ...params }, ctx) => {
      const aspect = await (await loadAspect(ctx.store, id)).revise(ctx.store, params);
      await exportProjections(ctx.store, ctx.projectRoot); return aspect.view(ctx.store);
    } });
  registry.register({ name: 'get_aspect', description: 'Read an Aspect with structural evidence and gaps.', category: 'planning',
    parameters: z.object({ id: z.string() }), execute: async ({ id }, ctx) => (await loadAspect(ctx.store, id)).view(ctx.store) });
  registry.register({ name: 'list_aspects', description: 'List project Aspects, optionally by intent status.', category: 'planning',
    parameters: z.object({ status: fields.shape.status }), execute: async ({ status }, ctx) => {
      const aspects = await ctx.store.listEntities<Aspect>(Aspect.dcr, status ? { status } : {});
      return Promise.all(aspects.map(a => a.view(ctx.store)));
    } });
  for (const name of ['link_aspect', 'unlink_aspect'] as const) registry.register({ name, description: `${name === 'link_aspect' ? 'Apply' : 'Remove'} an Aspect on a higher-level scope.`, category: 'planning',
    parameters: z.object({ aspectId: z.string(), scopeId: z.string() }), execute: async ({ aspectId, scopeId }, ctx) => {
      const aspect = await loadAspect(ctx.store, aspectId), scope = await loadScope(ctx.store, scopeId);
      if (name === 'link_aspect') await aspect.applyTo(scope, ctx.store); else await aspect.removeFrom(scope, ctx.store);
      await exportProjections(ctx.store, ctx.projectRoot); return aspect.view(ctx.store);
    } });
  registry.register({ name: 'get_applicable_aspects', description: 'Resolve defined scope inheritance with deduplication and Ticket cycle detection.', category: 'planning',
    parameters: z.object({ entityId: z.string() }), execute: async ({ entityId }, ctx) => {
      const scope = await loadScope(ctx.store, entityId);
      return Promise.all((await scope.applicableAspects(ctx.store)).map(a => a.view(ctx.store)));
    } });
  registry.register({ name: 'assess_aspects', description: 'Derive concern/work/evidence/Decision gaps without a score.', category: 'planning',
    parameters: z.object({ entityId: z.string() }), execute: async ({ entityId }, ctx) => (await loadScope(ctx.store, entityId)).assessAspects(ctx.store) });
}
