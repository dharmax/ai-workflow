import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools } from '../src/tools/index.ts';
import { WorkflowActor, pubsub } from '../src/actor/engine.ts';
import { resolveCloudCredentials, saveConfig } from '../src/config.ts';
import { FileNode } from '../src/graph/ontology.ts';

const noTools = (mode: 'design' | 'dev' | 'triage' | 'product' = 'dev') => ({
  discover: async () => ({query: {}, mode, tools: []}),
})

describe('Cognitive Escalation & Multi-Provider Engine', () => {
  let tempDir: string;
  let store: WorkflowStore;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-escalate-test-'));
    store = new WorkflowStore(tempDir, true);
    initializeTools();
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('should resolve cloud credentials from environment variables', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test5678';
    process.env.GEMINI_API_KEY = 'sk-gem-test9012';
    process.env.OPENAI_API_KEY = 'sk-oai-test3456';

    const creds = resolveCloudCredentials();
    expect(creds.openrouterApiKey).toBe('sk-or-test1234');
    expect(creds.anthropicApiKey).toBe('sk-ant-test5678');
    expect(creds.geminiApiKey).toBe('sk-gem-test9012');
    expect(creds.openaiApiKey).toBe('sk-oai-test3456');
  });

  it('should register providers based on resolved credentials', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test5678';

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      preferLocal: false
    });

    const providers = actor.getConfiguredProviders();
    expect(providers).toContain('ollama');
    expect(providers).toContain('openrouter');
    expect(providers).toContain('anthropic');
  });

  it('should not escalate when policy is local_only', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    saveConfig(tempDir, {
      escalation: {
        policy: 'local_only',
        blastRadiusThreshold: 3,
        testRetryThreshold: 2
      }
    });

    let askOptions: any;
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        askOptions = options;
        return {
          ok: true,
          data: {
            thought: 'Conclude',
            action: 'final_answer',
            finalAnswer: 'Local reasoning complete'
          }
        };
      }
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: noTools()
    });

    const res = await actor.execute('/design propose system architecture');
    expect(res.escalated).toBeFalsy();
    expect(res.targetModel).toBeUndefined();
    expect(askOptions.task).toBe('reasoning');
    expect(askOptions.preferLocal).toBe(true);
  });

  it('should auto-escalate upon observable no-progress when cloud provider is configured and emit pubsub event', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    saveConfig(tempDir, {
      escalation: {
        policy: 'auto',
        blastRadiusThreshold: 3,
        testRetryThreshold: 2
      }
    });

    let escalationEventReceived: any = null;
    pubsub.on('actor:escalate', (ev) => {
      escalationEventReceived = ev.data;
    });

    const recordedAskOptions: any[] = [];
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        recordedAskOptions.push(options);
        // On initial attempt with local preference, simulate observable no-progress (e.g. model failure / stall)
        if (options.preferLocal) {
          return {
            ok: false,
            failure: { message: 'Local model exhausted context without viable action' }
          };
        }
        // On escalated attempt (after observable no-progress triggers escalation), conclude successfully
        return {
          ok: true,
          data: {
            thought: 'Deep reasoning concludes the task',
            action: 'final_answer',
            finalAnswer: 'Escalated reasoning completed successfully'
          }
        };
      }
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      toolDiscovery: noTools()
    });
    // Inject mockAsker directly onto actor instance so options.asker is not set
    (actor as any).asker = mockAsker;
    (actor as any).session = new (await import('@dharmax/llm-utils')).LLMSession(mockAsker);

    const res = await actor.execute('/dev resolve complex state issue');

    expect(res.escalated).toBe(true);
    expect(res.escalationReason).toBeDefined();
    expect(res.answer).toContain('Escalated reasoning completed');
    expect(escalationEventReceived).not.toBeNull();
    expect(escalationEventReceived.mode).toBe('dev');
    expect(escalationEventReceived.taskClass).toBe('reasoning');
    expect(escalationEventReceived.preferLocal).toBe(false);

    // Initial attempts were on 'code' task with local preference
    expect(recordedAskOptions[0].task).toBe('code');
    expect(recordedAskOptions[0].preferLocal).toBe(true);
    // Escalated attempt was on 'reasoning' task with remote allowance
    const lastAsk = recordedAskOptions[recordedAskOptions.length - 1];
    expect(lastAsk.task).toBe('reasoning');
    expect(lastAsk.preferLocal).toBe(false);
  });

  it('keeps automatic escalation task-routed so configured routes can fall back', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    saveConfig(tempDir, {
      modelRoutes: {
        dev: 'anthropic/claude-3.7-sonnet'
      }
    });

    let askOptions: any;
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        askOptions = options;
        return {
          ok: true,
          data: {
            thought: 'Done',
            action: 'final_answer',
            finalAnswer: 'Custom route executed'
          }
        };
      }
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: noTools()
    });

    const res = await actor.execute('/dev write unit test', undefined, {forceCloud: true});
    expect(res.escalated).toBe(true);
    expect(askOptions.model).toBeUndefined();
    expect(askOptions.task).toBe('code');
    expect(askOptions.preferLocal).toBe(false);
  });

  it('should not escalate upon observable no-progress when policy is local_only', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    saveConfig(tempDir, {
      escalation: {
        policy: 'local_only',
        blastRadiusThreshold: 3,
        testRetryThreshold: 2
      }
    });

    let escalationTriggered = false;
    pubsub.on('actor:escalate', () => {
      escalationTriggered = true;
    });

    let callCount = 0;
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, _options: any) => {
        callCount++;
        return {
          ok: true,
          data: {
            thought: 'Repeating observation',
            action: 'tool_call',
            toolCalls: [{
              callId: `call_${callCount}`,
              name: 'run_command',
              parameters: { command: 'echo local_stall' }
            }]
          }
        };
      }
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: noTools()
    });

    const res = await actor.execute('/dev attempt stall in local-only');
    expect(res.escalated).toBeFalsy();
    expect(escalationTriggered).toBe(false);
    expect(res.failed).toBe(true);
  });
});

