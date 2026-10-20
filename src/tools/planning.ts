/**
 * Responsibility: Architectural Decision Records (ADRs) and Scratchpad Planning Facility.
 * Scope: Inert ADR proposals and shared agent notes.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { queryPerformance } from '../performance-metrics.ts';
import { registry, type ToolContext } from './registry.ts';

export function registerPlanningTools() {
  registry.register({ name: 'get_performance_metrics', description: 'Query compact persisted engineering performance summaries; root runs by default avoid nested token duplication.', category: 'planning',
    parameters: z.object({ operation: z.string().optional(), artifactId: z.string().optional(), since: z.string().optional(), tag: z.string().optional(), includeNested: z.boolean().optional() }),
    execute: (query, ctx) => queryPerformance(ctx.projectRoot, query) });
  registry.register({
    name: 'propose_decision',
    description: 'Return an inert Architectural Decision proposal without changing canonical state.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Decision identifier (e.g. ADR-001)'),
      title: z.string().describe('Short title of the architectural decision'),
      decision: z.string().describe('Proposed architectural choice'),
      context: z.string().optional().describe('Problem statement and context'),
      consequences: z.string().optional().describe('Impact and trade-offs of the decision')
    }),
    execute: (params) => {
      const id = params.id || `ADR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      return {...params, id, status: 'proposed', persisted: false,
        next: 'Review this proposal with product decision new; existing Decisions use product decision edit. Only exact host-reviewed S2 acceptance persists it.'};
    }
  });

  registry.register({
    name: 'read_scratchpad',
    description: 'Read the shared agent scratchpad notes.',
    category: 'planning',
    parameters: z.object({}),
    execute: async (_, ctx: ToolContext) => {
      const scratchFile = path.join(ctx.projectRoot, '.ai-workflow', 'scratchpad.md');
      if (!fs.existsSync(scratchFile)) {
        return { content: 'Scratchpad is empty.', notesCount: 0 };
      }
      const content = fs.readFileSync(scratchFile, 'utf8');
      const count = content.split('\n').filter(l => l.startsWith('- **[')).length;
      return { content, notesCount: count };
    }
  });

  registry.register({
    name: 'append_scratchpad_note',
    description: 'Append a durable note or finding to the project scratchpad.',
    category: 'planning',
    parameters: z.object({
      note: z.string().describe('Note text to append')
    }),
    execute: async ({ note }, ctx: ToolContext) => {
      ctx.store.assertCanWrite();
      const scratchDir = path.join(ctx.projectRoot, '.ai-workflow');
      fs.mkdirSync(scratchDir, { recursive: true });
      const scratchFile = path.join(scratchDir, 'scratchpad.md');
      const timestamp = new Date().toISOString();
      const entry = `\n- **[${timestamp}]**: ${note}\n`;
      fs.appendFileSync(scratchFile, entry, 'utf8');
      return { note, timestamp, savedPath: scratchFile };
    }
  });
}
