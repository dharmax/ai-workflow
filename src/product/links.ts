/** Governed link presentation over the existing Product/S2 owner. */
import {z} from 'zod';
import type {WorkflowStore} from '../graph/store.ts';
import {CharterWarningContextSchema,PRODUCT_RELATIONS,LinkPayloadSchema,normalizeLinkPayload,productKind,resolveProductEntity,productEdgeRows,productRelation} from './mutation.ts';
import {computeHash} from '../kb/canonical.ts';
import {CausalChangeEngine} from '../change/engine.ts';
import type {ChangeRequest} from '../change/types.ts';
import type {ToolContext} from '../tools/registry.ts';
import {entityDescriptors} from '../model/ontology.ts';
import {registry} from '../tools/registry.ts';

const kinds=z.enum([...new Set(PRODUCT_RELATIONS.flatMap(row=>[row.sourceKind,row.targetKind]))]);
const predicates=z.enum([...new Set(PRODUCT_RELATIONS.map(row=>row.predicate))]);
const id=z.string().min(1).regex(/\S/,'ID must not be blank');
const idMatch=z.enum(['exact','human']).optional();
export const LinkActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('allowed'),sourceKind:kinds.optional(),targetKind:kinds.optional()}).strict(),
 z.object({action:z.literal('inspect'),id,idMatch,direction:z.enum(['incoming','outgoing','both']).optional(),predicate:predicates.optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().optional()}).strict(),
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
 if(args.action==='allowed') return {status:'read',relations:PRODUCT_RELATIONS.filter(row=>(!args.sourceKind||row.sourceKind===args.sourceKind)&&(!args.targetKind||row.targetKind===args.targetKind)),payload:{note:'Optional uninterpreted rationale, at most 4000 characters; empty clears'},modes:{H:'Reviewed human add/remove/note',O:'Owner-managed; specialist operation only',L:'Legacy; remove only'}};
 if(args.action==='inspect') {
  const entity=await endpoint(store,args.id,args.idMatch);
  const direction=args.direction??'both',limit=args.limit??25;
  const allRows=await productEdgeRows(store,entity.id);
  const rows=allRows.filter(row=>(direction==='both'||(direction==='outgoing'?row.sourceId===entity.id:row.targetId===entity.id))&&(!args.predicate||row.predicateName===args.predicate));
  const basis=computeHash({id:entity.id,version:entity.version,direction,predicate:args.predicate??null,rows});
  let offset=0;
  if(args.cursor) {
   try {const cursor=JSON.parse(Buffer.from(args.cursor,'base64url').toString());if(cursor.basis!==basis||!Number.isInteger(cursor.offset)||cursor.offset<0||cursor.offset>=rows.length) throw Error();offset=cursor.offset;} catch {throw Error('Invalid or stale links cursor; restart inspection.');}
  }
  const links=[];
  for(const row of rows.slice(offset,offset+limit)) {
   const source=await store.getEntity(row.sourceId),target=await store.getEntity(row.targetId);
   const sourceKind=productKind(source),targetKind=productKind(target);
   const relation=productRelation(sourceKind??row.sourceType,row.predicateName,targetKind??row.targetType);
   const protectedEndpoint=[source,target].some(e=>e?.typeName()==='Artifact'&&/^(VERIFY-|GOVERNANCE-ADMISSION$)/.test(store.localId(e.id)));
   links.push({id:row._id,version:row._version,sourceId:store.localId(row.sourceId),targetId:store.localId(row.targetId),sourceKind:sourceKind??row.sourceType,targetKind:targetKind??row.targetType,
    sourceStatus:source&&'status' in source?source.status:undefined,targetStatus:target&&'status' in target?target.status:undefined,predicate:row.predicateName,direction:row.sourceId===entity.id?'outgoing':'incoming',
    note:row.payload?.note,mode:protectedEndpoint?'O':relation?.mode??'O',owner:protectedEndpoint?'Protected evidence owner':relation?.owner??'Indexed/runtime or unsupported historical relation; manual mutation forbidden'});
  }
  return {status:'read',id:store.localId(entity.id),version:entity.version,relationsHash:computeHash(allRows),links,cursor:offset+limit<rows.length?Buffer.from(JSON.stringify({basis,offset:offset+limit})).toString('base64url'):null};
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
 const preview=await registry.execute('link',args,ctx);
 if(args.action==='allowed'||args.action==='inspect') return preview;
 if(preview.blocked) throw Error(preview.blockReason??'Link preview blocked.');
 present?.(preview);
 if(!yes&&!confirm) return preview;
 if(!yes&&!await confirm!(preview)) return {status:'cancelled',preview};
 const applied=await ctx.store.withExecutionContext(ctx.executionAuthority ?? 'read-only',ctx.signal,()=>registry.execute('apply_change',{request:preview.request,fingerprint:preview.fingerprint,decision:'accept'},ctx),preview.fingerprint);
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
      const raised=await registry.execute('preview_change',basis.data.proposal,ctx);
      if (raised.status!=='needs_input' || raised.fingerprint!==basis.data.reviewFingerprint || !raised.warnings.includes(basis.data.warning)) continue;
      const answer = await respond(`Charter warning: ${basis.data.warning}\nEnter your actual response to this question. Approval of proposed text is separate; if your answer differs, revise the Decision before applying.\nDeveloper response: `,mutation.id);
      if (answer !== undefined) answers[mutation.id] = answer;
    }
  }
  return ctx.store.withExecutionContext(ctx.executionAuthority ?? 'read-only',ctx.signal,
    () => registry.execute('apply_change',input,ctx), input.decision === 'accept' ? input.fingerprint : undefined,answers);
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
  const applied = await ctx.store.withExecutionContext(ctx.executionAuthority ?? 'read-only', ctx.signal, () => registry.execute(
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
