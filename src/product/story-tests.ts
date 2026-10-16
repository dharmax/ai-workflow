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
import {testArtifactId,normalizeTestPath} from '../graph/test-artifacts.ts';

export const StoryTestSpecificationSchema=z.object({
  storyId:z.string().min(1),
  filePath:z.string().regex(/\.test\.ts$/),fixturePath:z.string().min(1),
  interfaceName:z.string().regex(/^[A-Za-z_$][\w$]*$/),
  body:z.string().min(1)
}).strict();
export type StoryTestSpecification=z.infer<typeof StoryTestSpecificationSchema>;

/** Materialized is a source fact, never an execution or satisfaction claim. */
export async function storyTestStatus(store:WorkflowStore,storyId:string) {
  const story=await store.getEntity<UserStory>(storyId,UserStory.dcr);
  if(!story) throw new Error('Story not found.');
  const tests=[];
  for(const edge of await store.getIncoming(story.id,'verifies')) {
    const test=await store.getEntity<TestNode>(edge.sourceId,TestNode.dcr);
    if(!test?.testSourceHash||!test.filePath||!test.fixturePath) continue;
    let materialized=false;
    try {
      materialized=test.storyVersion===story.version
        &&computeHash(fs.readFileSync(path.join(store.root,workspacePath(store.root,test.filePath)),'utf8'))===test.testSourceHash
        &&computeHash(fs.readFileSync(path.join(store.root,workspacePath(store.root,test.fixturePath)),'utf8'))===test.fixtureHash;
    } catch { /* Missing or escaped sources are uncovered. */ }
    tests.push({id:store.localId(test.id),filePath:test.filePath,state:materialized?test.testState:'uncovered',materialized});
  }
  return {status:tests.some(test=>test.materialized)?'materialized':'uncovered',tests};
}

/** Refuse new implementation without the reviewed executable Story contract. S5 owns activation/execution. */
export async function requireStoryTests(store:WorkflowStore,ticket:Ticket) {
  for(const edge of await store.getOutgoing(ticket.id,'addresses')) {
    const story=await store.getEntity<UserStory>(edge.targetId,UserStory.dcr);
    if(!story || (story as UserStory & {status:string}).status!=='accepted' || story.definitionReview.status!=='complete') continue;
    const coverage=await storyTestStatus(store,store.localId(story.id));
    if(coverage.status==='uncovered') throw new Error('Story '+store.localId(story.id)+' is uncovered. Review and materialize its public-interface test before implementation.');
    if(!coverage.tests.some(test=>test.materialized&&test.state==='not-run')) throw new Error('Activate the materialized Story test before implementation (S5).');
  }
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
  for(const aspect of await applicableAspects(story,store))
    basis.push({id:store.localId(aspect.id),entityType:aspect.typeName(),version:aspect.version});
  const testState=started?'not-run' as const:'skipped' as const;
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
      storyVersion:story.version,testState,testSourceHash,fixtureHash}},
    {kind:'product_link',sourceId:spec.testId,predicate:'verifies',targetId:spec.storyId}
  ]};
  const linkPreview=await engine.previewChange(request);
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
    const linked=await apply(preview.linkPreview);
    if(!linked.ok) throw new Error(linked.error||'Canonical linking failed.');
    return {status:'linked',fileMaterialized:true,testState:preview.testState,testId};
  } catch(error) {
    try { fileMaterialized=computeHash(fs.readFileSync(path.join(store.root,specification.filePath),'utf8'))===computeHash(preview.content); } catch { fileMaterialized=false; }
    return {status:fileMaterialized?'file-created-unlinked':'uncovered',fileMaterialized,
      reason:String(error),recovery:'Preserve the file; prepare and review this same specification and identity again. No canonical test approval is claimed.'};
  }
}
