import {
  MemoryRegistryStore,
  type RegistryClassifier,
  type RegistryQuery,
  type RegistryStore,
} from '@dharmax/semantic-registry'
import {z, type Asker} from '@dharmax/llm-utils'
import type {ToolDefinition, ToolRegistry} from './registry.ts'

const QUERY_SCHEMA = z.record(z.string(), z.array(z.string()))

const ACTION_ALIASES: Record<string, readonly string[]> = {
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
  process: ['process', 'resolve', 'reconcile'],
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

type Vocabulary = Readonly<Record<string, readonly string[]>>

function vocabularyFor(tools: readonly ToolDefinition[]): Vocabulary {
  const values = new Map<string, Set<string>>()

  for (const tool of tools) {
    const semantics = semanticsForTool(tool)
    for (const [key, entries] of Object.entries(semantics)) {
      let bucket = values.get(key)
      if (!bucket) {
        bucket = new Set<string>()
        values.set(key, bucket)
      }
      for (const entry of entries) bucket.add(entry)
    }
  }

  return Object.fromEntries(
    [...values.entries()].map(([key, bucket]) => [key, [...bucket].sort()]),
  )
}

function classifierSystem(vocabulary: Vocabulary): string {
  const domains = vocabulary.domain?.join(', ') || '(none)'
  const objects = vocabulary.object?.join(', ') || '(none)'
  const actions = vocabulary.action?.join(', ') || '(none)'
  const effects = vocabulary.effect?.join(', ') || '(none)'

  return `Classify one AI-Workflow request for semantic capability discovery.

Output a JSON object whose values are arrays. Use only the dimensions and values listed below.
Never invent a value. Omit a dimension when none of its allowed values clearly applies.

mode: design, dev, triage, product
domain: ${domains}
object: ${objects}
action: ${actions}
effect: ${effects}

Matching is AND across dimensions and OR within values of a dimension.
Choose the smallest set that identifies the required capability. Prefer one canonical value
per dimension. Use multiple values only when the request genuinely asks for alternatives.
Include effect only when the request explicitly distinguishes read-only work from mutation
or execution; otherwise omit it so effect does not overconstrain capability discovery.

Examples:
"do we have open tickets?" -> {"mode":["product"],"domain":["ticket"],"object":["ticket"],"action":["list"],"effect":["read"]}
"who calls parseConfig?" -> {"mode":["dev"],"domain":["graph"],"object":["caller"],"action":["inspect"],"effect":["read"]}
"show the source of parseConfig" -> {"mode":["dev"],"domain":["graph"],"object":["source"],"action":["get"],"effect":["read"]}
"fix the failing auth test" -> {"mode":["triage"],"domain":["test"],"object":["test"],"action":["debug"],"effect":["execution"]}
"resolve the next ticket" -> {"mode":["dev"],"domain":["ticket"],"object":["next"],"action":["resolve"],"effect":["execution"]}

Return semantic intent only. Do not answer the request.`
}

export class AiWorkflowRegistryClassifier implements RegistryClassifier {
  constructor(
    private readonly asker: Asker,
    private readonly vocabulary: () => Vocabulary,
    private readonly fallbackAsker?: Asker,
  ) {}

  async classify(text: string): Promise<RegistryQuery> {
    const vocabulary = this.vocabulary()
    const system = classifierSystem(vocabulary)
    let result = await this.asker.json(text, QUERY_SCHEMA, {
      system,
      temperature: 0,
      maxTokens: 192,
    })

    if ((!result.ok || !result.data) && this.fallbackAsker) {
      result = await this.fallbackAsker.json(text, QUERY_SCHEMA, {
        system,
        task: 'fast',
        temperature: 0,
        maxTokens: 192,
      })
    }

    if (!result.ok || !result.data) return {}
    return constrainQuery(normalizeQuery(result.data), vocabulary)
  }
}

export class ToolDiscovery {
  private readonly classifier: AiWorkflowRegistryClassifier
  private readonly index: RegistryStore = new MemoryRegistryStore()
  private readonly indexed = new Set<string>()

  constructor(
    private readonly tools: ToolRegistry,
    asker: Asker,
    fallbackAsker?: Asker,
  ) {
    this.classifier = new AiWorkflowRegistryClassifier(
      asker,
      () => vocabularyFor(this.tools.getAll()),
      fallbackAsker,
    )
  }

  async discover(text: string, limit = 5): Promise<DiscoveredTools> {
    await this.sync()

    const query = await this.classifier.classify(text)
    const mode = readMode(query)
    const searchable = withoutMode(query)
    if (Object.keys(searchable).length === 0) return {query, mode, tools: []}

    const ids = await this.index.search(searchable, limit)
    const matches = ids
      .map(id => this.tools.get(id))
      .filter((tool): tool is ToolDefinition => tool !== undefined)

    return {query, mode, tools: matches}
  }

  async recover(
    goal: string,
    attemptedToolName: string,
    attemptedParams: Record<string, unknown>,
    currentToolNames: ReadonlySet<string>,
  ): Promise<ToolDefinition | undefined> {
    const query = [
      `Goal: ${goal}`,
      `Missing capability requested by actor: ${attemptedToolName}`,
      `Arguments: ${JSON.stringify(attemptedParams)}`,
      'Select the single registered capability that best satisfies this action.',
    ].join('\n')

    const result = await this.discover(query, 3)
    return result.tools.find(tool => !currentToolNames.has(tool.name))
  }

  private async sync(): Promise<void> {
    for (const tool of this.tools.getAll()) {
      if (this.indexed.has(tool.name)) continue
      await this.index.put(tool.name, semanticsForTool(tool))
      this.indexed.add(tool.name)
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
    action: [...actions],
    effect: [effectForAction(verb)],
  }
}

function effectForAction(action: string): string {
  if (READ_ACTIONS.has(action)) return 'read'
  if (EXECUTION_ACTIONS.has(action)) return 'execution'
  return 'mutation'
}

function normalizeObject(value: string): string {
  const canonical: Record<string, string> = {
    user: 'story',
    stories: 'story',
    tickets: 'ticket',
    features: 'feature',
    epics: 'epic',
    aspects: 'aspect',
    tests: 'test',
    symbols: 'symbol',
    callers: 'caller',
    references: 'reference',
    files: 'file',
    metrics: 'metric',
    changes: 'change',
    dependencies: 'dependency',
    knowledgebase: 'knowledge',
  }
  return canonical[value] ?? value
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

function constrainQuery(query: RegistryQuery, vocabulary: Vocabulary): RegistryQuery {
  const constrained: Record<string, readonly string[]> = {}
  for (const [key, values] of Object.entries(query)) {
    const allowed = new Set(key === 'mode'
      ? ['design', 'dev', 'triage', 'product']
      : vocabulary[key] ?? [])
    const valid = values.filter(value => allowed.has(value))
    // Dropping an unsupported capability dimension would broaden an AND query.
    if (key !== 'mode' && valid.length === 0) return {}
    if (valid.length > 0) constrained[key] = valid
  }
  return constrained
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
