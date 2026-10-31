import { formatOutput } from '../src/ui/result-view.ts';
import { testEvidenceHashes } from '../src/graph/test-artifacts.ts';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, FileNode, TestNode } from '../src/model/ontology.ts';
import { initializeTools, commandRegistry } from '../src/tools/index.ts';
import { recordTicketEvent } from '../src/services/journal-service.ts';
import { parseCommand } from '../src/artifact-command.ts';
import { buildEntityView, saveEntityView } from '../src/ui/entity-view.ts';
import { processShellInput } from '../src/shell.ts';

let root: string, store: WorkflowStore;
const cli = path.resolve(import.meta.dir, '../src/cli.ts');
const prose = 'First paragraph.\n\n  Indented detail is meaningful.\nLast paragraph.';
const criteria = ['Preserve a criterion\nwith its continuation.', 'Keep the complete description.'];
const run = (...args: string[]) => {
  const p = Bun.spawnSync(['bun', cli, ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-human-output-'));
  store = new WorkflowStore(root);
  initializeTools();
  await store.upsertEntity(Ticket.dcr, {
    id: 'T',
    title: 'Readable work',
    body: prose,
    lane: 'Todo',
    priority: 0,
    kind: 'task',
    acceptanceCriteria: criteria,
  });
  for (let i = 0; i < 28; i++) {
    const file = 'src/example-' + String(i).padStart(2, '0') + '.ts';
    await store.upsertEntity(FileNode.dcr, { id: file, title: file, language: 'typescript' });
    await store.relate('T', 'modifies', file, { note: 'Relevant note ' + i });
  }
  await recordTicketEvent(store, {
    ticketId: 'T',
    kind: 'outcome',
    message: 'Current investigation is grounded in actual evidence.',
    references: ['src/example-00.ts'],
  });
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
it('shows useful Ticket information before semantic relationships without internal object dumps', () => {
  const r = run('ticket', 'show', 'T');
  expect(r.code, r.err).toBe(0);
  expect(r.out).toContain('Readable work');
  expect(r.out).toContain('Todo');
  expect(r.out).toContain('Priority');
  expect(r.out).toContain(prose);
  expect(r.out).toContain('Acceptance criteria');
  expect(r.out.indexOf('Readable work')).toBeLessThan(r.out.indexOf('example-00.ts'));
  expect(r.out).not.toContain('"_tags"');
  expect(r.out).not.toContain('"predicateName"');
  expect(r.out).not.toContain('[object Object]');
  expect(r.out).not.toContain('Defect report');
  expect(r.out).not.toContain('Lease:');
});
it('provides progressively useful detail and exhaustive human relationships', () => {
  const q = run('ticket', 'show', 'T', '-q'),
    normal = run('ticket', 'show', 'T'),
    v = run('ticket', 'show', 'T', '-v'),
    vv = run('ticket', 'show', 'T', '-vv');
  for (const r of [q, normal, v, vv]) expect(r.code, r.err).toBe(0);
  expect(q.out).toContain('Readable work');
  expect(q.out).not.toContain(prose);
  expect(q.out).not.toContain('example-27.ts');
  expect(normal.out.length).toBeGreaterThan(q.out.length);
  expect(v.out.length).toBeGreaterThan(normal.out.length);
  expect(vv.out).toContain('example-27.ts');
  expect(vv.out).toContain('Relevant note 27');
  expect(vv.out).not.toContain('"_version"');
  expect(vv.out).not.toContain('"payload"');
});
it('selects applicable sections independently of detail and rejects unknown sections', () => {
  const selected = run('ticket', 'show', 'T', '--brief', '--sections=criteria,history');
  expect(selected.code, selected.err).toBe(0);
  expect(selected.out).toContain('Preserve a criterion');
  expect(selected.out).toContain('history');
  expect(selected.out).not.toContain(prose);
  expect(run('ticket', 'show', 'T', '--brief', '--sections=revision').out).toContain('Revision');
  const bad = run('ticket', 'show', 'T', '--sections=bogus');
  expect(bad.code).not.toBe(0);
  expect(bad.err).toContain('bogus');
  expect(bad.err).toContain('summary');
  expect(bad.err).not.toContain('"code":');
});
it('round-trips the complete canonical result as pure full JSON and retains the used json alias', async () => {
  const expected = await commandRegistry.execute(
    'get_ticket',
    { ticketId: 'T' },
    { store, projectRoot: root, executionAuthority: 'read-only' },
  );
  for (const flag of ['--full-json', '--json']) {
    const r = run('ticket', 'show', 'T', flag);
    expect(r.code, r.err).toBe(0);
    expect(JSON.parse(r.out)).toEqual(expected);
    expect(JSON.parse(r.out).outgoing).toHaveLength(28);
    expect(r.out).not.toContain('\x1b');
    expect(r.out.trim().startsWith('{')).toBe(true);
  }
  for (const flags of [
    ['--full-json', '-q'],
    ['--full-json', '--sections=summary'],
    ['--brief', '--verbose'],
  ])
    expect(run('ticket', 'show', 'T', ...flags).code).not.toBe(0);
});
it('uses the same human and machine projection through Shell dispatch and read aliases', async () => {
  const session = { store, projectRoot: root, interactive: false, actor: {} } as Parameters<
    typeof processShellInput
  >[1];
  for (const flags of ['', '-q', '-v', '-vv', '--sections=criteria', '--full-json']) {
    const args = flags ? [flags] : [];
    const actual = await processShellInput('ticket show T ' + flags, session);
    const expected = run('ticket', 'show', 'T', ...args);
    expect(actual.output.trim()).toBe(expected.out.trim());
  }
  expect(run('ticket', 'T', '--brief').out).toBe(run('ticket', 'show', 'T', '--brief').out);
});
it('keeps complete form values and preserves multiline criteria when an unrelated field is edited', async () => {
  const ctx = { store, projectRoot: root, executionAuthority: 'project-write' as const };
  const view = await buildEntityView(ctx, 'ticket', 'T', 'edit');
  expect(view.fields.body!.value).toBe(prose);
  const values = Object.fromEntries(Object.entries(view.fields).map(([key, field]) => [key, field.value]));
  values.title = 'Edited title';
  await saveEntityView(ctx, 'ticket', 'T', values);
  const after = await commandRegistry.execute('get_ticket', { ticketId: 'T' }, ctx);
  expect(after.body).toBe(prose);
  expect(after.acceptanceCriteria).toEqual(criteria);
  expect(after.outgoing).toHaveLength(28);
});
it('formats lists, source inspection, non-Ticket reads and errors through the shared boundary', () => {
  const list = run('ticket', 'list');
  expect(list.code, list.err).toBe(0);
  expect(list.out).toContain('Readable work');
  expect(list.out).not.toContain('"tickets"');
  const project = run('project', 'status');
  expect(project.code, project.err).toBe(0);
  expect(project.out).not.toContain('"projectRoot"');
  fs.writeFileSync(path.join(root, 'example.txt'), '  source stays indented\n\nsecond paragraph\n');
  const source = run('source', 'file', 'read', 'example.txt');
  expect(source.code, source.err).toBe(0);
  expect(source.out).toContain('  source stays indented\n\nsecond paragraph\n');
  const error = run('ticket', 'show', 'MISSING');
  expect(error.code).not.toBe(0);
  expect(error.err).toContain('MISSING');
  expect(error.err).not.toContain('"status":"failed"');
});
it('explains operation outcomes and keeps explicit machine results complete', () => {
  const created = run(
    'ticket',
    'create',
    '--id',
    'NEW',
    '--title',
    'New work',
    '--body',
    'A concrete task',
    '--acceptance-criteria',
    '["Observable result"]',
  );
  expect(created.code, created.err).toBe(0);
  expect(created.out).toContain('NEW');
  expect(created.out).not.toContain('"lane"');
  const full = run('ticket', 'show', 'NEW', '--full-json');
  expect(JSON.parse(full.out).body).toBe('A concrete task');
});

it('reports actual linked test evidence as passing then stale without certifying acceptance', async () => {
  const file = 'proof.test.ts';
  fs.writeFileSync(path.join(root, file), '// current evidence');
  await store.upsertEntity(TestNode.dcr, { id: 'PROOF', title: 'Proof', filePath: file, framework: 'bun' });
  await store.withTestArtifactWrite('PROOF', () => store.relate('PROOF', 'verifies', 'T'));
  const test = (await store.getEntity<TestNode>('PROOF', TestNode.dcr))!;
  const hashes = await testEvidenceHashes(store, test);
  await store.withTestArtifactWrite('PROOF', () =>
    store.upsertEntity(TestNode.dcr, {
      id: 'PROOF',
      passed: true,
      lastRun: new Date().toISOString(),
      executionHashes: hashes,
    }),
  );
  const passing = run('ticket', 'show', 'T', '--sections=verification');
  expect(passing.out).toContain('1 current passing test');
  expect(passing.out).toContain('no completed verification');
  fs.appendFileSync(path.join(root, file), '\n// changed');
  const stale = run('ticket', 'show', 'T', '--sections=verification');
  expect(stale.out).toContain('stale');
  expect(stale.out).not.toContain('1 current passing test');
  expect(JSON.parse(run('ticket', 'show', 'T', '--full-json').out).testEvidence[0].passed).toBe(false);
});
it('distinguishes recorded current, stale and unknown receipts without inventing freshness', () => {
  for (const [verificationCurrent, message] of [
    [true, 'evidence is current'],
    [false, 'stale'],
    [null, 'freshness is not established'],
  ] as const) {
    const result = { id: 'T', lane: 'Done', verification: { tests: [] }, verificationCurrent };
    expect(formatOutput(result, { verbosity: 1, sections: ['verification'] })).toContain(message);
  }
  expect(
    formatOutput({ id: 'T', lane: 'Todo', kind: 'task', claim: { agentId: 'old', expiresAt: '2000-01-01' } }),
  ).not.toContain('old');
  expect(
    formatOutput({
      id: 'B',
      lane: 'Todo',
      kind: 'bug',
      defect: { expected: 'Expected result', actual: 'Wrong result' },
    }),
  ).toContain('Wrong result');
});
it('renders non-Ticket sections, empty lists and operation blockers usefully', () => {
  const feature = {
    id: 'F',
    title: 'Feature',
    body: prose,
    acceptanceCriteria: criteria,
    containedStories: ['S1'],
    _tags: ['internal'],
  };
  const rendered = formatOutput(feature, { verbosity: 3 });
  expect(rendered).toContain(prose);
  expect(rendered).toContain('S1');
  expect(rendered).not.toContain('_tags');
  expect(rendered).not.toContain('Bug report');
  expect(formatOutput([], { verbosity: 1 })).toContain('No records');
  expect(
    formatOutput({ status: 'blocked', blockers: [{ reason: 'Missing approved definition' }] }, { verbosity: 0 }),
  ).toContain('Missing approved definition');
  expect(() => formatOutput(feature, { verbosity: 1, sections: ['files'] })).toThrow('Available sections');
});
it('preserves large multiline content in human and machine views', () => {
  const body = Array.from({ length: 700 }, (_, i) => 'Paragraph ' + i + '\n  Preserve indentation.').join('\n\n');
  const data = { id: 'L', lane: 'Todo', body };
  expect(formatOutput(data)).toContain(body);
  expect(JSON.parse(formatOutput(data, { verbosity: 1, fullJson: true }))).toEqual(data);
});
it('validates formats and keeps Shell machine errors structured', async () => {
  const session = { store, projectRoot: root, interactive: false, actor: {} } as Parameters<
    typeof processShellInput
  >[1];
  const result = await processShellInput('ticket show MISSING --full-json', session);
  expect(JSON.parse(result.output)).toMatchObject({ status: 'failed' });
  for (const args of [['-vvv'], ['--full-json', '--json'], ['--sections='], ['-q', '-v']])
    expect(run('ticket', 'show', 'T', ...args).code).not.toBe(0);
  expect(run('ticket', '--help').out).toContain('resolve');
  expect(run('ticket', 'show', '--help').out).toContain('--full-json');
});

it('preserves flag-like argument data while extracting presentation options',async()=>{
 const parsed=await parseCommand(['ticket','update','T','--body','--json','--title','-v','--full-json']);
 expect(parsed.family).toBe('artifact');if(parsed.family!=='artifact')throw Error('Expected canonical operation');
 expect(parsed.args).toMatchObject({ticketId:'T',body:'--json',title:'-v'});expect(parsed.output?.fullJson).toBe(true);
 await expect(parseCommand(['ticket','show','T','--json=false'])).rejects.toThrow('does not take a value');
});

it('keeps partial operation acknowledgments distinct from complete Ticket evidence',()=>{
 const result={id:'NEW',title:'Created work',lane:'Todo',kind:'task'};const text=formatOutput(result);
 expect(text).not.toContain('No criteria recorded');expect(text).not.toContain('Priority: 2');expect(text).not.toContain('No completed verification');
 expect(formatOutput({...result,body:'Current report',missing:['Environment'],reasons:['Complete reproduction']})).toContain('Complete reproduction');
});
