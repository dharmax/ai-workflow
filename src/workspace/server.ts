/**
 * Responsibility: Local Workspace HTTP presentation and canonical S1 REST adapter.
 * Scope: Loopback authenticated host; domain reads/review/persistence retain their owners.
 */
import { z } from 'zod';
import { commandRegistry, initializeTools } from '../tools/index.ts';
import type { ToolContext } from '../tools/registry.ts';
import { ProductMutationSchema, ProductRevisionSchema } from '../product/mutation.ts';
import { workspacePage } from '../ui/workspace/page.ts';
import { IntentProposalSchema } from '../product/process-types.ts';
import { Product, ModuleNode } from '../model/ontology.ts';
import { ensureAstFresh } from '../graph/indexer.ts';
import {reviewProductChange} from '../product/links.ts';
import {publicApi,publicApiError,compilePublicRoutes} from './public-api.ts';

const reads = {
  Feature: ['list_features', 'get_feature', 'featureId'],
  UserStory: ['list_user_stories', 'get_user_story', 'storyId'],
  Aspect: ['list_aspects', 'get_aspect', 'id'],
  Goal: ['list_goals', 'get_goal', 'id'],
  Concept: ['list_concepts', 'get_concept', 'id'],
  Flow: ['list_flows', 'get_flow', 'id'],
  Decision: ['list_decisions', 'get_decision', 'id'],
  Epic: ['list_epics', 'get_epic', 'epicId'],
  Ticket: ['list_tickets', 'get_ticket', 'ticketId'],
  Product: [Product.dcr],
  Module: [ModuleNode.dcr]
} as const;
const querySchema = z.object({kind:z.enum(Object.keys(reads) as [keyof typeof reads, ...(keyof typeof reads)[]]), id:z.string().min(1)});
const requestSchema = z.object({action:z.literal('product_change'), mutations:z.array(ProductMutationSchema).min(1), basis:z.array(ProductRevisionSchema).optional(), originalRequest:z.string().optional()}).strict();
const applySchema = z.object({request:requestSchema, fingerprint:z.string().min(1), decision:z.enum(['accept','reject','cancel']),developerAnswers:z.record(z.string(),z.string()).optional()}).strict();

/** Caller owns the store; stop the returned server before closing it. Bind only loopback. */
export function startWorkspace(ctx: ToolContext, port = 0, confirm?: (preview:unknown)=>Promise<boolean>, respond?: Parameters<typeof reviewProductChange>[2]) {
  initializeTools();
  let routes=compilePublicRoutes(!!confirm),revision=commandRegistry.commandRevision;
  const token = crypto.randomUUID(), nonce = crypto.randomUUID();
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
      const readContext={...ctx,executionAuthority:'read-only' as const,signal:req.signal};
      const call=(name:string,params:unknown)=>commandRegistry.execute(name,params,req.method==='GET'?readContext:{...ctx,signal:req.signal});
      try {
        if(url.pathname.startsWith('/api/v1/')){
          if(revision!==commandRegistry.commandRevision){routes=compilePublicRoutes(!!confirm);revision=commandRegistry.commandRevision;}
          const result=await publicApi(req,req.method==='GET'?readContext:{...ctx,signal:req.signal},routes,confirm?{confirm,respond}:undefined);return json(result.body,result.status??200);}
        if (req.method === 'GET' && url.pathname === '/api/catalog') {
          const groups = await Promise.all(Object.entries(reads).map(async ([kind,[list]]) => {
            if (kind === 'Module') await ctx.store.withExecutionContext('read-only',req.signal,()=>ensureAstFresh(ctx.store));
            const rows: Array<Record<string,unknown>> = typeof list === 'string' ? await call(list,{}) as Array<Record<string,unknown>>
              : await Promise.all((await ctx.store.listEntities(list)).map(async entity=>({...await entity.fullDto<Record<string,unknown>>(),id:ctx.store.localId(entity.id),version:entity.version})));
            return rows.map(row=>({...row,...(kind==='Ticket'?{ticketKind:row.kind??'task'}:{}),kind}));
          }));
          return json({entities:groups.flat(),projectRoot:ctx.projectRoot,linkTypes:(await call('link',{action:'allowed'})).relations});
        }
        if(req.method==='GET'&&url.pathname==='/api/links') {
          const input=z.object({id:z.string().min(1),cursor:z.string()}).strict().parse(Object.fromEntries(url.searchParams));
          return json(await call('link',{action:'inspect',...input,limit:100}));
        }
        if (req.method === 'GET' && url.pathname === '/api/entity') {
          const {kind,id} = querySchema.parse(Object.fromEntries(url.searchParams));
          if (kind === 'Module') await ctx.store.withExecutionContext('read-only',req.signal,()=>ensureAstFresh(ctx.store));
          const reader = reads[kind];
          const canonical = await ctx.store.getEntity(id);
          if (canonical && canonical.typeName() !== (kind === 'Module' ? 'ModuleNode' : kind)) return json({error:'Entity kind mismatch'},400);
          const entity = kind === 'Module' ? await call('get_module',{moduleId:id}) as Record<string,unknown> : typeof reader[0] === 'string'
            ? await call(reader[1]!,{[reader[2]!]:id}) as Record<string,unknown>
            : canonical ? {...await canonical.fullDto<Record<string,unknown>>(),id:ctx.store.localId(canonical.id),version:canonical.version} : {};
          if (!canonical) return json({error:'Entity not found'},404);
          if (entity.version !== undefined && entity.version !== canonical.version)
            return json({error:'Entity changed while loading. Reload canonical data.'},409);
          const inspected=await call('link',{action:'inspect',id,limit:100});
          if(inspected.version!==canonical.version) return json({error:'Entity changed while loading. Reload canonical data.'},409);
          const relations=inspected.links;
          const aspects = kind === 'Aspect' || kind === 'Decision' ? [] : await call('get_applicable_aspects',{entityId:id});
          const storyTests=kind==='UserStory'?await call('get_story_test_status',{storyId:id}):undefined;
          return json({storyTests,relationCursor:inspected.cursor,entity:{...entity,version:canonical.version,...(kind==='Ticket'?{ticketKind:entity.kind??'task'}:{}),kind},basis:[{id,entityType:canonical.typeName(),version:canonical.version,relationsHash:inspected.relationsHash}],relations,aspects});
        }
        if (req.method === 'POST' && url.pathname === '/api/run-story-test')
          return json(await call('run_story_test',z.object({storyId:z.string().min(1)}).parse(await req.json())));
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
          if(input.decision==='accept'){
            if(!confirm)return json({status:'review_required',error:'Trusted host human review is unavailable; client decision/token cannot approve Product changes.'},403);
            const preview=await call('preview_change',input.request);
            if(preview.fingerprint!==input.fingerprint)return json({status:'stale',error:'Stale preview; reload and review.'},409);
            if(!await confirm(preview))return json({status:'cancelled'},200);
          }
          return json(await reviewProductChange({request:input.request,fingerprint:input.fingerprint,decision:input.decision},{...ctx,signal:req.signal},
            respond));
        }
        return json({error:'Not found'},404);
      } catch (error) {
        const failure=publicApiError(error);return json(failure.body,failure.status);
      }
    }
  });
  return {server,url:'http://127.0.0.1:' + server.port + '/#' + token};
}
