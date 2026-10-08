import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { WorkflowActor, classifyIntentMode, type ShellMode, pubsub } from '../src/actor/engine.ts';
import { Ticket, Epic, Feature, UserStory } from '../src/graph/ontology.ts';
import type {Asker, ZodType} from '@dharmax/llm-utils';

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

  it('maps configured mode routes to semantic tasks, with task routes authoritative', () => {
    const configPath=path.join(tempDir,'.ai-workflow/config.json');
    fs.mkdirSync(path.dirname(configPath),{recursive:true});
    for (const taskRoute of [undefined,'openai/gpt-4o-mini']) {
      fs.writeFileSync(configPath,JSON.stringify({model:'ollama/qwen2.5-coder:7b',modelRoutes:{dev:'openrouter/openai/gpt-4o-mini',...(taskRoute?{code:taskRoute}:{})}}));
      const actor=new WorkflowActor({store,projectRoot:tempDir,toolDiscovery:null});
      const asker=(actor as unknown as {asker:Asker}).asker;
      expect(asker.getRouter().resolve('code',['openai','openrouter','ollama'],true)).toEqual(taskRoute?{providerId:'openai',modelId:'gpt-4o-mini'}:{providerId:'openrouter',modelId:'openai/gpt-4o-mini'});
      // No concrete cloud target is configured for fast: do not invent a
      // gateway equivalent for an Ollama-local model when local is unavailable.
      expect(asker.getRouter().resolve('fast',['openrouter'],true)).toEqual({providerId:'ollama',modelId:'qwen2.5-coder:7b'});
    }
  });

  it('uses enforced shell observation effects to stop repeated reads within read-only authority', async () => {
    const asker = {json: async () => ({ok:true,data:{thought:'',action:'tool_call',toolCalls:[{name:'run_command',parameters:{command:'ls .'}}]}})} as unknown as Asker;
    const result = await new WorkflowActor({store,projectRoot:tempDir,asker,toolDiscovery:null,maxSteps:10}).execute('Inspect project evidence',undefined,{executionAuthority:'read-only'});
    expect(result.failed).toBe(true);
    expect(result.haltReason).toBe('error');
    expect(result.stepsCount).toBe(3);
    expect(result.events[1]!.toolResults![0]!.error).toContain('No new evidence');
    const observed=result.events[0]!.toolResults![0]!.result as {authority:string;scratchRoot:string;observationOnly:boolean};
    expect(observed.authority).toBe('read-only');
    expect(observed.observationOnly).toBe(true);
    expect(fs.existsSync(observed.scratchRoot)).toBe(false);
  });

  it('permits repeated scratch mutations and denies project writes through the same Actor path', async () => {
    let count=0;
    const commands=['printf fake > records.json','printf x >> "$TMPDIR/counter"','printf x >> "$TMPDIR/counter"','cat "$TMPDIR/counter"'];
    fs.writeFileSync(path.join(tempDir,'records.json'),'real');
    const asker={json:async()=>({ok:true,data:count<commands.length?{thought:'',action:'tool_call',toolCalls:[{name:'run_command',parameters:{command:commands[count++]}}]}:{thought:'',action:'final_answer',finalAnswer:'xx from scratch; source unchanged'}})} as unknown as Asker;
    const result=await new WorkflowActor({store,projectRoot:tempDir,asker,toolDiscovery:null}).execute('Compute without changing source',undefined,{executionAuthority:'read-only'});
    expect(result.failed).not.toBe(true);
    expect(result.events[0]!.toolResults![0]!.isError).toBe(true);
    expect(result.events[1]!.toolResults![0]!.isError).toBe(false);
    expect(result.events[2]!.toolResults![0]!.isError).toBe(false);
    expect((result.events[3]!.toolResults![0]!.result as {stdout:string}).stdout).toBe('xx');
    expect(fs.readFileSync(path.join(tempDir,'records.json'),'utf8')).toBe('real');
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
      if (actorCalls === 1) return {ok:true,data:{thought:'',action:'tool_call',toolCalls:[{name:'discover_tools',parameters:{request:'Recommend next ticket'}}]}};
      if (actorCalls === 2) return {ok: true, data: {thought: '', action: 'tool_call', toolCalls: [{callId: 'next', name: 'recommend_next_task', parameters: {}}]}};
      finalPrompt = prompt;
      return {ok: true, data: {thought: '', action: 'final_answer', finalAnswer: 'Work on BUG-NEXT: Fix a demonstrated bug.'}};
    }} as unknown as Asker;
    const actor = new WorkflowActor({store, projectRoot: tempDir, asker});
    const result = await actor.execute("what's the next recommeded ticket?");
    expect(result.failed).toBeUndefined();
    expect(result.discoveredTools).toEqual(['run_command', 'discover_tools', 'recommend_next_task']);
    expect(result.events[1].toolResult).toMatchObject({ticket: {id: 'BUG-NEXT'}});
    expect(finalPrompt).toContain('BUG-NEXT');
    expect(result.answer).toContain('BUG-NEXT');
    expect(classifierCalls).toBe(1); expect(actorCalls).toBe(3);
  });

  it('terminates a repeated successful selector without exhausting the ten-step budget', async () => {
    await store.upsertEntity(Ticket.dcr, {id: 'NEXT', title: 'Next task', lane: 'Todo', priority: 'P1'});
    let calls=0;
    const asker = {json: async () => ({ok: true, data: {thought: '', action: 'tool_call', toolCalls: ++calls===1 ? [{name:'discover_tools',parameters:{request:'Select next ticket'}}] : [{name: 'recommend_next_task', parameters: {}}]}})} as unknown as Asker;
    const result = await new WorkflowActor({store, projectRoot: tempDir, asker, toolDiscovery: discover(['recommend_next_task'])}).execute('Compare candidates');
    expect(result.failed).toBe(true); expect(result.haltReason).toBe('error'); expect(result.stepsCount).toBe(4);
    expect(result.answer).toContain('No new evidence');
  });

  it('lets the model discover graph evidence and compose a multi-part ticket comparison', async () => {
    for (const ticket of [{id: 'HIGH', title: 'High priority', lane: 'Todo', priority: 'P1'}, {id: 'LOW', title: 'Low priority', lane: 'Todo', priority: 'P3'}]) await store.upsertEntity(Ticket.dcr, ticket);
    const epic = await store.upsertEntity(Epic.dcr, {id: 'SHARED', title: 'Shared main initiative'});
    for (const id of ['HIGH', 'LOW']) {
      const feature = await store.upsertEntity(Feature.dcr, {id: `FEATURE-${id}`, title: `Feature ${id}`});
      const story = await store.upsertEntity(UserStory.dcr, {id: `STORY-${id}`, title: `Story ${id}`});
      await store.relate(epic, 'contains', feature); await store.relate(feature, 'contains', story);
      await store.relate((await store.getEntity<Ticket>(id, Ticket.dcr))!, 'implements', story);
    }
    let actorCalls = 0, discoveries = 0; const toolSnapshots: string[][] = [];
    const asker = {json: async (prompt: string, _schema: unknown, options: {system?: string}) => {
      if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
      if (options.system?.includes('Classify one AI-Workflow request')) {
        discoveries++;
        return {ok: true, data: discoveries === 1 ? {mode: ['product'], domain: ['ticket'], object: ['ticket'], action: ['list'], effect: ['read']} : {domain: ['graph'], object: ['graph'], action: ['search'], effect: ['read']}};
      }
      actorCalls++;
      expect(options.system).toContain('discover_tools'); expect(options.system).toContain('every requested part');
      if (actorCalls === 1) return {ok:true,data:{thought:'',action:'tool_call',toolCalls:[{name:'discover_tools',parameters:{request:'List ticket candidates'}}]}};
      if (actorCalls === 2) return {ok: true, data: {thought: '', action: 'tool_call', toolCalls: [{name: 'list_tickets', parameters: {}}]}};
      if (actorCalls === 3) {expect(prompt).toContain('P3'); return {ok: true, data: {thought: '', action: 'tool_call', toolCalls: [{name: 'discover_tools', parameters: {request: 'Search and traverse graph connections for ticket artifact relationships'}}]}};}
      if (actorCalls === 4) {expect(prompt).toContain('search_graph'); expect(options.system).toContain('maxDepth'); return {ok: true, data: {thought: '', action: 'tool_call', toolCalls: ['HIGH', 'LOW'].map(id => ({name: 'search_graph', parameters: {sourceId: id, direction: 'both', maxDepth: 3}}))}};}
      expect(prompt).toContain('SHARED'); expect(prompt).toContain('STORY-HIGH'); expect(prompt).toContain('STORY-LOW');
      return {ok: true, data: {thought: '', action: 'final_answer', finalAnswer: 'HIGH is most and LOW least by priority; both trace through separate stories and features to SHARED.'}};
    }} as unknown as Asker;
    const result = await new WorkflowActor({store, projectRoot: tempDir, asker}).execute('Compare most and least recommended tickets and their main artifacts', undefined, {onDiscovery: tools => toolSnapshots.push(tools)});
    expect(result.failed).toBeUndefined(); expect(result.stepsCount).toBe(5); expect(discoveries).toBe(2);
    expect(result.discoveredTools).toEqual(['run_command', 'discover_tools', 'list_tickets', 'search_graph']);
    expect(toolSnapshots.at(-1)).toEqual(result.discoveredTools); expect(result.answer).toContain('SHARED');
    expect(result.issues).toEqual([]);
  });

  it('bounds explicit discovery attempts including unsuccessful searches', async () => {
    let queries = 0, calls = 0;
    const asker = {json: async () => ++calls <= 3 ? {ok: true, data: {thought: '', action: 'tool_call', toolCalls: [{name: 'discover_tools', parameters: {request: `missing evidence ${calls}`}}]}} : {ok: true, data: {thought: '', action: 'final_answer', finalAnswer: 'The requested evidence was not available.'}}} as unknown as Asker;
    const discovery = {discover: async () => ++queries === 1 ? {query: {}, tools: [registry.get('list_tickets')!]} : {query: {}, tools: [], error: 'No applicable capability'}};
    const result = await new WorkflowActor({store, projectRoot: tempDir, asker, toolDiscovery: discovery}).execute('Read unsupported evidence');
    expect(queries).toBe(2); expect(result.stepsCount).toBe(4);
    expect(result.issues?.some(issue => issue.message.includes('exhausted after two attempts'))).toBe(true);
  });

  for (const discovery of [null, {discover: async () => {throw new Error('classifier failure')}}, {discover: async () => ({query:{},tools:[]})}]) it('starts with universal execution before any discovery, including disabled/failed/empty discovery', async () => {
    let calls=0;
    const asker={json:async (_prompt:string,_schema:unknown,options:{system?:string})=>{
      expect(options.system).toContain('### Tool: run_command');
      expect(options.system).not.toContain('### Tool: script_eval');
      return {ok:true,data:++calls===1?{thought:'',action:'tool_call',toolCalls:[{name:'run_command',parameters:{command:'printf observed'}}]}:{thought:'',action:'final_answer',finalAnswer:'observed'}};
    }} as unknown as Asker;
    const result=await new WorkflowActor({store,projectRoot:tempDir,asker,toolDiscovery:discovery}).execute('Inspect evidence','dev');
    expect(result.failed).toBeUndefined();expect(result.discoveredTools).toEqual(discovery ? ['run_command','discover_tools'] : ['run_command']);
    expect(result.events[0].toolResults?.[0].result).toMatchObject({stdout:'observed',success:true});
  });

  it('does not advertise a capability that is explicitly disabled', async () => {
    let calls = 0;
    const asker = {json: async (_prompt: string, schema: ZodType, options: {system?: string}) => {
      expect(options.system).not.toContain('### Tool: discover_tools');
      expect(schema.safeParse({thought: '', action: 'tool_call', toolCalls: [{name: 'discover_tools', parameters: {request: 'evidence'}}]}).success).toBe(false);
      return {ok: true, data: ++calls === 1
        ? {thought: '', action: 'tool_call', toolCalls: [{name: 'run_command', parameters: {command: 'printf observed'}}]}
        : {thought: '', action: 'final_answer', finalAnswer: 'observed'}};
    }} as unknown as Asker;
    const result = await new WorkflowActor({store, projectRoot: tempDir, asker, toolDiscovery: null}).execute('Inspect evidence');
    expect(result.discoveredTools).toEqual(['run_command']);
    expect(result.events[0].toolResults?.[0].result).toMatchObject({stdout: 'observed', success: true});
  });

  it('bounds stalled discovery and preserves universal execution and every result', async () => {
    let calls=0;let discoverySignal:AbortSignal|undefined;
    const asker={json:async()=>({ok:true,data:++calls===1?{thought:'PRIVATE',action:'tool_call',toolCalls:[{name:'discover_tools',parameters:{request:'special evidence'}}]}:calls===2?{thought:'PRIVATE',action:'tool_call',toolCalls:[{name:'run_command',parameters:{command:'printf one'}},{name:'run_command',parameters:{command:'printf two'}}]}:{thought:'PRIVATE',action:'final_answer',finalAnswer:'one and two'}})} as unknown as Asker;
    const started=Date.now();
    const result=await new WorkflowActor({store,projectRoot:tempDir,asker,timeoutMs:30,toolDiscovery:{discover:async(_request,_limit,options)=>{discoverySignal=options?.signal;return new Promise<never>(()=>{})}}}).execute('Gather evidence');
    expect(Date.now()-started).toBeLessThan(1000);expect(discoverySignal?.aborted).toBe(true);
    expect(result.failed).toBeUndefined();expect(result.discoveryEvents?.some(event=>event.status==='failed'&&event.error?.includes('timed out'))).toBe(true);
    expect(result.events[1].toolCalls).toHaveLength(2);expect(result.events[1].toolResults).toHaveLength(2);
    expect(result.events[1].toolResults?.map(item=>(item.result as {stdout:string}).stdout)).toEqual(['one','two']);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it('records failed commands as recoverable errors with complete observations', async () => {
    let calls=0;
    const asker={json:async(prompt:string)=>{
      if(calls===1){expect(prompt).toContain('RECOVERY / REPLANNING TURN');expect(prompt).toContain('partial');expect(prompt).toContain('compose available primitives')}
      return {ok:true,data:++calls===1?{thought:'',action:'tool_call',toolCalls:[{name:'run_command',parameters:{command:'printf partial; exit 7'}}]}:calls===2?{thought:'',action:'tool_call',toolCalls:[{name:'run_command',parameters:{command:'printf recovered'}}]}:{thought:'',action:'final_answer',finalAnswer:'recovered'}};
    }} as unknown as Asker;
    const result=await new WorkflowActor({store,projectRoot:tempDir,asker,toolDiscovery:null}).execute('Obtain evidence');
    expect(result.failed).toBeUndefined();
    expect(result.events[0].toolResults?.[0]).toMatchObject({isError:true,result:{success:false,stdout:'partial',exitCode:7}});
    expect(result.events[1].toolResults?.[0]).toMatchObject({isError:false,result:{success:true,stdout:'recovered',exitCode:0}});
  });

  it('parses explicit mode preferences without linguistic routing', () => {
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
    expect(capturedOptions.system).toContain('run_command');
    expect(capturedOptions.system).not.toContain('### Tool: resolve_test_target');
  });

  it('starts cognition with a small bootstrap prompt and no classifier call', async () => {
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

    expect(res.mode).toBe('dev')
    expect(classifierCalls).toBe(0)
    expect(actorSystem).not.toContain('### Tool: list_tickets')
    expect(actorSystem).not.toContain('### Tool: resolve_ticket')
    expect(actorSystem).toContain('### Tool: run_command')
    expect(actorSystem.length).toBeLessThan(8_000)
  });

  it('adds explicitly requested ticket tools without losing the bootstrap or exposing the registry', async () => {
    let call = 0
    const systems: string[] = []
    const mockAsker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        if (options.system?.startsWith('Qualify semantic discovery')) return {ok: true, data: {ids: JSON.parse(_prompt).candidates.map((candidate: {id: string}) => candidate.id)}};
        systems.push(options.system ?? '')
        call++
        if (call === 1) return {ok:true,data:{thought:'',action:'tool_call',toolCalls:[{name:'discover_tools',parameters:{request:'List tickets'}}]}}
        if (call === 2) {
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

    expect(res.mode).toBe('dev')
    expect(res.answer).toBe('There are open tickets.')
    expect(res.discoveredTools).toEqual(['run_command','discover_tools','list_tickets'])
    expect(systems[0]).not.toContain('### Tool: list_tickets')
    expect(systems[1]).toContain('### Tool: list_tickets')
    expect((systems[0].match(/### Tool:/g) ?? []).length).toBe(2)
    expect(systems[0]).toContain('### Tool: discover_tools')
    expect(systems[0].length).toBeLessThan(8_000)
    expect(systems[0]).toContain('run_command')
    expect(systems[0]).not.toContain('compile_codelet')
    expect(systems[0]).not.toContain('resolve_ticket')
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
          if (actorCalls === 1) return {ok:true,data:{thought:'',action:'tool_call',toolCalls:[{name:'discover_tools',parameters:{request:'Recommend and resolve ticket'}}]}}
          if (actorCalls === 2) {
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
          if (actorCalls === 3) {
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
        'discover_tools',
        'recommend_next_task',
        'resolve_ticket',
      ])
      expect(actorCalls).toBe(4)
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
        if (calls===1) return {ok:true,data:{thought:'',action:'tool_call',toolCalls:[{name:'discover_tools',parameters:{request:'capture signal'}}]}}
        return calls === 2
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
