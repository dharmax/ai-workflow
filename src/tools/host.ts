/**
 * Responsibility: Register existing safe project/configuration/model owners.
 * Scope: Transport adapters and authority checks; no new configuration or indexing system.
 */
import {z} from 'zod';import {commandRegistry as r} from './registry.ts';
import {CONFIG_SETTINGS,inspectConfig} from '../services/config-service.ts';
import {ensureAstFresh} from '../graph/indexer.ts';
import {exportProductManifest,exportAuthoredState} from '../product/manifest.ts';
export function registerHostTools(){
 r.register({name:'inspect_config',category:'planning',description:'Inspect non-secret effective configuration and provenance; credentials are excluded.',parameters:z.object({key:z.enum(Object.keys(CONFIG_SETTINGS) as [keyof typeof CONFIG_SETTINGS,...Array<keyof typeof CONFIG_SETTINGS>]).optional()}).strict(),execute:({key},ctx)=>inspectConfig(ctx.projectRoot,key)});
 r.register({name:'inspect_models',category:'planning',description:'Inspect configured model routes and providers without probing reachability or performing inference.',parameters:z.object({}).strict(),execute:async(_,ctx)=>{
  const {runModelCommand}=await import('../model-command.ts');const {WorkflowActor}=await import('../helpers/actor/engine.ts');return runModelCommand(ctx.projectRoot,ctx.actor??new WorkflowActor({store:ctx.store,projectRoot:ctx.projectRoot}),['list']);
 }});
 r.register({name:'project_status',category:'planning',description:'Read project root, Git status, active leases and bounded Ticket inventory.',parameters:z.object({}).strict(),execute:async(_,ctx)=>({projectRoot:ctx.projectRoot,git:await r.execute('get_git_status',{},ctx),claims:await ctx.store.getActiveClaims(),tickets:await r.execute('list_tickets',{limit:25},ctx)})});
 r.register({name:'project_doctor',category:'planning',description:'Run the existing project/runtime diagnostics; report provider reachability separately from inference.',parameters:z.object({}).strict(),execute:async(_,ctx)=>{const {runDiagnostics}=await import('../services/diagnostics-service.ts');return runDiagnostics(ctx.store,ctx.projectRoot);}});
 r.register({name:'export_project',category:'planning',description:'Export canonical Product manifest and authored snapshot through their existing owners; never copy a live database.',parameters:z.object({}).strict(),execute:async(_,ctx)=>{ctx.store.assertCanWrite();return {manifest:await exportProductManifest(ctx.store,ctx.projectRoot),snapshot:await exportAuthoredState(ctx.store,ctx.projectRoot)};}});
 r.register({name:'refresh_graph_index',category:'graph',description:'Explicitly refresh the source-derived index; requires host project-write authority.',parameters:z.object({}).strict(),execute:async(_,ctx)=>{ctx.store.assertCanWrite();return ensureAstFresh(ctx.store,ctx.projectRoot);}});
}
