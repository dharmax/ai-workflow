/** Local presentation adapter. Product rules, review and persistence belong to S2. */
import { z } from 'zod';
import { registry, initializeTools } from '../tools/index.ts';
import type { ToolContext } from '../tools/registry.ts';
import { ProductMutationSchema, ProductRevisionSchema } from '../product/mutation.ts';
import { workspacePage } from './page.ts';
import { IntentProposalSchema } from '../product/process-types.ts';

const reads = {
  Feature: ['list_features', 'get_feature', 'featureId'],
  UserStory: ['list_user_stories', 'get_user_story', 'storyId'],
  Aspect: ['list_aspects', 'get_aspect', 'id'],
  Goal: ['list_goals', 'get_goal', 'id'],
  Concept: ['list_concepts', 'get_concept', 'id'],
  Flow: ['list_flows', 'get_flow', 'id'],
  Epic: ['list_epics', 'get_epic', 'epicId'],
  Ticket: ['list_tickets', 'get_ticket', 'ticketId']
} as const;
const querySchema = z.object({kind:z.enum(Object.keys(reads) as [keyof typeof reads, ...(keyof typeof reads)[]]), id:z.string().min(1)});
const requestSchema = z.object({action:z.literal('product_change'), mutations:z.array(ProductMutationSchema).min(1), basis:z.array(ProductRevisionSchema).optional(), originalRequest:z.string().optional()}).strict();
const applySchema = z.object({request:requestSchema, fingerprint:z.string().min(1), decision:z.enum(['accept','reject','cancel'])}).strict();

/** Caller owns the store; stop the returned server before closing it. Bind only loopback. */
export function startWorkspace(ctx: ToolContext, port = 0) {
  initializeTools();
  const token = crypto.randomUUID(), nonce = crypto.randomUUID();
  const call = (name: string, params: unknown) => registry.execute(name, params, ctx);
  const server = Bun.serve({
    hostname:'127.0.0.1', port, maxRequestBodySize:1024 * 1024,
    async fetch(req, server) {
      const url = new URL(req.url), origin = 'http://127.0.0.1:' + server.port;
      const headers = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'};
      const json = (data: unknown, status=200) => Response.json(data, {status,headers});
      if (req.headers.get('host') !== new URL(origin).host || req.headers.get('origin') && req.headers.get('origin') !== origin)
        return json({error:'Workspace origin refused.'},403);
      if (url.pathname === '/' && req.method === 'GET')
        return new Response(workspacePage.replaceAll('__NONCE__',nonce), {headers:{...headers,'Content-Type':'text/html; charset=utf-8',
          'Content-Security-Policy':"default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
      if (!url.pathname.startsWith('/api/')) return json({error:'Not found'},404);
      if (req.headers.get('x-aiwf-token') !== token) return json({error:'Open the Workspace URL printed by aiwf workspace.'},403);
      try {
        if (req.method === 'GET' && url.pathname === '/api/catalog') {
          const groups = await Promise.all(Object.entries(reads).map(async ([kind,[list]]) => {
            const rows = await call(list,{}) as Array<Record<string,unknown>>;
            return rows.map(row=>({...row,kind}));
          }));
          return json({entities:groups.flat(),projectRoot:ctx.projectRoot});
        }
        if (req.method === 'GET' && url.pathname === '/api/entity') {
          const {kind,id} = querySchema.parse(Object.fromEntries(url.searchParams));
          const [,get,key] = reads[kind];
          const entity = await call(get,{[key]:id}) as Record<string,unknown>;
          const canonical = await ctx.store.getEntity(id);
          if (!canonical) return json({error:'Entity not found'},404);
          if (entity.version !== undefined && entity.version !== canonical.version)
            return json({error:'Entity changed while loading. Reload canonical data.'},409);
          const incoming = await ctx.store.getIncoming(canonical.id), outgoing = await ctx.store.getOutgoing(canonical.id);
          const relations = [...new Map([...incoming,...outgoing].map(edge=>[edge.id,{
            sourceId:ctx.store.localId(edge.sourceId),predicate:edge.predicateName,targetId:ctx.store.localId(edge.targetId)
          }])).values()];
          const aspects = kind === 'Aspect' ? [] : await call('get_applicable_aspects',{entityId:id});
          const storyTests=kind==='UserStory'?await call('get_story_test_status',{storyId:id}):undefined;
          return json({storyTests,entity:{...entity,kind},basis:[{id,entityType:canonical.typeName(),version:canonical.version}],relations,aspects});
        }
        if (req.method === 'POST' && ['/api/prepare-story-test','/api/apply-story-test'].includes(url.pathname)) {
          const name=url.pathname==='/api/prepare-story-test'?'prepare_story_test':'apply_story_test';
          return json(await call(name,await req.json()));
        }
        if (req.method === 'POST' && url.pathname === '/api/derive') {
          const input = z.object({kind:z.enum(['Feature','UserStory','Epic']),id:z.string().min(1),originalRequest:z.string().optional(),proposal:IntentProposalSchema.optional()}).strict().parse(await req.json());
          const key = input.kind === 'Feature' ? 'featureId' : input.kind === 'UserStory' ? 'storyId' : 'epicId';
          return json(await call('process_' + (input.kind === 'UserStory' ? 'story' : input.kind.toLowerCase()),{
            [key]:input.id,originalRequest:input.originalRequest,proposal:input.proposal,
            ...(input.proposal ? {critic:'none'} : {}),depth:1
          }));
        }
        if (req.method === 'POST' && url.pathname === '/api/preview') {
          const request = requestSchema.parse(await req.json());
          return json(await call('preview_change',request));
        }
        if (req.method === 'POST' && url.pathname === '/api/apply') {
          const input = applySchema.parse(await req.json());
          return json(await call('apply_change',input));
        }
        return json({error:'Not found'},404);
      } catch (error) {
        return json({error:error instanceof Error ? error.message : String(error)},400);
      }
    }
  });
  return {server,url:'http://127.0.0.1:' + server.port + '/#' + token};
}
