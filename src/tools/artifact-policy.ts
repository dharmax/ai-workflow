import { z } from 'zod';
import { registry } from './registry.ts';
import { CompletenessSchema, requireCompletenessScope } from '../artifact-policy.ts';
import { exportProjections } from '../graph/projections.ts';

export function registerArtifactPolicyTools(): void {
  registry.register({
    name: 'get_completeness_target', description: 'Read explicit/effective target and constrained inheritance provenance.', category: 'planning',
    parameters: z.object({ entityId: z.string() }),
    execute: async ({ entityId }, ctx) => {
      const entity = await ctx.store.getEntity(entityId);
      if (!entity) throw new Error(`Entity '${entityId}' not found.`);
      requireCompletenessScope(entity);
      return entity.getCompletenessTarget(ctx.store);
    }
  });
  registry.register({
    name: 'set_completeness_target', description: 'Explicitly remember or clear a durable scope target; Tickets have no persisted target.', category: 'planning',
    parameters: z.object({ entityId: z.string(), level: CompletenessSchema.nullable() }),
    execute: async ({ entityId, level }, ctx) => {
      const entity = await ctx.store.getEntity(entityId);
      if (!entity) throw new Error(`Entity '${entityId}' not found.`);
      requireCompletenessScope(entity);
      await entity.setCompletenessTarget(ctx.store, level);
      await exportProjections(ctx.store, ctx.projectRoot);
      const updated = await ctx.store.getEntity(entityId);
      if (!updated) throw new Error(`Entity '${entityId}' disappeared.`);
      requireCompletenessScope(updated);
      return updated.getCompletenessTarget(ctx.store);
    }
  });
}
