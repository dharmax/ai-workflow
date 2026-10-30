/** Real multi-file refactoring fixture, shared by deterministic regression and live acceptance replay. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WorkflowStore} from '../../src/graph/store.ts';
import {FileNode, SymbolNode, Ticket} from '../../src/model/ontology.ts';
import {ensureAstFresh} from '../../src/graph/indexer.ts';
import {initializeTools, commandRegistry} from '../../src/tools/index.ts';
import {buildSourceScope} from '../../src/ticket/source-scope.ts';
import type {ChangeRequest} from '../../src/change/types.ts';
import {acceptProduct} from '../product-review.ts';

const policySource = 'export interface RetryPolicy { waitSeconds: number }\n';
export const migrationFiles: Record<string, string> = {
  '.gitignore': 'node_modules\n.ai-workflow\n',
  'package.json': JSON.stringify({scripts:{typecheck:'tsc --noEmit'}}),
  'tsconfig.json': JSON.stringify({compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
    strict: true, noEmit: true, allowImportingTsExtensions: true, types: ['bun']}, include: ['src/**/*.ts', 'tests/**/*.ts']}),
  'src/policy.ts': policySource,
  'src/consumer.ts': String.raw`import type {RetryPolicy} from './policy.ts';
export function delays(policy: RetryPolicy, optional?: RetryPolicy) {
  const {waitSeconds: seconds} = policy;
  return [seconds * 1000, (optional?.waitSeconds ?? 0) * 1000, policy["wait\u0053econds"] * 1000];
}
`,
  'src/barrel.ts': "export type {RetryPolicy} from './policy.ts';\n",
  'src/escaped.ts': String.raw`import type {RetryPolicy} from './barrel.ts';
export function escaped(policy: RetryPolicy) { return policy["wait\u0053econds"] * 1000; }
`,
  'src/schema.ts': "import {z} from 'zod';\nexport const policySchema = z.object({waitSeconds: z.number().nonnegative()}).strict();\n",
  'src/config.ts': "import {readFileSync} from 'node:fs';\nimport {policySchema} from './schema.ts';\nimport type {RetryPolicy} from './policy.ts';\nexport function loadPolicy(): RetryPolicy { return policySchema.parse(JSON.parse(readFileSync(new URL('../settings/retry.cfg', import.meta.url), 'utf8'))) as RetryPolicy; }\n",
  'src/serialization.ts': "import type {RetryPolicy} from './policy.ts';\nconst wireKey = 'waitSeconds';\nexport function serialize(policy: RetryPolicy) { return JSON.stringify({[wireKey]: policy.waitSeconds}); }\n",
  'settings/retry.cfg': '{"waitSeconds":3}\n',
  'fixtures/wire-example.cfg': '{"waitSeconds":3}\n',
  'notes/decoy.txt': 'waitSeconds is an old name discussed here, not an active field contract.\n',
  'tests/policy.test.ts': `import {test, expect} from 'bun:test';
import {loadPolicy} from '../src/config.ts';
import {delays} from '../src/consumer.ts';
import {escaped} from '../src/escaped.ts';
import {policySchema} from '../src/schema.ts';
import {serialize} from '../src/serialization.ts';
test('millisecond field contract reaches configuration, consumers and wire format', () => {
  const policy = loadPolicy();
  expect(policy.delayMs).toBe(3000);
  expect(delays(policy, policy)).toEqual([3000, 3000, 3000]);
  expect(delays(policy)).toEqual([3000, 0, 3000]);
  expect(escaped(policy)).toBe(3000);
  expect(JSON.parse(serialize(policy))).toEqual({delayMs:3000});
});
test('legacy input is rejected rather than silently accepted', () => {
  expect(policySchema.safeParse({waitSeconds:3}).success).toBe(false);
});
`
};

export interface MigrationFixture {
  root: string;
  store: WorkflowStore;
  ticket: Ticket;
  context: {store: WorkflowStore; projectRoot: string; executionAuthority: 'project-write'};
}

export function runFixtureCommand(root: string, command: string[]) {
  const result = Bun.spawnSync(command, {cwd: root, stdout: 'pipe', stderr: 'pipe'});
  return {command, exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString()};
}

export async function createMigrationFixture(): Promise<MigrationFixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-field-contract-'));
  for (const [file, content] of Object.entries(migrationFiles)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), content);
  }
  fs.symlinkSync(path.resolve(import.meta.dir, '../../node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const command of [['git','init','-q'], ['git','add','.'], ['git','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','accepted field migration baseline']]) {
    const result = runFixtureCommand(root, command);
    if (result.exitCode !== 0) throw Error(result.output);
  }
  const store = new WorkflowStore(root);
  initializeTools();
  const context = {store, projectRoot: root, executionAuthority: 'project-write' as const};
  await commandRegistry.execute('create_ticket', {id:'FIELD-MIGRATION',kind:'task',title:'Migrate RetryPolicy.waitSeconds to delayMs',
    body:'Technical field-contract migration authorized by the Issue 6 demonstration: rename `RetryPolicy.waitSeconds` to `delayMs`, convert seconds to milliseconds, update consumers, schemas, wire key, configuration and example; preserve the genuine tests. Discover `waitSeconds` in semantic and literal contracts. Text-only decoys and negative assertions are not active legacy contracts.',
    lane:'Todo',priority:0,acceptanceCriteria:[
      'The delayMs number contract uses milliseconds consistently in configuration, destructured, optional and escaped consumers and serialization.',
      'The unchanged public tests pass and reject the legacy input; typecheck passes.',
      'Semantic references and literal schema/config occurrences are distinguished; residual text is explained and no coverage certainty is fabricated.'
    ]}, context);
  return {root,store,ticket:(await store.getEntity<Ticket>('FIELD-MIGRATION',Ticket.dcr))!,context};
}

export async function discoverMigrationImpact(fixture: MigrationFixture) {
  const {root,store,context} = fixture;
  const semantic = await commandRegistry.execute('get_exact_references', {filePath:'src/policy.ts',line:0,
    character:policySource.indexOf('waitSeconds')}, context);
  const references = semantic.references.map((reference:{uri:string}) => path.relative(root,fileURLToPath(reference.uri)));
  const text = await commandRegistry.execute('search_workspace_text', {text:'waitSeconds',limit:100}, context);
  return {semantic, references:[...new Set<string>(references)], text};
}

export async function authorizeMigration(fixture: MigrationFixture) {
  const {root,store,ticket} = fixture;
  await ensureAstFresh(store, root);
  const files = Object.keys(migrationFiles).filter(file => file.startsWith('src/') || file.endsWith('.cfg'));
  for (const file of files.filter(file => file.startsWith('src/'))) {
    const target = (await store.getEntity<FileNode>(file,FileNode.dcr))!;
    await store.relate(ticket, 'modifies', target);
  }
  const claim = await store.claimTicket('FIELD-MIGRATION','migration-host',30,false);
  if (!claim.success) throw Error(claim.message);
  const dossier = await ticket.investigate(store,{mandatoryEvidenceOnly:true});
  if (dossier.status !== 'complete') throw Error(JSON.stringify(dossier));
  const scope = await buildSourceScope(store,ticket,dossier.value,{authorizedFiles:files});
  const admission = await store.admitGovernance('governed');
  try {await store.saveGovernedScope('FIELD-MIGRATION',claim.claim!,admission,scope);}
  finally {await store.releaseGovernance(admission);}
  const structural = await commandRegistry.execute('analyze_blast_radius',{target:'src/policy.ts'},fixture.context);
  const escaped = await commandRegistry.execute('search_workspace_text',{text:String.raw`wait\u0053econds`,limit:100},fixture.context);
  return {files,dossier:dossier.value,structural,escaped};
}

export async function guardedMigrationChange(fixture: MigrationFixture, request: ChangeRequest) {
  const options = {ticketId:'FIELD-MIGRATION',agentId:'migration-host'};
  const preview = await commandRegistry.execute('preview_change',{...request,...options},fixture.context);
  if (preview.blocked) throw Error(preview.blockReason);
  const result = await commandRegistry.execute('apply_change',{request,fingerprint:preview.fingerprint,...options},fixture.context);
  if (!result.ok) throw Error(JSON.stringify(result));
  return {preview,result};
}

export async function executeFieldMigration(fixture: MigrationFixture) {
  const rename = await guardedMigrationChange(fixture,{action:'rename_symbol',target:{type:'position',filePath:'src/policy.ts',
    line:0,character:policySource.indexOf('waitSeconds')},newName:'delayMs'});
  const changes = migrationContractChanges(fixture);
  const contracts = await guardedMigrationChange(fixture,{action:'source_change',changes});
  const after = await commandRegistry.execute('search_workspace_text',{text:'waitSeconds',limit:100},fixture.context);
  const properties = await fixture.store.listEntities<SymbolNode>(SymbolNode.dcr,{title:'delayMs',filePath:'src/policy.ts'});
  return {rename,contracts,after,properties};
}

/** Fixture-local meaning authorized by Issue 6; the real project's charter is untouched. */
export async function acceptMigrationStory(fixture: MigrationFixture) {
  await acceptProduct(fixture.store,[
    {kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{
      title:'Retry policy fixture',purpose:'Load and use a consistent millisecond retry policy',actors:['Application developer'],
      scope:'Retry policy configuration, consumers and serialization',nonGoals:['Scheduling retries or external services'],
      bounds:'Isolated Issue 6 migration fixture; strict configuration and millisecond units',status:'accepted'}},
    {kind:'product_create',entityType:'Feature',id:'RETRY-POLICY',fields:{
      title:'Millisecond retry policy',body:'Expose a strict retry policy consistently in milliseconds across configuration, consumers and wire format.',status:'accepted'}},
    {kind:'product_create',entityType:'UserStory',id:'LOAD-POLICY',fields:{
      title:'Load the configured retry delay in milliseconds',actor:'Application developer',
      intent:'Obtain a retry delay in milliseconds without implicit unit conversion by callers',
      initialState:'The repository has a retry configuration representing a three-second delay; a public loadPolicy operation reads and validates it.',
      action:'Call the public loadPolicy operation to load the configured retry policy.',
      expectedResult:'Return exactly {delayMs:3000}, a numeric millisecond delay with no legacy waitSeconds field. Keep strict configuration validation. Configuration, consumer and wire-format contracts must agree on milliseconds.',status:'accepted'}},
    {kind:'product_link',sourceId:'PRODUCT',predicate:'contains',targetId:'RETRY-POLICY'},
    {kind:'product_link',sourceId:'RETRY-POLICY',predicate:'enables',targetId:'LOAD-POLICY'},
    {kind:'product_link',sourceId:'FIELD-MIGRATION',predicate:'addresses',targetId:'LOAD-POLICY'}
  ]);
}

export const migrationStoryTest = {
  storyId:'LOAD-POLICY',filePath:'tests/load-policy.test.ts',fixturePath:'src/config.ts',interfaceName:'loadPolicy',
  body:'const policy = subject();\nexpect(policy).toEqual({delayMs:3000});'
};

/** Use the existing two-boundary recovery when source indexing precedes canonical linking. */
export async function reviewMigrationStoryTest(fixture: MigrationFixture) {
  const reviews=[];
  for(let attempt=0;attempt<2;attempt++) {
    const preview=await commandRegistry.execute('prepare_story_test',{specification:migrationStoryTest},fixture.context);
    if(preview.status!=='review') throw Error(JSON.stringify(preview));
    const result=await fixture.store.withExecutionContext('project-write',undefined,()=>
      commandRegistry.execute('apply_story_test',{specification:migrationStoryTest,fingerprint:preview.fingerprint,decision:'accept'},fixture.context),preview.fingerprint);
    reviews.push({preview,result});
    if(result.status==='linked') return reviews;
    if(result.status!=='file-created-unlinked') throw Error(JSON.stringify(result));
  }
  throw Error('Story-test recovery did not link the existing identity.');
}

/** Exact contract replacements, reused after semantic rename or by Ticket.resolve. */
export function migrationContractChanges(fixture: MigrationFixture) {
  const changes: Array<{action:'replace_text';filePath:string;oldText:string;newText:string}> = [];
  for (const filePath of Object.keys(migrationFiles).filter(file => file.startsWith('src/') || file.endsWith('.cfg'))) {
    const oldText = fs.readFileSync(path.join(fixture.root,filePath),'utf8');
    const newText = filePath.endsWith('.cfg') ? '{"delayMs":3000}\n'
      : oldText.replaceAll('waitSeconds','delayMs').replaceAll(String.raw`wait\u0053econds`,'delayMs').replaceAll(' * 1000','');
    if (newText !== oldText) changes.push({action:'replace_text',filePath,oldText,newText});
  }
  return changes;
}
