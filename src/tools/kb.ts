/**
 * Responsibility: Knowledgebase Search & Retrieval Tools for Agents.
 * Scope: Exposes content-addressable knowledgebase tools and dynamic SkillManager capabilities to ToolRegistry and LLMActor.
 */

import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { KnowledgeBaseClient } from '../kb/client.ts';
import { getAIWFSkillManager } from '../kb/manager.ts';

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
    execute: async ({ query, type, tag }: any, ctx: ToolContext) => {
      // 1. Check dynamic skill-manager first if searching for skills or generic query
      let skillResults: any[] = [];
      if (!type || type === 'skill') {
        const sm = await getAIWFSkillManager({ projectRoot: ctx?.projectRoot });
        const matches = query ? await sm.retrieve(query) : await sm.list();
        skillResults = matches.map(s => ({
          id: s.id,
          type: 'skill' as const,
          title: s.name,
          description: s.description,
          tags: [...s.keys.primary, ...s.keys.secondary],
          sha256: s.source?.contentHash ? s.source.contentHash.slice(0, 12) : 'local'
        }));
      }

      const items = await kbClient.search({ query, type, tag });
      const kbItems = items.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        description: i.description,
        tags: i.tags,
        sha256: i.sha256.slice(0, 12)
      }));

      // Deduplicate by ID
      const seen = new Set<string>();
      const combined = [...skillResults, ...kbItems].filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      return {
        count: combined.length,
        items: combined
      };
    }
  });

  registry.register({
    name: 'get_knowledge_item',
    description: 'Retrieve verified content and specification of a skill, service recipe, or architecture pattern by its ID.',
    category: 'kb',
    parameters: z.object({
      id: z.string().describe('Exact item ID (e.g. "web-ui-design", "patterns/pubsub-event-routing")')
    }),
    execute: async ({ id }: any, ctx: ToolContext) => {
      // 1. Try resolving via dynamic skill-manager
      const sm = await getAIWFSkillManager({ projectRoot: ctx?.projectRoot });
      const activated = await sm.activate([id]);
      if (activated.length > 0) {
        const skill = activated[0];
        return {
          id: skill.id,
          type: 'skill',
          title: skill.name,
          description: skill.description,
          verified: true,
          sha256: skill.source?.contentHash,
          tools: skill.tools,
          requires: skill.requires,
          content: skill.context || skill.description
        };
      }

      // 2. Fall back to static KnowledgeBaseClient
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

  registry.register({
    name: 'find_skills',
    description: 'Dynamically discover verified operational skills and tools from @dharmax/skill-manager.',
    category: 'kb',
    parameters: z.object({
      query: z.string().describe('Search query describing the needed capability, component, or task'),
      limit: z.number().optional().default(5).describe('Maximum skills to return')
    }),
    execute: async ({ query, limit }: any, ctx: ToolContext) => {
      const sm = await getAIWFSkillManager({ projectRoot: ctx?.projectRoot });
      const tool = sm.getFindSkillsTool();
      return await tool.execute({ query, limit });
    }
  });
}
