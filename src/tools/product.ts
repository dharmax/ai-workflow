/**
 * Responsibility: Deterministic product intent tools for Epics, Features, User Stories, and causal graph relations.
 * Scope: CRUD/query for product entities, constrained canonical linking/unlinking, and coverage/impact wrappers.
 */

import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import {
  Epic,
  Feature,
  UserStory
} from '../graph/ontology.ts';
import { getCoverage } from '../product/coverage.ts';
import { getProductImpact } from '../product/impact.ts';
import { proposeEpicStructure, type EpicStructureProposal } from '../product/decompose.ts';
import { applyEpicStructure } from '../product/apply.ts';
import { applyProductMutations, resolveProductEntity, productKind } from '../product/mutation.ts';

const EPIC_STATUSES = ['draft', 'planned', 'active', 'completed', 'cancelled'] as const;
const INTENT_STATUSES = ['draft', 'proposed', 'accepted', 'deprecated'] as const;

async function requireEntity(ctx: ToolContext, id: string, dcr?: any, kind?: string): Promise<any> {
  const entity = await ctx.store.getEntity(id, dcr);
  if (!entity) {
    throw new Error(`${kind || 'Entity'} '${id}' not found.`);
  }
  return entity;
}

async function epicView(ctx: ToolContext, epic: Epic) {
  const localId = ctx.store.localId(epic.id);
  const [targetPreds, ticketPreds] = await Promise.all([
    ctx.store.getOutgoing(epic.id, 'targets'),
    ctx.store.getOutgoing(epic.id, 'contains')
  ]);

  const targetedFeatures: string[] = [];
  const targetedStories: string[] = [];
  for (const pred of targetPreds) {
    const target = await ctx.store.getEntity(pred.targetId);
    if (target instanceof Feature) {
      targetedFeatures.push(ctx.store.localId(target.id));
    } else if (target instanceof UserStory) {
      targetedStories.push(ctx.store.localId(target.id));
    }
  }

  const containedTickets = ticketPreds.map(p => ctx.store.localId(p.targetId)).sort();

  return {
    id: localId,
    title: (epic as any).title,
    status: (epic as any).status || 'draft',
    body: (epic as any).body || undefined,
    priority: (epic as any).priority ?? 1,
    targetedFeatures: targetedFeatures.sort(),
    targetedStories: targetedStories.sort(),
    containedTickets
  };
}

async function featureView(ctx: ToolContext, feature: Feature) {
  const localId = ctx.store.localId(feature.id);
  const [epicPreds, storyPreds, ticketPreds, testPreds, decisionPreds] = await Promise.all([
    ctx.store.getIncoming(feature.id, 'targets'),
    ctx.store.getOutgoing(feature.id, 'contains'),
    ctx.store.getIncoming(feature.id, 'implements'),
    ctx.store.getIncoming(feature.id, 'verifies'),
    ctx.store.getIncoming(feature.id, 'governs')
  ]);

  return {
    id: localId,
    title: (feature as any).title,
    status: (feature as any).status || 'draft',
    body: (feature as any).body || undefined,
    acceptanceCriteria: Array.isArray((feature as any).acceptanceCriteria) ? (feature as any).acceptanceCriteria : [],
    targetingEpics: epicPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    containedStories: storyPreds.map(p => ctx.store.localId(p.targetId)).sort(),
    implementingTickets: ticketPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    verifyingTests: testPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    governingDecisions: decisionPreds.map(p => ctx.store.localId(p.sourceId)).sort()
  };
}

async function storyView(ctx: ToolContext, story: UserStory) {
  const localId = ctx.store.localId(story.id);
  const [featurePreds, epicPreds, ticketPreds, testPreds, decisionPreds] = await Promise.all([
    ctx.store.getIncoming(story.id, 'contains'),
    ctx.store.getIncoming(story.id, 'targets'),
    ctx.store.getIncoming(story.id, 'addresses'),
    ctx.store.getIncoming(story.id, 'verifies'),
    ctx.store.getIncoming(story.id, 'governs')
  ]);

  return {
    id: localId,
    title: (story as any).title,
    status: (story as any).status || 'draft',
    actor: (story as any).actor || undefined,
    story: (story as any).story || undefined,
    context: (story as any).context || undefined,
    acceptanceCriteria: Array.isArray((story as any).acceptanceCriteria) ? (story as any).acceptanceCriteria : [],
    sla: (story as any).sla || undefined,
    containingFeatures: featurePreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    targetingEpics: epicPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    addressingTickets: ticketPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    verifyingTests: testPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    governingDecisions: decisionPreds.map(p => ctx.store.localId(p.sourceId)).sort()
  };
}

export function registerProductTools() {
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
    description: 'Get an Epic with targeted features/stories and contained tickets.',
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
    description: 'Get a Feature with its containing stories, targeting epics, tickets, and tests.',
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
    description: 'Get a user story with its containing feature, targeting epics, tickets, and tests.',
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
        const outgoing = await ctx.store.getOutgoing(featureId, 'contains');
        const allowed = new Set(outgoing.map(p => p.targetId));
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
    description: 'Connect product entities using strictly allowed canonical relations (Epic targets Feature/Story, Feature contains Story, Epic contains Ticket, Ticket implements Feature, Ticket addresses Story, Test verifies Feature/Story, Decision governs Epic/Feature/Story).',
    category: 'planning',
    parameters: z.object({
      sourceId: z.string().describe('Source entity ID'),
      predicate: z.string().describe('Semantic predicate: targets, contains, implements, addresses, verifies, governs'),
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
      predicate: z.string().describe('Semantic predicate: targets, contains, implements, addresses, verifies, governs'),
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
