/**
 * Official US acceptance: exercise the real public workflow and independently
 * check its user-observable result. No scripted implementation or verifier.
 *
 * Run with AIWF_LIVE_US_TESTS=1. This test intentionally needs a configured
 * development model and acceptance reviewer. It never uses the host project.
 */
import {it, describe, expect} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../../src/graph/store.ts';
import {loadConfig, saveConfig} from '../../src/config.ts';
import {initializeTools, registry} from '../../src/tools/index.ts';
import {acceptProduct} from '../product-review.ts';
import {closeAllTsLspClients} from '../../src/change/ts-lsp.ts';

const liveTest = process.env.AIWF_LIVE_US_TESTS === '1' ? it : it.skip;
const repoRoot = path.resolve(import.meta.dir, '../..');

function command(root: string, args: string[]) {
  const run = Bun.spawnSync(args, {cwd: root, stdout: 'pipe', stderr: 'pipe'});
  return {exitCode: run.exitCode, output: run.stdout.toString() + run.stderr.toString()};
}

describe('US: As a developer, I can request a Story and receive working, independently accepted behavior', () => {
  liveTest('Given a reviewed greeting Story, resolving it through AIWF makes its public API satisfy the request', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-us-acceptance-'));
    let store: WorkflowStore | undefined;
    try {
      const files = {
        '.gitignore': 'node_modules\n.ai-workflow\n',
        'package.json': JSON.stringify({scripts: {typecheck: 'tsc --noEmit'}}),
        'tsconfig.json': JSON.stringify({compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
          strict: true, noEmit: true, allowImportingTsExtensions: true, types: ['bun']}, include: ['src/**/*.ts', 'tests/**/*.ts']}),
        'src/greeting.ts': "export function greet(name: string): string { return 'Hello, ' + name; }\n",
        // Independent observable oracle; not generated, modified or supplied as an implementation.
        'tests/public-contract.test.ts': "import {it,expect} from 'bun:test';\nimport {greet} from '../src/greeting.ts';\nit('greeting API satisfies the public contract',()=>expect(greet('Ada')).toBe('Hello, ADA!'));\n"
      };
      for (const [relative, content] of Object.entries(files)) {
        const dest = path.join(root, relative);
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.writeFileSync(dest, content);
      }
      fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
      for (const args of [
        ['git', 'init', '-q'], ['git', 'add', '.'],
        ['git', '-c', 'user.name=US Test', '-c', 'user.email=us@example.invalid', 'commit', '-qm', 'initial user project']
      ]) {
        const init = command(root, args);
        expect(init.exitCode, init.output).toBe(0);
      }

      // The test project inherits model configuration, but NEVER the host DB or Git tree.
      const configured = loadConfig(repoRoot);
      saveConfig(root, {gateway: configured.gateway, model: configured.model, modelRoutes: configured.modelRoutes,
        ollamaUrl: configured.ollamaUrl, llmOutputTokens: configured.llmOutputTokens});
      store = new WorkflowStore(root);
      initializeTools();
      const ctx = {store, projectRoot: root, executionAuthority: 'project-write' as const};
      const oracle = fs.readFileSync(path.join(root, 'tests/public-contract.test.ts'), 'utf8');
      expect(command(root, ['bun', 'test', 'tests/public-contract.test.ts']).exitCode).not.toBe(0);

      // User creates/accepts the Story and work through their actual public facades.
      await acceptProduct(store, [
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
          expectedResult: "Return exactly 'Hello, ADA!' without callers transforming the result.",
          status: 'accepted'}},
        {kind: 'product_link', sourceId: 'PRODUCT', predicate: 'contains', targetId: 'GREETINGS'},
        {kind: 'product_link', sourceId: 'GREETINGS', predicate: 'enables', targetId: 'GREET-USER'}
      ]);
      await registry.execute('create_ticket', {id: 'GREET-TICKET', title: 'Implement the greeting Story',
        body: "Update the public greet(name) behavior for the accepted GREET-USER Story; preserve the public signature.",
        acceptanceCriteria: ["Calling greet('Ada') returns exactly 'Hello, ADA!' and the public test passes.",
          'Typecheck passes and the existing public test is unchanged.']}, ctx);
      // Discover the implementation target through the public graph facade.
      const sourceSymbols = await registry.execute('find_symbol',
        {name: 'greet', filePath: 'src/greeting.ts', exact: true}, ctx);
      expect(sourceSymbols.some((symbol: {name: string}) => symbol.name === 'greet')).toBe(true);
      await acceptProduct(store, [
        {kind: 'product_link', sourceId: 'GREET-TICKET', predicate: 'addresses', targetId: 'GREET-USER'},
        {kind: 'product_link', sourceId: 'GREET-TICKET', predicate: 'modifies', targetId: 'src/greeting.ts'}
      ]);

      // Developer reviews ONE executable Story test through public preview/apply.
      const specification = {storyId: 'GREET-USER', filePath: 'tests/greeting.story.test.ts',
        fixturePath: 'src/greeting.ts', interfaceName: 'greet',
        body: "expect(subject('Ada')).toBe('Hello, ADA!');"};
      let linked = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const preview = await registry.execute('prepare_story_test', {specification}, ctx);
        expect(preview.status, JSON.stringify(preview)).toBe('review');
        const applied = await store.withExecutionContext('project-write', undefined, () =>
          registry.execute('apply_story_test', {specification, fingerprint: preview.fingerprint, decision: 'accept'}, ctx),
        preview.fingerprint);
        if (applied.status === 'linked') {linked = true; break;}
        expect(applied.status, JSON.stringify(applied)).toBe('file-created-unlinked');
      }
      expect(linked).toBe(true);
      expect(command(root, ['git', 'add', '.']).exitCode).toBe(0);
      expect(command(root, ['git', '-c', 'user.name=US Test', '-c', 'user.email=us@example.invalid',
        'commit', '-qm', 'accepted Story and executable public contract']).exitCode).toBe(0);

      // WHEN: the user calls the public resolver; no source edits or acceptance verdict are supplied.
      const resolved = await registry.execute('resolve_ticket', {
        ticketId: 'GREET-TICKET', agentId: 'us-acceptance', maxRepairs: 2,
        authorizedFiles: {'GREET-TICKET': ['src/greeting.ts']},
        testCommands: [['bun', 'test'], ['bun', 'run', 'typecheck']]
      }, ctx);

      // THEN: assess observable behavior, not how the implementation achieved it.
      expect(resolved.status, JSON.stringify(resolved)).toBe('complete');
      const actual = command(root, ['bun', '-e',
        "import {greet} from './src/greeting.ts'; console.log(greet('Ada'))"]);
      expect(actual.exitCode, actual.output).toBe(0);
      expect(actual.output.trim()).toBe('Hello, ADA!');
      const publicTest = command(root, ['bun', 'test', 'tests/public-contract.test.ts']);
      expect(publicTest.exitCode, publicTest.output).toBe(0);
      expect(fs.readFileSync(path.join(root, 'tests/public-contract.test.ts'), 'utf8')).toBe(oracle);
      expect((await registry.execute('get_user_story', {storyId: 'GREET-USER'}, ctx)).effectiveState.state).toBe('done');
      expect((await registry.execute('get_ticket', {ticketId: 'GREET-TICKET'}, ctx)).lane).toBe('Done');
    } finally {
      // Always delete the project, even after failed assertions or a failed model call.
      await closeAllTsLspClients();
      store?.close();
      fs.rmSync(root, {recursive: true, force: true});
    }
  }, 300_000);
});
