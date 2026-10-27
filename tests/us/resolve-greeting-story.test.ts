/** Genuine US acceptance: no scripted implementation or verifier. */
import {describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createMcpServer} from '../../src/mcp.ts';
import {loadConfig,saveConfig} from '../../src/config.ts';
import {registry} from '../../src/tools/index.ts';
import {withAcceptedGreetingStory, runInProject} from './fixtures/greeting-project.ts';

// No model configured or authorized? Report SKIPPED, never a false PASS.
const testUS = process.env.AIWF_LIVE_US_TESTS === '1' ? it : it.skip;

describe('US: As a developer, I can have AIWF implement an accepted Story', () => {
  testUS('Given a failing public greeting, when I resolve its Story, callers receive the requested result', async () => {
    await withAcceptedGreetingStory(async ({root, ctx, publicOracle, step}) => {
      const route=process.env.AIWF_LIVE_MODEL_ROUTE;
      if(route) {
        const configured=loadConfig(root),model=configured.modelRoutes?.[route];
        if(!model)throw Error('Live test route is not configured: '+route);
        saveConfig(root,{modelRoutes:{...configured.modelRoutes,dev:model}});
        process.stderr.write('Live implementation uses configured '+route+' route: '+model+'\n');
      }
      // GIVEN: a publicly accepted, reviewed Story with a failing caller-visible contract.
      const before = await registry.execute('get_user_story', {storyId: 'GREET-USER'}, ctx);
      expect(before.status).toBe('accepted');
      expect(before.effectiveState.state).toBe('ready');
      expect(runInProject(root, ['bun', 'test', 'tests/public-contract.test.ts']).exitCode).not.toBe(0);

      // WHEN: invoke the actual public resolver; do not supply code edits or a mock acceptance verdict.
      const signal = new AbortController();
      const deadline = setTimeout(() => signal.abort(new Error('US resolution exceeded 60s; see last reported stage')), 60_000);
      let resolution: Awaited<ReturnType<typeof registry.execute>>;
      const previousTrace = process.env.AIWF_TRACE_RESOLUTION;
      process.env.AIWF_TRACE_RESOLUTION = '1';
      const server=createMcpServer({store:ctx.store,projectRoot:root,executionAuthority:'project-write'}).server;
      const client=new Client({name:'live-resolver-acceptance',version:'1'});
      const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);await client.connect(clientTransport);
      try {
        resolution = await step('Resolve Story through public resolve_ticket', async () => {
          const response=await client.callTool({name:'resolve_ticket',arguments:{
            ticketId: 'GREET-TICKET', agentId: 'us-acceptance', maxRepairs: 2,
            authorizedFiles: {'GREET-TICKET': ['src/greeting.ts']},
            testCommands: [['bun', 'test'], ['bun', 'run', 'typecheck']]
          }},undefined,{signal:signal.signal,timeout:65000});
          if(response.isError)throw Error(JSON.stringify(response.content));
          return JSON.parse((response.content as Array<{text:string}>)[0]!.text);
        });
      } finally {
        clearTimeout(deadline);
        await client.close();await server.close();
        if (previousTrace === undefined) delete process.env.AIWF_TRACE_RESOLUTION;
        else process.env.AIWF_TRACE_RESOLUTION = previousTrace;
      }

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
