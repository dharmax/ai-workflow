import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { WorkflowActor, classifyIntentMode, type ShellMode, pubsub } from '../src/actor/engine.ts';
import { Ticket } from '../src/graph/ontology.ts';
import type {Asker} from '@dharmax/llm-utils';

const discover = (names: string[] = [], mode: 'design' | 'dev' | 'triage' | 'product' = 'dev') => ({
  discover: async () => ({
    query: {},
    mode,
    tools: names.map(name => registry.get(name)).filter(Boolean) as any[],
  }),
})

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

  it('answers the next-ticket question through actual semantic discovery and selector execution', async () => {
    await store.upsertEntity(Ticket.dcr, {id: 'BUG-NEXT', title: 'Fix a demonstrated bug', lane: 'Todo', priority: 'P1'});
    let classifierCalls = 0, actorCalls = 0, finalPrompt = '';
    const asker = {json: async (prompt: string, _schema: unknown, options: {system?: string}) => {
      if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
      if (options.system?.includes('Classify one AI-Workflow request')) {
        classifierCalls++;
        return {ok: true, data: {mode: ['product'], domain: ['ticket'], object: ['ticket'], action: ['recommend'], effect: ['read']}};
      }
      actorCalls++;
      if (actorCalls === 1) return {ok: true, data: {thought: '', action: 'tool_call', toolCalls: [{callId: 'next', name: 'recommend_next_task', parameters: {}}]}};
      finalPrompt = prompt;
      return {ok: true, data: {thought: '', action: 'final_answer', finalAnswer: 'Work on BUG-NEXT: Fix a demonstrated bug.'}};
    }} as unknown as Asker;
    const actor = new WorkflowActor({store, projectRoot: tempDir, asker});
    const result = await actor.execute("what's the next recommeded ticket?");
    expect(result.failed).toBeUndefined();
    expect(result.discoveredTools).toEqual(['recommend_next_task']);
    expect(result.events[0].toolResult).toMatchObject({ticket: {id: 'BUG-NEXT'}});
    expect(finalPrompt).toContain('BUG-NEXT');
    expect(result.answer).toContain('BUG-NEXT');
    expect(classifierCalls).toBe(1); expect(actorCalls).toBe(2);
  });

  it('replans from an insufficient successful selector to semantic ticket-list recovery', async () => {
    await store.upsertEntity(Ticket.dcr, {id: 'NEXT', title: 'Next task', lane: 'Todo', priority: 'P1'});
    await store.upsertEntity(Ticket.dcr, {id: 'OTHER', title: 'Another candidate', lane: 'Backlog', priority: 'P3'});
    let actorCalls = 0, recoveryCalls = 0, finalPrompt = '';
    const asker = {json: async (prompt: string, _schema: unknown, options: {system?: string}) => {
      if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
      if (options.system?.includes('Classify one AI-Workflow request')) {
        const recovery = prompt.includes('Missing capability requested by actor');
        if (recovery) {recoveryCalls++; expect(prompt).toContain('Classify the missing capability requested above, not the original goal');}
        return {ok: true, data: {mode: ['product'], domain: ['ticket'], object: ['ticket'], action: [recovery ? 'list' : 'recommend'], effect: ['read']}};
      }
      actorCalls++; finalPrompt = prompt;
      return {ok: true, data: actorCalls <= 2
        ? {thought: '', action: 'tool_call', toolCalls: [{name: 'recommend_next_task', parameters: {}}]}
        : actorCalls === 3 ? {thought: '', action: 'tool_call', toolCalls: [{name: 'list_tickets', parameters: {}}]}
        : {thought: '', action: 'final_answer', finalAnswer: 'OTHER is a backlog candidate, but least recommended requires a ranking criterion.'}};
    }} as unknown as Asker;
    const result = await new WorkflowActor({store, projectRoot: tempDir, asker}).execute("what's the least recommended ticket?");
    expect(result.failed).toBeUndefined(); expect(result.stepsCount).toBe(4);
    expect(result.discoveredTools).toEqual(['recommend_next_task', 'list_tickets']);
    expect(recoveryCalls).toBe(1); expect(finalPrompt).toContain('OTHER'); expect(finalPrompt).toContain('\"priority\":\"P3\"');
    expect(result.issues?.some(issue => issue.message.includes('No new evidence'))).toBe(true);
    expect(result.answer).toContain('requires a ranking criterion');
  });

  it('terminates a repeated successful selector without exhausting the ten-step budget', async () => {
    await store.upsertEntity(Ticket.dcr, {id: 'NEXT', title: 'Next task', lane: 'Todo', priority: 'P1'});
    const asker = {json: async () => ({ok: true, data: {thought: '', action: 'tool_call', toolCalls: [{name: 'recommend_next_task', parameters: {}}]}})} as unknown as Asker;
    const result = await new WorkflowActor({store, projectRoot: tempDir, asker, toolDiscovery: discover(['recommend_next_task'])}).execute('Compare candidates');
    expect(result.failed).toBe(true); expect(result.haltReason).toBe('error'); expect(result.stepsCount).toBe(3);
    expect(result.answer).toContain('No new evidence');
  });

  it('stops failed discovery before spending an Actor call on invented tools', async () => {
    let calls = 0;
    const asker = {json: async () => {calls++; return {ok: false, failure: {message: 'classifier unavailable'}};}} as unknown as Asker;
    const actor = new WorkflowActor({store, projectRoot: tempDir, asker});
    const result = await actor.execute('recommend next ticket');
    expect(result.failed).toBe(true); expect(result.haltReason).toBe('discovery_failed');
    expect(result.stepsCount).toBe(0); expect(result.stepBudget).toBe(0);
    expect(result.answer).toContain('classifier unavailable'); expect(calls).toBe(1);
  });

  it('stops an unmatched capability query before Actor execution', async () => {
    let calls = 0;
    const asker = {json: async () => {calls++; return {ok: true, data: {domain: ['ticket'], object: ['epic'], action: ['recommend']}};}} as unknown as Asker;
    const result = await new WorkflowActor({store, projectRoot: tempDir, asker}).execute('recommend an epic');
    expect(result.failed).toBe(true); expect(result.stepsCount).toBe(0);
    expect(result.answer).toContain('No registered tools match'); expect(calls).toBe(1);
  });

  for (const names of [['request_tool', 'request_tool'], ['missing_a', 'missing_b', 'missing_c']]) {
    it(`bounds unsuccessful semantic recovery for ${names.join(', ')}`, async () => {
      let calls = 0; const recoveries: string[] = [];
      const asker = {json: async () => ++calls === 1
        ? {ok: true, data: {thought: '', action: 'tool_call', toolCalls: names.map((name, index) => ({callId: String(index), name, parameters: {toolName: `target_${index}`}}))}}
        : {ok: true, data: {thought: '', action: 'final_answer', finalAnswer: 'The requested capabilities are unavailable.'}}} as unknown as Asker;
      const actor = new WorkflowActor({store, projectRoot: tempDir, asker, toolDiscovery: {
        ...discover(['get_git_status']), recover: async (_goal, name) => {recoveries.push(name); return undefined;}
      }});
      const result = await actor.execute('inspect the unavailable capabilities');
      expect(recoveries).toEqual([...new Set(names)].slice(0, 2));
      expect(result.stepsCount).toBe(2);
      expect(result.issues?.filter(issue => issue.kind === 'tool')).toHaveLength(names.length);
    });
  }

  it('should accurately classify modes via explicit commands and intent keywords', () => {
    // Explicit commands
    expect(classifyIntentMode('/design what is our database strategy?')).toBe('design');
    expect(classifyIntentMode('/dev create a patch for store.ts')).toBe('dev');
    expect(classifyIntentMode('/triage why are playwright tests failing?')).toBe('triage');
    expect(classifyIntentMode('/product prioritize next sprint backlog')).toBe('product');

    // Natural-language mode selection is semantic and happens in ToolDiscovery.
    // This helper only parses explicit operator syntax and otherwise falls back to dev.
    expect(classifyIntentMode('How should we design the architecture?')).toBe('dev');
    expect(classifyIntentMode('Add a new Epic for user onboarding')).toBe('dev');
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
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
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
      asker: mockAsker,
      toolDiscovery: discover(['get_git_status', 'resolve_test_target'], 'dev')
    });

    const res = await actor.execute('unsure readme is aligned with latest changes');

    expect(res.answer).toBe('README checked.');
    expect(capturedOptions.task).toBe('code');
    expect(capturedOptions.model).toBeUndefined();
    expect(capturedOptions.system).toContain('get_git_status');
    expect(capturedOptions.system).toContain('resolve_test_target');
  });

  it('should keep a real semantic-discovery Actor prompt small for an open-ticket question', async () => {
    let actorSystem = ''
    let classifierCalls = 0
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
        if ((options.system ?? '').includes('Classify one AI-Workflow request')) {
          classifierCalls++
          return {
            ok: true,
            data: {
              mode: ['product'],
              domain: ['ticket'],
              object: ['ticket'],
              action: ['list'],
              effect: ['read'],
            },
          }
        }

        actorSystem = options.system ?? ''
        return {
          ok: true,
          data: {
            thought: 'Answer directly from the available capability surface.',
            action: 'final_answer',
            finalAnswer: 'Ticket status can be inspected.',
          },
        }
      },
    } as any

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
    })

    const res = await actor.execute('do we have open tickets?')

    expect(res.mode).toBe('product')
    expect(classifierCalls).toBe(1)
    expect(actorSystem).toContain('### Tool: list_tickets')
    expect(actorSystem).not.toContain('### Tool: resolve_ticket')
    expect(actorSystem).not.toContain('### Tool: run_command')
    expect(actorSystem.length).toBeLessThan(8_000)
  });

  it('should expose only semantically discovered ticket tools to the Actor', async () => {
    let call = 0
    const systems: string[] = []
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
        systems.push(options.system ?? '')
        call++
        if (call === 1) {
          return {
            ok: true,
            data: {
              thought: 'Inspect open tickets.',
              action: 'tool_call',
              toolCalls: [{callId: '1', name: 'list_tickets', parameters: {}}],
            },
          }
        }
        return {
          ok: true,
          data: {
            thought: 'Answer from ticket observation.',
            action: 'final_answer',
            finalAnswer: 'There are open tickets.',
          },
        }
      },
    } as any

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: discover(['list_tickets'], 'product'),
    })

    const res = await actor.execute('do we have open tickets?')

    expect(res.mode).toBe('product')
    expect(res.answer).toBe('There are open tickets.')
    expect(res.discoveredTools).toEqual(['list_tickets'])
    expect(systems[0]).toContain('list_tickets')
    expect((systems[0].match(/### Tool:/g) ?? []).length).toBe(1)
    expect(systems[0].length).toBeLessThan(8_000)
    expect(systems[0]).not.toContain('run_command')
    expect(systems[0]).not.toContain('compile_codelet')
    expect(systems[0]).not.toContain('resolve_ticket')
  });

  it('should recover one missing capability through semantic discovery without exposing the registry', async () => {
    let call = 0
    const systems: string[] = []
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
        systems.push(options.system ?? '')
        call++
        if (call === 1) {
          return {
            ok: true,
            data: {
              thought: 'Need the next-task capability.',
              action: 'tool_call',
              toolCalls: [{callId: '1', name: 'recommend_next_task', parameters: {}}],
            },
          }
        }
        return {
          ok: true,
          data: {
            thought: 'Use the observation.',
            action: 'final_answer',
            finalAnswer: 'No pending task.',
          },
        }
      },
    } as any

    const discovery = {
      discover: async () => ({
        query: {domain: ['ticket']},
        mode: 'product' as const,
        tools: [registry.get('list_tickets')!],
      }),
      recover: async (_goal: string, name: string) =>
        name === 'recommend_next_task' ? registry.get('recommend_next_task') : undefined,
    }

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: discovery,
    })

    const toolSnapshots: string[][] = [];
    let streamedSteps = 0;
    const res = await actor.execute('what should I work on?', undefined, {
      onDiscovery: tools => toolSnapshots.push(tools),
      onStep: () => {streamedSteps++;}
    })

    expect(res.answer).toBe('No pending task.')
    expect(res.events[0]?.toolCall?.name).toBe('recommend_next_task')
    expect(systems[0]).toContain('list_tickets')
    expect(systems[0]).not.toContain('recommend_next_task')
    expect(systems[0]).not.toContain('run_command')
    expect(systems[1]).toContain('recommend_next_task')
    expect(toolSnapshots).toEqual([['list_tickets'], ['list_tickets', 'recommend_next_task']]);
    expect(streamedSteps).toBe(res.stepsCount);
  });

  it('composes selected existing capabilities for multi-stage natural language', async () => {
    await store.upsertEntity(Ticket.dcr, {
      id: 'TKT-NEXT-ACTOR',
      title: 'Next actor work',
      lane: 'In Progress',
    })

    const original = Ticket.prototype.resolve
    let actorCalls = 0
    try {
      Ticket.prototype.resolve = async function () {
        return {status: 'complete', artifactId: 'TKT-NEXT-ACTOR', value: {verification: true}} as any
      }

      const mockAsker = {
        json: async (_prompt: string, _schema: unknown, options: any) => {
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
          if ((options.system ?? '').includes('Classify one AI-Workflow request')) {
            return {
              ok: true,
              data: {
                mode: ['dev'],
                domain: ['ticket'],
                action: ['recommend', 'resolve'],
              },
            }
          }

          actorCalls++
          if (actorCalls === 1) {
            expect(options.system).toContain('### Tool: recommend_next_task')
            expect(options.system).toContain('### Tool: resolve_ticket')
            return {
              ok: true,
              data: {
                thought: 'Select the next actionable ticket.',
                action: 'tool_call',
                toolCalls: [{callId: '1', name: 'recommend_next_task', parameters: {}}],
              },
            }
          }
          if (actorCalls === 2) {
            return {
              ok: true,
              data: {
                thought: 'Resolve the selected ticket.',
                action: 'tool_call',
                toolCalls: [{callId: '2', name: 'resolve_ticket', parameters: {ticketId: 'TKT-NEXT-ACTOR'}}],
              },
            }
          }
          return {
            ok: true,
            data: {
              thought: 'Report the observed resolution.',
              action: 'final_answer',
              finalAnswer: 'Resolved TKT-NEXT-ACTOR.',
            },
          }
        },
      } as any

      const actor = new WorkflowActor({store, projectRoot: tempDir, asker: mockAsker})
      const result = await actor.execute('please resolve next open or in-progress ticket')

      expect(result.answer).toBe('Resolved TKT-NEXT-ACTOR.')
      expect(result.events.map(event => event.toolCall?.name).filter(Boolean)).toEqual([
        'recommend_next_task',
        'resolve_ticket',
      ])
      expect(actorCalls).toBe(3)
    } finally {
      Ticket.prototype.resolve = original
    }
  })

  it('uses timeoutMs per model call instead of inventing a whole-run deadline', async () => {
    const seen: any[] = []
    let calls = 0
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
        seen.push(options)
        calls++
        return calls === 1
          ? {
              ok: true,
              data: {
                thought: 'Inspect status.',
                action: 'tool_call',
                toolCalls: [{callId: '1', name: 'get_git_status', parameters: {}}],
              },
            }
          : {
              ok: true,
              data: {
                thought: 'Done.',
                action: 'final_answer',
                finalAnswer: 'done',
              },
            }
      },
    } as any

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: discover(['get_git_status'], 'dev'),
    })

    const result = await actor.execute('inspect status')

    expect(result.answer).toBe('done')
    expect(seen.every(options => options.timeoutMs === 60000)).toBe(true)
    expect(seen.every(options => options.signal === undefined)).toBe(true)
  })

  it('propagates an explicit cancellation signal through model and tool execution', async () => {
    const controller = new AbortController()
    let modelSignal: AbortSignal | undefined
    let toolSignal: AbortSignal | undefined
    let calls = 0
    const tool = {
      name: 'capture_signal',
      description: 'Capture execution signal',
      category: 'os' as const,
      parameters: (await import('@dharmax/llm-utils')).z.object({}),
      execute: (_params: unknown, ctx: any) => {
        toolSignal = ctx.signal
        return {ok: true}
      },
    }
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
        modelSignal = options.signal
        calls++
        return calls === 1
          ? {
              ok: true,
              data: {
                thought: 'Use the tool.',
                action: 'tool_call',
                toolCalls: [{callId: '1', name: 'capture_signal', parameters: {}}],
              },
            }
          : {
              ok: true,
              data: {
                thought: 'Done.',
                action: 'final_answer',
                finalAnswer: 'done',
              },
            }
      },
    } as any
    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: {
        discover: async () => ({query: {}, mode: 'dev' as const, tools: [tool] as any[]}),
      },
    })

    const result = await actor.execute('run the selected capability', undefined, {signal: controller.signal})

    expect(result.answer).toBe('done')
    expect(modelSignal).toBe(controller.signal)
    expect(toolSignal).toBe(controller.signal)
  })

  it('reports partial actor failure instead of claiming execution was not attempted', async () => {
    const mockAsker = {
      json: async () => ({
        ok: true,
        data: {
          thought: 'Use one tool.',
          action: 'tool_call',
          toolCalls: [{callId: '1', name: 'get_git_status', parameters: {}}],
        },
      }),
    } as any
    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      maxSteps: 1,
      toolDiscovery: discover(['get_git_status'], 'dev'),
    })

    const result = await actor.execute('inspect until complete')

    expect(result.failed).toBe(true)
    expect(result.stepsCount).toBe(1)
    expect(result.answer).toContain('Execution stopped after 1 step(s) (max_steps_exceeded)')
    expect(result.answer).not.toContain('Natural-language execution was not attempted')
    expect(result.issues?.some(issue => issue.kind === 'budget')).toBe(true)
  })

  it('forwards tool cancellation into ticket resolution options', async () => {
    await store.upsertEntity(Ticket.dcr, {
      id: 'TKT-SIGNAL',
      title: 'Signal propagation',
      lane: 'Todo',
    })
    const controller = new AbortController()
    const original = Ticket.prototype.resolve
    let received: AbortSignal | undefined
    try {
      Ticket.prototype.resolve = async function (_store, options) {
        received = options?.signal
        return {status: 'complete', artifactId: 'TKT-SIGNAL', value: {verification: true}} as any
      }

      await registry.execute('resolve_ticket', {ticketId: 'TKT-SIGNAL'}, {
        store,
        projectRoot: tempDir,
        signal: controller.signal,
      })

      expect(received).toBe(controller.signal)
    } finally {
      Ticket.prototype.resolve = original
    }
  })

  it('should preserve conversational context across shell actor turns', async () => {
    const prompts: string[] = [];
    let call = 0;
    const mockAsker = {
      json: async (prompt: string) => {
        prompts.push(prompt);
        call++;
        return {
          ok: true,
          data: {
            thought: 'Answer from available context.',
            action: 'final_answer',
            finalAnswer: call === 1
              ? 'I inspected the recent README-related changes.'
              : 'Those changes affected README behavior.'
          }
        };
      }
    } as any;

    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      asker: mockAsker,
      toolDiscovery: discover([], 'dev')
    });

    await actor.execute('ensure the readme is aligned with latest changes');
    const second = await actor.execute('what were those changes?');

    expect(second.answer).toContain('Those changes');
    expect(prompts[1]).toContain('Session History');
    expect(prompts[1]).toContain('ensure the readme is aligned with latest changes');
    expect(prompts[1]).toContain('I inspected the recent README-related changes.');
    expect(prompts[1]).toContain('what were those changes?');
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
      maxSteps: 5,
      toolDiscovery: discover(['get_environment_info'], 'triage')
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
