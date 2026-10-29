/** Developer-reviewed technical acceptance bindings on real, existing TestNodes.
 * A scope is a semantic review partition, never a new test or execution record.
 */
import path from 'node:path';
import {z} from 'zod';
import {WorkflowStore} from './store.ts';
import {TestNode,Ticket,UserStory,SymbolNode} from '../model/ontology.ts';
import {ensureAstFresh} from './indexer.ts';
import {hashFiles,currentTestEvidence} from './test-artifacts.ts';
import {canonical,computeHash} from '../kb/canonical.ts';
import {CausalChangeEngine} from '../change/engine.ts';
import {ticketVerificationSignature} from '../ticket-operation-types.ts';
import {buildVerificationContext,DEFAULT_VERIFICATION_CONTEXT_CHARS} from '../verification-context.ts';
import type {TicketDossier} from '../ticket-operation-types.ts';
import type {ChangePreview,ChangeApplyResult} from '../change/types.ts';

import {TestBindingSpecificationSchema,TechnicalProofSchema,ScopeSchema,type TestBindingSpecification,type TechnicalProof} from '../model/test-proof-types.ts';

/** Each dependency is indexed, read and hashed by its own store; no external hashFiles mode. */
export async function withProofProject<T>(store:WorkflowStore,root:string,work:(owner:WorkflowStore)=>Promise<T>):Promise<T>{
 if(path.resolve(root)===store.root)return work(store);
 const owner=new WorkflowStore(root);
 try{return await work(owner);}finally{owner.close();}
}

async function scopeSnapshot(store:WorkflowStore,scope:z.infer<typeof ScopeSchema>){
 const projectRoot=path.resolve(store.root,scope.projectRoot??'.');
 const test=await withProofProject(store,projectRoot,async owner=>{
  await ensureAstFresh(owner,owner.root);
  const test=await owner.getEntity<TestNode>(scope.testId,TestNode.dcr);
  if(!test?.filePath)throw Error('Acceptance binding requires an existing indexed TestNode: '+scope.testId);
  return {id:owner.localId(test.id),filePath:test.filePath,version:test.version};
 });
 const sources=scope.sources.map(source=>({...source,projectRoot:path.resolve(projectRoot,source.projectRoot??'.')}));
 const hashes:Record<string,string>={};
 for(const root of new Set([projectRoot,...sources.map(source=>source.projectRoot)]))
  await withProofProject(store,root,async owner=>{
   await ensureAstFresh(owner,owner.root);
   const files=[...(root===projectRoot?[test.filePath]:[]),...sources.filter(source=>source.projectRoot===root).map(source=>source.filePath)];
   for(const [file,hash] of Object.entries(hashFiles(owner.root,files))){
    if(hash==='missing')throw Error('Acceptance source or test is missing.');
    hashes[owner.root+'::'+file]=hash;
   }
  });
 return {...scope,sources,projectRoot,testId:test.id,filePath:test.filePath,reviewedTestVersion:test.version,hashes};
}

export async function prepareTestBinding(store:WorkflowStore,raw:TestBindingSpecification){
 const specification=TestBindingSpecificationSchema.parse(raw);
 await ensureAstFresh(store,store.root);
 const ticket=await store.getEntity<Ticket>(specification.ticketId,Ticket.dcr);
 const test=await store.getEntity<TestNode>(specification.testId,TestNode.dcr);
 if(!ticket||!test)throw Error('Technical binding requires an existing Ticket and TestNode.');
 for(const edge of await store.getOutgoing(ticket.id,'addresses'))
  if(await store.getEntity(edge.targetId,UserStory.dcr))throw Error('Use the accepted Story-test owner for Story work.');
 if(new Set(specification.scopes.map(scope=>scope.id)).size!==specification.scopes.length)throw Error('Duplicate proof scope.');
 const acceptanceCriteria=ticket.acceptanceCriteria??[];
 const criteria=new Set(specification.scopes.flatMap(scope=>scope.criteria));
 if(acceptanceCriteria.some(criterion=>!criteria.has(criterion))||[...criteria].some(criterion=>!acceptanceCriteria.includes(criterion)))
  throw Error('Technical binding must cover every exact Ticket criterion.');
 for(const edge of await store.getIncoming(ticket.id,'verifies')){
  const previous=await store.getEntity<TestNode>(edge.sourceId,TestNode.dcr);
  if(previous&&previous.id!==test.id&&previous.technicalProofs?.some(proof=>proof.ticketId===store.localId(ticket.id)))
   throw Error('Reuse the existing TestNode identity owning this Ticket binding.');
 }
 const scopes=[];
 for(const scope of specification.scopes)scopes.push(await scopeSnapshot(store,scope));
 if(!scopes.some(scope=>scope.projectRoot===store.root&&scope.testId===store.localId(test.id)))
  throw Error('Binding owner must be one of the real local acceptance tests.');
 const technicalProof:TechnicalProof={ticketId:store.localId(ticket.id),basisHash:await ticketVerificationSignature(store,ticket),scopes};
 const engine=new CausalChangeEngine({store,projectRoot:store.root});
 const request={action:'product_change' as const,basis:[
  {id:store.localId(ticket.id),entityType:ticket.typeName(),version:ticket.version},
  {id:store.localId(test.id),entityType:test.typeName(),version:test.version}
 ],originalRequest:'Developer-reviewed technical Ticket acceptance binding',mutations:[
  {kind:'product_update' as const,entityType:'Test' as const,id:store.localId(test.id),fields:{technicalProofs:[...(test.technicalProofs??[]).filter(proof=>proof.ticketId!==technicalProof.ticketId),technicalProof]}},
  {kind:'product_link' as const,sourceId:store.localId(test.id),predicate:'verifies',targetId:store.localId(ticket.id)}
 ]};
 const preview=await store.withTestArtifactWrite(test.id,()=>engine.previewChange(request));
 if(preview.blocked)throw Error(preview.blockReason);
 return {status:'review' as const,specification,technicalProof,preview,fingerprint:preview.fingerprint};
}

export async function applyTestBinding(store:WorkflowStore,specification:TestBindingSpecification,fingerprint:string,decision:'accept'|'reject'|'cancel',apply:(preview:ChangePreview)=>Promise<ChangeApplyResult>){
 if(decision!=='accept')return {status:decision==='reject'?'rejected':'cancelled'};
 store.assertCanWrite();
 if(!store.canReviewProduct(fingerprint))return {status:'review_required',fingerprint};
 const current=await prepareTestBinding(store,specification);
 if(current.fingerprint!==fingerprint)throw Error('Stale technical test binding. Review the current source and revisions.');
 const result=await store.withTestArtifactWrite(specification.testId,()=>apply(current.preview));
 if(!result.ok)throw Error(result.error??'Technical binding failed.');
 return {status:'bound',testId:specification.testId,fingerprint};
}

/** Revalidate accepted meaning without confusing execution-version updates with authored changes. */
export async function readTechnicalProof(store:WorkflowStore,ticketId:string):Promise<TechnicalProof|null>{
 const bindings:TechnicalProof[]=[];
 for(const edge of await store.getIncoming(ticketId,'verifies')){
  const test=await store.getEntity<TestNode>(edge.sourceId,TestNode.dcr);
  for(const proof of test?.technicalProofs??[])
   if(proof.ticketId===store.localId(ticketId))bindings.push(TechnicalProofSchema.parse(proof));
 }
 if(bindings.length>1)throw Error('Conflicting technical test bindings.');
 const proof=bindings[0];
 if(!proof)return null;
 const ticket=await store.getEntity<Ticket>(ticketId,Ticket.dcr);
 if(!ticket||proof.basisHash!==await ticketVerificationSignature(store,ticket))throw Error('Stale technical binding: Ticket or governance changed.');
 for(const scope of proof.scopes){
  const current=await scopeSnapshot(store,scope);
  if(current.testId!==scope.testId||current.filePath!==scope.filePath||canonical(current.hashes)!==canonical(scope.hashes))
   throw Error('Stale technical binding: source or TestNode changed in '+scope.id);
 }
 return proof;
}

/** A bounded view of the real dossier; every source and test identity belongs to this scope's project. */
export async function technicalScopeContext(store:WorkflowStore,dossier:TicketDossier,scope:TechnicalProof['scopes'][number]){
 const files:Array<import('../verification-context.ts').VerificationFileContext & {projectRoot:string}>=[];
 const evidenceIds:string[]=[];
 for(const root of new Set([scope.projectRoot,...scope.sources.map(source=>source.projectRoot??scope.projectRoot)])){
  const context=await withProofProject(store,root,async owner=>{
   await ensureAstFresh(owner,owner.root);
   const symbols=await owner.listEntities<SymbolNode>(SymbolNode.dcr);
   const evidence:TicketDossier['evidence']=[];
   for(const source of scope.sources.filter(source=>(source.projectRoot??scope.projectRoot)===root)){
    if(source.symbolName){
     const symbol=symbols.find(item=>item.filePath===source.filePath&&
      (item.containerName?item.containerName+'.'+item.title:item.title)===source.symbolName&&item.status!=='deprecated');
     if(!symbol)throw Error('Missing exact technical proof symbol '+source.symbolName);
     evidence.push({id:owner.localId(symbol.id),kind:'SymbolNode',title:symbol.title!,filePath:source.filePath,
      symbolName:symbol.title,containerName:symbol.containerName,mandatory:true,provenance:'Reviewed technical scope'});
    }else evidence.push({id:source.filePath,kind:'FileNode',title:source.filePath,filePath:source.filePath,mandatory:true,provenance:'Reviewed technical scope'});
   }
   const tests=[];
   if(root===scope.projectRoot){
    evidence.push({id:scope.testId,kind:'TestNode',title:scope.testId,filePath:scope.filePath,mandatory:true,provenance:'Ticket verifies'});
    tests.push((await owner.getEntity<TestNode>(scope.testId,TestNode.dcr))!);
   }
   const scoped={...dossier,ticket:{...dossier.ticket,acceptanceCriteria:scope.criteria},evidence,scope:undefined};
   const context=await buildVerificationContext(owner,owner.root,{dossier:scoped,files:[],testNodes:tests});
   evidenceIds.push(...evidence.map(item=>root===store.root?item.id:root+'::'+item.id));
   return context;
  });
  const supplied=context.files.map(file=>({...file,file:root===store.root?file.file:root+'::'+file.file,projectRoot:root}));
  files.push(...supplied);evidenceIds.push(...supplied.map(file=>file.file));
 }
 const characters=JSON.stringify(files).length;
 if(characters>DEFAULT_VERIFICATION_CONTEXT_CHARS)throw Error('Technical scope exceeds '+DEFAULT_VERIFICATION_CONTEXT_CHARS+' characters ('+characters+').');
 return {files,characters,evidenceIds};
}

/** Completion/reuse must re-read owner evidence; stored review verdicts alone never qualify. */
export async function assertTechnicalExecutions(store:WorkflowStore,proof:TechnicalProof){
 for(const scope of proof.scopes)await withProofProject(store,scope.projectRoot,async owner=>{
  const evidence=(await currentTestEvidence(owner,[scope.testId]))[0];
  if(!evidence?.passed)throw Error('Missing, failing or stale technical execution: '+scope.id);
 });
}

/** Match every independently assessed scope to current accepted meaning and real owner execution. */
export async function assertTechnicalReviews(store:WorkflowStore,ticketId:string,acceptance:import('../ticket-operation-types.ts').AcceptanceVerification){
 const proof=await readTechnicalProof(store,ticketId);
 const reviews=acceptance.scopeReviews??[];
 if(!proof){if(reviews.length)throw Error('Technical reviews have no current authored binding.');return;}
 if(reviews.length!==proof.scopes.length)throw Error('Missing independently assessed technical scope.');
 for(const scope of proof.scopes){
  const matches=reviews.filter(review=>review.id===scope.id);
  const review=matches[0];
  if(matches.length!==1||review.bindingHash!==computeHash(proof)||review.projectRoot!==scope.projectRoot||review.testId!==scope.testId||
   canonical(review.hashes)!==canonical(scope.hashes)||scope.criteria.some(criterion=>!review.assessment.criteria.some(check=>check.criterion===criterion&&check.passed)))
   throw Error('Missing, stale or inconclusive technical scope: '+scope.id);
  await withProofProject(store,scope.projectRoot,async owner=>{
   const execution=(await currentTestEvidence(owner,[scope.testId]))[0];
   if(!execution?.passed||execution.lastRun!==review.execution.lastRun||canonical(execution.hashes)!==canonical(review.execution.hashes))
    throw Error('Missing, changed or failing technical execution: '+scope.id);
  });
 }
}


