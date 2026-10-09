import {afterEach, beforeEach, describe, expect, it, spyOn} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Writable} from 'node:stream';
import {LLMSession, type Asker, type ActorStepRecord} from '@dharmax/llm-utils';
import {FakeRenderer, ProcessViewport} from '@dharmax/shell-ui';
import {WorkflowStore} from '../src/graph/store.ts';
import {WorkflowActor} from '../src/actor/engine.ts';
import {initializeTools} from '../src/tools/index.ts';
import {processShellInput, type ShellSession} from '../src/shell.ts';
import {shellTracePath} from '../src/shell-trace.ts';

describe('Shell failure trace and floating inspection', () => {
  let root: string, store: WorkflowStore, session: ShellSession, output: string;
  beforeEach(() => {
    initializeTools();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-trace-'));
    store = new WorkflowStore(root, true);
    output = '';
    const stream = new Writable({write(chunk, _encoding, callback) {output += chunk.toString(); callback();}});
    session = {store, projectRoot: root, actor: new WorkflowActor({store, projectRoot: root, offline: true}),
      viewport: new ProcessViewport({mode: 'fold', stream: stream as unknown as NodeJS.WriteStream})};
  });
  afterEach(() => {store.close(); fs.rmSync(root, {recursive: true, force: true});});

  it('preserves unavailable-call evidence with the tiny bootstrap catalog', async () => {
    let calls = 0;
    const asker = {json: async () => ({ok: true, data: {thought: 'PRIVATE reasoning must not appear', action: 'tool_call',
      toolCalls: [{callId: String(++calls), name: 'get_product_coverage', parameters: {entityId: 'EPIC-MISSING'}}]}})} as unknown as Asker;
    session.actor = new WorkflowActor({store, projectRoot: root, asker, maxSteps: 3,
      toolDiscovery: {discover: async () => ({query: {}, mode: 'product', tools: []})}});
    const result = await processShellInput("what's the next recommended ticket?", session);
    expect(result.output).toContain('Repeated unavailable tool calls');
    expect(session.viewport!.getRun().status).toBe('fail');
    expect(output).toContain('✖ Process failed');
    expect(output).not.toContain('✔');
    const execute = spyOn(session.actor, 'execute');
    try {
      const trace = (await processShellInput('trace show', session)).output;
      expect(trace).toContain('Request: what\'s the next recommended ticket?');
      expect(trace).toContain('Mode: DEV');
      expect(trace).toContain('Available tools: run_command, discover_tools');
      expect(trace).toContain('Termination: error');
      expect(trace).toContain('Step 1:');
      expect(trace).toContain('Step budget: 3');
      expect(calls).toBe(2);
      expect(trace).toContain('EPIC-MISSING');
      expect(trace).toContain('not available for this run');
      expect(trace).not.toContain('PRIVATE');
      expect(trace).not.toContain('[THINK]');
      expect(fs.readFileSync(shellTracePath(session), 'utf8')).toBe(trace);
      const renderer = new FakeRenderer().viewWith('shell-trace', {status: 'closed'}); session.renderer = renderer;
      expect((await processShellInput('trace open', session)).output).toBe('');
      expect(renderer.requests.at(-1)).toMatchObject({id: 'shell-trace', mode: 'readonly', fields: {trace: {value: trace, multiline: true}}});
      expect(execute).not.toHaveBeenCalled();
    } finally {execute.mockRestore();}
  });

  it('stops on a thrown error, preserves partial evidence, and reads it after restart', async () => {
    const execute = spyOn(session.actor, 'execute').mockImplementation(async (_input, _mode, options) => {
      options?.onDiscovery?.(['read_workspace_file'], 'dev');
      options?.onStep?.({step: 1, thought: 'PRIVATE', action: 'tool_call',
        toolCalls: [{callId: 'a', toolName: 'read_workspace_file', parameters: {path: 'README.md'}}],
        toolResults: [{callId: 'a', toolName: 'read_workspace_file', isError: false, result: {summary: 'read file', completeContents: 'Complete evidence survives'}}]});
      throw Error('provider disconnected after first step');
    });
    try {await expect(processShellInput('inspect README', session)).rejects.toThrow('provider disconnected');}
    finally {execute.mockRestore();}
    expect(session.viewport!.getRun().status).toBe('fail');
    const restarted: ShellSession = {store, projectRoot: root, actor: session.actor};
    const trace = (await processShellInput('trace show', restarted)).output;
    expect(trace).toContain('provider disconnected after first step');
    expect(trace).toContain('Complete evidence survives');
    expect(trace).toContain('Available tools: read_workspace_file');
    expect(trace).not.toContain('PRIVATE');
    expect((await processShellInput('trace open', restarted)).output).toBe(trace);
  });

  it('records optional discovery failure after cognition and preserves fallback command evidence', async () => {
    let calls=0;
    session.actor = new WorkflowActor({store, projectRoot: root, asker: {json: async () => ({ok:true,data:++calls===1?{thought:'PRIVATE',action:'tool_call',toolCalls:[{name:'discover_tools',parameters:{request:'Inspect project evidence'}}]}:calls===2?{thought:'PRIVATE',action:'tool_call',toolCalls:[{name:'run_command',parameters:{command:'printf fallback'}}]}:{thought:'PRIVATE',action:'final_answer',finalAnswer:'fallback observed'}})} as unknown as Asker,
      toolDiscovery: {discover: async () => {throw Error('classifier response invalid');}}});
    await processShellInput('inspect project evidence', session);
    const trace=(await processShellInput('trace show',session)).output;
    expect(trace).toContain('classifier response invalid');expect(trace).toContain('Capability lookup:');
    expect(trace).toContain('run_command');expect(trace).toContain('fallback');expect(trace).not.toContain('PRIVATE');
    expect(session.viewport!.getRun().status).toBe('success');
  });

  it('does not turn a failed run with partial final text into successful trace status', async () => {
    session.actor = new WorkflowActor({store, projectRoot: root, asker: {json: async () => {throw Error('should not run');}} as unknown as Asker,
      toolDiscovery: {discover: async () => ({query: {}, tools: []})}});
    const run = spyOn(LLMSession.prototype, 'run').mockResolvedValue({ok: false, finalText: 'Incomplete response', steps: [], totalSteps: 0,
      haltReason: 'error', error: 'verification interrupted', issues: []});
    try {
      await processShellInput('inspect project', session);
      expect(session.viewport!.getRun().status).toBe('fail');
      expect((await processShellInput('trace show', session)).output).toContain('verification interrupted');
    } finally {run.mockRestore();}
  });

  it('keeps full final answers and all calls/results, and replaces only the latest run', async () => {
    const answer = 'Detailed answer ' + 'z'.repeat(300);
    const step: ActorStepRecord = {step: 1, thought: 'PRIVATE', action: 'final_answer', finalAnswer: answer,
      toolCalls: [{callId: 'a', toolName: 'first', parameters: {}}, {callId: 'b', toolName: 'second', parameters: {}}],
      toolResults: [{callId: 'a', toolName: 'first', isError: false, result: 'one'}, {callId: 'b', toolName: 'second', isError: true, error: 'second failed'}]};
    const execute = spyOn(session.actor, 'execute').mockImplementation(async (_input, _mode, options) => {
      options?.onStep?.(step);
      return {mode: 'dev', stepsCount: 1, answer, events: [], discoveredTools: ['first', 'second'], haltReason: 'completed'};
    });
    try {await processShellInput('first request', session); await processShellInput('second request', session);}
    finally {execute.mockRestore();}
    const trace = (await processShellInput('trace show', session)).output;
    expect(trace).toContain(answer);
    expect(trace).toContain('second failed');
    expect(trace).toContain('Request: second request');
    expect(trace).not.toContain('Request: first request');
    expect(session.viewport!.getSteps()).toHaveLength(1);
  });

  it('falls back to trace text when a floating renderer is unavailable or throws', async () => {
    await processShellInput('inspect project', session);
    const trace = (await processShellInput('trace show', session)).output;
    const renderer = new FakeRenderer(); session.renderer = renderer;
    const view = spyOn(renderer, 'view').mockResolvedValue({status: 'unavailable'});
    try {
      expect((await processShellInput('trace open', session)).output).toBe(trace);
      view.mockRejectedValue(Error('terminal renderer crashed'));
      expect((await processShellInput('trace open', session)).output).toContain(trace);
      expect(session.viewport!.getRun().status).toBe('fail');
    } finally {view.mockRestore();}
  });
});
