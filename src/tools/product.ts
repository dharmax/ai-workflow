/**
 * Responsibility: Deterministic product intent tools for Epics, Features, User Stories, and causal graph relations.
 * Scope: CRUD/query for product entities, constrained canonical linking/unlinking, and coverage/impact wrappers.
 */

import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import {
  Goal,
  Concept,
  Flow,
  Epic,
  Feature,
  UserStory
} from '../graph/ontology.ts';
import { getCoverage } from '../product/coverage.ts';
import { getProductImpact } from '../product/impact.ts';
import { proposeEpicStructure, type EpicStructureProposal } from '../product/decompose.ts';
import { applyEpicStructure } from '../product/apply.ts';
import { applyProductMutations, resolveProductEntity, productKind } from '../product/mutation.ts';
import { ArtifactTransportOptionsSchema } from '../artifact-policy.ts';

const EPIC_STATUSES = ['draft', 'planned', 'active', 'completed', 'cancelled'] as const;
const INTENT_STATUSES = ['draft', 'proposed', 'accepted', 'deprecated'] as const;

async function requireEntity(ctx: ToolContext, id: string, dcr?: any, kind?: string): Promise<any> {
  const entity = await ctx.store.getEntity(id, dcr);
  if (!entity) {
    throw new Error(`${kind || 'Entity'} '${id}' not found.`);
  }
  return entity;
}

async function topLevelIntentView(ctx: ToolContext, entity: Goal | Concept | Flow) {
  const [incoming, outgoing] = await Promise.all([
    ctx.store.getIncoming(entity.id),
    ctx.store.getOutgoing(entity.id)
  ]);
  const relation = (edge: any) => ({
    sourceId: ctx.store.localId(edge.sourceId),
    predicate: edge.predicateName,
    targetId: ctx.store.localId(edge.targetId)
  });
  return {
    id: ctx.store.localId(entity.id),
    kind: entity.typeName(),
    title: entity.title,
    body: (entity as any).body || undefined,
    status: (entity as any).status || 'draft',
    ...((entity instanceof Flow) ? {
      actor: (entity as any).actor || undefined,
      context: (entity as any).context || undefined
    } : {}),
    incoming: incoming.map(relation),
    outgoing: outgoing.map(relation)
  };
}

async function epicView(ctx: ToolContext, epic: Epic) {
  const localId = ctx.store.localId(epic.id);
  const [targetPreds, ticketPreds] = await Promise.all([
    ctx.store.getOutgoing(epic.id, 'targets'),
    ctx.store.getOutgoing(epic.id, 'contains')
  ]);

  const targetedGoals: string[] = [];
  const targetedConcepts: string[] = [];
  const targetedFlows: string[] = [];
  const targetedFeatures: string[] = [];
  const targetedStories: string[] = [];
  for (const pred of targetPreds) {
    const target = await ctx.store.getEntity(pred.targetId);
    if (target instanceof Goal) targetedGoals.push(ctx.store.localId(target.id));
    else if (target instanceof Concept) targetedConcepts.push(ctx.store.localId(target.id));
    else if (target instanceof Flow) targetedFlows.push(ctx.store.localId(target.id));
    else if (target instanceof Feature) targetedFeatures.push(ctx.store.localId(target.id));
    else if (target instanceof UserStory) targetedStories.push(ctx.store.localId(target.id));
  }

  const containedTickets = ticketPreds.map(p => ctx.store.localId(p.targetId)).sort();

  return {
    id: localId,
    title: (epic as any).title,
    status: (epic as any).status || 'draft',
    body: (epic as any).body || undefined,
    priority: (epic as any).priority ?? 1,
    targetedGoals: targetedGoals.sort(),
    targetedConcepts: targetedConcepts.sort(),
    targetedFlows: targetedFlows.sort(),
    targetedFeatures: targetedFeatures.sort(),
    targetedStories: targetedStories.sort(),
    containedTickets
  };
}

async function featureView(ctx: ToolContext, feature: Feature) {
  const localId = ctx.store.localId(feature.id);
  const [epicPreds, enabledPreds, legacyStoryPreds, ticketPreds, testPreds, governingPreds] = await Promise.all([
    ctx.store.getIncoming(feature.id, 'targets'),
    ctx.store.getOutgoing(feature.id, 'enables'),
    ctx.store.getOutgoing(feature.id, 'contains'),
    ctx.store.getIncoming(feature.id, 'implements'),
    ctx.store.getIncoming(feature.id, 'verifies'),
    ctx.store.getIncoming(feature.id, 'governs')
  ]);
  const enabledStories = [...new Set([...enabledPreds, ...legacyStoryPreds].map(p => ctx.store.localId(p.targetId)))].sort();
  const governingConcepts: string[] = [];
  const governingDecisions: string[] = [];
  for (const pred of governingPreds) {
    const source = await ctx.store.getEntity(pred.sourceId);
    if (source instanceof Concept) governingConcepts.push(ctx.store.localId(source.id));
    else governingDecisions.push(ctx.store.localId(pred.sourceId));
  }

  return {
    id: localId,
    title: (feature as any).title,
    status: (feature as any).status || 'draft',
    body: (feature as any).body || undefined,
    acceptanceCriteria: Array.isArray((feature as any).acceptanceCriteria) ? (feature as any).acceptanceCriteria : [],
    targetingEpics: epicPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    enabledStories,
    containedStories: enabledStories,
    implementingTickets: ticketPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    verifyingTests: testPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    governingConcepts: governingConcepts.sort(),
    governingDecisions: governingDecisions.sort()
  };
}

async function storyView(ctx: ToolContext, story: UserStory) {
  const localId = ctx.store.localId(story.id);
  const [containsPreds, enablesPreds, epicPreds, ticketPreds, testPreds, governingPreds] = await Promise.all([
    ctx.store.getIncoming(story.id, 'contains'),
    ctx.store.getIncoming(story.id, 'enables'),
    ctx.store.getIncoming(story.id, 'targets'),
    ctx.store.getIncoming(story.id, 'addresses'),
    ctx.store.getIncoming(story.id, 'verifies'),
    ctx.store.getIncoming(story.id, 'governs')
  ]);

  const containingFlows: string[] = [];
  const legacyFeatures: string[] = [];
  for (const pred of containsPreds) {
    const source = await ctx.store.getEntity(pred.sourceId);
    if (source instanceof Flow) containingFlows.push(ctx.store.localId(source.id));
    else if (source instanceof Feature) legacyFeatures.push(ctx.store.localId(source.id));
  }
  const enablingFeatures = [...new Set([...enablesPreds.map(p => ctx.store.localId(p.sourceId)), ...legacyFeatures])].sort();
  const governingConcepts: string[] = [];
  const governingDecisions: string[] = [];
  for (const pred of governingPreds) {
    const source = await ctx.store.getEntity(pred.sourceId);
    if (source instanceof Concept) governingConcepts.push(ctx.store.localId(source.id));
    else governingDecisions.push(ctx.store.localId(pred.sourceId));
  }

  return {
    id: localId,
    title: (story as any).title,
    status: (story as any).status || 'draft',
    actor: (story as any).actor || undefined,
    story: (story as any).story || undefined,
    context: (story as any).context || undefined,
    acceptanceCriteria: Array.isArray((story as any).acceptanceCriteria) ? (story as any).acceptanceCriteria : [],
    sla: (story as any).sla || undefined,
    containingFlows: containingFlows.sort(),
    enablingFeatures,
    containingFeatures: enablingFeatures,
    targetingEpics: epicPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    addressingTickets: ticketPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    verifyingTests: testPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    governingConcepts: governingConcepts.sort(),
    governingDecisions: governingDecisions.sort()
  };
}

export function registerProductTools() {
  for (const spec of [
    { kind: 'Goal' as const, ctor: Goal, prefix: 'goal', idPrefix: 'GOAL', actorFields: false },
    { kind: 'Concept' as const, ctor: Concept, prefix: 'concept', idPrefix: 'CONCEPT', actorFields: false },
    { kind: 'Flow' as const, ctor: Flow, prefix: 'flow', idPrefix: 'FLOW', actorFields: true }
  ]) {
    const baseFields = {
      id: z.string().optional(),
      title: z.string().min(1),
      body: z.string().optional(),
      status: z.enum(INTENT_STATUSES).optional()
    };
    const createSchema = spec.actorFields
      ? z.object({ ...baseFields, actor: z.string().optional(), context: z.string().optional() })
      : z.object(baseFields);
    registry.register({
      name: `create_${spec.prefix}`,
      description: `Create a durable ${spec.kind} in top-level Product Intent.`,
      category: 'planning',
      parameters: createSchema,
      execute: async (params: any, ctx: ToolContext) => {
        const id = params.id || `${spec.idPrefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const fields = Object.fromEntries(Object.entries({
          title: params.title, body: params.body || '', status: params.status || 'draft',
          ...(spec.actorFields ? { actor: params.actor || '', context: params.context || '' } : {})
        }).filter(([, value]) => value !== undefined));
        await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: spec.kind, id, fields }]);
        return topLevelIntentView(ctx, await requireEntity(ctx, id, spec.ctor.dcr, spec.kind));
      }
    });
    registry.register({
      name: `get_${spec.prefix}`,
      description: `Get a ${spec.kind} and its semantic relations.`,
      category: 'planning',
      parameters: z.object({ id: z.string() }),
      execute: async ({ id }, ctx: ToolContext) => topLevelIntentView(ctx, await requireEntity(ctx, id, spec.ctor.dcr, spec.kind))
    });
    registry.register({
      name: `list_${spec.prefix}s`,
      description: `List ${spec.kind} entities.`,
      category: 'planning',
      parameters: z.object({ status: z.enum(INTENT_STATUSES).optional() }),
      execute: async ({ status }, ctx: ToolContext) => {
        const entities = await ctx.store.listEntities<any>(spec.ctor.dcr);
        const views = await Promise.all(entities.map(entity => topLevelIntentView(ctx, entity)));
        return status ? views.filter(view => view.status === status) : views;
      }
    });
    registry.register({
      name: `update_${spec.prefix}`,
      description: `Update a ${spec.kind} without changing its semantic relations.`,
      category: 'planning',
      parameters: spec.actorFields
        ? z.object({ id: z.string(), title: z.string().optional(), body: z.string().optional(), status: z.enum(INTENT_STATUSES).optional(), actor: z.string().optional(), context: z.string().optional() })
        : z.object({ id: z.string(), title: z.string().optional(), body: z.string().optional(), status: z.enum(INTENT_STATUSES).optional() }),
      execute: async ({ id, ...changes }: any, ctx: ToolContext) => {
        const fields = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
        await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: spec.kind, id, fields }]);
        return topLevelIntentView(ctx, await requireEntity(ctx, id, spec.ctor.dcr, spec.kind));
      }
    });
  }

  for (const [name, ctor, key] of [['process_epic', Epic, 'epicId'], ['process_feature', Feature, 'featureId'], ['process_story', UserStory, 'storyId']] as const) {
    registry.register({ name, category: 'planning', description: 'Reconcile Product Intent into necessary reviewed work, reusing existing capabilities and respecting completeness/depth/breadth.',
      parameters: ArtifactTransportOptionsSchema.extend({ [key]: z.string() }),
      execute: async (params, ctx) => {
        const { [key]: id, ...options } = params;
        const entity = await ctx.store.getEntity(String(id), ctor.dcr) as Epic | Feature | UserStory | null;
        if (!entity) throw new Error(`${ctor.name} '${id}' not found.`);
        return entity.process(ctx.store, options);
      }
    });
  }
  // ---------------------------------------------------------------------------
  // Epic Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'create_epic',
    description: 'Create a new Epic in the Product Intent Graph.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Optional stable epic ID (e.g. EPIC-001)'),
      title: z.string().describe('Epic title'),
      body: z.string().optional().describe('Detailed epic description or background'),
      priority: z.number().optional().describe('Priority integer (default 1)'),
      status: z.enum(EPIC_STATUSES).optional().describe('Epic lifecycle status (default: draft)')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `EPIC-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'Epic', id,
        fields: { title: params.title, body: params.body || '', priority: params.priority ?? 1, status: params.status || 'draft' } }]);
      const epic = await requireEntity(ctx, id, Epic.dcr, 'Epic');
      return await epicView(ctx, epic);
    }
  });

  registry.register({
    name: 'get_epic',
    description: 'Get an Epic with targeted goals/concepts/flows/features/stories and contained tickets.',
    category: 'planning',
    parameters: z.object({ epicId: z.string() }),
    execute: async ({ epicId }, ctx: ToolContext) => {
      const epic = await requireEntity(ctx, epicId, Epic.dcr, 'Epic');
      return await epicView(ctx, epic);
    }
  });

  registry.register({
    name: 'list_epics',
    description: 'List Epics in the Product Intent Graph, optionally filtering by status.',
    category: 'planning',
    parameters: z.object({
      status: z.enum(EPIC_STATUSES).optional()
    }),
    execute: async ({ status }, ctx: ToolContext) => {
      const epics = await ctx.store.listEntities<Epic>(Epic.dcr);
      const views = await Promise.all(epics.map(e => epicView(ctx, e)));
      if (status) return views.filter(v => v.status === status);
      return views;
    }
  });

  registry.register({
    name: 'update_epic',
    description: 'Update the title, body, priority, or status of an existing Epic.',
    category: 'planning',
    parameters: z.object({
      epicId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      priority: z.number().optional(),
      status: z.enum(EPIC_STATUSES).optional()
    }),
    execute: async ({ epicId, ...changes }, ctx: ToolContext) => {
      const update = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'Epic', id: epicId, fields: update }]);
      return await epicView(ctx, await requireEntity(ctx, epicId, Epic.dcr, 'Epic'));
    }
  });

  // ---------------------------------------------------------------------------
  // Feature Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'create_feature',
    description: 'Create a durable Feature entity in the Product Intent Graph.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Optional stable feature ID (e.g. FEAT-001)'),
      title: z.string().describe('Feature capability title'),
      body: z.string().optional().describe('Feature scope and description'),
      acceptanceCriteria: z.array(z.string()).optional().describe('High-level feature acceptance criteria'),
      status: z.enum(INTENT_STATUSES).optional().describe('Intent lifecycle status (default: draft)')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `FEAT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'Feature', id,
        fields: { title: params.title, body: params.body || '', acceptanceCriteria: params.acceptanceCriteria || [], status: params.status || 'draft' } }]);
      const feature = await requireEntity(ctx, id, Feature.dcr, 'Feature');
      return await featureView(ctx, feature);
    }
  });

  registry.register({
    name: 'get_feature',
    description: 'Get a Feature with the Stories it enables, targeting epics, tickets, and tests.',
    category: 'planning',
    parameters: z.object({ featureId: z.string() }),
    execute: async ({ featureId }, ctx: ToolContext) => {
      const feature = await requireEntity(ctx, featureId, Feature.dcr, 'Feature');
      return await featureView(ctx, feature);
    }
  });

  registry.register({
    name: 'list_features',
    description: 'List Features in the Product Intent Graph, optionally filtering by status.',
    category: 'planning',
    parameters: z.object({
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async ({ status }, ctx: ToolContext) => {
      const features = await ctx.store.listEntities<Feature>(Feature.dcr);
      const views = await Promise.all(features.map(f => featureView(ctx, f)));
      if (status) return views.filter(v => v.status === status);
      return views;
    }
  });

  registry.register({
    name: 'update_feature',
    description: 'Update the title, body, criteria, or status of an existing Feature.',
    category: 'planning',
    parameters: z.object({
      featureId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async ({ featureId, ...changes }, ctx: ToolContext) => {
      const update = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'Feature', id: featureId, fields: update }]);
      return await featureView(ctx, await requireEntity(ctx, featureId, Feature.dcr, 'Feature'));
    }
  });

  // ---------------------------------------------------------------------------
  // User Story Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'create_user_story',
    description: 'Create a first-class user story in the Product Intent Graph.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Optional stable story ID (e.g. STORY-001)'),
      title: z.string().describe('Short behavior/outcome title'),
      actor: z.string().optional().describe('User or stakeholder experiencing the behavior'),
      story: z.string().optional().describe('Desired behavior/outcome'),
      context: z.string().optional().describe('Why or when this behavior matters'),
      acceptanceCriteria: z.array(z.string()).optional().describe('Observable acceptance criteria'),
      sla: z.string().optional().describe('Performance or service-level expectation'),
      status: z.enum(INTENT_STATUSES).optional().describe('Intent lifecycle status (default: draft)')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `STORY-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'UserStory', id,
        fields: { title: params.title, actor: params.actor || '', story: params.story || '', context: params.context || '',
          acceptanceCriteria: params.acceptanceCriteria || [], sla: params.sla || '', status: params.status || 'draft' } }]);
      const story = await requireEntity(ctx, id, UserStory.dcr, 'UserStory');
      return await storyView(ctx, story);
    }
  });

  registry.register({
    name: 'get_user_story',
    description: 'Get a narrative Story with its containing Flow, enabling Features, targeting epics, tickets, and tests.',
    category: 'planning',
    parameters: z.object({ storyId: z.string() }),
    execute: async ({ storyId }, ctx: ToolContext) => {
      const story = await requireEntity(ctx, storyId, UserStory.dcr, 'User story');
      return await storyView(ctx, story);
    }
  });

  registry.register({
    name: 'list_user_stories',
    description: 'List user stories, optionally filtering by status or containing feature.',
    category: 'planning',
    parameters: z.object({
      status: z.enum(INTENT_STATUSES).optional(),
      featureId: z.string().optional()
    }),
    execute: async ({ status, featureId }, ctx: ToolContext) => {
      let stories = await ctx.store.listEntities<UserStory>(UserStory.dcr);

      if (featureId) {
        const [enabled, legacy] = await Promise.all([
          ctx.store.getOutgoing(featureId, 'enables'),
          ctx.store.getOutgoing(featureId, 'contains')
        ]);
        const allowed = new Set([...enabled, ...legacy].map(p => p.targetId));
        stories = stories.filter(s => allowed.has(s.id));
      }

      const views = await Promise.all(stories.map(s => storyView(ctx, s)));
      if (status) return views.filter(v => v.status === status);
      return views;
    }
  });

  registry.register({
    name: 'update_user_story',
    description: 'Update the behavioral content or status of an existing user story without changing graph relations.',
    category: 'planning',
    parameters: z.object({
      storyId: z.string(),
      title: z.string().optional(),
      actor: z.string().optional(),
      story: z.string().optional(),
      context: z.string().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      sla: z.string().optional(),
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async ({ storyId, ...changes }, ctx: ToolContext) => {
      const update = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'UserStory', id: storyId, fields: update }]);
      return await storyView(ctx, await requireEntity(ctx, storyId, UserStory.dcr, 'User story'));
    }
  });

  // ---------------------------------------------------------------------------
  // Constrained Link and Unlink Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'link_product',
    description: 'Connect Product Intent using canonical semantic relations, including Flow serves Goal, Concept governs scopes, Flow contains Story, Feature enables Story, Epic targets intent, and Ticket implements/addresses work.',
    category: 'planning',
    parameters: z.object({
      sourceId: z.string().describe('Source entity ID'),
      predicate: z.string().describe('Semantic predicate such as inspires, serves, governs, targets, contains, enables, implements, addresses, verifies'),
      targetId: z.string().describe('Target entity ID')
    }),
    execute: async ({ sourceId, predicate, targetId }, ctx: ToolContext) => {
      const source = await resolveProductEntity(ctx.store, sourceId);
      const target = await resolveProductEntity(ctx.store, targetId);
      const sourceKind = productKind(source)!;
      const targetKind = productKind(target)!;
      await applyProductMutations(ctx.store, [{ kind: 'product_link', sourceId, predicate, targetId }]);

      return {
        success: true,
        sourceId: ctx.store.localId(source.id),
        sourceKind,
        predicate,
        targetId: ctx.store.localId(target.id),
        targetKind
      };
    }
  });

  registry.register({
    name: 'unlink_product',
    description: 'Disconnect product entities linked by canonical relations.',
    category: 'planning',
    parameters: z.object({
      sourceId: z.string().describe('Source entity ID'),
      predicate: z.string().describe('Semantic predicate such as inspires, serves, governs, targets, contains, enables, implements, addresses, verifies'),
      targetId: z.string().describe('Target entity ID')
    }),
    execute: async ({ sourceId, predicate, targetId }, ctx: ToolContext) => {
      const source = await resolveProductEntity(ctx.store, sourceId);
      const target = await resolveProductEntity(ctx.store, targetId);
      const sourceKind = productKind(source)!;
      const targetKind = productKind(target)!;
      await applyProductMutations(ctx.store, [{ kind: 'product_unlink', sourceId, predicate, targetId }]);

      return {
        success: true,
        sourceId: ctx.store.localId(source.id),
        sourceKind,
        predicate,
        targetId: ctx.store.localId(target.id),
        targetKind
      };
    }
  });

  // ---------------------------------------------------------------------------
  // Coverage & Impact Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'get_product_coverage',
    description: 'Evaluate structural and causal coverage (work, code grounding, verification, blockers) for an Epic, Feature, or User Story.',
    category: 'planning',
    parameters: z.object({
      entityId: z.string().describe('Epic, Feature, or UserStory ID')
    }),
    execute: async ({ entityId }, ctx: ToolContext) => {
      return await getCoverage(ctx.store, entityId);
    }
  });

  registry.register({
    name: 'get_product_impact',
    description: 'Extract bounded semantic neighborhood (intent, work, code anchors, verification, decisions) for an Epic, Feature, or User Story.',
    category: 'planning',
    parameters: z.object({
      entityId: z.string().describe('Epic, Feature, or UserStory ID')
    }),
    execute: async ({ entityId }, ctx: ToolContext) => {
      return await getProductImpact(ctx.store, entityId);
    }
  });

  // ---------------------------------------------------------------------------
  // Epic Decomposition Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'propose_epic_structure',
    description: 'Propose a structured Epic decomposition into stable Features and observable User Stories with zero graph mutation.',
    category: 'planning',
    parameters: z.object({
      title: z.string().describe('Epic title or draft'),
      body: z.string().optional().describe('Epic scope or description'),
      status: z.enum(EPIC_STATUSES).optional().describe('Epic status'),
      existingEpicId: z.string().optional().describe('Optional existing Epic ID to enrich'),
      injectedSemanticOutput: z.any().optional().describe('Deterministic test injection (bypasses LLM)')
    }),
    execute: async ({ injectedSemanticOutput, ...draft }, ctx: ToolContext) => {
      return await proposeEpicStructure(ctx.store, draft, injectedSemanticOutput ? { injectedSemanticOutput } : undefined);
    }
  });

  registry.register({
    name: 'apply_epic_structure',
    description: 'Apply an accepted EpicStructureProposal deterministically and idempotently to the Product Intent Graph.',
    category: 'planning',
    parameters: z.object({
      proposal: z.any().describe('The validated EpicStructureProposal object to apply')
    }),
    execute: async ({ proposal }, ctx: ToolContext) => {
      return await applyEpicStructure(ctx.store, proposal);
    }
  });
}
