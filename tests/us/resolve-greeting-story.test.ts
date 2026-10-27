/** Genuine US acceptance: no scripted implementation or verifier. */
import {describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {registry} from '../../src/tools/index.ts';
import {withAcceptedGreetingStory, runInProject} from './fixtures/greeting-project.ts';

// No model configured or authorized? Report SKIPPED, never a false PASS.
const testUS = process.env.AIWF_LIVE_US_TESTS === '1' ? it : it.skip;

describe('US: As a developer, I can have AIWF implement an accepted Story', () => {
  testUS('Given a failing public greeting, when I resolve its Story, callers receive the requested result', async () => {
    await withAcceptedGreetingStory(async ({root, ctx, publicOracle, step}) => {
      // GIVEN: the original public behavior does not satisfy the accepted Story.
      expect(runInProject(root, ['bun', 'test', 'tests/public-contract.test.ts']).exitCode).not.toBe(0);

      // WHEN: invoke the actual public resolver; do not supply code edits or a mock acceptance verdict.
      const signal = new AbortController();
      const deadline = setTimeout(() => signal.abort(new Error('US resolution exceeded 180s; see last reported stage')), 180_000);
      let resolution: Awaited<ReturnType<typeof registry.execute>>;
      try {
        resolution = await step('Resolve Story through public resolve_ticket', () => registry.execute('resolve_ticket', {
          ticketId: 'GREET-TICKET', agentId: 'us-acceptance', maxRepairs: 2,
          authorizedFiles: {'GREET-TICKET': ['src/greeting.ts']},
          testCommands: [['bun', 'test'], ['bun', 'run', 'typecheck']]
        }, {...ctx, signal: signal.signal}));
      } finally { clearTimeout(deadline); }

      // THEN: verify the caller-visible contract independently of the resolver's own evidence.
      expect(resolution.status, JSON.stringify(resolution)).toBe('complete');
      const actual = runInProject(root, ['bun', '-e',
        "import {greet} from './src/greeting.ts'; console.log(greet('Ada'))"]);
      expect(actual.exitCode, actual.output).toBe(0);
      expect(actual.output.trim()).toBe('Hello, ADA!');
      const oracle = runInProject(root, ['bun', 'test', 'tests/public-contract.test.ts']);
      expect(oracle.exitCode, oracle.output).toBe(0);
      expect(fs.readFileSync(path.join(root, 'tests/public-contract.test.ts'), 'utf8')).toBe(publicOracle);
      expect((await registry.execute('get_user_story', {storyId: 'GREET-USER'}, ctx)).effectiveState.state).toBe('done');
      expect((await registry.execute('get_ticket', {ticketId: 'GREET-TICKET'}, ctx)).lane).toBe('Done');
    });
  }, 300_000);
});
