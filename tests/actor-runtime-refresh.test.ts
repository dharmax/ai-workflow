import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowActor } from '../src/actor/engine.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { saveConfig } from '../src/config.ts';
import { processShellInput, type ShellSession } from '../src/shell.ts';

describe('WorkflowActor runtime refresh & effective target (J2.5)', () => {
  let root: string;
  let store: WorkflowStore;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-runtime-refresh-test-'));
    fs.mkdirSync(path.join(root, '.ai-workflow'));
    saveConfig(root, {
      model: 'ollama/qwen2.5-coder:7b',
      modelRoutes: {
        dev: 'ollama/qwen2.5-coder:7b',
        design: 'openai/o3-mini',
      }
    });
    store = new WorkflowStore(root, true);
    await store.sp.ready();
  });

  afterEach(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves initial effective route based on configured providers and routes', () => {
    const actor = new WorkflowActor({ store, projectRoot: root, toolDiscovery: null });
    const effectiveDev = actor.getEffectiveRoute('dev');
    expect(effectiveDev).toBeDefined();
    expect(effectiveDev?.target).toBe('ollama/qwen2.5-coder:7b');

    const effectiveDesign = actor.getEffectiveRoute('design');
    expect(effectiveDesign).toBeDefined();
    expect(effectiveDesign?.target).toBe('openai/o3-mini');
  });

  it('updates resolved routes dynamically after saveConfig and reloadConfig on the same instance', () => {
    const actor = new WorkflowActor({ store, projectRoot: root, toolDiscovery: null });
    expect(actor.getEffectiveRoute('dev')?.target).toBe('ollama/qwen2.5-coder:7b');

    // Update config on disk
    saveConfig(root, {
      modelRoutes: {
        dev: 'openrouter/anthropic/claude-sonnet-4.6',
        design: 'openai/o3-mini',
      }
    });

    // Before reloadConfig, same actor still sees old route
    expect(actor.getEffectiveRoute('dev')?.target).toBe('ollama/qwen2.5-coder:7b');

    // Trigger runtime reload
    actor.reloadConfig();

    // Now the same actor instance reflects the new target
    expect(actor.getEffectiveRoute('dev')?.target).toBe('openrouter/anthropic/claude-sonnet-4.6');
  });

  it('preserves injected mock askers during reloadConfig', () => {
    const mockAsker = {
      getRouter: () => ({
        resolve: () => ({ providerId: 'mock', modelId: 'model-1' })
      })
    } as any;

    const actor = new WorkflowActor({ store, projectRoot: root, asker: mockAsker });
    expect(actor.getAsker()).toBe(mockAsker);

    saveConfig(root, {
      modelRoutes: { dev: 'some/other-model' }
    });
    actor.reloadConfig();

    // Injected mock asker remains untouched
    expect(actor.getAsker()).toBe(mockAsker);
  });

  it('displays Effective routes and reloads runtime on /model set in interactive shell', async () => {
    const actor = new WorkflowActor({ store, projectRoot: root, toolDiscovery: null });
    const session: ShellSession = {
      store,
      projectRoot: root,
      actor
    };

    // 1. Initial /model output displays effective target
    const modelOut1 = await processShellInput('/model', session);
    expect(modelOut1.output).toContain('Effective:');
    expect(modelOut1.output).toContain('ollama/qwen2.5-coder:7b');

    // 2. Run model set in shell
    const setOut = await processShellInput('model set dev openrouter/anthropic/claude-sonnet-4.6', session);
    expect(setOut.output).toContain('Set model for [DEV] to: openrouter/anthropic/claude-sonnet-4.6');

    // 3. session.actor has been reloaded dynamically
    expect(session.actor.getEffectiveRoute('dev')?.target).toBe('openrouter/anthropic/claude-sonnet-4.6');

    // 4. Subsequent /model reflects updated effective target
    const modelOut2 = await processShellInput('model', session);
    expect(modelOut2.output).toContain('Effective:');
    expect(modelOut2.output).toContain('openrouter/anthropic/claude-sonnet-4.6');
  });

  it('records and retrieves execution metrics accurately via getLastExecutionMetrics', () => {
    const actor = new WorkflowActor({ store, projectRoot: root, toolDiscovery: null });
    expect(actor.getLastExecutionMetrics()).toBeUndefined();

    // Simulate metric recording
    actor.metrics.append({
      kind: 'llm',
      timestamp: new Date().toISOString(),
      latencyMs: 142,
      success: true,
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4.6',
      promptTokens: 50,
      completionTokens: 25,
      totalTokens: 75
    });

    const last = actor.getLastExecutionMetrics();
    expect(last).toBeDefined();
    expect(last?.providerId).toBe('openrouter');
    expect(last?.modelId).toBe('anthropic/claude-sonnet-4.6');
    expect(last?.latencyMs).toBe(142);
    expect(last?.totalTokens).toBe(75);
  });
});
