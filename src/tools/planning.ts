/**
 * Responsibility: Architectural Decision Records (ADRs) and Scratchpad Planning Facility.
 * Scope: Creating and reading ADR decisions and agent notes.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { Decision } from '../graph/ontology.ts';

export function registerPlanningTools() {
  registry.register({
    name: 'propose_decision',
    description: 'Record a new Architectural Decision Record (ADR) in the graph.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Decision identifier (e.g. ADR-001)'),
      title: z.string().describe('Short title of the architectural decision'),
      decision: z.string().describe('What was decided'),
      context: z.string().optional().describe('Problem statement and context'),
      consequences: z.string().optional().describe('Impact and trade-offs of the decision')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `ADR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const dec = await ctx.store.upsertEntity<Decision>(Decision.dcr, {
        id,
        title: params.title,
        decision: params.decision,
        context: params.context || '',
        consequences: params.consequences || '',
        status: 'accepted'
      });

      return {
        id: ctx.store.localId(dec.id),
        title: params.title,
        status: 'accepted'
      };
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
