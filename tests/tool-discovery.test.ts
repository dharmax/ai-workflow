import {describe, expect, it} from 'bun:test'
import {initializeTools, registry} from '../src/tools/index.ts'
import {ToolDiscovery} from '../src/tools/discovery.ts'
import {getPublicMcpTools} from '../src/tools/surface.ts'

describe('semantic tool discovery and surfaces', () => {
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
    expect(fallbackOptions.task).toBe('fast')
    expect(result.tools.map(tool => tool.name)).toEqual(['list_tickets'])
  })

  it('recovers one missing capability semantically without returning an existing tool', async () => {
    initializeTools()
    const asker = {
      json: async (prompt: string) => {
        if (prompt.includes('Missing capability requested by actor')) {
          return {
            ok: true,
            data: {
              mode: ['product'],
              domain: ['ticket'],
              object: ['next', 'task'],
              action: ['recommend'],
              effect: ['read'],
            },
          }
        }
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
    const initial = await discovery.discover('show tickets')
    expect(initial.tools.map(tool => tool.name)).toEqual(['list_tickets'])

    const recovered = await discovery.recover(
      'choose the next ticket',
      'recommend_next_task',
      {},
      new Set(initial.tools.map(tool => tool.name)),
    )
    expect(recovered?.name).toBe('recommend_next_task')
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
