import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools } from '../src/tools/index.ts';
import { WorkflowActor, pubsub } from '../src/actor/engine.ts';
import { resolveCloudCredentials, saveConfig } from '../src/config.ts';
import { FileNode } from '../src/graph/ontology.ts';

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

    const mockAsker = {
      json: async () => ({
        ok: true,
        data: {
          thought: 'Conclude',
          action: 'final_answer',
          finalAnswer: 'Local reasoning complete'
        }
      })
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker
    });

    const res = await actor.execute('/design propose system architecture');
    expect(res.escalated).toBeFalsy();
    expect(res.targetModel).toContain('ollama');
  });

  it('should auto-escalate in design mode when cloud provider is configured and emit pubsub event', async () => {
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

    const mockAsker = {
      json: async () => ({
        ok: true,
        data: {
          thought: 'Conclude design',
          action: 'final_answer',
          finalAnswer: 'Frontier architecture designed'
        }
      })
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker
    });

    const res = await actor.execute('/design propose system architecture');

    expect(res.escalated).toBe(true);
    expect(res.escalationReason).toContain('Design mode');
    expect(res.targetModel).toContain('openrouter');
    expect(res.targetModel).toContain('deepseek');
    expect(escalationEventReceived).not.toBeNull();
    expect(escalationEventReceived.mode).toBe('design');
    expect(escalationEventReceived.targetModel).toBe(res.targetModel);
  });

  it('should respect custom modelRoutes overrides', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    saveConfig(tempDir, {
      modelRoutes: {
        dev: 'anthropic/claude-3.7-sonnet'
      }
    });

    const mockAsker = {
      json: async () => ({
        ok: true,
        data: {
          thought: 'Done',
          action: 'final_answer',
          finalAnswer: 'Custom route executed'
        }
      })
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker
    });

    const res = await actor.execute('/dev write unit test');
    expect(res.targetModel).toBe('anthropic/claude-3.7-sonnet');
  });

  it('should auto-escalate when blast radius exceeds threshold', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test1234';
    saveConfig(tempDir, {
      escalation: {
        policy: 'auto',
        blastRadiusThreshold: 1,
        testRetryThreshold: 2
      }
    });

    // Create and save a file entity in store
    await store.upsertEntity<FileNode>(FileNode.dcr, {
      id: 'src/core.ts',
      name: 'src/core.ts',
      path: 'src/core.ts',
      size: 100,
      lastModified: Date.now()
    });

    const mockAsker = {
      json: async () => ({
        ok: true,
        data: {
          thought: 'Conclude',
          action: 'final_answer',
          finalAnswer: 'Blast radius mutation concluded'
        }
      })
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker
    });

    const res = await actor.execute('Refactor src/core.ts and update all callers');
    expect(res.escalated).toBe(true);
    expect(res.escalationReason).toContain('Blast radius');
    expect(res.targetModel).toContain('deepseek');
  });
});
