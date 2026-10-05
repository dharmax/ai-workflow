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
