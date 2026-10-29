/**
 * Responsibility: Deterministic product intent tools for Epics, Features, User Stories, and causal graph relations.
 * Scope: CRUD/query for product entities, constrained canonical linking/unlinking, and coverage/impact wrappers.
 */

import {PrioritySchema} from '../model/types.ts';
import { z } from 'zod';
import {TestBindingSpecificationSchema} from '../model/test-proof-types.ts';
import {prepareTestBinding,applyTestBinding} from '../graph/technical-proof.ts';
import fs from 'node:fs';
import path from 'node:path';
import { IntentProposalSchema } from '../product/process-types.ts';
import {StoryTestSpecificationSchema,prepareStoryTest,applyStoryTest,storyTestStatus,runStoryTest} from '../product/story-tests.ts';
import {applyOwnedChange} from './change.ts';
import { registry, type ToolContext } from './registry.ts';
import {
  Product,
  ModuleNode,
  FileNode,
  Decision,
  Goal,
  Concept,
  Flow,
  Epic,
  Feature,
  UserStory
} from '../model/ontology.ts';
import { getCoverage } from '../product/coverage.ts';
import { getProductImpact } from '../product/impact.ts';
import { proposeEpicStructure, type EpicStructureProposal } from '../product/decompose.ts';
import { applyEpicStructure } from '../product/apply.ts';
import {LinkActionSchema,linkAction,endpoint,previewDefinitionChange,type DefinitionReviewInput} from '../product/links.ts';
import {computeHash} from '../kb/canonical.ts';
import {entityDescriptors} from '../model/ontology.ts';
import { applyProductMutations, resolveProductEntity, productKind, productDefinitionFields, productDependents } from '../product/mutation.ts';
import { ArtifactTransportOptionsSchema } from '../artifact-policy.ts';
import { ensureAstFresh } from '../graph/indexer.ts';

const EPIC_STATUSES = ['draft', 'planned', 'active', 'completed', 'cancelled'] as const;
const INTENT_STATUSES = ['draft', 'proposed', 'accepted', 'deprecated'] as const;

async function requireEntity(ctx: ToolContext, id: string, dcr?: any, kind?: string): Promise<any> {
  const entity = await ctx.store.getEntity(id, dcr);
  if (!entity) {
    throw new Error(`${kind || 'Entity'} '${id}' not found.`);
  }
  return entity;
}

async function topLevelIntentView(ctx: ToolContext, entity: Goal | Concept | Flow) {
  const [incoming, outgoing] = await Promise.all([
    ctx.store.getIncoming(entity.id),
    ctx.store.getOutgoing(entity.id)
  ]);
  const relation = (edge: any) => ({
    sourceId: ctx.store.localId(edge.sourceId),
    predicate: edge.predicateName,
    targetId: ctx.store.localId(edge.targetId)
  });
  return {
    id: ctx.store.localId(entity.id),
    kind: entity.typeName(),
    title: entity.title,
    body: (entity as any).body || undefined,
    status: (entity as any).status || 'draft',
    ...((entity instanceof Flow) ? {
      actor: (entity as any).actor || undefined,
      context: (entity as any).context || undefined
    } : {}),
    incoming: incoming.map(relation),
    outgoing: outgoing.map(relation)
  };
}

async function epicView(ctx: ToolContext, epic: Epic) {
  const localId = ctx.store.localId(epic.id);
  const [targetPreds, ticketPreds] = await Promise.all([
    ctx.store.getOutgoing(epic.id, 'targets'),
    ctx.store.getOutgoing(epic.id, 'contains')
  ]);

  const targetedGoals: string[] = [];
  const targetedConcepts: string[] = [];
  const targetedFlows: string[] = [];
  const targetedFeatures: string[] = [];
  const targetedStories: string[] = [];
  for (const pred of targetPreds) {
    const target = await ctx.store.getEntity(pred.targetId);
    if (target instanceof Goal) targetedGoals.push(ctx.store.localId(target.id));
    else if (target instanceof Concept) targetedConcepts.push(ctx.store.localId(target.id));
    else if (target instanceof Flow) targetedFlows.push(ctx.store.localId(target.id));
    else if (target instanceof Feature) targetedFeatures.push(ctx.store.localId(target.id));
    else if (target instanceof UserStory) targetedStories.push(ctx.store.localId(target.id));
  }

  const containedTickets = ticketPreds.map(p => ctx.store.localId(p.targetId)).sort();

  return {
    id: localId,
    title: (epic as any).title,
    status: (epic as any).status || 'draft',
    body: (epic as any).body || undefined,
    priority: epic.priority,
    targetedGoals: targetedGoals.sort(),
    targetedConcepts: targetedConcepts.sort(),
    targetedFlows: targetedFlows.sort(),
    targetedFeatures: targetedFeatures.sort(),
    targetedStories: targetedStories.sort(),
    containedTickets
  };
}

async function featureView(ctx: ToolContext, feature: Feature) {
  const localId = ctx.store.localId(feature.id);
  const [epicPreds, enabledPreds, legacyStoryPreds, ticketPreds, testPreds, governingPreds] = await Promise.all([
    ctx.store.getIncoming(feature.id, 'targets'),
    ctx.store.getOutgoing(feature.id, 'enables'),
    ctx.store.getOutgoing(feature.id, 'contains'),
    ctx.store.getIncoming(feature.id, 'implements'),
    ctx.store.getIncoming(feature.id, 'verifies'),
    ctx.store.getIncoming(feature.id, 'governs')
  ]);
  const enabledStories = [...new Set([...enabledPreds, ...legacyStoryPreds].map(p => ctx.store.localId(p.targetId)))].sort();
  const governingConcepts: string[] = [];
  const governingDecisions: string[] = [];
  for (const pred of governingPreds) {
    const source = await ctx.store.getEntity(pred.sourceId);
    if (source instanceof Concept) governingConcepts.push(ctx.store.localId(source.id));
    else governingDecisions.push(ctx.store.localId(pred.sourceId));
  }

  let parentProduct: string | undefined;
  const incomingContains = await ctx.store.getIncoming(feature.id, 'contains');
  for (const pred of incomingContains) {
    const source = await ctx.store.getEntity(pred.sourceId);
    if (source instanceof Product) {
      parentProduct = ctx.store.localId(source.id);
      break;
    }
  }

  return {
    id: localId,
    version: feature.version,
    title: feature.title,
    status: (feature as any).status || 'draft',
    body: (feature as any).body || undefined,
    priority: feature.priority,
    acceptanceCriteria: Array.isArray((feature as any).acceptanceCriteria) ? (feature as any).acceptanceCriteria : [],
    outcomes: feature.outcomes,
    scope: feature.scope,
    boundaries: feature.boundaries,
    behavioralRules: feature.behavioralRules,
    parentProduct,
    targetingEpics: epicPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    enabledStories,
    containedStories: enabledStories,
    implementingTickets: ticketPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    verifyingTests: testPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    governingConcepts: governingConcepts.sort(),
    governingDecisions: governingDecisions.sort()
  };
}

async function storyView(ctx: ToolContext, story: UserStory) {
  const localId = ctx.store.localId(story.id);
  const [containsPreds, enablesPreds, epicPreds, ticketPreds, testPreds, governingPreds] = await Promise.all([
    ctx.store.getIncoming(story.id, 'contains'),
    ctx.store.getIncoming(story.id, 'enables'),
    ctx.store.getIncoming(story.id, 'targets'),
    ctx.store.getIncoming(story.id, 'addresses'),
    ctx.store.getIncoming(story.id, 'verifies'),
    ctx.store.getIncoming(story.id, 'governs')
  ]);

  const containingFlows: string[] = [];
  const legacyFeatures: string[] = [];
  for (const pred of containsPreds) {
    const source = await ctx.store.getEntity(pred.sourceId);
    if (source instanceof Flow) containingFlows.push(ctx.store.localId(source.id));
    else if (source instanceof Feature) legacyFeatures.push(ctx.store.localId(source.id));
  }
  const enablingFeatures = [...new Set([...enablesPreds.map(p => ctx.store.localId(p.sourceId)), ...legacyFeatures])].sort();
  const governingConcepts: string[] = [];
  const governingDecisions: string[] = [];
  for (const pred of governingPreds) {
    const source = await ctx.store.getEntity(pred.sourceId);
    if (source instanceof Concept) governingConcepts.push(ctx.store.localId(source.id));
    else governingDecisions.push(ctx.store.localId(pred.sourceId));
  }

  return {
    id: localId,
    version: story.version,
    title: story.title,
    status: (story as any).status || 'draft',
    actor: story.actor,
    story: story.story,
    context: story.context,
    acceptanceCriteria: Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : [],
    sla: story.sla,
    intent: story.intent,
    initialState: story.initialState,
    action: story.action,
    expectedResult: story.expectedResult,
    exceptions: story.exceptions,
    bounds: story.bounds,
    definitionReview: story.definitionReview,
    effectiveState: await story.getEffectiveState(ctx.store),
    containingFlows: containingFlows.sort(),
    enablingFeatures,
    containingFeatures: enablingFeatures,
    targetingEpics: epicPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    addressingTickets: ticketPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    verifyingTests: testPreds.map(p => ctx.store.localId(p.sourceId)).sort(),
    governingConcepts: governingConcepts.sort(),
    governingDecisions: governingDecisions.sort()
  };
}

const artifactKinds=['Product','Goal','Concept','Flow','Feature','UserStory','Aspect','Module','Epic','Ticket','Bug','Decision','Idea'] as const;
type ArtifactKind=typeof artifactKinds[number];
const artifactId=z.string().min(1).regex(/\S/,'ID must not be blank');
const artifactMatch=z.enum(['exact','human']).optional();
const pageFields={query:z.string().optional(),limit:z.number().int().min(1).max(100).optional(),cursor:z.string().optional()};
const workFilter=z.object({lane:z.enum(['Backlog','Todo','In Progress','Done','Blocked','Cancelled']).optional(),priority:PrioritySchema.optional(),kind:z.enum(['task','bug']).optional()}).strict();
const definitionFilter=(kind:ArtifactKind)=>kind==='Ticket'?workFilter:kind==='Bug'?workFilter.extend({kind:z.literal('bug').optional()}):
  z.object({status:(kind==='Epic'?z.enum(EPIC_STATUSES):kind==='Idea'?z.enum(['draft','proposed','accepted','implemented','verified','deprecated']):z.enum(INTENT_STATUSES)).optional()}).strict();
const artifactBranches:z.ZodType[]=[z.object({action:z.literal('describe'),kind:z.enum(artifactKinds).optional()}).strict()];
for(const kind of artifactKinds) {
  const identity=kind==='Product'?z.literal('PRODUCT'):artifactId;
  artifactBranches.push(z.object({action:z.literal('list'),kind:z.literal(kind),...pageFields,filter:definitionFilter(kind).optional()}).strict(),
    z.object({action:z.literal('show'),kind:z.literal(kind),id:kind==='Product'?identity.optional():identity,idMatch:artifactMatch}).strict());
  if(kind==='Idea') continue;
  const authored=productDefinitionFields(kind==='Bug'?'Ticket':kind);
  const editable=kind==='Ticket'||kind==='Bug'?authored.omit({lane:true,...(kind==='Bug'?{kind:true}:{})}):authored;
  artifactBranches.push(z.object({action:z.literal('preview_edit'),kind:z.literal(kind),id:identity,version:z.number().int().positive(),
    fields:editable.refine(value=>Object.keys(value).length>0,'At least one definition field is required.').meta({minProperties:1})}).strict());
  if(kind!=='Module') artifactBranches.push(z.object({action:z.literal('preview_new'),kind:z.literal(kind),id:identity.optional(),
    fields:(kind==='Ticket'||kind==='Bug'?editable.extend({lane:z.enum(['Backlog','Todo']).optional()}):editable).extend({title:z.string().min(1).regex(/\S/,'Title must not be blank')})}).strict());
  if(!['Epic','Ticket','Bug'].includes(kind)) artifactBranches.push(z.object({action:z.literal('preview_retire'),kind:z.literal(kind),id:identity,version:z.number().int().positive()}).strict());
}
const ArtifactActionSchema=z.union(artifactBranches as [z.ZodType,z.ZodType,...z.ZodType[]]);
const VerifyActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('describe'),kind:z.enum(['story','ticket']).optional()}).strict(),
  z.object({action:z.literal('show'),kind:z.enum(['story','ticket']),id:artifactId,idMatch:artifactMatch}).strict(),
  z.object({action:z.literal('run'),kind:z.literal('story'),id:artifactId,idMatch:artifactMatch}).strict()
]);
// Parsing the finite schemas above precedes this common adapter; domain rules remain in S2/S5.
type ArtifactAction={action:'describe';kind?:ArtifactKind}|{action:'list';kind:ArtifactKind;query?:string;filter?:Record<string,string|number>;limit?:number;cursor?:string}|
  {action:'show';kind:ArtifactKind;id?:string;idMatch?:'exact'|'human'}|
  {action:'preview_new';kind:Exclude<ArtifactKind,'Idea'|'Module'>;id?:string;fields:Record<string,unknown>}|
  {action:'preview_edit';kind:Exclude<ArtifactKind,'Idea'>;id:string;version:number;fields:Record<string,unknown>}|
  {action:'preview_retire';kind:Exclude<ArtifactKind,'Idea'|'Epic'|'Ticket'|'Bug'>;id:string;version:number};

async function artifactAction(args:ArtifactAction,ctx:ToolContext) {
  if(args.action==='describe') return {status:'read',kinds:artifactKinds,actions:['describe','list','show','preview_new','preview_edit','preview_retire'],
    ...(args.kind?{kind:args.kind,schemas:artifactBranches.filter(branch=>{
      const schema=z.toJSONSchema(branch),kindSchema=schema.properties?.kind;return typeof kindSchema==='object'&&kindSchema.const===args.kind;
    }).map(branch=>z.toJSONSchema(branch))}:{}),
    review:'Previews are inert. A developer must review the exact fingerprint through Workspace or product-change accept. apply_change cannot self-approve.',
    specialists:{relations:'link',verification:'verify',work:'claim_ticket / update_ticket_state / resolve_ticket',storyTests:'prepare_story_test / apply_story_test',rules:'preview_rule_change / apply_rule_change',source:'find_symbol / get_module'}};
  const kind=args.kind==='Bug'?'Ticket':args.kind;
  if(kind==='Module') await ensureAstFresh(ctx.store);
  if(args.action==='list') {
    const descriptor=entityDescriptors.find(item=>item.name===(kind==='Module'?'ModuleNode':kind));
    if(!descriptor) throw Error(`No descriptor for ${kind}.`);
    const query=(args.query??'').toLowerCase();
    const rows=[];
    for(const entity of await ctx.store.listEntities(descriptor)) {
      const data=await entity.fullDto<Record<string,unknown>>();
      const recordKind=data.kind??'task';
      if(args.kind==='Bug'&&recordKind!=='bug') continue;
      const status=kind==='Module'?data.intentStatus??'draft':data.status;
      if(query&&!`${data.title??''}\n${data.body??''}`.toLowerCase().includes(query)) continue;
      if(Object.entries(args.filter??{}).some(([key,value])=>(key==='kind'?recordKind:key==='status'?status:data[key])!==value)) continue;
      rows.push({id:ctx.store.localId(entity.id),kind:args.kind,version:entity.version,title:data.title,body:data.body,
        ...(kind==='Ticket'?{lane:data.lane,priority:data.priority,workKind:recordKind}:{status})});
    }
    rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const basis=computeHash({kind:args.kind,query,filter:args.filter??{},rows});let offset=0;
    if(args.cursor) {try {const cursor=JSON.parse(Buffer.from(args.cursor,'base64url').toString());if(cursor.basis!==basis||!Number.isInteger(cursor.offset)||cursor.offset<0||cursor.offset>=rows.length) throw Error();offset=cursor.offset;}catch{throw Error('Invalid or stale artifact cursor; restart listing.');}}
    const limit=args.limit??25;
    return {status:'read',items:rows.slice(offset,offset+limit),cursor:offset+limit<rows.length?Buffer.from(JSON.stringify({basis,offset:offset+limit})).toString('base64url'):null};
  }
  if(args.action==='preview_new') {
    const id=args.kind==='Product'?'PRODUCT':args.id??`${artifactPrefixes[args.kind]}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    return previewDefinitionChange(ctx,{kind:kind as DefinitionReviewInput['kind'],id,create:true,fields:{...args.fields,...(args.kind==='Bug'?{kind:'bug'}:{})}});
  }
  const id=args.id??'PRODUCT';
  if(args.action==='show'&&kind==='Product'&&!await ctx.store.getEntity('PRODUCT',Product.dcr)) return {status:'read',kind:'Product',defined:false,id:'PRODUCT'};
  const entity=await endpoint(ctx.store,id,'idMatch' in args?args.idMatch:undefined);
  if(productKind(entity)!==kind) throw Error(`Expected ${args.kind} '${id}', found ${productKind(entity)}.`);
  const data=await entity.fullDto<Record<string,unknown>>();
  if(args.kind==='Bug'&&(data.kind??'task')!=='bug') throw Error(`Ticket '${id}' is a task, not a Bug.`);
  const exactId=ctx.store.localId(entity.id);
  if(args.action==='show') {
    const definition=kind==='Module'?await registry.execute('get_module',{moduleId:exactId},ctx):data;
    return {status:'read',kind:args.kind,id:exactId,version:entity.version,...(kind==='Product'?{defined:true}:{}),definition,
      relations:await linkAction(ctx.store,{action:'inspect',id:exactId,limit:25}),
      evidence:kind==='Ticket'?await registry.execute('get_ticket',{ticketId:exactId},ctx):entity instanceof UserStory?await entity.getEffectiveState(ctx.store):{state:'not-assessed',next:'verify / get_product_coverage; definition acceptance is not satisfaction'}};
  }
  if(entity.version!==args.version) throw Error(`Stale ${args.kind} version; read the current definition and restart review.`);
  const fields=args.action==='preview_retire'?{[kind==='Module'?'intentStatus':'status']:'deprecated'}:args.fields;
  const preview=await previewDefinitionChange(ctx,{kind:kind as DefinitionReviewInput['kind'],id:exactId,create:false,fields});
  return {...preview,...(args.action==='preview_retire'?{dependents:await productDependents(ctx.store,exactId)}:{})};
}
const artifactPrefixes={Product:'PRODUCT',Goal:'GOAL',Concept:'CONCEPT',Flow:'FLOW',Feature:'FEAT',UserStory:'STORY',Aspect:'ASP',Epic:'EPIC',Ticket:'TKT',Bug:'BUG',Decision:'DEC'} as const;

export function registerProductTools() {
  registry.register({name:'artifact',category:'planning',description:'Typed definition discovery, bounded reads and inert S2 previews. Use describe for one kind. Product acceptance requires exact developer review.',parameters:ArtifactActionSchema,execute:(args,ctx)=>artifactAction(args as ArtifactAction,ctx)});
  registry.register({name:'verify',category:'test',description:'Inspect Story S5 execution or recorded Ticket proof; run an activated Story test. Never writes a Ticket receipt or completes work.',parameters:VerifyActionSchema,execute:async(args,ctx)=>{
    if(args.action==='describe') return {status:'read',kinds:['story','ticket'],actions:{story:['show','run'],ticket:['show']},rights:{show:'read-only',run:'project-write; executes the existing activated Story test'},states:'Story evidence is current S5 classification. Ticket receipt is recorded-unchecked until the independent completion owner revalidates current source, tests and governance.',next:'prepare_story_test / apply_story_test; resolve_ticket owns independent Ticket completion'};
    const entity=await endpoint(ctx.store,args.id,args.idMatch);
    const expected=args.kind==='story'?'UserStory':'Ticket';
    if(productKind(entity)!==expected) throw Error(`Expected ${expected} '${args.id}'.`);
    const id=ctx.store.localId(entity.id);
    if(args.kind==='ticket') return registry.execute('get_ticket',{ticketId:id},ctx);
    return registry.execute(args.action==='run'?'run_story_test':'get_story_test_status',{storyId:id},ctx);
  }});
  registry.register({
    name:'get_module', category:'graph',
    description:'Read an exact indexed Module identity, authored intent and current source availability. Source facts are not authorable.',
    parameters:z.object({moduleId:z.string().min(1)}).strict(),
    execute:async({moduleId},ctx)=>{
      const module=await ctx.store.getEntity<ModuleNode>(moduleId,ModuleNode.dcr);
      if(!module) throw Error(`Module '${moduleId}' not found.`);
      let sourcePresent=false;
      for(const edge of await ctx.store.getOutgoing(module.id,'contains')) {
        if(edge.targetType!=='FileNode') continue;
        const file=await ctx.store.getEntity<FileNode & {metadata?:{externalPath?:string}}>(edge.targetId,FileNode.dcr);
        const source=file?.metadata?.externalPath ?? path.resolve(ctx.projectRoot,ctx.store.localId(edge.targetId));
        if(fs.statSync(source,{throwIfNoEntry:false})?.isFile()) {sourcePresent=true;break;}
      }
      return {...await module.fullDto<Record<string,unknown>>(),id:ctx.store.localId(module.id),version:module.version,
        sourceStatus:sourcePresent?'indexed':'missing_source'};
    }
  });
  registry.register({name:'get_decision',category:'planning',description:'Read one canonical Decision without changing its approval state.',
    parameters:z.object({id:z.string().min(1)}).strict(),execute:async({id},ctx)=>{
      const decision=await ctx.store.getEntity<Decision>(id,Decision.dcr);
      if(!decision) throw Error(`Decision '${id}' not found.`);
      return {...await decision.fullDto<Record<string,unknown>>(),id:ctx.store.localId(decision.id),version:decision.version};
    }});
  registry.register({name:'list_decisions',category:'planning',description:'List canonical Decisions without accepting or revising definitions.',
    parameters:z.object({}).strict(),execute:async(_params,ctx)=>Promise.all((await ctx.store.listEntities<Decision>(Decision.dcr)).map(async decision=>
      ({...await decision.fullDto<Record<string,unknown>>(),id:ctx.store.localId(decision.id),version:decision.version})))});
  registry.register({name:'link',category:'planning',description:'Discover H/O/L relation types, inspect edges, or prepare an inert reviewed link change. Applying requires separate S2 review; no model approval flag.',parameters:LinkActionSchema,execute:(args,ctx)=>linkAction(ctx.store,args)});
  registry.register({name:'get_story_test_status',category:'planning',description:'Inspect materialized Story test specification; missing sources are uncovered, never skipped.',parameters:z.object({storyId:z.string().min(1)}),execute:({storyId},ctx)=>storyTestStatus(ctx.store,storyId)});
  registry.register({name:'run_story_test',category:'test',description:'Run an activated Story test through the existing targeted test runner and classify current execution evidence.',parameters:z.object({storyId:z.string().min(1)}),execute:({storyId},ctx)=>runStoryTest(ctx.store,storyId,command=>registry.execute('triage_test_failures',{testCommand:command},ctx),preview=>applyOwnedChange(preview,ctx))});
  registry.register({name:'prepare_test_binding',category:'planning',description:'Preview developer-reviewed bounded technical Ticket proof using existing local and dependency-owned TestNodes; no execution or acceptance is imported.',parameters:z.object({specification:TestBindingSpecificationSchema}).strict(),execute:({specification},ctx)=>prepareTestBinding(ctx.store,specification)});
  registry.register({name:'apply_test_binding',category:'planning',description:'Bind the exact current technical proof preview only with host-reviewed fingerprint authority. Project-write and model decisions cannot approve proof meaning.',parameters:z.object({specification:TestBindingSpecificationSchema,fingerprint:z.string().min(1),decision:z.enum(['accept','reject','cancel'])}).strict(),execute:({specification,fingerprint,decision},ctx)=>applyTestBinding(ctx.store,specification,fingerprint,decision,preview=>applyOwnedChange(preview,ctx))});
  registry.register({name:'prepare_story_test',category:'planning',description:'Preview a reviewed executable public-interface Story suite; missing fixtures remain uncovered.',
    parameters:z.object({specification:StoryTestSpecificationSchema}),
    execute:({specification},ctx)=>prepareStoryTest(ctx.store,specification)});
  registry.register({name:'apply_story_test',category:'planning',description:'Approve guarded test source materialization, then separately link its canonical Test. Reports partial outcomes.',
    parameters:z.object({specification:StoryTestSpecificationSchema,fingerprint:z.string().min(1),decision:z.enum(['accept','reject','cancel'])}),
    execute:async({specification,fingerprint,decision},ctx)=>{
      return applyStoryTest(ctx.store,specification,fingerprint,decision,preview=>
        applyOwnedChange(preview,ctx));
    }});

  for (const spec of [
    { kind: 'Goal' as const, ctor: Goal, prefix: 'goal', idPrefix: 'GOAL', actorFields: false },
    { kind: 'Concept' as const, ctor: Concept, prefix: 'concept', idPrefix: 'CONCEPT', actorFields: false },
    { kind: 'Flow' as const, ctor: Flow, prefix: 'flow', idPrefix: 'FLOW', actorFields: true }
  ]) {
    const baseFields = {
      id: z.string().optional(),
      title: z.string().min(1),
      body: z.string().optional(),
      status: z.enum(INTENT_STATUSES).optional()
    };
    const createSchema = spec.actorFields
      ? z.object({ ...baseFields, actor: z.string().optional(), context: z.string().optional() })
      : z.object(baseFields);
    registry.register({
      name: `create_${spec.prefix}`,
      description: `Create a durable ${spec.kind} in top-level Product Intent.`,
      category: 'planning',
      parameters: createSchema,
      execute: async (params: any, ctx: ToolContext) => {
        const id = params.id || `${spec.idPrefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const fields = Object.fromEntries(Object.entries({
          title: params.title, body: params.body || '', status: params.status || 'draft',
          ...(spec.actorFields ? { actor: params.actor || '', context: params.context || '' } : {})
        }).filter(([, value]) => value !== undefined));
        await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: spec.kind, id, fields }]);
        return topLevelIntentView(ctx, await requireEntity(ctx, id, spec.ctor.dcr, spec.kind));
      }
    });
    registry.register({
      name: `get_${spec.prefix}`,
      description: `Get a ${spec.kind} and its semantic relations.`,
      category: 'planning',
      parameters: z.object({ id: z.string() }),
      execute: async ({ id }, ctx: ToolContext) => topLevelIntentView(ctx, await requireEntity(ctx, id, spec.ctor.dcr, spec.kind))
    });
    registry.register({
      name: `list_${spec.prefix}s`,
      description: `List ${spec.kind} entities.`,
      category: 'planning',
      parameters: z.object({ status: z.enum(INTENT_STATUSES).optional() }),
      execute: async ({ status }, ctx: ToolContext) => {
        const entities = await ctx.store.listEntities<any>(spec.ctor.dcr);
        const views = await Promise.all(entities.map(entity => topLevelIntentView(ctx, entity)));
        return status ? views.filter(view => view.status === status) : views;
      }
    });
    registry.register({
      name: `update_${spec.prefix}`,
      description: `Update a ${spec.kind} without changing its semantic relations.`,
      category: 'planning',
      parameters: spec.actorFields
        ? z.object({ id: z.string(), title: z.string().optional(), body: z.string().optional(), status: z.enum(INTENT_STATUSES).optional(), actor: z.string().optional(), context: z.string().optional() })
        : z.object({ id: z.string(), title: z.string().optional(), body: z.string().optional(), status: z.enum(INTENT_STATUSES).optional() }),
      execute: async ({ id, ...changes }: any, ctx: ToolContext) => {
        const fields = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
        await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: spec.kind, id, fields }]);
        return topLevelIntentView(ctx, await requireEntity(ctx, id, spec.ctor.dcr, spec.kind));
      }
    });
  }

  for (const [name, ctor, key] of [['process_epic', Epic, 'epicId'], ['process_feature', Feature, 'featureId'], ['process_story', UserStory, 'storyId']] as const) {
    registry.register({ name, category: 'planning', description: 'Reconcile Product Intent into necessary reviewed work, reusing existing capabilities and respecting completeness/depth/breadth.',
      parameters: ArtifactTransportOptionsSchema.extend({ [key]: z.string(), originalRequest: z.string().optional(), proposal: IntentProposalSchema.optional() }),
      execute: async (params, ctx) => {
        const { [key]: id, ...options } = params;
        const entity = await ctx.store.getEntity(String(id), ctor.dcr) as Epic | Feature | UserStory | null;
        if (!entity) throw new Error(`${ctor.name} '${id}' not found.`);
        return entity.process(ctx.store, {...options, ...(entity instanceof Feature ? {requireWorkScope:true} : {})});
      }
    });
  }
  // ---------------------------------------------------------------------------
  // Epic Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'create_epic',
    description: 'Create a new Epic in the Product Intent Graph.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Optional stable epic ID (e.g. EPIC-001)'),
      title: z.string().describe('Epic title'),
      body: z.string().optional().describe('Detailed epic description or background'),
      priority: PrioritySchema.optional().describe('Priority integer 0-5 (default 2; lower ranks first)'),
      status: z.enum(EPIC_STATUSES).optional().describe('Epic lifecycle status (default: draft)')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `EPIC-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'Epic', id,
        fields: { title: params.title, body: params.body || '', priority: params.priority ?? 2, status: params.status || 'draft' } }]);
      const epic = await requireEntity(ctx, id, Epic.dcr, 'Epic');
      return await epicView(ctx, epic);
    }
  });

  registry.register({
    name: 'get_epic',
    description: 'Get an Epic with targeted goals/concepts/flows/features/stories and contained tickets.',
    category: 'planning',
    parameters: z.object({ epicId: z.string() }),
    execute: async ({ epicId }, ctx: ToolContext) => {
      const epic = await requireEntity(ctx, epicId, Epic.dcr, 'Epic');
      return await epicView(ctx, epic);
    }
  });

  registry.register({
    name: 'list_epics',
    description: 'List Epics in the Product Intent Graph, optionally filtering by status.',
    category: 'planning',
    parameters: z.object({
      status: z.enum(EPIC_STATUSES).optional()
    }),
    execute: async ({ status }, ctx: ToolContext) => {
      const epics = await ctx.store.listEntities<Epic>(Epic.dcr);
      const views = await Promise.all(epics.map(e => epicView(ctx, e)));
      if (status) return views.filter(v => v.status === status);
      return views;
    }
  });

  registry.register({
    name: 'update_epic',
    description: 'Update the title, body, priority, or status of an existing Epic.',
    category: 'planning',
    parameters: z.object({
      epicId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      priority: PrioritySchema.optional(),
      status: z.enum(EPIC_STATUSES).optional()
    }),
    execute: async ({ epicId, ...changes }, ctx: ToolContext) => {
      const update = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'Epic', id: epicId, fields: update }]);
      return await epicView(ctx, await requireEntity(ctx, epicId, Epic.dcr, 'Epic'));
    }
  });

  // ---------------------------------------------------------------------------
  // Feature Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'create_feature',
    description: 'Create a durable Feature entity in the Product Intent Graph.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Optional stable feature ID (e.g. FEAT-001)'),
      title: z.string().describe('Feature capability title'),
      body: z.string().optional().describe('Feature scope and description'),
      priority: PrioritySchema.optional().describe('Priority integer 0-5 (default 2; lower ranks first)'),
      acceptanceCriteria: z.array(z.string()).optional().describe('High-level feature acceptance criteria'),
      status: z.enum(INTENT_STATUSES).optional().describe('Intent lifecycle status (default: draft)')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `FEAT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'Feature', id,
        fields: { title: params.title, body: params.body || '', priority: params.priority, acceptanceCriteria: params.acceptanceCriteria || [], status: params.status || 'draft' } }]);
      const feature = await requireEntity(ctx, id, Feature.dcr, 'Feature');
      return await featureView(ctx, feature);
    }
  });

  registry.register({
    name: 'get_feature',
    description: 'Get a Feature with the Stories it enables, targeting epics, tickets, and tests.',
    category: 'planning',
    parameters: z.object({ featureId: z.string() }),
    execute: async ({ featureId }, ctx: ToolContext) => {
      const feature = await requireEntity(ctx, featureId, Feature.dcr, 'Feature');
      return await featureView(ctx, feature);
    }
  });

  registry.register({
    name: 'list_features',
    description: 'List Features in the Product Intent Graph, optionally filtering by status.',
    category: 'planning',
    parameters: z.object({
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async ({ status }, ctx: ToolContext) => {
      const features = await ctx.store.listEntities<Feature>(Feature.dcr);
      const views = await Promise.all(features.map(f => featureView(ctx, f)));
      if (status) return views.filter(v => v.status === status);
      return views;
    }
  });

  registry.register({
    name: 'update_feature',
    description: 'Update the title, body, criteria, or status of an existing Feature.',
    category: 'planning',
    parameters: z.object({
      featureId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      priority: PrioritySchema.optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async ({ featureId, ...changes }, ctx: ToolContext) => {
      const update = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'Feature', id: featureId, fields: update }]);
      return await featureView(ctx, await requireEntity(ctx, featureId, Feature.dcr, 'Feature'));
    }
  });

  // ---------------------------------------------------------------------------
  // User Story Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'create_user_story',
    description: 'Create a first-class user story in the Product Intent Graph.',
    category: 'planning',
    parameters: z.object({
      id: z.string().optional().describe('Optional stable story ID (e.g. STORY-001)'),
      title: z.string().describe('Short behavior/outcome title'),
      actor: z.string().optional().describe('Human or system actor experiencing the behavior'),
      intent: z.string().optional(),
      initialState: z.string().optional(),
      action: z.string().optional(),
      expectedResult: z.string().optional().describe('Expected observable result through the public interface'),
      exceptions: z.string().optional(),
      bounds: z.string().optional(),
      story: z.string().optional().describe('Desired behavior/outcome'),
      context: z.string().optional().describe('Why or when this behavior matters'),
      acceptanceCriteria: z.array(z.string()).optional().describe('Observable acceptance criteria'),
      sla: z.string().optional().describe('Performance or service-level expectation'),
      status: z.enum(INTENT_STATUSES).optional().describe('Intent lifecycle status (default: draft)')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `STORY-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'UserStory', id,
        fields: { title: params.title, actor: params.actor || '', intent: params.intent, initialState: params.initialState,
          action: params.action, expectedResult: params.expectedResult, exceptions: params.exceptions, bounds: params.bounds,
          story: params.story || '', context: params.context || '',
          acceptanceCriteria: params.acceptanceCriteria || [], sla: params.sla || '', status: params.status || 'draft' } }]);
      const story = await requireEntity(ctx, id, UserStory.dcr, 'UserStory');
      return await storyView(ctx, story);
    }
  });

  registry.register({
    name: 'get_user_story',
    description: 'Get a narrative Story with its containing Flow, enabling Features, targeting epics, tickets, and tests.',
    category: 'planning',
    parameters: z.object({ storyId: z.string() }),
    execute: async ({ storyId }, ctx: ToolContext) => {
      const story = await requireEntity(ctx, storyId, UserStory.dcr, 'User story');
      return await storyView(ctx, story);
    }
  });

  registry.register({
    name: 'list_user_stories',
    description: 'List user stories, optionally filtering by status or containing feature.',
    category: 'planning',
    parameters: z.object({
      status: z.enum(INTENT_STATUSES).optional(),
      featureId: z.string().optional()
    }),
    execute: async ({ status, featureId }, ctx: ToolContext) => {
      let stories = await ctx.store.listEntities<UserStory>(UserStory.dcr);

      if (featureId) {
        const [enabled, legacy] = await Promise.all([
          ctx.store.getOutgoing(featureId, 'enables'),
          ctx.store.getOutgoing(featureId, 'contains')
        ]);
        const allowed = new Set([...enabled, ...legacy].map(p => p.targetId));
        stories = stories.filter(s => allowed.has(s.id));
      }

      const views = await Promise.all(stories.map(s => storyView(ctx, s)));
      if (status) return views.filter(v => v.status === status);
      return views;
    }
  });

  registry.register({
    name: 'update_user_story',
    description: 'Update the behavioral content or status of an existing user story without changing graph relations.',
    category: 'planning',
    parameters: z.object({
      storyId: z.string(),
      title: z.string().optional(),
      actor: z.string().optional(),
      intent: z.string().optional(),
      initialState: z.string().optional(),
      action: z.string().optional(),
      expectedResult: z.string().optional(),
      exceptions: z.string().optional(),
      bounds: z.string().optional(),
      story: z.string().optional(),
      context: z.string().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      sla: z.string().optional(),
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async ({ storyId, ...changes }, ctx: ToolContext) => {
      const update = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'UserStory', id: storyId, fields: update }]);
      return await storyView(ctx, await requireEntity(ctx, storyId, UserStory.dcr, 'User story'));
    }
  });

  // ---------------------------------------------------------------------------
  // Constrained Link and Unlink Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'link_product',
    description: 'Connect Product Intent using canonical semantic relations, including Flow serves Goal, Concept governs scopes, Flow contains Story, Feature enables Story, Epic targets intent, and Ticket implements/addresses work.',
    category: 'planning',
    parameters: z.object({
      sourceId: z.string().describe('Source entity ID'),
      predicate: z.string().describe('Semantic predicate such as inspires, serves, governs, targets, contains, enables, implements, addresses, verifies'),
      targetId: z.string().describe('Target entity ID')
    }),
    execute: async ({ sourceId, predicate, targetId }, ctx: ToolContext) => {
      const source = await resolveProductEntity(ctx.store, sourceId);
      const target = await resolveProductEntity(ctx.store, targetId);
      const sourceKind = productKind(source)!;
      const targetKind = productKind(target)!;
      await applyProductMutations(ctx.store, [{ kind: 'product_link', sourceId, predicate, targetId }]);

      return {
        success: true,
        sourceId: ctx.store.localId(source.id),
        sourceKind,
        predicate,
        targetId: ctx.store.localId(target.id),
        targetKind
      };
    }
  });

  registry.register({
    name: 'unlink_product',
    description: 'Disconnect product entities linked by canonical relations.',
    category: 'planning',
    parameters: z.object({
      sourceId: z.string().describe('Source entity ID'),
      predicate: z.string().describe('Semantic predicate such as inspires, serves, governs, targets, contains, enables, implements, addresses, verifies'),
      targetId: z.string().describe('Target entity ID')
    }),
    execute: async ({ sourceId, predicate, targetId }, ctx: ToolContext) => {
      const source = await resolveProductEntity(ctx.store, sourceId);
      const target = await resolveProductEntity(ctx.store, targetId);
      const sourceKind = productKind(source)!;
      const targetKind = productKind(target)!;
      await applyProductMutations(ctx.store, [{ kind: 'product_unlink', sourceId, predicate, targetId }]);

      return {
        success: true,
        sourceId: ctx.store.localId(source.id),
        sourceKind,
        predicate,
        targetId: ctx.store.localId(target.id),
        targetKind
      };
    }
  });

  // ---------------------------------------------------------------------------
  // Coverage & Impact Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'get_product_coverage',
    description: 'Evaluate structural and causal coverage (work, code grounding, verification, blockers) for an Epic, Feature, or User Story.',
    category: 'planning',
    parameters: z.object({
      entityId: z.string().describe('Epic, Feature, or UserStory ID')
    }),
    execute: async ({ entityId }, ctx: ToolContext) => {
      return await getCoverage(ctx.store, entityId);
    }
  });

  registry.register({
    name: 'get_product_impact',
    description: 'Extract bounded semantic neighborhood (intent, work, code anchors, verification, decisions) for an Epic, Feature, or User Story.',
    category: 'planning',
    parameters: z.object({
      entityId: z.string().describe('Epic, Feature, or UserStory ID')
    }),
    execute: async ({ entityId }, ctx: ToolContext) => {
      return await getProductImpact(ctx.store, entityId);
    }
  });

  // ---------------------------------------------------------------------------
  // Epic Decomposition Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'propose_epic_structure',
    description: 'Propose a structured Epic decomposition into stable Features and observable User Stories with zero graph mutation.',
    category: 'planning',
    parameters: z.object({
      title: z.string().describe('Epic title or draft'),
      body: z.string().optional().describe('Epic scope or description'),
      status: z.enum(EPIC_STATUSES).optional().describe('Epic status'),
      existingEpicId: z.string().optional().describe('Optional existing Epic ID to enrich'),
      priority: PrioritySchema.default(2),
      injectedSemanticOutput: z.any().optional().describe('Deterministic test injection (bypasses LLM)')
    }),
    execute: async ({ injectedSemanticOutput, ...draft }, ctx: ToolContext) => {
      return await proposeEpicStructure(ctx.store, draft, injectedSemanticOutput ? { injectedSemanticOutput } : undefined);
    }
  });

  registry.register({
    name: 'apply_epic_structure',
    description: 'Prepare an inert, versioned change preview from Epic decomposition. Review it and use apply_change with decision=accept to commit; reused definitions are preserved.',
    category: 'planning',
    parameters: z.object({
      proposal: z.any().describe('The validated EpicStructureProposal object to apply')
    }),
    execute: async ({ proposal }, ctx: ToolContext) => {
      return await applyEpicStructure(ctx.store, proposal);
    }
  });

  // ---------------------------------------------------------------------------
  // Product Charter Singleton Tools
  // ---------------------------------------------------------------------------
  registry.register({
    name: 'get_product',
    description: 'Get the top-level Product charter singleton if defined.',
    category: 'planning',
    parameters: z.object({}),
    execute: async (_params: unknown, ctx: ToolContext) => {
      const product = await ctx.store.getEntity<Product>('PRODUCT', Product.dcr);
      if (!product) return { defined: false, product: null, features: [] };
      const outgoing = await ctx.store.getOutgoing(product.id, 'contains');
      const featureIds = new Set(outgoing.map(e => ctx.store.localId(e.targetId)));
      const allFeatures = await ctx.store.listEntities<Feature>(Feature.dcr);
      const features = await Promise.all(
        allFeatures
          .filter(f => featureIds.has(ctx.store.localId(f.id)))
          .map(f => featureView(ctx, f))
      );
      return {
        defined: true,
        product: {
          id: 'PRODUCT',
          version: product.version,
          title: product.title,
          purpose: product.purpose,
          actors: product.actors ?? [],
          scope: product.scope,
          nonGoals: product.nonGoals ?? [],
          bounds: product.bounds,
          status: product.status || 'draft'
        },
        features
      };
    }
  });

  registry.register({
    name: 'define_product',
    description: 'Define the initial Product charter singleton.',
    category: 'planning',
    parameters: z.object({
      title: z.string().min(1),
      purpose: z.string().optional(),
      actors: z.array(z.string()).optional(),
      scope: z.string().optional(),
      nonGoals: z.array(z.string()).optional(),
      bounds: z.string().optional(),
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async (params, ctx: ToolContext) => {
      const fields = Object.fromEntries(Object.entries({
        title: params.title,
        purpose: params.purpose,
        actors: params.actors,
        scope: params.scope,
        nonGoals: params.nonGoals,
        bounds: params.bounds,
        status: params.status || 'draft'
      }).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'Product', id: 'PRODUCT', fields }]);
      const p = (await ctx.store.getEntity<Product>('PRODUCT', Product.dcr))!;
      return {
        defined: true,
        id: 'PRODUCT',
        version: p.version,
        title: p.title,
        purpose: p.purpose,
        actors: p.actors ?? [],
        scope: p.scope,
        nonGoals: p.nonGoals ?? [],
        bounds: p.bounds,
        status: p.status || 'draft'
      };
    }
  });

  registry.register({
    name: 'update_product',
    description: 'Update the Product charter singleton.',
    category: 'planning',
    parameters: z.object({
      title: z.string().optional(),
      purpose: z.string().optional(),
      actors: z.array(z.string()).optional(),
      scope: z.string().optional(),
      nonGoals: z.array(z.string()).optional(),
      bounds: z.string().optional(),
      status: z.enum(INTENT_STATUSES).optional()
    }),
    execute: async (params, ctx: ToolContext) => {
      const fields = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'Product', id: 'PRODUCT', fields }]);
      const p = (await ctx.store.getEntity<Product>('PRODUCT', Product.dcr))!;
      return {
        defined: true,
        id: 'PRODUCT',
        version: p.version,
        title: p.title,
        purpose: p.purpose,
        actors: p.actors ?? [],
        scope: p.scope,
        nonGoals: p.nonGoals ?? [],
        bounds: p.bounds,
        status: p.status || 'draft'
      };
    }
  });
}
