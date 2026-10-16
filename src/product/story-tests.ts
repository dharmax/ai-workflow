/** Reviewed Story-test derivation. Filesystem materialization and canonical linking are separate boundaries. */
import fs from 'node:fs';
import path from 'node:path';
import {parseIndexedFile} from '@dharmax/codebase-parser';
import {z} from 'zod';
import {UserStory,Ticket,TestNode} from '../graph/ontology.ts';
import type {WorkflowStore} from '../graph/store.ts';
import {CausalChangeEngine} from '../change/engine.ts';
import {workspacePath} from '../change/workspace-path.ts';
import {canonical,computeHash} from '../kb/canonical.ts';
import type {ChangeRequest,ChangePreview,ChangeApplyResult} from '../change/types.ts';
import {applicableAspects} from '../aspects.ts';
import {testArtifactId,normalizeTestPath,currentTestEvidence} from '../graph/test-artifacts.ts';

export const StoryTestSpecificationSchema=z.object({
  storyId:z.string().min(1),
  filePath:z.string().regex(/\.test\.ts$/),fixturePath:z.string().min(1),
  interfaceName:z.string().regex(/^[A-Za-z_$][\w$]*$/),
  body:z.string().min(1)
}).strict();
export type StoryTestSpecification=z.infer<typeof StoryTestSpecificationSchema>;

type StoryTestState = 'skipped' | 'not-run' | 'expected-red' | 'green' | 'blocked' | 'stale' | 'uncovered';

async function storyTestBasis(store:WorkflowStore,story:UserStory) {
  const aspects=await applicableAspects(story,store);
  const revisions=aspects.map(aspect=>({id:store.localId(aspect.id),version:aspect.version})).sort((a,b)=>a.id.localeCompare(b.id));
  return {aspects,hash:computeHash(canonical({story:{id:store.localId(story.id),version:story.version},aspects:revisions}))};
}

async function inspectStoryTest(store:WorkflowStore,story:UserStory,test:TestNode) {
  if(!test.filePath||!test.fixturePath||!test.testSourceHash||!test.fixtureHash||!test.storyVersion||!test.storyBasisHash)
    return {state:'uncovered' as const,materialized:false,reason:'Test source has no complete reviewed Story basis.'};
  try {
    const testPath=workspacePath(store.root,test.filePath),fixturePath=workspacePath(store.root,test.fixturePath);
    const testFile=path.join(store.root,testPath),fixture=path.join(store.root,fixturePath);
    if(!fs.existsSync(testFile)||!fs.existsSync(fixture))
      return {state:'uncovered' as const,materialized:false,reason:'Reviewed test or public-interface fixture is missing.'};
    const source=fs.readFileSync(testFile,'utf8'),fixtureSource=fs.readFileSync(fixture,'utf8');
    if(computeHash(source)!==test.testSourceHash)
      return {state:'stale' as const,materialized:true,reason:'Story test source changed since review.'};
    if(test.storyVersion!==story.version)
      return {state:'stale' as const,materialized:true,reason:'Story revision changed since test review.'};
    const basis=await storyTestBasis(store,story);
    if(test.storyBasisHash!==basis.hash)
      return {state:'stale' as const,materialized:true,reason:'Story or applicable Aspect revision changed since test review.'};
    if(computeHash(fixtureSource)!==test.fixtureHash)
      return {state:'stale' as const,materialized:true,reason:'Public-interface fixture changed since the last reviewed or executed state.'};
    if(test.testState==='green'||test.testState==='expected-red') {
      const execution=(await currentTestEvidence(store,[test.id]))[0];
      if(!test.lastRun||!execution||canonical(execution.hashes)!==canonical(test.executionHashes))
        return {state:'stale' as const,materialized:true,reason:'Execution evidence no longer matches current test and source files.'};
      if(test.testState==='green'&&(!test.passed||!execution.passed))
        return {state:'blocked' as const,materialized:true,reason:'Green classification has no current passing execution evidence.'};
      if(test.testState==='expected-red'&&test.passed!==false)
        return {state:'blocked' as const,materialized:true,reason:'Expected-red classification has no current failing execution evidence.'};
    } else if(test.lastRun)
      return {state:'blocked' as const,materialized:true,reason:'Execution was recorded without a current Story-test classification.'};
    const state=(test.testState||'uncovered') as StoryTestState;
    const reason=test.testStateReason || (state==='skipped'?'Implementation has not started; this materialized test is intentionally skipped.':
      state==='not-run'?'Ticket started; run this active Story test before implementation.':'');
    return {state,materialized:true,reason};
  } catch(error) {
    return {state:'uncovered' as const,materialized:false,reason:'Cannot inspect reviewed Story test: '+String(error)};
  }
}

/** Materialized is a source fact; execution state is current only while its complete revision basis matches. */
export async function storyTestStatus(store:WorkflowStore,storyId:string) {
  const story=await store.getEntity<UserStory>(storyId,UserStory.dcr);
  if(!story) throw new Error('Story not found.');
  const tests=[];
  for(const edge of await store.getIncoming(story.id,'verifies')) {
    const test=await store.getEntity<TestNode>(edge.sourceId,TestNode.dcr);
    if(!test) continue;
    const result=await inspectStoryTest(store,story,test);
    tests.push({id:store.localId(test.id),filePath:test.filePath||test.targetPath||'',state:result.state,
      reason:result.reason,materialized:result.materialized,passed:test.passed===true,lastRun:test.lastRun||null});
  }
  return {status:tests.some(test=>test.materialized)?'materialized':'uncovered',
    state:tests.length===1?tests[0]!.state:tests.length?tests.map(test=>test.state):'uncovered',tests};
}

/** Activate the reviewed skipped source before the existing Ticket lane operation starts implementation. */
export async function activateStoryTestsForTicket(store:WorkflowStore,ticketId:string,apply:(preview:ChangePreview)=>Promise<ChangeApplyResult>) {
  const ticket=await store.getEntity<Ticket>(ticketId,Ticket.dcr);
  if(!ticket) throw new Error('Ticket not found.');
  const activated:string[]=[];
  for(const edge of await store.getOutgoing(ticket.id,'addresses')) {
    const story=await store.getEntity<UserStory>(edge.targetId,UserStory.dcr);
    if(!story || (story as UserStory & {status:string}).status!=='accepted' || story.definitionReview.status!=='complete') continue;
    const tests=[];
    for(const link of await store.getIncoming(story.id,'verifies')) {
      const test=await store.getEntity<TestNode>(link.sourceId,TestNode.dcr);
      if(test) tests.push(test);
    }
    if(!tests.length) throw new Error('Story '+store.localId(story.id)+' is uncovered. Review and materialize its public-interface test before implementation.');
    for(const test of tests) {
      const state=await inspectStoryTest(store,story,test);
      const filePath=workspacePath(store.root,test.filePath!),source=fs.readFileSync(path.join(store.root,filePath),'utf8');
      const recoveredSource=source.replace(/\bit\s*\(/,match=>match.replace('it','it.skip'));
      const basis=await storyTestBasis(store,story);
      const recovery=state.state==='stale'&&test.testState==='skipped'&&computeHash(recoveredSource)===test.testSourceHash
        &&test.storyVersion===story.version&&test.storyBasisHash===basis.hash&&computeHash(fs.readFileSync(path.join(store.root,workspacePath(store.root,test.fixturePath!)),'utf8'))===test.fixtureHash;
      if(!state.materialized||(state.state==='stale'&&!recovery)||state.state==='blocked'||state.state==='uncovered') throw new Error('Cannot activate Story test '+store.localId(test.id)+': '+state.state+' — '+state.reason);
      if(state.state==='skipped'||recovery) {
        if(!recovery) {
          const active=source.replace(/\bit\.skip\s*\(/g,'it(');
          if(active===source) throw new Error('Reviewed Story test skip marker is missing; preserve and review its source before activation.');
          const engine=new CausalChangeEngine({store,projectRoot:store.root});
          const preview=await engine.previewChange({action:'replace_text',filePath,oldText:source,newText:active});
          if(preview.blocked) throw new Error(preview.blockReason||'Guarded Story-test activation was blocked.');
          const result=await apply(preview);
          if(!result.ok) throw new Error((result.error||'Guarded Story-test activation failed.')+' The same TestNode can be reconciled by retrying the Ticket start.');
        }
      } else if(state.state!=='not-run') throw new Error('Story test must be skipped or not-run when Ticket work starts; found '+state.state+'.');
      const activeSource=fs.readFileSync(path.join(store.root,workspacePath(store.root,test.filePath!)),'utf8');
      const currentTest=await store.getEntity<TestNode>(test.id,TestNode.dcr);
      if(!currentTest) throw new Error('Activated Story-test identity disappeared; preserve the source and reconcile this same TestNode.');
      const engine=new CausalChangeEngine({store,projectRoot:store.root});
      const request:ChangeRequest={action:'product_change',basis:[{id:store.localId(currentTest.id),entityType:'TestNode',version:currentTest.version},{id:store.localId(story.id),entityType:'UserStory',version:story.version}],originalRequest:'Activate reviewed Story test for '+store.localId(story.id),mutations:[{kind:'product_update',entityType:'Test',id:store.localId(test.id),fields:{testState:'not-run',testStateReason:'Ticket started; run this active Story test before implementation.',testSourceHash:computeHash(activeSource),storyVersion:story.version,storyBasisHash:basis.hash}}]};
      const preview=await store.withTestArtifactWrite(test.id,()=>engine.previewChange(request));
      if(preview.blocked) throw new Error(preview.blockReason||'Canonical Story-test activation was blocked.');
      const result=await store.withTestArtifactWrite(test.id,()=>apply(preview));
      if(!result.ok) throw new Error(result.error||'Canonical Story-test activation failed after source activation. Reconcile the same Story and TestNode.');
      activated.push(store.localId(test.id));
    }
  }
  return {status:'activated',tests:activated};
}

/** Refuse implementation until every complete accepted Story has current expected-red or green execution evidence. */
export async function requireStoryTests(store:WorkflowStore,ticket:Ticket) {
  for(const edge of await store.getOutgoing(ticket.id,'addresses')) {
    const story=await store.getEntity<UserStory>(edge.targetId,UserStory.dcr);
    if(!story || (story as UserStory & {status:string}).status!=='accepted' || story.definitionReview.status!=='complete') continue;
    const coverage=await storyTestStatus(store,store.localId(story.id));
    if(coverage.status==='uncovered') throw new Error('Story '+store.localId(story.id)+' is uncovered. Review and materialize its public-interface test before implementation.');
    if(!coverage.tests.some(test=>test.materialized&&(test.state==='expected-red'||test.state==='green'))) throw new Error('Run the active Story test and establish current expected-red or green evidence before implementation (S5).');
  }
}

/** Run the existing targeted runner and classify only current public-interface assertion failures as expected red. */
export async function runStoryTest(store:WorkflowStore,storyId:string,run:(command:string)=>Promise<unknown>,apply:(preview:ChangePreview)=>Promise<ChangeApplyResult>) {
  store.assertCanWrite();
  const story=await store.getEntity<UserStory>(storyId,UserStory.dcr);
  if(!story || (story as UserStory & {status:string}).status!=='accepted' || story.definitionReview.status!=='complete') throw new Error('Only a complete accepted Story can run its Story test.');
  const tests=[];
  for(const edge of await store.getIncoming(story.id,'verifies')) {
    const test=await store.getEntity<TestNode>(edge.sourceId,TestNode.dcr);
    if(test) tests.push(test);
  }
  if(tests.length!==1) throw new Error(tests.length?'Story test selection is ambiguous.':'Story is uncovered; materialize its reviewed public-interface test first.');
  const test=tests[0]!;
  const ticketEdges=await store.getIncoming(story.id,'addresses');
  let active=false;
  for(const edge of ticketEdges) {
    const ticket=await store.getEntity<Ticket>(edge.sourceId,Ticket.dcr);
    if(ticket?.lane==='In Progress') active=true;
  }
  if(!active) throw new Error('Start an authorized Ticket to activate this Story test before running it.');
  if(test.testState==='skipped') throw new Error('Story test is skipped because implementation has not started.');
  const sourcePath=workspacePath(store.root,test.filePath||test.targetPath||'');
  const source=fs.readFileSync(path.join(store.root,sourcePath),'utf8');
  if(computeHash(source)!==test.testSourceHash) throw new Error('Story test source changed since review; review and materialize it again.');
  if(test.storyVersion!==story.version) throw new Error('Story revision changed since test review.');
  const basis=await storyTestBasis(store,story);
  if(test.storyBasisHash!==basis.hash) throw new Error('Story or applicable Aspect revision changed since test review.');
  const fixturePath=workspacePath(store.root,test.fixturePath||'');
  const fixture=fs.readFileSync(path.join(store.root,fixturePath),'utf8');
  const fixtureHash=computeHash(fixture);
  const previousRun=test.lastRun;
  await run((test.command||['bun','test',sourcePath]).join(' '));
  const current=await store.getEntity<TestNode>(test.id,TestNode.dcr);
  if(!current?.lastRun||current.lastRun===previousRun) throw new Error('The existing test runner did not persist new execution evidence; result is unknown.');
  const expectedAssertion=/error:\s*expect\(|Expected:|expect\(received\)/i.test(current.output||'');
  const state=current.passed===true?'green':current.passed===false&&fixtureHash===test.fixtureHash&&expectedAssertion?'expected-red':'blocked';
  const reason=state==='green'?'Existing Bun runner passed the active public-interface Story test.':state==='expected-red'?'Current reviewed fixture failed a test assertion before implementation.':current.passed===false?'Test failed without attributable product assertion evidence; fixture, syntax, infrastructure or runner failure is blocked.':'Runner outcome is unknown.';
  const engine=new CausalChangeEngine({store,projectRoot:store.root});
  const request:ChangeRequest={action:'product_change',basis:[{id:store.localId(current.id),entityType:'TestNode',version:current.version},{id:store.localId(story.id),entityType:'UserStory',version:story.version}],originalRequest:'Classify current Story-test execution for '+store.localId(story.id),mutations:[{kind:'product_update',entityType:'Test',id:store.localId(current.id),fields:{testState:state,testStateReason:reason,testSourceHash:computeHash(source),fixtureHash,storyVersion:story.version,storyBasisHash:basis.hash}}]};
  const preview=await store.withTestArtifactWrite(current.id,()=>engine.previewChange(request));
  if(preview.blocked) return {status:'blocked',reason:'Execution was recorded but classification could not be applied: '+preview.blockReason,testId:store.localId(current.id),lastRun:current.lastRun};
  const applied=await store.withTestArtifactWrite(current.id,()=>apply(preview));
  if(!applied.ok) return {status:'blocked',reason:'Execution was recorded but canonical classification failed: '+(applied.error||'unknown apply failure'),testId:store.localId(current.id),lastRun:current.lastRun};
  return {status:state,reason,testId:store.localId(current.id),lastRun:current.lastRun,passed:current.passed===true,output:current.output||''};
}

/** Inspect the actual fixture without importing/executing user code during preview. */
export async function prepareStoryTest(store:WorkflowStore,specification:StoryTestSpecification) {
  const supplied=StoryTestSpecificationSchema.parse(specification);
  const spec={...supplied,testId:testArtifactId(normalizeTestPath(supplied.filePath))};
  const story=await store.getEntity<UserStory>(spec.storyId,UserStory.dcr);
  if(!story || (story as UserStory & {status:string}).status!=='accepted' || story.definitionReview.status!=='complete')
    return {status:'uncovered' as const,reason:'Review and accept a complete Story scenario first.'};
  const fixturePath=workspacePath(store.root,spec.fixturePath),filePath=workspacePath(store.root,spec.filePath);
  const absoluteFixture=path.join(store.root,fixturePath),absoluteTest=path.join(store.root,filePath);
  if(!fs.existsSync(absoluteFixture)||!fs.statSync(absoluteFixture).isFile())
    return {status:'uncovered' as const,reason:'Missing executable public-interface fixture: '+fixturePath};
  if(fixturePath===filePath) throw new Error('A test cannot be its own public-interface fixture.');
  const fixture=fs.readFileSync(absoluteFixture,'utf8');
  const transpiler=new Bun.Transpiler({loader:'ts'});
  const exported=transpiler.scan(fixture).exports.includes(spec.interfaceName);
  if(!exported) return {status:'uncovered' as const,reason:'Unknown public interface '+spec.interfaceName+' in '+fixturePath};
  try {
    const fixtureBuild=await Bun.build({entrypoints:[absoluteFixture],target:'bun'});
    if(!fixtureBuild.success) return {status:'uncovered' as const,reason:'Fixture is not executable: '+fixtureBuild.logs.map(log=>log.message).join('; ')};
  } catch(error) {
    return {status:'uncovered' as const,reason:'Fixture is not executable: '+String(error)};
  }
  const basis=[{id:spec.storyId,entityType:story.typeName(),version:story.version}];
  const currentBasis=await storyTestBasis(store,story);
  let started=false;
  for(const edge of await store.getIncoming(story.id,'verifies')) {
    const test=await store.getEntity<TestNode>(edge.sourceId,TestNode.dcr);
    if(test?.testState==='not-run'||test?.lastRun) started=true;
  }
  for(const edge of await store.getIncoming(story.id,'addresses')) {
    const ticket=await store.getEntity<Ticket>(edge.sourceId,Ticket.dcr);
    if(!ticket) continue;
    basis.push({id:store.localId(ticket.id),entityType:ticket.typeName(),version:ticket.version});
    if(['In Progress','Done'].includes(ticket.lane)) started=true;
  }
  for(const aspect of currentBasis.aspects)
    basis.push({id:store.localId(aspect.id),entityType:aspect.typeName(),version:aspect.version});
  const testState=started?'not-run' as const:'skipped' as const;
  const testStateReason=started?'Ticket work has started; run this active Story test before implementation.':'Implementation has not started; this materialized test is intentionally skipped.';
  let relative=path.relative(path.dirname(absoluteTest),absoluteFixture).split(path.sep).join('/');
  if(!relative.startsWith('.')) relative='./'+relative;
  const content="import {it,expect} from 'bun:test';\nimport {"+spec.interfaceName+" as subject} from "+JSON.stringify(relative)+";\n"+
    "it"+(started?"":".skip")+"("+JSON.stringify(story.title)+",async()=>{\n"+spec.body+"\n});\n";
  try { transpiler.transformSync(content); } catch(error) {
    return {status:'uncovered' as const,reason:'Malformed executable test: '+String(error)};
  }
  const parsed=parseIndexedFile({filePath,content});
  if(!parsed.facts.some(fact=>fact.predicate==='calls'&&fact.objectText==='subject') || !parsed.facts.some(fact=>fact.predicate==='calls'&&fact.objectText==='expect'))
    return {status:'uncovered' as const,reason:'Review a test that calls the public subject and asserts an observable result.'};
  const existing=await store.getEntity(spec.testId);
  if(existing && !(existing instanceof TestNode)) throw new Error('Test identity belongs to another entity.');
  const previous=existing as TestNode|null;
  if(previous) {
    const verifies=await store.getOutgoing(previous.id,'verifies');
    const authored=verifies.filter(edge=>(edge as {payload?:{state?:string}}).payload?.state!=='derived');
    if(previous.filePath!==filePath || (authored.length&&!authored.some(edge=>edge.targetId===story.id)))
      throw new Error('Indexed test identity is already assigned to another Story or file.');
    basis.push({id:spec.testId,entityType:previous.typeName(),version:previous.version});
  }
  const current=fs.existsSync(absoluteTest)?fs.readFileSync(absoluteTest,'utf8'):undefined;
  if(current!==undefined && current!==content && (!previous?.testSourceHash || computeHash(current)!==previous.testSourceHash))
    throw new Error('Test file contains unattributed changes. Preserve and review them first.');
  const engine=new CausalChangeEngine({store,projectRoot:store.root});
  let sourcePreview:ChangePreview|undefined;
  if(current!==content) {
    const request:ChangeRequest=current===undefined?{action:'create_file',filePath,content,productContextEntityId:spec.storyId}
      :{action:'replace_text',filePath,oldText:current,newText:content};
    sourcePreview=await engine.previewChange(request);
    if(sourcePreview.blocked) return {status:'uncovered' as const,reason:sourcePreview.blockReason};
  }
  const fixtureHash=computeHash(fixture),testSourceHash=computeHash(content);
  const request:ChangeRequest={action:'product_change',basis,originalRequest:'Developer-reviewed executable Story test for '+spec.storyId,mutations:[
    {kind:previous?'product_update':'product_create',entityType:'Test',id:spec.testId,fields:{
      title:story.title,filePath,framework:'bun',command:['bun','test',filePath],fixturePath,interfaceName:spec.interfaceName,
      storyVersion:story.version,testState,testStateReason,testSourceHash,fixtureHash,storyBasisHash:currentBasis.hash}},
    {kind:'product_link',sourceId:spec.testId,predicate:'verifies',targetId:spec.storyId}
  ]};
  const linkPreview=await store.withTestArtifactWrite(spec.testId,()=>engine.previewChange(request));
  if(linkPreview.blocked) return {status:'uncovered' as const,reason:linkPreview.blockReason};
  return {status:'review' as const,specification:supplied,content,testState,fixtureHash,sourcePreview,linkPreview,
    fingerprint:computeHash(canonical({spec,source:sourcePreview?.fingerprint,link:linkPreview.fingerprint,testSourceHash,fixtureHash}))};
}

/** No rollback fiction: preserve an applied source file and report an unlinked partial outcome for reviewed recovery. */
export async function applyStoryTest(
  store:WorkflowStore,specification:StoryTestSpecification,fingerprint:string,decision:'accept'|'reject'|'cancel',
  apply:(preview:ChangePreview)=>Promise<ChangeApplyResult>
) {
  if(decision!=='accept') return {status:decision==='reject'?'rejected':'cancelled',fileMaterialized:false};
  store.assertCanWrite();
  const testId=testArtifactId(normalizeTestPath(specification.filePath));
  const preview=await prepareStoryTest(store,specification);
  if(preview.status!=='review') return preview;
  if(preview.fingerprint!==fingerprint) throw new Error('Stale Story test review. Prepare and review again.');
  let fileMaterialized=!preview.sourcePreview;
  try {
    if(preview.sourcePreview) {
      const source=await apply(preview.sourcePreview);
      fileMaterialized=fs.existsSync(path.join(store.root,specification.filePath));
      if(!source.ok) throw new Error(source.error||'Guarded source application failed.');
      // Causal indexing creates the canonical path-keyed TestNode during file materialization.
      if(await store.getEntity(testId,TestNode.dcr)) return {status:'file-created-unlinked',fileMaterialized:true,
        reason:'The guarded file is indexed. Review its fresh canonical TestNode link before approval.',
        recovery:'Prepare and review this same Story test again; the existing TestNode identity will be reused.'};
    }
    if(computeHash(fs.readFileSync(path.join(store.root,specification.filePath),'utf8'))!==computeHash(preview.content)
      ||computeHash(fs.readFileSync(path.join(store.root,specification.fixturePath),'utf8'))!==preview.fixtureHash)
      throw new Error('Source or fixture changed before canonical linking.');
    const linked=await store.withTestArtifactWrite(testId,()=>apply(preview.linkPreview));
    if(!linked.ok) throw new Error(linked.error||'Canonical linking failed.');
    return {status:'linked',fileMaterialized:true,testState:preview.testState,testId};
  } catch(error) {
    try { fileMaterialized=computeHash(fs.readFileSync(path.join(store.root,specification.filePath),'utf8'))===computeHash(preview.content); } catch { fileMaterialized=false; }
    return {status:fileMaterialized?'file-created-unlinked':'uncovered',fileMaterialized,
      reason:String(error),recovery:'Preserve the file; prepare and review this same specification and identity again. No canonical test approval is claimed.'};
  }
}
