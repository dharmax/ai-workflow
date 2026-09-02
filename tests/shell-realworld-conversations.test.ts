import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { WorkflowStore } from '../src/store.ts';
import { DecisionManager } from '../src/decisions.ts';
import { CodeletEngine } from '../src/compiler.ts';
import { LocalGitTransport } from '../src/transport.ts';
import { MetricsCollector } from '../src/metrics.ts';
import { type CommandContext } from '../src/registry.ts';
import { ShellAgent } from '../src/shell-agent.ts';
import { InteractiveShell } from '../src/shell.ts';
import { Asker, CompletionEngine, type ProviderAdapter } from '@dharmax/llm-utils';

function getLastTurnInput(opts: any): string {
  const prompt = typeof opts === 'string' ? opts : (opts?.prompt || '');
  const parts = prompt.split(/\n\[USER\]:\s*/);
  return (parts[parts.length - 1] || prompt).trim();
}

describe('ai-workflow Real-World Long Conversational Scenarios & Stress Tests', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let compiler: CodeletEngine;
  let decisions: DecisionManager;
  let transport: LocalGitTransport;
  let metrics: MetricsCollector;
  let ctx: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwf-conv-test-'));
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

    // Populate initial project state with tickets & files
    store.upsertEntity({
      id: 'src/store.ts',
      type: 'file',
      title: 'store.ts',
      body: 'export class WorkflowStore { ... }'
    });
    store.upsertEntity({
      id: 'src/payment.ts',
      type: 'file',
      title: 'payment.ts',
      body: 'export class PaymentService { ... }'
    });
    store.upsertEntity({
      id: 'TKT-TRUST-001',
      type: 'ticket',
      title: 'Restore AIWF Trust and Evidence-Gated Closure',
      lane: 'Done',
      status: 'verified',
      body: 'Enforce unmocked test verification before ticket closure.'
    });
    store.addRelation({
      fromId: 'src/payment.ts',
      toId: 'src/store.ts',
      relation: 'imports'
    });
  });

  afterEach(async () => {
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('Scenario 1: 6-Turn Deep Architectural Design Session with Tool Loop (/design)', async () => {
    const adapter: ProviderAdapter = {
      id: 'simulated-designer',
      async generate(opts) {
        const last = getLastTurnInput(opts);

        // Turn 1: Requirements analysis
        if (last.includes('Event Sourcing and CQRS architecture')) {
          return {
            ok: true,
            text: 'Designing an Event Sourcing & CQRS architecture for payments requires an append-only event log, SQLite journal tables, idempotent event handlers, and snapshotting. Let us inspect our project files first.',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }

        // Turn 2: Inspect codebase files
        if (last.includes('inspect our existing codebase')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "get_project_overview",\n  "args": {}\n}\n```',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }
        if (last.includes('[OBSERVATION for get_project_overview]')) {
          return {
            ok: true,
            text: 'I inspected the project health and entities. We currently have payment.ts and store.ts in place. We are ready to formalize ADR-010.',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }

        // Turn 3: Formulate and Propose ADR-010
        if (last.includes('propose ADR-010')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "propose_decision",\n  "args": {\n    "id": "ADR-010",\n    "title": "Event Sourcing for Payment Ledger",\n    "body": "Adopt append-only event log in SQLite with deterministic replay capabilities.",\n    "lane": "Proposed"\n  }\n}\n```',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }
        if (last.includes('[OBSERVATION for propose_decision]')) {
          return {
            ok: true,
            text: 'ADR-010 has been successfully proposed and stored in the causal graph.',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }

        // Turn 4: Blast radius on store.ts
        if (last.includes('blast radius of modifying src/store.ts')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "get_blast_radius",\n  "args": { "target": "src/store.ts" }\n}\n```',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }
        if (last.includes('[OBSERVATION for get_blast_radius]')) {
          return {
            ok: true,
            text: 'Blast radius analysis complete: modifying src/store.ts directly impacts src/payment.ts.',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }

        // Turn 5: Create execution ticket
        if (last.includes('create two execution tickets')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "create_ticket",\n  "args": {\n    "id": "TKT-EVT-001",\n    "title": "SQLite Event Log Schema & Migrations",\n    "lane": "Todo",\n    "body": "Implement append-only events table per ADR-010."\n  }\n}\n```',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }
        if (last.includes('[OBSERVATION for create_ticket]')) {
          return {
            ok: true,
            text: 'I created ticket TKT-EVT-001 in the Todo lane for SQLite Event Log Schema.',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }

        // Turn 6: Comprehensive summary
        if (last.includes('Summarize everything we decided')) {
          return {
            ok: true,
            text: '### Executive Architecture Summary\n1. **Architecture**: Event Sourcing & CQRS payment journal.\n2. **Decision**: ADR-010 (Event Sourcing for Payment Ledger) proposed.\n3. **Blast Radius**: src/payment.ts is affected by changes to src/store.ts.\n4. **Execution Tickets**: TKT-EVT-001 created in Todo lane.\n5. **Next Steps**: Begin implementation of SQLite journal tables.',
            model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
          };
        }

        return {
          ok: true,
          text: 'Acknowledged. How would you like to proceed?',
          model: { providerId: 'simulated-designer', modelId: 'architect-v1' }
        };
      }
    };

    const completion = new CompletionEngine([adapter]);
    const asker = new Asker({
      completion,
      providers: [{ id: 'simulated-designer', available: true, enabled: true }],
      defaultModel: { providerId: 'simulated-designer', modelId: 'architect-v1' }
    });

    const agent = new ShellAgent(ctx, asker, 'design');

    // Turn 1: Requirements
    const t1 = await agent.turn('We need to design an Event Sourcing and CQRS architecture for payments with SQLite journaling.', 'design');
    expect(t1.output).toContain('Event Sourcing & CQRS');
    expect(agent.getHistory().length).toBe(2);

    // Turn 2: Codebase discovery with tool execution
    const t2 = await agent.turn('Please inspect our existing codebase and project health.', 'design');
    expect(t2.steps.length).toBe(2);
    expect(t2.steps[0].toolCall?.tool).toBe('get_project_overview');
    expect(t2.steps[0].toolResult?.success).toBe(true);
    expect(t2.output).toContain('payment.ts');
    expect(agent.getHistory().length).toBe(6);

    // Turn 3: Propose ADR-010
    const t3 = await agent.turn('Please propose ADR-010 for this event sourcing architecture.', 'design');
    expect(t3.steps.length).toBe(2);
    expect(t3.steps[0].toolCall?.tool).toBe('propose_decision');
    expect(t3.steps[0].toolResult?.success).toBe(true);
    expect(t3.output).toContain('ADR-010');

    // Verify ADR in SQLite store
    const adrEntity = store.getEntity('ADR-010');
    expect(adrEntity).toBeDefined();
    expect(adrEntity?.title).toBe('Event Sourcing for Payment Ledger');

    // Turn 4: Blast radius analysis
    const t4 = await agent.turn('What is the blast radius of modifying src/store.ts?', 'design');
    expect(t4.steps.length).toBe(2);
    expect(t4.steps[0].toolCall?.tool).toBe('get_blast_radius');
    expect(t4.steps[0].toolResult?.success).toBe(true);
    expect(t4.output).toContain('payment.ts');

    // Turn 5: Create execution ticket
    const t5 = await agent.turn('Please create two execution tickets for implementing this.', 'design');
    expect(t5.steps.length).toBe(2);
    expect(t5.steps[0].toolCall?.tool).toBe('create_ticket');
    expect(t5.steps[0].toolResult?.success).toBe(true);

    const ticketEntity = store.getEntity('TKT-EVT-001');
    expect(ticketEntity).toBeDefined();
    expect(ticketEntity?.lane).toBe('Todo');

    // Turn 6: Multi-turn summary recalling entire history
    const t6 = await agent.turn('Summarize everything we decided across this session and next steps.', 'design');
    expect(t6.output).toContain('Executive Architecture Summary');
    expect(t6.output).toContain('ADR-010');
    expect(t6.output).toContain('TKT-EVT-001');
    expect(agent.getHistory().length).toBe(20); // 6 turns with multi-step ReAct traces in memory
  });

  test('Scenario 2: 5-Turn Real-World Bug Triage, OS Shell Execution, and Diagnostic Remediation (/triage)', async () => {
    const adapter: ProviderAdapter = {
      id: 'simulated-triage',
      async generate(opts) {
        const last = getLastTurnInput(opts);

        // Turn 1: Bug sweep
        if (last.includes('sweep the codebase for any bugs')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "sweep_bugs",\n  "args": {}\n}\n```',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }
        if (last.includes('[OBSERVATION for sweep_bugs]')) {
          return {
            ok: true,
            text: 'Bug sweep executed cleanly across the repository. No unhandled syntax bugs detected.',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }

        // Turn 2: Doctor diagnosis
        if (last.includes('Run doctor diagnose')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "doctor_diagnose",\n  "args": {}\n}\n```',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }
        if (last.includes('[OBSERVATION for doctor_diagnose]')) {
          return {
            ok: true,
            text: 'Doctor diagnosis completed: 0 orphaned nodes and all causal graph relations are healthy.',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }

        // Turn 3: OS command execution
        if (last.includes('Run the OS shell to check bun version and list test files')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "exec_os_shell",\n  "args": { "command": "bun --version && echo OK_SHELL_TEST" }\n}\n```',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }
        if (last.includes('[OBSERVATION for exec_os_shell]')) {
          return {
            ok: true,
            text: 'OS Shell output verified: Bun runtime is active and test command succeeded.',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }

        // Turn 4: Record ticket lesson
        if (last.includes('Record a lesson for ticket TKT-TRUST-001')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "record_ticket_lesson",\n  "args": {\n    "ticketId": "TKT-TRUST-001",\n    "lesson": "Never close a ticket without verified evidence-gated test results."\n  }\n}\n```',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }
        if (last.includes('[OBSERVATION for record_ticket_lesson]')) {
          return {
            ok: true,
            text: 'Lesson recorded successfully for TKT-TRUST-001.',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }

        // Turn 5: Next task recommendation
        if (last.includes('What is our next recommended task?')) {
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "recommend_next_task",\n  "args": {}\n}\n```',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }
        if (last.includes('[OBSERVATION for recommend_next_task]')) {
          return {
            ok: true,
            text: 'Next recommended task retrieved from the causal graph.',
            model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
          };
        }

        return {
          ok: true,
          text: 'Triage state verified.',
          model: { providerId: 'simulated-triage', modelId: 'triage-v1' }
        };
      }
    };

    const completion = new CompletionEngine([adapter]);
    const asker = new Asker({
      completion,
      providers: [{ id: 'simulated-triage', available: true, enabled: true }],
      defaultModel: { providerId: 'simulated-triage', modelId: 'triage-v1' }
    });

    const agent = new ShellAgent(ctx, asker, 'triage');

    // 1. Bug sweep
    const t1 = await agent.turn('Please sweep the codebase for any bugs or syntax issues.', 'triage');
    expect(t1.steps[0].toolCall?.tool).toBe('sweep_bugs');
    expect(t1.output).toContain('Bug sweep executed');

    // 2. Doctor diagnose
    const t2 = await agent.turn('Run doctor diagnose on our project graph.', 'triage');
    expect(t2.steps[0].toolCall?.tool).toBe('doctor_diagnose');
    expect(t2.output).toContain('Doctor diagnosis completed');

    // 3. Real OS command execution
    const t3 = await agent.turn('Run the OS shell to check bun version and list test files.', 'triage');
    expect(t3.steps[0].toolCall?.tool).toBe('exec_os_shell');
    expect(t3.steps[0].toolResult?.output).toContain('OK_SHELL_TEST');
    expect(t3.output).toContain('Bun runtime is active');

    // 4. Record ticket lesson
    const t4 = await agent.turn('Record a lesson for ticket TKT-TRUST-001 about evidence-gated verification.', 'triage');
    expect(t4.steps[0].toolCall?.tool).toBe('record_ticket_lesson');
    expect(t4.steps[0].toolResult?.success).toBe(true);

    const artifacts = store.getRunArtifacts('TKT-TRUST-001');
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts[0].lessons?.note).toContain('evidence-gated');

    // 5. Recommend next task
    const t5 = await agent.turn('What is our next recommended task?', 'triage');
    expect(t5.steps[0].toolCall?.tool).toBe('recommend_next_task');
    expect(t5.output).toContain('Next recommended task');
  });

  test('Scenario 3: Tool Error Handling and Self-Correction Resilience', async () => {
    let callCount = 0;
    const adapter: ProviderAdapter = {
      id: 'resilient-agent',
      async generate(opts) {
        callCount++;
        const last = getLastTurnInput(opts);

        if (callCount === 1) {
          // Attempt invalid tool call (missing required field: title)
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "create_ticket",\n  "args": { "id": "TKT-BAD" }\n}\n```',
            model: { providerId: 'resilient-agent', modelId: 'resilient-v1' }
          };
        }

        if (callCount === 2) {
          // Model sees error observation and self-corrects with valid args
          expect(last).toContain('[OBSERVATION for create_ticket]');
          return {
            ok: true,
            text: '```tool_call\n{\n  "tool": "create_ticket",\n  "args": { "id": "TKT-FIXED", "title": "Corrected Ticket Title", "lane": "Todo" }\n}\n```',
            model: { providerId: 'resilient-agent', modelId: 'resilient-v1' }
          };
        }

        // Model sees success and outputs final resolution
        return {
          ok: true,
          text: 'I encountered an argument error, corrected the parameters, and successfully created ticket TKT-FIXED.',
          model: { providerId: 'resilient-agent', modelId: 'resilient-v1' }
        };
      }
    };

    const completion = new CompletionEngine([adapter]);
    const asker = new Asker({
      completion,
      providers: [{ id: 'resilient-agent', available: true, enabled: true }],
      defaultModel: { providerId: 'resilient-agent', modelId: 'resilient-v1' }
    });

    const agent = new ShellAgent(ctx, asker, 'dev');
    const result = await agent.turn('Create a ticket for the user.', 'dev');

    expect(result.steps.length).toBe(3);
    // Step 1: Failed
    expect(result.steps[0].toolResult?.success).toBe(false);
    // Step 2: Succeeded with correction
    expect(result.steps[1].toolResult?.success).toBe(true);
    expect(result.output).toContain('TKT-FIXED');

    const created = store.getEntity('TKT-FIXED');
    expect(created).toBeDefined();
    expect(created?.title).toBe('Corrected Ticket Title');
  });

  test('Scenario 4: InteractiveShell multi-turn session with mode transitions and memory isolation', async () => {
    const responsesMap: Record<string, string> = {
      'what is our architecture': 'Our architecture follows a clean Causal OS with SQLite ledgers and unified capability registry.',
      'who is the lead actor': 'The primary actor is the Autonomous Engineering OS operator.',
      'summarize our design': 'Design summary: Causal OS with multi-mode conversational shell.'
    };

    const adapter: ProviderAdapter = {
      id: 'interactive-adapter',
      async generate(opts) {
        const last = getLastTurnInput(opts);
        for (const [k, v] of Object.entries(responsesMap)) {
          if (last.includes(k)) {
            return {
              ok: true,
              text: v,
              model: { providerId: 'interactive-adapter', modelId: 'interactive-v1' }
            };
          }
        }
        return {
          ok: true,
          text: 'Interactive agent ready.',
          model: { providerId: 'interactive-adapter', modelId: 'interactive-v1' }
        };
      }
    };

    const completion = new CompletionEngine([adapter]);
    const asker = new Asker({
      completion,
      providers: [{ id: 'interactive-adapter', available: true, enabled: true }],
      defaultModel: { providerId: 'interactive-adapter', modelId: 'interactive-v1' }
    });

    const shell = new InteractiveShell(store, asker);

    // 1. Initial conversation in design mode
    const out1 = await shell.executeCommand('what is our architecture');
    expect(out1).toContain('Causal OS');

    // 2. Switch mode to product
    const modeOut = await shell.executeCommand('/product');
    expect(modeOut).toContain('PRODUCT');
    expect(shell.mode).toBe('product');
    expect(shell.agent.mode).toBe('product');

    // 3. Product turn (retaining history)
    const out2 = await shell.executeCommand('who is the lead actor');
    expect(out2).toContain('Autonomous Engineering OS operator');
    expect(shell.agent.getHistory().length).toBe(4);

    // 4. Memory Clear via /clear
    const clearOut = await shell.executeCommand('/clear');
    expect(clearOut).toContain('Cleared');
    expect(shell.agent.getHistory().length).toBe(0);

    // 5. Post-clear turn
    const out3 = await shell.executeCommand('summarize our design');
    expect(out3).toContain('Design summary');
    expect(shell.agent.getHistory().length).toBe(2);
  });
});
