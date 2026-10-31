/**
 * Responsibility: Typed Link discovery, canonical relationship reads and governed review presentation.
 * Scope: Existing Product relation policy and S2 preview/apply; no independent writer authority.
 */
import {z} from 'zod';
import type {WorkflowStore} from '../graph/store.ts';
import {CharterWarningContextSchema,PRODUCT_RELATIONS,LinkPayloadSchema,normalizeLinkPayload,productKind,resolveProductEntity,productEdgeRows,productRelation} from './mutation.ts';
import {computeHash} from '../kb/canonical.ts';
import {CausalChangeEngine} from '../change/engine.ts';
import type {ChangeRequest} from '../change/types.ts';
import type {ToolContext} from '../tools/registry.ts';
import {semanticPredicates} from '../model/predicates.ts';
import {entityDescriptors} from '../model/ontology.ts';
import {commandRegistry} from '../tools/registry.ts';

const kinds=z.enum([...new Set(PRODUCT_RELATIONS.flatMap(row=>[row.sourceKind,row.targetKind]))]);
const readPredicates=z.enum(Object.keys(semanticPredicates) as [string,...string[]]);
const predicates=z.enum([...new Set(PRODUCT_RELATIONS.map(row=>row.predicate))]);
const id=z.string().min(1).regex(/\S/,'ID must not be blank');
const idMatch=z.enum(['exact','human']).optional();
export const LinkActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('allowed'),sourceKind:kinds.optional(),targetKind:kinds.optional()}).strict(),
 z.object({action:z.literal('inspect'),id,idMatch,direction:z.enum(['incoming','outgoing','both']).optional(),predicate:readPredicates.optional(),targetId:id.optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().optional()}).strict(),
 z.object({action:z.literal('preview_add'),sourceId:id,targetId:id,predicate:predicates,payload:LinkPayloadSchema.optional(),idMatch}).strict(),
 z.object({action:z.literal('preview_remove'),sourceId:id,targetId:id,predicate:predicates,idMatch}).strict()
]);
export type LinkAction=z.infer<typeof LinkActionSchema>;

export async function endpoint(store:WorkflowStore,id:string,match:'exact'|'human'='exact') {
 try {return await resolveProductEntity(store,id);} catch(error) {
  if(match==='exact' || !String(error).includes('not found')) throw error;
 }
 const candidates=[];
 for(const descriptor of entityDescriptors) {
  // Source/test identities deliberately require exact spelling.
  if(['FileNode','SymbolNode','TestNode'].includes(descriptor.name)) continue;
  for(const entity of await store.listEntities(descriptor)) if(productKind(entity) && store.localId(entity.id).toLowerCase()===id.toLowerCase()) candidates.push(entity);
 }
 if(candidates.length!==1) throw Error(candidates.length?`Ambiguous ID '${id}': ${candidates.slice(0,10).map(e=>e.id).join(', ')}`:`Entity '${id}' not found.`);
 return candidates[0]!;
}

export async function linkAction(store:WorkflowStore,input:LinkAction) {
 const args=LinkActionSchema.parse(input);
 if(args.action==='allowed') return {status:'read',relations:PRODUCT_RELATIONS.filter(row=>(!args.sourceKind||row.sourceKind===args.sourceKind)&&(!args.targetKind||row.targetKind===args.targetKind)),payload:{note:'Optional uninterpreted rationale, at most 4000 characters; empty clears'}};
 if(args.action==='inspect') {
  const entity=await endpoint(store,args.id,args.idMatch);
  const direction=args.direction??'both',limit=args.limit??25;
  const allRows=await productEdgeRows(store,entity.id);
  const rows=allRows.filter(row=>(direction==='both'||(direction==='outgoing'?row.sourceId===entity.id:row.targetId===entity.id))&&(!args.predicate||row.predicateName===args.predicate)&&(!args.targetId||store.localId(row.targetId)===store.localId(args.targetId)));
  const basis=computeHash({id:entity.id,version:entity.version,direction,predicate:args.predicate??null,targetId:args.targetId??null,rows});
  let offset=0;
  if(args.cursor) {
   try {const cursor=JSON.parse(Buffer.from(args.cursor,'base64url').toString());if(cursor.basis!==basis||!Number.isInteger(cursor.offset)||cursor.offset<0||cursor.offset>=rows.length) throw Error();offset=cursor.offset;} catch {throw Error('Invalid or stale links cursor; restart inspection.');}
  }
  const links=[];
  for(const row of rows.slice(offset,offset+limit)) {
   const source=await store.getEntity(row.sourceId),target=await store.getEntity(row.targetId);
   const sourceKind=productKind(source),targetKind=productKind(target);
   links.push({id:row._id,version:row._version,sourceId:store.localId(row.sourceId),targetId:store.localId(row.targetId),sourceKind:sourceKind??row.sourceType,targetKind:targetKind??row.targetType,
    sourceStatus:source&&'status' in source?source.status:undefined,targetStatus:target&&'status' in target?target.status:undefined,predicate:row.predicateName,direction:row.sourceId===entity.id?'outgoing':'incoming',
    note:row.payload?.note});
  }
  return {status:'read',id:store.localId(entity.id),version:entity.version,freshness:{basis:'canonical-relations',sourceIndex:'not-assessed'},relationsHash:computeHash(allRows),links,cursor:offset+limit<rows.length?Buffer.from(JSON.stringify({basis,offset:offset+limit})).toString('base64url'):null};
 }
 const source=await endpoint(store,args.sourceId,args.idMatch),target=await endpoint(store,args.targetId,args.idMatch);
 const request:Extract<ChangeRequest,{action:'product_change'}>={action:'product_change',mutations:[{
  kind:args.action==='preview_add'?'product_link':'product_unlink',sourceId:store.localId(source.id),targetId:store.localId(target.id),predicate:args.predicate,
  ...(args.action==='preview_add'&&args.payload!==undefined?{payload:normalizeLinkPayload(args.payload)}:{})
 }],basis:[source,target].map(e=>({id:store.localId(e.id),entityType:e.typeName(),version:e.version}))};
 const engine=new CausalChangeEngine({store,projectRoot:store.root});
 const preview=await engine.previewChange(request);
 const old=(await productEdgeRows(store,source.id)).filter(row=>row.sourceId===source.id&&row.targetId===target.id&&row.predicateName===args.predicate);
 const mutation=request.mutations[0]!;
 const desired=args.action==='preview_remove'?null:args.payload===undefined?old[0]?.payload?.note:normalizeLinkPayload(args.payload).note;
 const unchanged=args.action==='preview_remove'?old.length===0:old.length===1&&(args.payload===undefined||desired===old[0]?.payload?.note)||old.length===0&&args.payload!==undefined&&!desired;
 return {...preview,status:preview.blocked?'blocked':'preview',unchanged,relationDiff:{sourceId:store.localId(source.id),targetId:store.localId(target.id),predicate:args.predicate,
  before:old.map(row=>({id:row._id,version:row._version,note:row.payload?.note})),after:args.action==='preview_remove'?null:{note:desired},operation:mutation.kind}};
}

/** Only local deterministic CLI/shell calls enter this review function; never an Actor tool. */
export async function reviewLink(args:LinkAction,ctx:ToolContext,yes:boolean,confirm?: (preview:unknown)=>Promise<boolean>,present?: (preview:unknown)=>void) {
 const preview=await commandRegistry.execute('link',args,ctx);
 if(args.action==='allowed'||args.action==='inspect') return preview;
 if(preview.blocked) throw Error(preview.blockReason??'Link preview blocked.');
 present?.(preview);
 if(!yes&&!confirm) return preview;
 if(!yes&&!await confirm!(preview)) return {status:'cancelled',preview};
 const applied=await ctx.store.withExecutionContext(ctx.executionAuthority ?? 'read-only',ctx.signal,()=>commandRegistry.execute('apply_change',{request:preview.request,fingerprint:preview.fingerprint,decision:'accept'},ctx),preview.fingerprint);
 if(!applied.ok) throw Error(applied.error??'Link application failed.');
 if(applied.verification&&!applied.verification.passed) {
  return {
   status:'committed-verification-failed',
   preview,
   result:applied,
   warning:`Change was committed to canonical store, but subsequent verification failed: ${applied.verification.errors.join('; ')}. Do not retry blind application (the entity is already modified). Inspect entity or run aiwf sync.`
  };
 }
  return {status:preview.unchanged?'unchanged':'applied',preview,result:applied};
}

export interface DefinitionReviewInput {
  kind: 'Product' | 'Goal' | 'Concept' | 'Flow' | 'Feature' | 'UserStory' | 'Aspect' | 'Decision' | 'Module' | 'Ticket' | 'Epic';
  id: string;
  create: boolean;
  fields: Record<string, unknown>;
}

export async function previewDefinitionChange(ctx: ToolContext, input: DefinitionReviewInput) {
  const basis: Array<{ id: string; entityType: string; version: number }> = [];
  if (!input.create) {
    const existing = await resolveProductEntity(ctx.store, input.id);
    basis.push({ id: ctx.store.localId(existing.id), entityType: existing.typeName(), version: existing.version });
  }

  const request: Extract<ChangeRequest, { action: 'product_change' }> = {
    action: 'product_change',
    mutations: [
      input.create
        ? { kind: 'product_create', entityType: input.kind as any, id: input.id, fields: input.fields }
        : { kind: 'product_update', entityType: input.kind as any, id: input.id, fields: input.fields }
    ],
    ...(basis.length ? { basis } : {})
  };

  const engine = new CausalChangeEngine({ store: ctx.store, projectRoot: ctx.projectRoot });
  const preview = await engine.previewChange(request);
  return {
    ...preview,
    status: preview.status ?? (preview.blocked ? 'blocked' : 'preview'),
    definitionDiff: {
      kind: input.kind,
      id: input.id,
      operation: input.create ? 'create' : 'update',
      fields: input.fields
    }
  };
}

/** Existing local review, with a separate question/response step for charter Decisions.
 * The callback is host UI code, never an Actor/tool argument. */
export async function reviewProductChange(
  input: {request: import('../change/types.ts').ChangeRequest; fingerprint:string; decision:'accept'|'reject'|'cancel'},
  ctx: ToolContext,
  respond?: (question:string, decisionId:string) => Promise<string | undefined>
) {
  const answers: Record<string,string> = {};
  if (input.decision === 'accept' && respond && input.request.action === 'product_change') {
    for (const mutation of input.request.mutations) {
      if ((mutation.kind !== 'product_create' && mutation.kind !== 'product_update') || mutation.entityType !== 'Decision') continue;
      let context: unknown;
      try { context = JSON.parse(String(mutation.fields.context)); } catch { continue; }
      const basis=CharterWarningContextSchema.safeParse(context);
      if (!basis.success) continue;
      // Obtain the grounded question from the public owner, rather than trusting
      // an agent's account of what warning was raised. Changed/uncertain review fails closed.
      const raised=await commandRegistry.execute('preview_change',basis.data.proposal,ctx);
      if (raised.status!=='needs_input' || raised.fingerprint!==basis.data.reviewFingerprint || !raised.warnings.includes(basis.data.warning)) continue;
      const answer = await respond(`Charter warning: ${basis.data.warning}\nEnter your actual response to this question. Approval of proposed text is separate; if your answer differs, revise the Decision before applying.\nDeveloper response: `,mutation.id);
      if (answer !== undefined) answers[mutation.id] = answer;
    }
  }
  return ctx.store.withExecutionContext(ctx.executionAuthority ?? 'read-only',ctx.signal,
    () => commandRegistry.execute('apply_change',input,ctx), input.decision === 'accept' ? input.fingerprint : undefined,answers);
}

export async function reviewDefinition(
  input: DefinitionReviewInput,
  ctx: ToolContext,
  yes: boolean,
  confirm?: (preview: unknown) => Promise<boolean>,
  present?: (preview: unknown) => void
) {
  const preview = await previewDefinitionChange(ctx, input);
  if (preview.status === 'needs_input') return preview;
  if (preview.blocked) throw new Error(preview.blockReason ?? 'Definition preview blocked.');
  present?.(preview);
  if (!yes && !confirm) return preview;
  if (!yes && !(await confirm!(preview))) return { status: 'cancelled', preview };
  const applied = await ctx.store.withExecutionContext(ctx.executionAuthority ?? 'read-only', ctx.signal, () => commandRegistry.execute(
    'apply_change',
    { request: preview.request, fingerprint: preview.fingerprint, decision: 'accept' },
    ctx
  ), preview.fingerprint);
  if (applied.status === 'needs_input') return {...(applied.preview ?? preview), status: 'needs_input' as const, result: applied};
  if (!applied.ok) throw new Error(applied.error ?? 'Definition application failed.');
  if (applied.verification && !applied.verification.passed) {
    return {
      status: 'committed-verification-failed',
      preview,
      result: applied,
      warning: `Change was committed to canonical store, but subsequent verification failed: ${applied.verification.errors.join('; ')}.`
    };
  }
  return { status: 'applied', preview, result: applied };
}

/** Canonical S1 discovery over the existing finite relation policy. */
export const GraphPredicateActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list')}).strict(),
 z.object({action:z.literal('check'),sourceKind:kinds,predicate:readPredicates,targetKind:kinds}).strict()
]);
export async function graphPredicateAction(store:WorkflowStore,input:z.infer<typeof GraphPredicateActionSchema>){
 const args=GraphPredicateActionSchema.parse(input);
 if(args.action==='list')return {...await linkAction(store,{action:'allowed'}),predicates:Object.keys(semanticPredicates).map(name=>({name,relations:PRODUCT_RELATIONS.filter(row=>row.predicate===name)}))};
 const descriptor=productRelation(args.sourceKind,args.predicate,args.targetKind);
 return {status:'read',sourceKind:args.sourceKind,predicate:args.predicate,targetKind:args.targetKind,allowed:descriptor?true:PRODUCT_RELATIONS.some(row=>row.predicate===args.predicate)?false:null,descriptor:descriptor??null,...(!descriptor&&!PRODUCT_RELATIONS.some(row=>row.predicate===args.predicate)?{reason:'Endpoint policy belongs to the graph runtime/index owner; no Product authorability is granted.'}:{})};
}
export const GraphLinkActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list'),sourceId:id,predicate:readPredicates.optional(),targetId:id.optional(),direction:z.enum(['incoming','outgoing','both']).optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().optional()}).strict(),
 z.object({action:z.literal('show'),sourceId:id,predicate:readPredicates,targetId:id}).strict()
]);
export async function graphLinkAction(store:WorkflowStore,input:z.infer<typeof GraphLinkActionSchema>){
 const args=GraphLinkActionSchema.parse(input);
 if(args.targetId)await endpoint(store,args.targetId);
 const {action,sourceId,...options}=args;
 const result=await linkAction(store,{action:'inspect',id:sourceId,...options,direction:action==='show'?'outgoing':args.action==='list'?args.direction:undefined});
 if(action==='show'&&'links' in result&&!result.links?.length)throw Error('Graph link not found: '+sourceId+' '+args.predicate+' '+args.targetId);
 return result;
}

/** Trusted host review of a registered Product apply; transport input grants no consent. */
export async function reviewPublicProductChange(input:Parameters<typeof reviewProductChange>[0]&{ticketId?:string;agentId?:string;allowDirtyTargets?:string[]},ctx:ToolContext,confirm?: (preview:unknown)=>Promise<boolean>,respond?:Parameters<typeof reviewProductChange>[2]){
 if(input.request.action!=='product_change'){
  if(input.decision==='reject'||input.decision==='cancel')return {status:'cancelled'};
  if(!input.allowDirtyTargets?.length)return commandRegistry.execute('apply_change',input,ctx);
  if(!confirm)return {status:'needs_input',error:'Dirty targets require trusted host review; client paths cannot authorize edits.'};
  const preview=await commandRegistry.execute('preview_change',{...input.request,ticketId:input.ticketId,agentId:input.agentId,allowDirtyTargets:input.allowDirtyTargets},ctx);
  if(preview.blocked)throw Error(preview.blockReason??'Source preview blocked.');
  if(preview.fingerprint!==input.fingerprint)throw Error('Stale preview; reload and review.');
  if(!await confirm(preview))return {status:'cancelled'};
  return ctx.store.withExecutionContext(ctx.executionAuthority??'read-only',ctx.signal,()=>commandRegistry.execute('apply_change',input,ctx),input.fingerprint);
 }
 if(input.decision!=='accept')return reviewProductChange(input,ctx);
 if(!confirm)return {status:'needs_input',error:'Trusted host review is required; client JSON cannot approve Product meaning.'};
 const preview=await commandRegistry.execute('preview_change',input.request,ctx);
 if(preview.fingerprint!==input.fingerprint)throw Error('Stale preview; reload and review.');
 if(!await confirm(preview))return {status:'cancelled'};
 return reviewProductChange(input,ctx,respond);
}
