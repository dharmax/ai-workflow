/** Isolated, real-model setup for the public greeting Story. Not an implementation mock. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../../../src/graph/store.ts';
import {loadConfig, saveConfig} from '../../../src/config.ts';
import {initializeTools, registry} from '../../../src/tools/index.ts';
import {acceptProduct} from '../../product-review.ts';
import {productReviewFixture} from '../../product-review-fixture.ts';
import {closeAllTsLspClients} from '../../../src/change/ts-lsp.ts';

const repository = path.resolve(import.meta.dir, '../../..');

export function runInProject(root: string, args: string[]) {
  const run = Bun.spawnSync(args, {cwd: root, stdout: 'pipe', stderr: 'pipe'});
  return {exitCode: run.exitCode, output: run.stdout.toString() + run.stderr.toString()};
}
function mustRun(root: string, args: string[]) {
  const result = runInProject(root, args);
  if (result.exitCode !== 0) throw Error(args.join(' ') + ': ' + result.output);
}

export async function withAcceptedGreetingStory(
  exercise: (project: {root: string; ctx: {store: WorkflowStore; projectRoot: string; executionAuthority: 'project-write'};
    publicOracle: string; step: <T>(name: string, run: () => Promise<T>) => Promise<T>}) => Promise<void>
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-us-acceptance-'));
  let store: WorkflowStore | undefined;
  let closeDefinitionReviewer: (() => void) | undefined;
  const startedAt = Date.now();
  let phase = 'project setup';
  const report = (message: string) => process.stderr.write(`[US greeting +${((Date.now()-startedAt)/1000).toFixed(1)}s] ${message}\n`);
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    phase = name;
    report('START ' + name);
    try {
      const value = await run();
      report('PASS  ' + name);
      return value;
    } catch (error) {
      report('FAIL  ' + name + ': ' + String(error));
      throw error;
    }
  };
  const heartbeat = setInterval(() => report('STILL ' + phase), 10_000);
  heartbeat.unref();
  // Bun may interrupt a timed-out test before its finally block finishes.
  const exitCleanup = () => fs.rmSync(root, {recursive: true, force: true});
  process.once('exit', exitCleanup);
  report('Created isolated project ' + root);
  try {
    const files = {
      '.gitignore': 'node_modules\n.ai-workflow\n',
      'package.json': JSON.stringify({scripts: {typecheck: 'tsc --noEmit'}}),
      'tsconfig.json': JSON.stringify({compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
        strict: true, noEmit: true, allowImportingTsExtensions: true, types: ['bun']}, include: ['src/**/*.ts', 'tests/**/*.ts']}),
      'src/greeting.ts': "export function greet(name: string): string { return 'Hello, ' + name; }\n",
      // Stable public-interface adapter: its source must not change when AIWF implements greet.
      'tests/greeting-interface.ts': "export {greet} from '../src/greeting.ts';\n",
      'tests/public-contract.test.ts': "import {it,expect} from 'bun:test';\nimport {greet} from '../src/greeting.ts';\nit('greeting API satisfies the public contract',()=>expect(greet('Ada')).toBe('Hello, ADA!'));\n"
    };
    for (const [relative, content] of Object.entries(files)) {
      const dest = path.join(root, relative);
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.writeFileSync(dest, content);
    }
    const publicOracle = files['tests/public-contract.test.ts'];
    fs.symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    mustRun(root, ['git', 'init', '-q']);
    mustRun(root, ['git', 'add', '.']);
    mustRun(root, ['git', '-c', 'user.name=US Test', '-c', 'user.email=us@example.invalid', 'commit', '-qm', 'initial project']);

    // Reuse configured models, but never the original project's database or files.
    const configured = loadConfig(repository);
    saveConfig(root, {gateway: configured.gateway, model: configured.model, modelRoutes: configured.modelRoutes,
      ollamaUrl: configured.ollamaUrl, llmOutputTokens: configured.llmOutputTokens});
    store = new WorkflowStore(root);
    initializeTools();
    const ctx = {store, projectRoot: root, executionAuthority: 'project-write' as const};

    // Fixture setup uses a controlled definition Critic via the real public facades.
    // This does not replace implementation or independent acceptance in resolve_ticket.
    closeDefinitionReviewer = await step('Start controlled definition reviewer for setup', () =>
      productReviewFixture(store!, false));
    try {
    // Developer creates the Product, Story, and work using public reviewed changes.
    await step('Accept Product and User Story through public review', () => acceptProduct(store!, [
      {kind: 'product_create', entityType: 'Product', id: 'PRODUCT', fields: {
        title: 'Greeting service', purpose: 'Expose a usable public greeting API', actors: ['Application developer'],
        scope: 'The greeting function', nonGoals: ['Web UI'], bounds: 'Disposable local project', status: 'accepted'}},
      {kind: 'product_create', entityType: 'Feature', id: 'GREETINGS', fields: {
        title: 'Public greeting API', body: 'Callers get a normalized greeting.', status: 'accepted'}},
      {kind: 'product_create', entityType: 'UserStory', id: 'GREET-USER', fields: {
        title: 'Return the requested greeting', actor: 'Application developer',
        intent: 'Receive the greeting with the name uppercased',
        initialState: 'A greet(name) function exists, but returns the name without uppercase or punctuation.',
        action: "Call greet('Ada') using the public module API.",
        expectedResult: "Return exactly 'Hello, ADA!' without callers transforming the result.", status: 'accepted'}},
      {kind: 'product_link', sourceId: 'PRODUCT', predicate: 'contains', targetId: 'GREETINGS'},
      {kind: 'product_link', sourceId: 'GREETINGS', predicate: 'enables', targetId: 'GREET-USER'}
    ]));
    await step('Create Ticket through public API', () => registry.execute('create_ticket', {id: 'GREET-TICKET', title: 'Implement the greeting Story',
      body: "Update the public greet(name) behavior for the accepted GREET-USER Story; preserve its signature.",
      acceptanceCriteria: ["Calling greet('Ada') returns exactly 'Hello, ADA!' and the public test passes.",
        'Typecheck passes and the existing public test is unchanged.']}, ctx)); 

    const matches = await step('Discover exact greeting symbol through public graph', () =>
      registry.execute('search_graph', {entityType: 'SymbolNode', query: 'greet'}, ctx));
    const targets = matches.results.filter((item: {title?: string; filePath?: string; status?: string}) =>
      item.title === 'greet' && item.filePath === 'src/greeting.ts' && item.status !== 'deprecated');
    if (targets.length !== 1) throw Error('Expected one indexed public greet symbol; found ' + targets.length);
    await step('Link Ticket to Story and exact source symbol', () => acceptProduct(store!, [
      {kind: 'product_link', sourceId: 'GREET-TICKET', predicate: 'addresses', targetId: 'GREET-USER'},
      {kind: 'product_link', sourceId: 'GREET-TICKET', predicate: 'modifies', targetId: targets[0]!.id}
    ]));

    // Developer approves the executable public-interface Story test.
    const specification = {storyId: 'GREET-USER', filePath: 'tests/greeting.story.test.ts',
      fixturePath: 'tests/greeting-interface.ts', interfaceName: 'greet',
      body: "expect(subject('Ada')).toBe('Hello, ADA!');"};
    let linked = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const preview = await step('Prepare reviewed Story test attempt ' + (attempt+1), () =>
        registry.execute('prepare_story_test', {specification}, ctx));
      if (preview.status !== 'review') throw Error(JSON.stringify(preview));
      const applied = await step('Approve Story test attempt ' + (attempt+1), () =>
        store!.withExecutionContext('project-write', undefined, () =>
          registry.execute('apply_story_test', {specification, fingerprint: preview.fingerprint, decision: 'accept'}, ctx),
          preview.fingerprint));
      if (applied.status === 'linked') {linked = true; break;}
      if (applied.status !== 'file-created-unlinked') throw Error(JSON.stringify(applied));
    }
    if (!linked) throw Error('Could not approve the executable Story test.');
    mustRun(root, ['git', 'add', '.']);
    mustRun(root, ['git', '-c', 'user.name=US Test', '-c', 'user.email=us@example.invalid',
      'commit', '-qm', 'accepted Story and public contract']);

    } finally {
      // Restore the genuine configured models before the operation under test.
      try { closeDefinitionReviewer?.(); }
      finally {
        closeDefinitionReviewer = undefined;
        saveConfig(root, {gateway: configured.gateway, model: configured.model, modelRoutes: configured.modelRoutes,
          ollamaUrl: configured.ollamaUrl, llmOutputTokens: configured.llmOutputTokens});
      }
    }
    report('Restored real implementation and independent acceptance models');
    await step('Exercise public US acceptance', () => exercise({root, ctx, publicOracle, step}));
  } finally {
    clearInterval(heartbeat);
    try { closeDefinitionReviewer?.(); }
    finally {
      report('CLEANUP disposable project');
      try { await closeAllTsLspClients(); }
      finally {
        try { store?.close(); }
        finally {
          try { exitCleanup(); }
          finally { process.off('exit', exitCleanup); }
        }
      }
    }
  }
}
