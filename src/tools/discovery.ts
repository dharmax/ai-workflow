import {
  MemoryRegistryStore,
  Registry,
  type IRegistryItem,
  type RegistryClassifier,
  type RegistryQuery,
} from '@dharmax/semantic-registry'
import {z, type Asker} from '@dharmax/llm-utils'
import type {ToolDefinition, ToolRegistry} from './registry.ts'

const QUERY_SCHEMA = z.record(z.string(), z.array(z.string()))

const CLASSIFIER_SYSTEM = `
Classify an AI-Workflow user request for capability discovery.

Return only these dimensions when useful:
- mode: exactly one of design, dev, triage, product
- domain: one or more of ticket, planning, graph, compiler, git, test, change, kb, os, script
- object: short singular nouns such as ticket, epic, feature, story, aspect, symbol, file, test, repository, knowledge, command
- action: canonical verbs such as list, get, search, find, inspect, analyze, recommend, create, update, resolve, prepare, investigate, run, apply, compile, debug
- effect: read, mutation, execution

Use short lowercase canonical values. Omit uncertain dimensions.
For questions about existing project state, prefer read effects.
Examples:
"do we have open tickets?" -> {"mode":["product"],"domain":["ticket"],"object":["ticket"],"action":["list"],"effect":["read"]}
"who calls parseConfig?" -> {"mode":["dev"],"domain":["graph"],"object":["symbol"],"action":["find"],"effect":["read"]}
"fix the failing auth test" -> {"mode":["triage"],"domain":["test"],"object":["test"],"action":["debug"],"effect":["execution"]}
`.trim()

const ACTION_ALIASES: Record<string, string[]> = {
  get: ['get', 'read', 'inspect'],
  list: ['list', 'read', 'inspect'],
  find: ['find', 'search', 'read'],
  search: ['search', 'find', 'read'],
  read: ['read', 'inspect'],
  analyze: ['analyze', 'inspect', 'read'],
  estimate: ['estimate', 'analyze', 'read'],
  recommend: ['recommend', 'select', 'read'],
  investigate: ['investigate', 'inspect', 'read'],
  prepare: ['prepare'],
  resolve: ['resolve', 'execute'],
  create: ['create'],
  update: ['update', 'edit'],
  set: ['set', 'update'],
  apply: ['apply', 'edit'],
  link: ['link', 'update'],
  unlink: ['unlink', 'update'],
  run: ['run', 'execute'],
  compile: ['compile', 'generate'],
  promote: ['promote', 'update'],
  scaffold: ['scaffold', 'create'],
  debug: ['debug', 'inspect'],
  triage: ['triage', 'debug'],
  generate: ['generate', 'create'],
  propose: ['propose', 'analyze'],
  assess: ['assess', 'analyze', 'read'],
  append: ['append', 'update'],
}

const READ_ACTIONS = new Set([
  'get', 'list', 'find', 'search', 'read', 'analyze', 'estimate',
  'recommend', 'investigate', 'assess',
])
const EXECUTION_ACTIONS = new Set(['run', 'resolve', 'debug', 'triage', 'compile'])

export interface DiscoveredTools {
  query: RegistryQuery
  mode?: 'design' | 'dev' | 'triage' | 'product'
  tools: ToolDefinition[]
}

interface ToolItem extends IRegistryItem {
  readonly tool: ToolDefinition
}

export class AiWorkflowRegistryClassifier implements RegistryClassifier {
  private readonly known = new Map<string, RegistryQuery>()

  constructor(private readonly asker: Asker) {}

  remember(text: string, query: RegistryQuery): void {
    this.known.set(text, query)
  }

  async classify(text: string): Promise<RegistryQuery> {
    const known = this.known.get(text)
    if (known) return known

    const result = await this.asker.json(text, QUERY_SCHEMA, {
      system: CLASSIFIER_SYSTEM,
      task: 'fast',
      preferLocal: true,
      temperature: 0,
      maxTokens: 256,
    })

    if (!result.ok || !result.data) return {}
    return normalizeQuery(result.data)
  }
}

export class ToolDiscovery {
  private readonly classifier: AiWorkflowRegistryClassifier
  private readonly semantic: Registry

  constructor(
    private readonly tools: ToolRegistry,
    asker: Asker,
  ) {
    this.classifier = new AiWorkflowRegistryClassifier(asker)
    this.semantic = new Registry(new MemoryRegistryStore(), this.classifier)
  }

  async discover(text: string, limit = 8): Promise<DiscoveredTools> {
    await this.sync()

    const query = await this.classifier.classify(text)
    const mode = readMode(query)
    const searchable = withoutMode(query)
    if (Object.keys(searchable).length === 0) return {query, mode, tools: []}

    for (const candidate of relaxationSequence(searchable)) {
      const matches = await this.semantic.find(candidate, {limit})
      if (matches.length > 0) {
        return {
          query,
          mode,
          tools: matches.map(item => (item as ToolItem).tool),
        }
      }
    }

    return {query, mode, tools: []}
  }

  private async sync(): Promise<void> {
    for (const tool of this.tools.getAll()) {
      if (this.semantic.get(tool.name)) continue

      const functionalDescription = `${tool.name}: ${tool.description}`
      this.classifier.remember(functionalDescription, semanticsForTool(tool))
      const item: ToolItem = {
        id: tool.name,
        tool,
        functionalDescription,
      }
      await this.semantic.register(item)
    }
  }
}

export function semanticsForTool(tool: ToolDefinition): RegistryQuery {
  const parts = tool.name.toLowerCase().split('_').filter(Boolean)
  const verb = parts[0] ?? 'get'
  const objects = [...new Set(parts.slice(1).map(normalizeObject).filter(Boolean))]
  const actions = ACTION_ALIASES[verb] ?? [verb]

  return {
    domain: [tool.category],
    ...(objects.length > 0 ? {object: objects} : {}),
    action: actions,
    effect: [effectForAction(verb)],
  }
}

function effectForAction(action: string): string {
  if (READ_ACTIONS.has(action)) return 'read'
  if (EXECUTION_ACTIONS.has(action)) return 'execution'
  return 'mutation'
}

function normalizeObject(value: string): string {
  if (value === 'user') return 'story'
  if (value === 'stories') return 'story'
  if (value === 'tickets') return 'ticket'
  if (value === 'features') return 'feature'
  if (value === 'epics') return 'epic'
  if (value === 'aspects') return 'aspect'
  if (value === 'tests') return 'test'
  if (value === 'symbols') return 'symbol'
  if (value === 'knowledgebase') return 'knowledge'
  return value.endsWith('s') && value.length > 3 ? value.slice(0, -1) : value
}

function readMode(query: RegistryQuery): DiscoveredTools['mode'] {
  const value = query.mode?.[0]
  return value === 'design' || value === 'dev' || value === 'triage' || value === 'product'
    ? value
    : undefined
}

function withoutMode(query: RegistryQuery): RegistryQuery {
  return Object.fromEntries(
    Object.entries(query).filter(([key, values]) => key !== 'mode' && values.length > 0),
  )
}

function relaxationSequence(query: RegistryQuery): RegistryQuery[] {
  const candidates: RegistryQuery[] = [query]
  if (query.object) {
    const {object: _object, ...withoutObject} = query
    candidates.push(withoutObject)
  }
  if (query.action && query.domain) {
    candidates.push({
      domain: query.domain,
      ...(query.effect ? {effect: query.effect} : {}),
    })
  }
  return candidates.filter((candidate, index, all) =>
    Object.keys(candidate).length > 0 &&
    all.findIndex(other => JSON.stringify(other) === JSON.stringify(candidate)) === index
  )
}

function normalizeQuery(query: Record<string, string[]>): RegistryQuery {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([, values]) => Array.isArray(values))
      .map(([key, values]) => [
        key.trim().toLowerCase(),
        [...new Set(values.map(value => String(value).trim().toLowerCase()).filter(Boolean))],
      ])
      .filter(([, values]) => values.length > 0),
  )
}
