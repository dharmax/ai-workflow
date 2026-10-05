import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools } from '../src/tools/index.ts';
import { WorkflowActor, classifyIntentMode, type ShellMode, pubsub } from '../src/actor/engine.ts';

describe('Cognitive Actor & Mode Switcher', () => {
  let tempDir: string;
  let store: WorkflowStore;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-actor-test-'));
    store = new WorkflowStore(tempDir, true);
    initializeTools();
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should accurately classify modes via explicit commands and intent keywords', () => {
    // Explicit commands
    expect(classifyIntentMode('/design what is our database strategy?')).toBe('design');
    expect(classifyIntentMode('/dev create a patch for store.ts')).toBe('dev');
    expect(classifyIntentMode('/triage why are playwright tests failing?')).toBe('triage');
    expect(classifyIntentMode('/product prioritize next sprint backlog')).toBe('product');

    // Natural language heuristics
    expect(classifyIntentMode('How should we design the architecture and modular boundaries?')).toBe('design');
    expect(classifyIntentMode('What are the trade-offs of this RFC proposal?')).toBe('design');
    expect(classifyIntentMode('Triage the failing tests in tests/graph.test.ts')).toBe('triage');
    expect(classifyIntentMode('There is a regression bug in the login flow')).toBe('triage');
    expect(classifyIntentMode('Add a new Epic for user onboarding and draft stories')).toBe('product');
    expect(classifyIntentMode('Implement the new ticket lease API in store.ts')).toBe('dev');
  });

  it('should report natural-language LLM unavailability without inventing intent', async () => {
    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      offline: true
    });

    const res = await actor.execute('unsure readme is aligned with latest changes');

    expect(res.mode).toBe('dev');
    expect(res.offlineFallback).toBe(true);
    expect(res.answer).toContain('LLM unavailable');
    expect(res.answer).not.toContain('Target Domain');
    expect(res.answer).not.toContain('Recommended Capabilities');
    expect(res.events).toEqual([]);
  });

  it('should delegate natural-language intent and model choice to llm-utils', async () => {
    let capturedOptions: any;
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        capturedOptions = options;
        return {
          ok: true,
          data: {
            thought: 'The request is clear.',
            action: 'final_answer',
            finalAnswer: 'README checked.'
          }
        };
      }
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker
    });

    const res = await actor.execute('unsure readme is aligned with latest changes');

    expect(res.answer).toBe('README checked.');
    expect(capturedOptions.task).toBe('code');
    expect(capturedOptions.model).toBeUndefined();
    expect(capturedOptions.system).toContain('get_git_status');
    expect(capturedOptions.system).toContain('resolve_test_target');
  });

  it('should execute a cognitive loop with a mock Asker and emit pubsub events', async () => {
    let callCount = 0;
    const mockAsker = {
      json: async (prompt: string) => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            data: {
              thought: 'I will inspect the system environment.',
              action: 'tool_call',
              toolCalls: [{ callId: 'call_1', name: 'get_environment_info', parameters: {} }]
            }
          };
        }
        return {
          ok: true,
          data: {
            thought: 'We have sufficient information to conclude.',
            action: 'final_answer',
            finalAnswer: 'The repository environment is verified and operational.'
          }
        };
      }
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      maxSteps: 5
    });

    const actorEvents: any[] = [];
    pubsub.on('actor:step', ev => {
      actorEvents.push(ev.data);
    });

    const res = await actor.execute('/triage check environment state');

    expect(res.mode).toBe('triage');
    expect(res.answer).toContain('verified and operational');
    expect(res.stepsCount).toBe(2);
    expect(actorEvents.length).toBeGreaterThanOrEqual(1);
  });
});
