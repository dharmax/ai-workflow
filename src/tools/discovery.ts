import {
  MemoryRegistryStore,
  type RegistryClassifier,
  type RegistryQuery,
  type RegistryStore,
  type RegistryRefiner,
  type IRegistryItem,
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
  error?: string
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
per dimension. For a request that requires multiple sequential capabilities, include the
needed action values together and omit object/effect dimensions that differ between stages,
so discovery can expose the small composable tool set without inventing a workflow tool.
Use multiple values otherwise only when the request genuinely asks for alternatives.
Include effect only when it applies to every required stage; otherwise omit it so effect
does not overconstrain capability discovery.

Examples:
"do we have open tickets?" -> {"mode":["product"],"domain":["ticket"],"object":["ticket"],"action":["list"],"effect":["read"]}
"who calls parseConfig?" -> {"mode":["dev"],"domain":["graph"],"object":["caller"],"action":["inspect"],"effect":["read"]}
"show the source of parseConfig" -> {"mode":["dev"],"domain":["graph"],"object":["source"],"action":["get"],"effect":["read"]}
"fix the failing auth test" -> {"mode":["triage"],"domain":["test"],"object":["test"],"action":["debug"],"effect":["execution"]}

Return semantic intent only. Do not answer the request.`
}

export class AiWorkflowRegistryClassifier implements RegistryClassifier {
  constructor(
    private readonly asker: Asker,
    private readonly vocabulary: () => Vocabulary,
    private readonly fallbackAsker?: Asker,
  ) {}

  async classify(text: string, options: {signal?: AbortSignal; timeoutMs?: number} = {}): Promise<RegistryQuery> {
    const vocabulary = this.vocabulary()
    const system = classifierSystem(vocabulary)
    let result = await this.asker.json(text, QUERY_SCHEMA, {
      system,
      temperature: 0,
      maxTokens: 192,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    })

    if ((!result.ok || !result.data) && this.fallbackAsker) {
      result = await this.fallbackAsker.json(text, QUERY_SCHEMA, {
        system,
        task: 'fast',
        temperature: 0,
        maxTokens: 192,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      })
    }

    if (!result.ok || !result.data) throw new Error(`Semantic classification failed: ${result.failure?.message ?? 'No valid classification was returned.'}`)
    const query = normalizeQuery(result.data)
    const constrained = constrainQuery(query, vocabulary)
    if (Object.keys(withoutMode(query)).length && !Object.keys(withoutMode(constrained)).length) {
      throw new Error(`Semantic classification used unsupported capability values: ${JSON.stringify(query)}`)
    }
    return constrained
  }
}

export class ToolDiscovery {
  private readonly classifier: AiWorkflowRegistryClassifier
  private readonly index: RegistryStore = new MemoryRegistryStore()
  private readonly indexed = new Set<string>()
  private readonly refiner: (query: string | RegistryQuery, items: readonly IRegistryItem[], options: {signal?: AbortSignal; timeoutMs?: number}) => Promise<IRegistryItem[]>

  constructor(
    private readonly tools: ToolRegistry,
    asker: Asker,
    fallbackAsker?: Asker,
    refiner?: RegistryRefiner,
  ) {
    this.refiner = refiner ? (query, items) => refiner.refine(query, items) : async (query, items, options) => {
      const schema = z.object({ids: z.array(z.string())});
      const result = await asker.json(JSON.stringify({request: query, candidates: items.map(item => ({id: item.id, description: item.functionalDescription}))}), schema, {
        system: "Qualify semantic discovery candidates against the FULL request. Return only candidate IDs that actually provide evidence or actions needed for this request. Coarse tag matching is insufficient. Respect direction, scope and constraints: a capability that selects one preferred item does not establish comparative rankings or provide all candidates. Select evidence-gathering tools when reasoning can finish the request from their output or identify the clarification needed to define an ambiguous comparison. Return an empty ids array if no candidate fits. Never substitute an answer to a different question.",
        temperature: 0, maxTokens: 192, ...options,
      });
      if (!result.ok || !result.data) throw new Error(`Capability qualification failed: ${result.failure?.message ?? "No valid qualification returned."}`);
      const {ids} = schema.parse(result.data);
      if (ids.some(id => !items.some(item => item.id === id))) throw new Error("Capability qualification selected an undiscovered tool.");
      return items.filter(item => ids.includes(item.id));
    };
    this.classifier = new AiWorkflowRegistryClassifier(
      asker,
      () => vocabularyFor(this.tools.getAll()),
      fallbackAsker,
    )
  }

  async discover(text: string, limit = 5, options: {signal?: AbortSignal; timeoutMs?: number} = {}): Promise<DiscoveredTools> {
    await this.sync()

    let query: RegistryQuery
    try { query = await this.classifier.classify(text, options) }
    catch (error) { return {query: {}, tools: [], error: error instanceof Error ? error.message : String(error)} }
    const mode = readMode(query)
    const searchable = withoutMode(query)
    if (Object.keys(searchable).length === 0) return {query, mode, tools: []}

    const candidates = async (intent: RegistryQuery) => (await this.index.search(withoutMode(intent), limit))
      .map(id => this.tools.get(id)).filter((tool): tool is ToolDefinition => tool !== undefined)
    const initial = await candidates(query)
    if (!initial.length) return {query, mode, tools: [], error: `No registered tools match semantic intent: ${JSON.stringify(searchable)}`}
    const qualify = async (tools: ToolDefinition[]) => {
      const accepted = await this.refiner(text, tools.map(tool => ({id: tool.name, functionalDescription: tool.description})), options)
      return tools.filter(tool => accepted.some(item => item.id === tool.name))
    }
    try {
      let matches = await qualify(initial)
      if (matches.length) return {query, mode, tools: matches}
      // One constrained rediscovery, with the failed candidate descriptions as evidence.
      const revised = await this.classifier.classify(`Request: ${text}\nThese candidates do not satisfy the full request: ${JSON.stringify(initial.map(tool => ({name: tool.name, description: tool.description})))}\nCapability to discover: read or list the underlying inputs and evidence needed to independently reason about this request, rather than performing the rejected selection/action. Classify this evidence-gathering capability; the original request is context, not the action to repeat.`, options)
      if (Object.keys(withoutMode(revised)).length) {
        const alternatives = (await candidates(revised)).filter(tool => !initial.some(rejected => rejected.name === tool.name))
        if (alternatives.length) matches = await qualify(alternatives)
        if (matches.length) return {query: revised, mode, tools: matches}
      }
      return {query, mode, tools: [], error: 'No qualified capability satisfies the full request; semantic candidates were insufficient.'}
    } catch (error) { return {query, mode, tools: [], error: error instanceof Error ? error.message : String(error)} }
  }

  private async sync(): Promise<void> {
    for (const tool of this.tools.getAll()) {
      if (this.indexed.has(tool.name)) continue
      await this.index.put(tool.name, semanticsForTool(tool))
      this.indexed.add(tool.name)
    }
  }
}

const DOMAIN_ALIASES: Record<string, readonly string[]> = {
  project: ['planning', 'ticket', 'graph'],
  product: ['planning'],
  dependency: ['graph', 'planning'],
  dependencies: ['graph', 'planning'],
  architecture: ['planning', 'graph'],
  code: ['graph', 'change'],
  repo: ['git', 'os'],
  workspace: ['os', 'graph'],
  system: ['os'],
}

function normalizeDomain(value: string): string[] {
  return [...(DOMAIN_ALIASES[value] ?? [value])]
}

export function semanticsForTool(tool: ToolDefinition): RegistryQuery {
  const parts = tool.name.toLowerCase().split('_').filter(Boolean)
  const verb = parts[0] ?? 'get'
  const objects = [...new Set(parts.slice(1).map(normalizeObject).filter(Boolean))]
  const actions = ACTION_ALIASES[verb] ?? [verb]
  const domains = normalizeDomain(tool.category)

  return {
    domain: domains.length > 0 ? domains : [tool.category],
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
    task: 'ticket',
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
    goals: 'goal',
    concepts: 'concept',
    flows: 'flow',
    decisions: 'decision',
    coverages: 'coverage',
    impacts: 'impact',
    hotspots: 'blast',
    workspace: 'file',
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
      .map(([key, values]) => {
        const k = key.trim().toLowerCase()
        const flatValues = values.flatMap(v => {
          const val = String(v).trim().toLowerCase()
          if (k === 'domain') return normalizeDomain(val)
          if (k === 'object') return [normalizeObject(val)]
          return [val]
        }).filter(Boolean)
        return [k, [...new Set(flatValues)]]
      })
      .filter(([, values]) => values.length > 0),
  )
}
