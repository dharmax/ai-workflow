/**
 * Responsibility: Knowledgebase Search & Retrieval Tools for Agents.
 * Scope: Exposes content-addressable knowledgebase tools to ToolRegistry and LLMActor.
 */

import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { KnowledgeBaseClient } from '../kb/client.ts';

const kbClient = new KnowledgeBaseClient();

export function registerKnowledgebaseTools() {
  registry.register({
    name: 'search_knowledgebase',
    description: 'Search content-addressed knowledgebase of verified operational skills, systemd/docker services, and architecture patterns.',
    category: 'kb',
    parameters: z.object({
      query: z.string().optional().describe('Search term or keyword (e.g. "ollama", "pubsub", "port")'),
      type: z.enum(['service', 'skill', 'pattern']).optional().describe('Filter by item type'),
      tag: z.string().optional().describe('Filter by tag')
    }),
    execute: async ({ query, type, tag }: any, _ctx: ToolContext) => {
      const items = await kbClient.search({ query, type, tag });
      return {
        count: items.length,
        items: items.map((i) => ({
          id: i.id,
          type: i.type,
          title: i.title,
          description: i.description,
          tags: i.tags,
          sha256: i.sha256.slice(0, 12)
        }))
      };
    }
  });

  registry.register({
    name: 'get_knowledge_item',
    description: 'Retrieve verified content and specification of a skill, service recipe, or architecture pattern by its ID.',
    category: 'kb',
    parameters: z.object({
      id: z.string().describe('Exact item ID (e.g. "patterns/pubsub-event-routing", "services/systemd-ollama")')
    }),
    execute: async ({ id }: any, _ctx: ToolContext) => {
      const item = await kbClient.getItem(id);
      if (!item) {
        return { error: `Item '${id}' not found in knowledgebase.` };
      }
      return {
        id: item.meta.id,
        type: item.meta.type,
        title: item.meta.title,
        description: item.meta.description,
        verified: item.verified,
        sha256: item.meta.sha256,
        content: item.parsed || item.rawContent
      };
    }
  });
}
