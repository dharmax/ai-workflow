import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowActor, type ShellMode } from '../src/actor/engine.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { saveConfig } from '../src/config.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { ToolDiscovery } from '../src/tools/discovery.ts';
import { Epic, Feature, UserStory, Ticket, TestNode } from '../src/graph/ontology.ts';
import { getCoverage } from '../src/product/coverage.ts';
import { getProductImpact } from '../src/product/impact.ts';
import type { Asker } from '@dharmax/llm-utils';

describe('User Story: STORY-AIWF-SOPHISTICATED-GOAL (J2.4)', () => {
  let root: string;
  let store: WorkflowStore;

  beforeEach(async () => {
    initializeTools();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-j24-user-story-'));
    fs.mkdirSync(path.join(root, '.ai-workflow'), { recursive: true });
    saveConfig(root, {
      model: 'ollama/qwen2.5-coder:7b',
      modelRoutes: {
        dev: 'ollama/qwen2.5-coder:7b',
        product: 'ollama/qwen2.5-coder:7b',
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

  it('Criterion 3: Semantic discovery normalizes natural compound domain/object queries without unsupported classification errors', async () => {
    // Fake asker for semantic classifier that returns natural compound classification:
    // User asked about "project", so classifier returns domain: ["project"], object: ["goal", "hotspots"]
    const asker = {
      json: async (_prompt: string, _schema: unknown, options: { system?: string }) => {
        if (options.system?.includes('Classify one AI-Workflow request')) {
          return {
            ok: true,
            data: {
              mode: ['product'],
              domain: ['project'],
              object: ['goal', 'hotspots'],
              action: ['get', 'analyze'],
              effect: ['read']
            }
          };
        }
        if (options.system?.startsWith('Qualify semantic discovery')) {
          const candidates: Array<{ id: string }> = JSON.parse(_prompt).candidates;
          return {
            ok: true,
            data: { ids: candidates.map(c => c.id) }
          };
        }
        return { ok: true, data: {} };
      }
    } as unknown as Asker;

    const discovery = new ToolDiscovery(registry, asker);
    const discovered = await discovery.discover("what's on the critical path of this project? what's the goal of the project? what's missing?");

    // Must not return unsupported capability value error; must discover mapped tools
    expect(discovered.error).toBeUndefined();
    const toolNames = discovered.tools.map(t => t.name);
    expect(toolNames).toContain('get_goal');
  });

  it('Criterion 1: Solves compound project goal + critical path + missing evidence from governing project documentation', async () => {
    const fixture = `# Orchard project
Goal: launch the Orchard offline inventory service.
Critical dependency chain: schema migration -> import validation -> release.
Blocker: import validation awaits the migration.
Missing: restore drill evidence.
`;
    fs.writeFileSync(path.join(root, 'project.md'), fixture);

    // Realistic multi-turn Actor that acquires project.md and synthesizes the grounded answer
    let actorTurns = 0;
    const executedCommands: string[] = [];
    const asker = {
      json: async (_prompt: string, _schema: unknown, options: { system?: string }) => {
        actorTurns++;
        if (actorTurns === 1) {
          // Turn 1: Inspect governing project document
          return {
            ok: true,
            data: {
              thought: 'Acquire governing project documentation to discover goal, critical path, and blockers.',
              action: 'tool_call',
              toolCalls: [{
                callId: 'call-1',
                name: 'run_command',
                parameters: { command: 'cat project.md' }
              }]
            }
          };
        }

        // Turn 2: Synthesize final answer from observed evidence
        expect(_prompt).toContain('launch the Orchard offline inventory service');
        expect(_prompt).toContain('schema migration -> import validation -> release');
        expect(_prompt).toContain('restore drill evidence');
        return {
          ok: true,
          data: {
            thought: 'Synthesize all 3 parts from the observed project.md evidence.',
            action: 'final_answer',
            finalAnswer: 'Goal: launch the Orchard offline inventory service.\nCritical Path: schema migration -> import validation -> release.\nMissing: restore drill evidence.'
          }
        };
      }
    } as unknown as Asker;

    const actor = new WorkflowActor({ store, projectRoot: root, asker, toolDiscovery: null });
    const result = await actor.execute("what's on the critical path of this project? what's the goal of the project? what's missing?");

    expect(result.failed).toBeUndefined();
    expect(result.stepsCount).toBe(2);
    expect(result.answer).toContain('launch the Orchard offline inventory service');
    expect(result.answer).toContain('schema migration -> import validation -> release');
    expect(result.answer).toContain('restore drill evidence');

    // Confirm that the tool called was run_command cat project.md and not dummy echoes
    const calls = result.events.flatMap(e => e.toolCalls || []);
    expect(calls.length).toBe(1);
    expect(calls[0].toolName).toBe('run_command');
    expect(calls[0].parameters.command).toBe('cat project.md');
  });

  it('Criterion 2: Evaluates recommendation policy & candidate ordering (2nd recommended ticket)', async () => {
    const policyDoc = `# Next work recommendation policy
Only Todo tickets are eligible. Order by numeric priority ascending; ties by ticket ID ascending.
| ID | Priority | Lane | Main artifact |
| --- | --- | --- | --- |
| ORCH-A | 1 | Todo | inventory-engine |
| ORCH-B | 2 | Todo | sync-service |
| ORCH-C | 3 | Todo | inventory-engine |
| ORCH-X | 0 | Done | legacy-import |
`;
    fs.writeFileSync(path.join(root, 'project.md'), policyDoc);

    let actorTurns = 0;
    const asker = {
      json: async (_prompt: string, _schema: unknown, options: { system?: string }) => {
        actorTurns++;
        if (actorTurns === 1) {
          return {
            ok: true,
            data: {
              thought: 'Inspect governing project document for ticket recommendation policy and candidate table.',
              action: 'tool_call',
              toolCalls: [{
                callId: 'call-1',
                name: 'run_command',
                parameters: { command: 'cat project.md' }
              }]
            }
          };
        }

        // Must observe that ORCH-X is Done (ineligible), ORCH-A is #1 (priority 1), ORCH-B is #2 (priority 2)
        expect(_prompt).toContain('ORCH-A');
        expect(_prompt).toContain('ORCH-B');
        return {
          ok: true,
          data: {
            thought: 'Under the policy, only Todo tickets are eligible. ORCH-X is Done. Eligible ranking: 1. ORCH-A (priority 1), 2. ORCH-B (priority 2). Therefore ORCH-B is the 2nd most recommended.',
            action: 'final_answer',
            finalAnswer: 'The 2nd most recommended next ticket is ORCH-B (priority 2, Todo).'
          }
        };
      }
    } as unknown as Asker;

    const actor = new WorkflowActor({ store, projectRoot: root, asker, toolDiscovery: null });
    const result = await actor.execute('give me the 2nd most recommended next ticket?');

    expect(result.failed).toBeUndefined();
    expect(result.stepsCount).toBe(2);
    expect(result.answer).toContain('ORCH-B');
  });

  it('Criterion 1 & 2 (Graph Domain): Structural coverage & product impact accurately expose critical path and missing verification', async () => {
    // Build an authentic product intent graph
    const epic = await store.upsertEntity(Epic.dcr, {
      id: 'EPIC-ORCH',
      title: 'Orchard Inventory Service',
      status: 'active'
    });

    const feature = await store.upsertEntity(Feature.dcr, {
      id: 'FEAT-SYNC',
      title: 'Sync Service Component',
      status: 'active'
    });
    await store.relate(epic, 'contains', feature);

    const story = await store.upsertEntity(UserStory.dcr, {
      id: 'STORY-OFFLINE',
      title: 'Offline Inventory Sync',
      status: 'accepted'
    });
    await store.relate(feature, 'contains', story);

    const ticket = await store.upsertEntity(Ticket.dcr, {
      id: 'ORCH-B',
      title: 'Implement sync service handler',
      lane: 'Todo',
      priority: 'P1'
    });
    await store.relate(ticket, 'implements', story);

    // 1. Evaluate coverage gaps on story (lacks test verification)
    const storyCoverage = await getCoverage(store, 'STORY-OFFLINE');
    expect(storyCoverage.complete).toBe(false);
    expect(storyCoverage.gaps.some(g => g.kind === 'missing_verification')).toBe(true);

    // 2. Evaluate impact neighborhood on feature (traces dependencies & tickets)
    const impact = await getProductImpact(store, 'FEAT-SYNC');
    expect(impact.epics).toContain('EPIC-ORCH');
    expect(impact.stories).toContain('STORY-OFFLINE');
    expect(impact.tickets).toContain('ORCH-B');
  });
});
