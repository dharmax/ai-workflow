import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { WorkflowStore } from '../src/store.ts';
import { DecisionManager } from '../src/decisions.ts';
import { CodeletEngine } from '../src/compiler.ts';
import { LocalGitTransport } from '../src/transport.ts';
import { MetricsCollector } from '../src/metrics.ts';
import { registry, type CommandContext } from '../src/registry.ts';
import { executeOsCommand } from '../src/os-shell.ts';
import { getAvailableShellTools, executeShellTool } from '../src/shell-tools.ts';
import { ShellAgent } from '../src/shell-agent.ts';
import { InteractiveShell } from '../src/shell.ts';
import { Asker } from '@dharmax/llm-utils';

describe('ai-workflow Autonomous Shell Agent & OS Engine Tests', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let compiler: CodeletEngine;
  let decisions: DecisionManager;
  let transport: LocalGitTransport;
  let metrics: MetricsCollector;
  let ctx: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwf-agent-test-'));
    store = new WorkflowStore(tempDir);
    compiler = new CodeletEngine(store);
    decisions = new DecisionManager(store);
    transport = new LocalGitTransport(store);
    metrics = new MetricsCollector(store);

    ctx = {
      store,
      compiler,
      decisions,
      transport,
      metrics,
      projectRoot: tempDir
    };
  });

  afterEach(async () => {
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('executeOsCommand runs shell commands and captures stdout/stderr/exitCode', async () => {
    const res1 = await executeOsCommand('echo "bun os runner works"', { cwd: tempDir });
    expect(res1.success).toBe(true);
    expect(res1.exitCode).toBe(0);
    expect(res1.stdout).toBe('bun os runner works');

    const res2 = await executeOsCommand('exit 42', { cwd: tempDir });
    expect(res2.success).toBe(false);
    expect(res2.exitCode).toBe(42);
  });

  test('getAvailableShellTools exposes all registry capabilities + exec_os_shell', () => {
    const tools = getAvailableShellTools();
    expect(tools.length).toBeGreaterThanOrEqual(30);

    const osTool = tools.find(t => t.name === 'exec_os_shell');
    expect(osTool).toBeDefined();
    expect(osTool?.category).toBe('system');

    const overviewTool = tools.find(t => t.name === 'get_project_overview');
    expect(overviewTool).toBeDefined();

    const blastTool = tools.find(t => t.name === 'get_blast_radius');
    expect(blastTool).toBeDefined();
  });

  test('executeShellTool executes capabilities and OS commands against CommandContext', async () => {
    // 1. Execute OS shell tool
    const osRes = await executeShellTool('exec_os_shell', { command: 'echo "hello from tool"' }, ctx);
    expect(osRes.success).toBe(true);
    expect(osRes.output).toContain('hello from tool');

    // 2. Execute get_project_overview
    const overviewRes = await executeShellTool('get_project_overview', {}, ctx);
    expect(overviewRes.success).toBe(true);
    expect(overviewRes.data).toBeDefined();
    expect(overviewRes.data.totalTickets).toBeDefined();

    // 3. Execute propose_decision
    const adrRes = await executeShellTool('propose_decision', {
      id: 'ADR-TEST-01',
      title: 'Adopt Reactive Agent Loop',
      body: 'Autonomous shell reasoning protocol'
    }, ctx);
    expect(adrRes.success).toBe(true);
    expect(adrRes.data.id).toBe('ADR-TEST-01');

    // Verify in store
    const entity = store.getEntity('ADR-TEST-01');
    expect(entity).toBeDefined();
    expect(entity?.title).toBe('Adopt Reactive Agent Loop');
  });

  test('ShellAgent multi-turn memory, mode switching, and clear', async () => {
    const { CompletionEngine } = await import('@dharmax/llm-utils');
    const mockAdapter = {
      id: 'mock',
      async generate(opts: any) {
        if (opts.prompt.includes('ADR-TEST-01')) {
          return {
            ok: true,
            text: 'ADR-TEST-01 is about adopting reactive agent loop.',
            model: { providerId: 'mock', modelId: 'mock-agent' }
          };
        }
        return {
          ok: true,
          text: 'I am your systems architect.',
          model: { providerId: 'mock', modelId: 'mock-agent' }
        };
      }
    };
    const completion = new CompletionEngine([mockAdapter as any]);
    const mockAsker = new Asker({
      completion,
      providers: [{ id: 'mock', available: true, enabled: true }],
      defaultModel: { providerId: 'mock', modelId: 'mock-agent' }
    });

    const agent = new ShellAgent(ctx, mockAsker, 'design');
    expect(agent.mode).toBe('design');

    // Turn 1
    const res1 = await agent.turn('Hello, what is your role?', 'design');
    expect(res1.output).toContain('architect');
    expect(agent.getHistory().length).toBe(2);

    // Switch mode
    agent.setMode('dev');
    expect(agent.mode).toBe('dev');

    // Clear
    agent.clear();
    expect(agent.getHistory().length).toBe(0);
  });

  test('ShellAgent executes ReAct tool calls and synthesizes final answer', async () => {
    const { CompletionEngine } = await import('@dharmax/llm-utils');
    let callCount = 0;
    const mockAdapter = {
      id: 'mock',
      async generate() {
        callCount++;
        if (callCount === 1) {
          // Step 1: Model requests a tool call to propose ADR
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "propose_decision",\n  "args": { "id": "ADR-AGENT-99", "title": "Automated Agent ADR", "body": "Proposed autonomously" }\n}\n```',
            model: { providerId: 'mock', modelId: 'mock-agent' }
          };
        }
        // Step 2: Model sees observation and outputs final answer
        return {
          ok: true,
          text: 'I have successfully proposed ADR-AGENT-99 for the project.',
          model: { providerId: 'mock', modelId: 'mock-agent' }
        };
      }
    };
    const completion = new CompletionEngine([mockAdapter as any]);
    const mockAsker = new Asker({
      completion,
      providers: [{ id: 'mock', available: true, enabled: true }],
      defaultModel: { providerId: 'mock', modelId: 'mock-agent' }
    });

    const agent = new ShellAgent(ctx, mockAsker, 'design');
    const result = await agent.turn('Please create an ADR for automated agents.', 'design');

    expect(result.steps.length).toBe(2);
    expect(result.steps[0].toolCall?.tool).toBe('propose_decision');
    expect(result.steps[0].toolResult?.success).toBe(true);
    expect(result.output).toContain('ADR-AGENT-99');

    // Verify entity was saved in store
    const adr = store.getEntity('ADR-AGENT-99');
    expect(adr).toBeDefined();
    expect(adr?.title).toBe('Automated Agent ADR');
  });

  test('InteractiveShell handles /clear and routes natural language into agent', async () => {
    const shell = new InteractiveShell(store);

    // Test /clear
    const clearOut = await shell.executeCommand('/clear');
    expect(clearOut).toContain('Cleared');

    // Test mode switch
    const devOut = await shell.executeCommand('/dev');
    expect(devOut).toContain('DEV');
    expect(shell.mode).toBe('dev');
    expect(shell.agent.mode).toBe('dev');

    // Test offline notice when no custom asker configured
    const countOut = await shell.executeCommand('how many todo tickets do we have');
    expect(countOut).toContain('Notice: LLM provider');

    // Test instant grounded fallback on project inquiries
    const projectOut = await shell.executeCommand('tell me about this project');
    expect(projectOut).toContain('LIVE PROJECT CAUSAL GRAPH CONTEXT');
  });

  test('ShellAgent never returns "Task completed." on timeout/error and surfaces the exact error', async () => {
    const { CompletionEngine } = await import('@dharmax/llm-utils');
    const timeoutAdapter = {
      id: 'mock-timeout',
      async generate() {
        return {
          ok: false,
          text: '',
          failure: { kind: 'timeout', message: 'The operation timed out.' },
          model: { providerId: 'mock-timeout', modelId: 'mock-agent' }
        };
      }
    };
    const completion = new CompletionEngine([timeoutAdapter as any]);
    const mockAsker = new Asker({
      completion,
      providers: [{ id: 'mock-timeout', available: true, enabled: true }],
      defaultModel: { providerId: 'mock-timeout', modelId: 'mock-agent' }
    });

    const agent = new ShellAgent(ctx, mockAsker, 'product');
    const result = await agent.turn('tell me about this project', 'product', { timeoutMs: 100 });

    expect(result.output).not.toBe('Task completed.');
    expect(result.output).toContain('Model communication issue');
    expect(result.output).toContain('The operation timed out.');
  });

  test('ShellAgent preserves partial tool observations when subsequent reasoning step fails', async () => {
    const { CompletionEngine } = await import('@dharmax/llm-utils');
    let callCount = 0;
    const partialAdapter = {
      id: 'mock-partial',
      async generate() {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "get_project_overview",\n  "args": {}\n}\n```',
            model: { providerId: 'mock-partial', modelId: 'mock-agent' }
          };
        }
        return {
          ok: false,
          text: '',
          failure: { kind: 'timeout', message: 'Secondary step timed out.' },
          model: { providerId: 'mock-partial', modelId: 'mock-agent' }
        };
      }
    };
    const completion = new CompletionEngine([partialAdapter as any]);
    const mockAsker = new Asker({
      completion,
      providers: [{ id: 'mock-partial', available: true, enabled: true }],
      defaultModel: { providerId: 'mock-partial', modelId: 'mock-agent' }
    });

    const agent = new ShellAgent(ctx, mockAsker, 'product');
    const result = await agent.turn('what modules do we have?', 'product', { timeoutMs: 100 });

    expect(result.output).not.toBe('Task completed.');
    expect(result.output).toContain('Model communication issue');
    expect(result.output).toContain('Observations Collected Before Failure');
    expect(result.output).toContain('AI-WORKFLOW CAUSAL OS');
  });

  test('ShellAgent synthesizes findings from collected observations when maxSteps is reached', async () => {
    const { CompletionEngine } = await import('@dharmax/llm-utils');
    const loopAdapter = {
      id: 'mock-loop',
      async generate(opts: any) {
        if (opts.prompt.includes('summarize your final findings')) {
          return {
            ok: false,
            text: '',
            failure: { kind: 'error', message: 'Summary generation failed.' },
            model: { providerId: 'mock-loop', modelId: 'mock-agent' }
          };
        }
        return {
          ok: true,
          text: '```tool_call\n{\n  "tool": "get_project_overview",\n  "args": {}\n}\n```',
          model: { providerId: 'mock-loop', modelId: 'mock-agent' }
        };
      }
    };
    const completion = new CompletionEngine([loopAdapter as any]);
    const mockAsker = new Asker({
      completion,
      providers: [{ id: 'mock-loop', available: true, enabled: true }],
      defaultModel: { providerId: 'mock-loop', modelId: 'mock-agent' }
    });

    const agent = new ShellAgent(ctx, mockAsker, 'product');
    const result = await agent.turn('loop test', 'product', { maxSteps: 2, timeoutMs: 100 });

    expect(result.output).not.toBe('Task completed.');
    expect(result.output).toContain('Completed maximum reasoning steps (2)');
    expect(result.output).toContain('Findings gathered from tools');
  });

  test('executeShellTool blocks destructive/mutating commands via Safety Gate', async () => {
    const pushRes = await executeShellTool('exec_os_shell', { command: 'git push origin main' }, ctx);
    expect(pushRes.success).toBe(false);
    expect(pushRes.output).toContain('[BLOCKED BY SAFETY GATE]');

    const commitRes = await executeShellTool('exec_os_shell', { command: 'git commit -m "test"' }, ctx);
    expect(commitRes.success).toBe(false);
    expect(commitRes.output).toContain('[BLOCKED BY SAFETY GATE]');

    const rmRes = await executeShellTool('exec_os_shell', { command: 'rm -rf /tmp/test' }, ctx);
    expect(rmRes.success).toBe(false);
    expect(rmRes.output).toContain('[BLOCKED BY SAFETY GATE]');

    const branchRes = await executeShellTool('exec_os_shell', { command: 'git branch -m main' }, ctx);
    expect(branchRes.success).toBe(false);
    expect(branchRes.output).toContain('[BLOCKED BY SAFETY GATE]');

    // Safe command passes
    const statusRes = await executeShellTool('exec_os_shell', { command: 'git status' }, ctx);
    expect(statusRes.output).not.toContain('[BLOCKED BY SAFETY GATE]');
  });
});
