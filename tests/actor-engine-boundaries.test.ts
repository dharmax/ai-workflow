import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LLMSession, ToolAbortError, z, type Asker} from '@dharmax/llm-utils';
import {WorkflowActor, classifyIntentMode} from '../src/actor/engine.ts';
import {saveConfig} from '../src/config.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {initializeTools, registry} from '../src/tools/index.ts';

describe('WorkflowActor execution boundaries', () => {
  let root: string;
  let store: WorkflowStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-engine-boundaries-'));
    store = new WorkflowStore(root, true);
    initializeTools();
  });

  afterEach(() => {
    initializeTools();
    store.close();
    fs.rmSync(root, {recursive: true, force: true});
  });

  const answer = (text = 'done') => ({ok: true, data: {thought: '', action: 'final_answer', finalAnswer: text}});
  const call = (name: string, parameters = {}) => ({ok: true, data: {thought: '', action: 'tool_call', toolCalls: [{name, parameters}]}});

  // Exercise the ordinary escalation branch without making provider calls.
  const routedActor = (asker: Asker) => {
    const actor = new WorkflowActor({store, projectRoot: root, toolDiscovery: null});
    const runtime = actor as unknown as {_asker: Asker; session: LLMSession; _configuredProviders: string[]; localProviders: string[]};
    runtime._asker = asker;
    runtime.session = new LLMSession(asker);
    runtime._configuredProviders = ['ollama', 'openrouter'];
    runtime.localProviders = ['ollama'];
    return actor;
  };

  it('parses complete mode tokens and preserves the rest of the instruction', async () => {
    const prompts: string[] = [];
    const asker = {json: async (prompt: string) => {prompts.push(prompt); return answer();}} as unknown as Asker;
    const actor = new WorkflowActor({store, projectRoot: root, asker, toolDiscovery: null, mode: 'product'});
    expect(classifyIntentMode('/development', 'product')).toBe('product');
    expect(classifyIntentMode('/DESIGN inspect')).toBe('design');
    expect((await actor.execute('  /TRIAGE inspect failure')).mode).toBe('triage');
    expect(prompts[0]).not.toContain('/TRIAGE');
    expect((await actor.execute('/development details')).mode).toBe('triage');
    expect(prompts[1]).toContain('/development details');
  });

  it('denies cancelled explicit delegation before invoking a mutating capability', async () => {
    let calls = 0;
    const tool = registry.get('resolve_ticket')!;
    registry.register({...tool, execute: () => {calls++; return {status: 'complete'};}});
    const controller = new AbortController();
    controller.abort();
    const actor = new WorkflowActor({store, projectRoot: root, offline: true});
    const result = await actor.execute('resolve T', undefined, {signal: controller.signal});
    expect(result.failed).toBe(true);
    expect(result.haltReason).toBe('aborted');
    expect(calls).toBe(0);
  });

  it('denies read-only explicit delegation before invoking a mutating capability', async () => {
    let calls = 0;
    const tool = registry.get('resolve_ticket')!;
    registry.register({...tool, execute: () => {calls++; return {status: 'complete'};}});
    const result = await new WorkflowActor({store, projectRoot: root, offline: true})
      .execute('resolve T', undefined, {executionAuthority: 'read-only'});
    expect(result.failed).toBe(true);
    expect(result.answer).toContain('Read-only authority');
    expect(calls).toBe(0);
  });

  it('returns explicit delegation errors as execution failures', async () => {
    const tool = registry.get('resolve_ticket')!;
    registry.register({...tool, execute: () => {throw 'delegation failed';}});
    const result = await new WorkflowActor({store, projectRoot: root, offline: true}).execute('resolve T');
    expect(result.failed).toBe(true);
    expect(result.answer).toContain('delegation failed');
  });

  it('preserves an explicit tool abort returned by artifact delegation', async () => {
    const tool = registry.get('resolve_ticket')!;
    registry.register({...tool, execute: () => {throw new ToolAbortError('User refused execution');}});
    const result = await new WorkflowActor({store, projectRoot: root, offline: true}).execute('resolve T');
    expect(result.failed).toBe(true);
    expect(result.haltReason).toBe('aborted');
    expect(result.answer).toContain('User refused execution');
  });

  it('preserves injected discovery tools and applies schema transforms exactly once', async () => {
    let calls = 0;
    let value = '';
    const tool = {
      name: 'custom_transform', description: 'Use a host capability', category: 'os' as const,
      parameters: z.object({value: z.string().transform(input => input + '!')}),
      execute: (params: {value: string}) => {value = params.value; return ['observed'];}
    };
    const asker = {json: async () => ++calls === 1 ? call('discover_tools', {request: 'host capability'})
      : calls === 2 ? call(tool.name, {value: 'input'}) : answer()} as unknown as Asker;
    const result = await new WorkflowActor({
      store, projectRoot: root, asker,
      toolDiscovery: {discover: async () => ({query: {}, tools: [tool]})}
    }).execute('Use the custom host capability');
    expect(result.failed).toBeUndefined();
    expect(value).toBe('input!');
    expect(result.events[1]!.toolResult).toEqual(['observed']);
  });

  it('denies discovered mutating capabilities under read-only authority', async () => {
    let calls = 0;
    let invoked = false;
    const tool = {name: 'custom_mutation', description: 'Mutate state', category: 'os' as const,
      parameters: z.object({}), execute: () => {invoked = true; return {};}};
    const asker = {json: async () => ++calls === 1 ? call('discover_tools', {request: 'mutation'})
      : calls === 2 ? call(tool.name) : answer()} as unknown as Asker;
    const result = await new WorkflowActor({
      store, projectRoot: root, asker,
      toolDiscovery: {discover: async () => ({query: {}, tools: [tool]})}
    }).execute('Inspect state', undefined, {executionAuthority: 'read-only'});
    expect(invoked).toBe(false);
    expect(result.events[1]!.toolResults![0]!.error).toContain('Read-only authority');
  });

  it('does not retry a tool abort through cognitive escalation', async () => {
    const command = registry.get('run_command')!;
    registry.register({...command, execute: () => {throw new ToolAbortError('User refused execution');}});
    let calls = 0;
    const asker = {json: async () => {calls++; return call('run_command', {command: 'echo refused'});}} as unknown as Asker;
    const result = await routedActor(asker).execute('Perform the task');
    expect(result.haltReason).toBe('aborted');
    expect(result.escalated).toBe(false);
    expect(calls).toBe(1);
  });

  it('does not retry an explicitly forced model after failure', async () => {
    let calls = 0;
    const asker = {json: async () => {calls++; return {ok: false, failure: {message: 'Provider unavailable'}};}} as unknown as Asker;
    const result = await routedActor(asker).execute('Perform the task', undefined, {forceModel: 'ollama/chosen'});
    expect(result.failed).toBe(true);
    expect(result.escalated).toBe(false);
    expect(result.targetModel).toBe('ollama/chosen');
    expect(calls).toBe(1);
  });

  it('keeps local-only policy authoritative when forceCloud is requested', async () => {
    saveConfig(root, {escalation: {policy: 'local_only', blastRadiusThreshold: 3, testRetryThreshold: 2}});
    let options: {preferLocal?: boolean; allowedProviders?: string[]} | undefined;
    const asker = {json: async (_prompt: string, _schema: unknown, supplied: typeof options) => {options = supplied; return answer();}} as unknown as Asker;
    const result = await routedActor(asker).execute('Perform the task', undefined, {forceCloud: true});
    expect(result.escalated).toBe(false);
    expect(options?.preferLocal).toBe(true);
    expect(options?.allowedProviders).toEqual(['ollama']);
  });
});
