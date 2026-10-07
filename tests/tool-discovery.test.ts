import {describe, expect, it} from 'bun:test'
import {initializeTools, registry} from '../src/tools/index.ts'
import {ToolDiscovery as ProductionToolDiscovery, semanticsForTool} from '../src/tools/discovery.ts'
import {getPublicMcpTools} from '../src/tools/surface.ts'
import type {Asker} from '@dharmax/llm-utils'

// These tests isolate classification/AND matching; qualification has dedicated cases below.
class ToolDiscovery extends ProductionToolDiscovery {
  constructor(tools: ConstructorParameters<typeof ProductionToolDiscovery>[0], asker: Asker, fallback?: Asker) {
    super(tools, asker, fallback, {refine: async (_query, items) => [...items]})
  }
}

describe('semantic tool discovery and surfaces', () => {
  it('matches the live classified recommend-ticket tuple to the existing selector', async () => {
    initializeTools()
    const query = {mode: ['product'], domain: ['ticket'], object: ['ticket'], action: ['recommend'], effect: ['read']}
    const asker = {json: async () => ({ok: true, data: query})} as unknown as Asker
    const result = await new ToolDiscovery(registry, asker).discover("what's the next recommeded ticket?", 3)
    expect(result.query).toEqual(query)
    expect(result.tools.map(tool => tool.name)).toEqual(['recommend_next_task'])
    expect(result.error).toBeUndefined()
  })

  it('reports a valid but unmatched AND query without dropping its constraints', async () => {
    initializeTools()
    const query = {mode: ['product'], domain: ['ticket'], object: ['epic'], action: ['recommend'], effect: ['read']}
    const result = await new ToolDiscovery(registry, {json: async () => ({ok: true, data: query})} as unknown as Asker).discover('recommend an epic')
    expect(result.query).toEqual(query)
    expect(result.tools).toEqual([])
    expect(result.error).toContain('No registered tools match')
  })

  it('retains classifier failure details instead of silently returning an empty surface', async () => {
    initializeTools()
    const result = await new ToolDiscovery(registry, {json: async () => ({ok: false, failure: {message: 'classifier provider unavailable'}})} as unknown as Asker).discover('recommend work')
    expect(result.tools).toEqual([])
    expect(result.error).toContain('classifier provider unavailable')
  })

  it('selects only the relevant read tool for an open-ticket question with one classifier call', async () => {
    initializeTools()
    let calls = 0
    const asker = {
      json: async () => {
        calls++
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
      },
    } as any

    const discovery = new ToolDiscovery(registry, asker)
    const result = await discovery.discover('do we have open tickets?')

    expect(calls).toBe(1)
    expect(result.mode).toBe('product')
    expect(result.tools.map(tool => tool.name)).toEqual(['list_tickets'])
    expect(result.tools.length).toBeLessThan(registry.getAll().length)
  })

  it('exposes a small composable tool set for a multi-stage intent', async () => {
    initializeTools()
    const asker = {
      json: async () => ({
        ok: true,
        data: {
          mode: ['dev'],
          domain: ['ticket'],
          action: ['recommend', 'resolve'],
        },
      }),
    } as any

    const discovery = new ToolDiscovery(registry, asker)
    const result = await discovery.discover('choose suitable work and execute it')

    expect(result.mode).toBe('dev')
    expect(new Set(result.tools.map(tool => tool.name))).toEqual(
      new Set(['recommend_next_task', 'resolve_ticket']),
    )
  })

  it('constrains classifier output to the registry vocabulary before matching', async () => {
    initializeTools()
    const asker = {
      json: async () => ({
        ok: true,
        data: {
          mode: ['product', 'invented-mode'],
          domain: ['ticket', 'invented-domain'],
          object: ['ticket', 'invented-object'],
          action: ['list', 'invented-action'],
          effect: ['read', 'invented-effect'],
        },
      }),
    } as any

    const discovery = new ToolDiscovery(registry, asker)
    const result = await discovery.discover('do we have open tickets?')

    expect(result.query).toEqual({
      mode: ['product'],
      domain: ['ticket'],
      object: ['ticket'],
      action: ['list'],
      effect: ['read'],
    })
    expect(result.tools.map(tool => tool.name)).toEqual(['list_tickets'])
  })

  it('propagates execution cancellation and per-call timeout into semantic classification', async () => {
    initializeTools()
    const controller = new AbortController()
    let captured: any
    const asker = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        captured = options
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
      },
    } as any

    const discovery = new ToolDiscovery(registry, asker)
    await discovery.discover('show tickets', 5, {signal: controller.signal, timeoutMs: 1234})

    expect(captured.signal).toBe(controller.signal)
    expect(captured.timeoutMs).toBe(1234)
  })

  it('uses the fallback classifier only after the local classifier fails', async () => {
    initializeTools()
    let localCalls = 0
    let fallbackCalls = 0
    let localOptions: any
    let fallbackOptions: any
    const local = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        localCalls++
        localOptions = options
        return {ok: false}
      },
    } as any
    const fallback = {
      json: async (_prompt: string, _schema: unknown, options: any) => {
        fallbackCalls++
        fallbackOptions = options
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
      },
    } as any

    const discovery = new ToolDiscovery(registry, local, fallback)
    const result = await discovery.discover('do we have open tickets?')

    expect(localCalls).toBe(1)
    expect(fallbackCalls).toBe(1)
    expect(localOptions.task).toBeUndefined()
    expect((localOptions.system ?? '').length).toBeLessThan(8_000)
    expect(fallbackOptions.task).toBe('fast')
    expect(result.tools.map(tool => tool.name)).toEqual(['list_tickets'])
  })

  it('resolves canonical multi-key intents to narrow functions across domains', async () => {
    initializeTools()
    const cases = [
      {
        query: 'who calls parseConfig?',
        data: {mode: ['dev'], domain: ['graph'], object: ['caller'], action: ['inspect'], effect: ['read']},
        expected: 'get_exact_callers',
      },
      {
        query: 'show the source of parseConfig',
        data: {mode: ['dev'], domain: ['graph'], object: ['source'], action: ['get'], effect: ['read']},
        expected: 'get_symbol_source',
      },
      {
        query: 'fix the failing auth test',
        data: {mode: ['triage'], domain: ['test'], object: ['test'], action: ['debug'], effect: ['execution']},
        expected: 'triage_test_failures',
      },
      {
        query: 'show git status',
        data: {mode: ['dev'], domain: ['git'], object: ['status'], action: ['get'], effect: ['read']},
        expected: 'get_git_status',
      },
    ]

    for (const item of cases) {
      const asker = {json: async () => ({ok: true, data: item.data})} as any
      const discovery = new ToolDiscovery(registry, asker)
      const result = await discovery.discover(item.query)
      expect(result.tools.map(tool => tool.name)).toEqual([item.expected])
    }
  })

  it('does not broaden a failed multi-key lookup into a category bucket', async () => {
    initializeTools()
    const asker = {
      json: async () => ({
        ok: true,
        data: {
          mode: ['dev'],
          domain: ['planning'],
          object: ['nonexistent-object'],
          effect: ['read'],
        },
      }),
    } as any

    const discovery = new ToolDiscovery(registry, asker)
    const result = await discovery.discover('inspect something unknown')

    expect(result.tools).toEqual([])
  })

  it('never turns an unclassifiable request into the full registry', async () => {
    initializeTools()
    const asker = {
      json: async () => ({ok: false}),
    } as any

    const discovery = new ToolDiscovery(registry, asker)
    const result = await discovery.discover('???')

    expect(result.tools).toEqual([])
  })

  it('keeps every registered function semantically distinguishable at the full key tuple', () => {
    initializeTools()
    const signatures = registry.getAll().map(tool => JSON.stringify(semanticsForTool(tool)))
    expect(new Set(signatures).size).toBe(signatures.length)
  })

  it('keeps the public MCP API smaller than the internal implementation registry', () => {
    initializeTools()
    const publicTools = getPublicMcpTools(registry)
    const publicNames = new Set(publicTools.map(tool => tool.name))

    expect(publicTools.length).toBeLessThan(registry.getAll().length)
    expect(publicNames.has('resolve_ticket')).toBe(true)
    expect(publicNames.has('find_symbol')).toBe(true)
    expect(publicNames.has('run_command')).toBe(false)
    expect(publicNames.has('script_eval')).toBe(false)
    expect(publicNames.has('compile_codelet')).toBe(false)
  })
})

it('qualifies candidate descriptions and narrowly rediscovers evidence when coarse tags lose request constraints', async () => {
  initializeTools()
  let classifications = 0, qualifications = 0
  const controller = new AbortController()
  const asker = {json: async (prompt: string, _schema: unknown, options: {system?: string; signal?: AbortSignal; timeoutMs?: number}) => {
    expect(options.signal).toBe(controller.signal); expect(options.timeoutMs).toBe(1234)
    if (options.system?.startsWith('Qualify semantic discovery')) {
      qualifications++
      const candidates = JSON.parse(prompt).candidates as Array<{id: string; description: string}>
      expect(candidates).toHaveLength(1)
      if (qualifications === 1) {expect(candidates[0]?.description).toContain('prioritizes'); return {ok: true, data: {ids: []}}}
      expect(candidates[0]?.id).toBe('list_tickets')
      return {ok: true, data: {ids: ['list_tickets']}}
    }
    classifications++
    if (classifications === 2) expect(prompt).toContain('do not satisfy the full request')
    return {ok: true, data: {mode: ['product'], domain: ['ticket'], object: ['ticket'], action: [classifications === 1 ? 'recommend' : 'list'], effect: ['read']}}
  }} as unknown as Asker
  const result = await new ProductionToolDiscovery(registry, asker).discover('Compare all candidates to find the least justified one', 5, {signal: controller.signal, timeoutMs: 1234})
  expect(result.tools.map(tool => tool.name)).toEqual(['list_tickets'])
  expect(result.error).toBeUndefined(); expect(classifications).toBe(2); expect(qualifications).toBe(2)
})

for (const response of [{ids: []}, {ids: ['non_candidate']}, undefined]) it(`fails closed and bounds qualification for ${JSON.stringify(response)}`, async () => {
  initializeTools()
  let classifications = 0, qualifications = 0
  const asker = {json: async (_prompt: string, _schema: unknown, options: {system?: string}) => {
    if (options.system?.startsWith('Qualify semantic discovery')) {qualifications++; return response ? {ok: true, data: response} : {ok: false, failure: {message: 'qualification provider unavailable'}}}
    classifications++
    return {ok: true, data: {domain: ['ticket'], object: ['ticket'], action: ['recommend'], effect: ['read']}}
  }} as unknown as Asker
  const result = await new ProductionToolDiscovery(registry, asker).discover('A request the selector cannot satisfy')
  expect(result.tools).toEqual([]); expect(result.error).toBeDefined()
  expect(classifications).toBeLessThanOrEqual(2); expect(qualifications).toBe(1)
})
