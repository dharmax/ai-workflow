/**
 * Responsibility: User-story product behavior and graph relations.
 * Scope: Story CRUD, Epic/Story/Ticket/Test relationships, and coverage queries.
 */

import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { Epic, Ticket, TestNode, UserStory } from '../graph/ontology.ts';

async function requireEntity<T>(ctx: ToolContext, id: string, dcr: any, kind: string): Promise<T> {
  const entity = await ctx.store.getEntity<T>(id, dcr);
  if (!entity) throw new Error(`${kind} ${id} not found.`);
  return entity;
}

async function storyView(ctx: ToolContext, story: UserStory) {
  const [epicPreds, ticketPreds, testPreds] = await Promise.all([
    ctx.store.getIncoming(story.id, 'contains'),
    ctx.store.getIncoming(story.id, 'addresses'),
    ctx.store.getIncoming(story.id, 'verifies')
  ]);

  return {
    id: ctx.store.localId(story.id),
    title: (story as any).title,
    actor: (story as any).actor || undefined,
    story: (story as any).story || undefined,
    context: (story as any).context || undefined,
    acceptanceCriteria: (story as any).acceptanceCriteria || [],
    sla: (story as any).sla || undefined,
    status: (story as any).status,
    epicIds: epicPreds.map(p => ctx.store.localId(p.sourceId)),
    ticketIds: ticketPreds.map(p => ctx.store.localId(p.sourceId)),
    testIds: testPreds.map(p => ctx.store.localId(p.sourceId)),
    implemented: ticketPreds.length > 0,
    verified: testPreds.length > 0
  };
}

export function registerStoryTools() {
  registry.register({
    name: 'create_user_story',
    description: 'Create a first-class user story and optionally attach it to an Epic.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Optional stable story ID (e.g. STORY-001)'),
      title: z.string().describe('Short behavior/outcome title'),
      actor: z.string().optional().describe('User or stakeholder experiencing the behavior'),
      story: z.string().optional().describe('Desired behavior/outcome; do not force agile phrasing'),
      context: z.string().optional().describe('Why or when this behavior matters'),
      acceptanceCriteria: z.array(z.string()).optional().describe('Observable acceptance criteria'),
      sla: z.string().optional().describe('Optional performance or service-level expectation'),
      epicId: z.string().optional().describe('Optional containing Epic ID')
    }),
    execute: async (params, ctx: ToolContext) => {
      if (params.epicId) await requireEntity(ctx, params.epicId, Epic.dcr, 'Epic');

      const id = params.id || `STORY-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const story = await ctx.store.upsertEntity<UserStory>(UserStory.dcr, {
        id,
        title: params.title,
        actor: params.actor || '',
        story: params.story || '',
        context: params.context || '',
        acceptanceCriteria: params.acceptanceCriteria || [],
        sla: params.sla || '',
        status: 'proposed'
      });

      if (params.epicId) {
        await ctx.store.relate(params.epicId, 'contains', story);
      }

      return await storyView(ctx, story);
    }
  });

  registry.register({
    name: 'update_user_story',
    description: 'Update the behavioral content of an existing user story without changing graph relations.',
    category: 'planning',
    parameters: z.object({
      storyId: z.string(),
      title: z.string().optional(),
      actor: z.string().optional(),
      story: z.string().optional(),
      context: z.string().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      sla: z.string().optional(),
      status: z.enum(['draft', 'proposed', 'accepted', 'implemented', 'verified', 'deprecated']).optional()
    }),
    execute: async ({ storyId, ...changes }, ctx: ToolContext) => {
      const entity = await requireEntity<UserStory>(ctx, storyId, UserStory.dcr, 'User story');
      const update = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await entity.update({ ...update, updatedAt: new Date().toISOString() }, true, false);
      return await storyView(ctx, entity);
    }
  });

  registry.register({
    name: 'link_user_story',
    description: 'Connect a story to its containing Epic, implementation tickets, or verifying tests using graph relations.',
    category: 'planning',
    parameters: z.object({
      storyId: z.string(),
      epicId: z.string().optional(),
      ticketIds: z.array(z.string()).optional(),
      testIds: z.array(z.string()).optional()
    }),
    execute: async ({ storyId, epicId, ticketIds = [], testIds = [] }, ctx: ToolContext) => {
      const story = await requireEntity<UserStory>(ctx, storyId, UserStory.dcr, 'User story');

      if (epicId) {
        await requireEntity(ctx, epicId, Epic.dcr, 'Epic');
        await ctx.store.relate(epicId, 'contains', story);
      }

      for (const ticketId of ticketIds) {
        await requireEntity(ctx, ticketId, Ticket.dcr, 'Ticket');
        await ctx.store.relate(ticketId, 'addresses', story);
      }

      for (const testId of testIds) {
        await requireEntity(ctx, testId, TestNode.dcr, 'Test');
        await ctx.store.relate(testId, 'verifies', story);
      }

      return await storyView(ctx, story);
    }
  });

  registry.register({
    name: 'get_user_story',
    description: 'Get a user story with its Epic, implementation tickets, tests, and coverage state.',
    category: 'planning',
    parameters: z.object({ storyId: z.string() }),
    execute: async ({ storyId }, ctx: ToolContext) => {
      const story = await requireEntity<UserStory>(ctx, storyId, UserStory.dcr, 'User story');
      return await storyView(ctx, story);
    }
  });

  registry.register({
    name: 'list_user_stories',
    description: 'List user stories, optionally filtering to stories lacking implementation tickets or verification tests.',
    category: 'planning',
    parameters: z.object({
      coverage: z.enum(['all', 'unimplemented', 'unverified']).default('all'),
      epicId: z.string().optional()
    }),
    execute: async ({ coverage, epicId }, ctx: ToolContext) => {
      let stories = await ctx.store.listEntities<UserStory>(UserStory.dcr);

      if (epicId) {
        const outgoing = await ctx.store.getOutgoing(epicId, 'contains');
        const allowed = new Set(outgoing.map(p => p.targetId));
        stories = stories.filter(s => allowed.has(s.id));
      }

      const views = await Promise.all(stories.map(s => storyView(ctx, s)));
      if (coverage === 'unimplemented') return views.filter(v => !v.implemented);
      if (coverage === 'unverified') return views.filter(v => !v.verified);
      return views;
    }
  });
}
