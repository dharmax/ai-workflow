import { z } from 'zod';
import { loadConfig } from './config.ts';
import type { WorkflowStore } from './graph/store.ts';
import { Epic, Feature, UserStory, ModuleNode, Ticket, type WorkflowEntity } from './graph/ontology.ts';

export const CompletenessSchema = z.enum(['poc', 'functional', 'advanced', 'production']);
export type CompletenessLevel = z.infer<typeof CompletenessSchema>;
export interface CriticFinding { readonly message: string; readonly artifactId?: string }
export interface RequiredInput { readonly question: string; readonly artifactId?: string }
export interface CriticInput {
  readonly artifactId: string;
  readonly intent: string;
  readonly neighborhood: readonly Readonly<Record<string, unknown>>[];
  readonly proposal: readonly Readonly<Record<string, unknown>>[];
  readonly applicableAspects: readonly string[];
  readonly candidateAspects: readonly string[];
  readonly completeness: CompletenessLevel;
  readonly depth: number;
  readonly evidence: readonly string[];
  readonly acceptanceCriteria?: readonly string[];
}
export type CriticResult =
  | { verdict: 'accept'; findings?: CriticFinding[] }
  | { verdict: 'revise' | 'reject'; findings: CriticFinding[] }
  | { verdict: 'needs_input'; required: RequiredInput[] };
export interface ArtifactCritic { readonly id: string; review(input: CriticInput): Promise<CriticResult> }
export interface ArtifactOperationOptions {
  /** Internal execution cancellation; deliberately not part of the transport schema. */
  signal?: AbortSignal;
  tags?: Record<string, string | number | boolean>;
  completeness?: CompletenessLevel;
  depth?: number | 'all';
  maxArtifacts?: number;
  critic?: ArtifactCritic | { id: string } | 'auto' | 'none';
}
export const ArtifactTransportOptionsSchema = z.object({
  tags: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  completeness: CompletenessSchema.optional(),
  depth: z.union([z.number().int().nonnegative(), z.literal('all')]).optional(),
  maxArtifacts: z.number().int().positive().optional(),
  critic: z.union([z.object({ id: z.string().min(1) }), z.enum(['auto', 'none'])]).optional()
});
export interface CompletenessTarget {
  explicit?: CompletenessLevel;
  effective: CompletenessLevel;
  source: 'override' | 'explicit' | 'operation' | 'feature' | 'project';
  inheritedFrom?: string[];
}
export interface ScopeCompleteness { id: string; target: CompletenessTarget }
export interface TicketCompletenessContext {
  epic: ScopeCompleteness[]; feature: ScopeCompleteness[]; story: ScopeCompleteness[]; module: ScopeCompleteness[];
  runOverride?: CompletenessLevel;
  projectFallback: CompletenessLevel;
  criticStrength: CompletenessLevel;
}
export interface CompletenessAssessment {
  target: CompletenessLevel;
  structuralCoverage: unknown;
  knownGaps: string[];
  meetsTarget: boolean;
  evidence: string[];
}

export function strongest(levels: readonly CompletenessLevel[]): CompletenessLevel {
  if (!levels.length) throw new Error('No completeness levels supplied.');
  return levels.reduce((a, b) => CompletenessSchema.options.indexOf(a) >= CompletenessSchema.options.indexOf(b) ? a : b);
}

export function requireCompletenessScope(entity: WorkflowEntity): asserts entity is Epic | Feature | UserStory | ModuleNode {
  if (!(entity instanceof Epic || entity instanceof Feature || entity instanceof UserStory || entity instanceof ModuleNode)) {
    throw new Error('Only Epic, Feature, UserStory and Module have persistent completeness targets.');
  }
}

/** Persistent completeness is explicit per scope; Product Intent relations do not imply ownership inheritance. */
export async function scopeTarget(entity: WorkflowEntity, store: WorkflowStore, options: {
  override?: CompletenessLevel; inherited?: CompletenessLevel; descendant?: boolean;
} = {}): Promise<CompletenessTarget> {
  requireCompletenessScope(entity);
  const explicit = entity.completenessTarget == null ? undefined : CompletenessSchema.parse(entity.completenessTarget);
  if (!options.descendant && options.override) return { explicit, effective: CompletenessSchema.parse(options.override), source: 'override' };
  if (explicit) return { explicit, effective: explicit, source: 'explicit' };
  if (options.descendant && options.inherited) return { effective: CompletenessSchema.parse(options.inherited), source: 'operation' };
  return { effective: CompletenessSchema.parse(loadConfig(store.root).defaultCompleteness), source: 'project' };
}

export async function ticketCompleteness(ticket: Ticket, store: WorkflowStore, override?: CompletenessLevel): Promise<TicketCompletenessContext> {
  const result: TicketCompletenessContext = {
    epic: [], feature: [], story: [], module: [], runOverride: override && CompletenessSchema.parse(override),
    projectFallback: CompletenessSchema.parse(loadConfig(store.root).defaultCompleteness), criticStrength: 'poc'
  };
  for (const edge of await store.getIncoming(ticket.id, 'contains')) {
    const epic = await store.getEntity<Epic>(edge.sourceId, Epic.dcr);
    if (epic) result.epic.push({ id: store.localId(epic.id), target: await scopeTarget(epic, store) });
  }
  for (const edge of await store.getOutgoing(ticket.id)) {
    const ctor = edge.predicateName === 'implements' ? Feature : edge.predicateName === 'addresses' ? UserStory : edge.predicateName === 'targets' ? ModuleNode : null;
    if (!ctor) continue;
    const scope = await store.getEntity<Feature | UserStory | ModuleNode>(edge.targetId, ctor.dcr);
    if (!scope) continue;
    const field = scope instanceof Feature ? 'feature' : scope instanceof UserStory ? 'story' : 'module';
    result[field].push({ id: store.localId(scope.id), target: await scopeTarget(scope, store) });
  }
  const levels = [...result.epic, ...result.feature, ...result.story, ...result.module].map(s => s.target.effective);
  if (result.runOverride) levels.push(result.runOverride);
  result.criticStrength = strongest(levels.length ? levels : [result.projectFallback]);
  return result;
}

/** IDs resolve through the caller's configured critic, never a global registry. */
export async function resolveArtifactCritic(selection: ArtifactOperationOptions['critic'], resolveId: (id: string) => Promise<ArtifactCritic>): Promise<ArtifactCritic | null> {
  if (selection === 'none') return null;
  if (typeof selection === 'object' && 'review' in selection) return selection;
  return resolveId(typeof selection === 'object' ? selection.id : 'auto');
}

/** Counts distinct artifact visits and expansion edges, never tools or Aspects. */
export class ArtifactBudget {
  readonly visited = new Set<string>();
  readonly remaining = new Set<string>();
  readonly depth: number | 'all';
  readonly maxArtifacts: number;
  stoppedAtDepth = false;
  stoppedAtMaxArtifacts = false;
  constructor(options: ArtifactOperationOptions, defaultDepth: number | 'all', defaultMaxArtifacts: number) {
    this.depth = options.depth ?? defaultDepth;
    this.maxArtifacts = options.maxArtifacts ?? defaultMaxArtifacts;
    ArtifactTransportOptionsSchema.pick({ depth: true, maxArtifacts: true }).parse({ depth: this.depth, maxArtifacts: this.maxArtifacts });
  }
  visit(id: string, expansionDepth: number): boolean {
    z.number().int().nonnegative().parse(expansionDepth);
    if (this.visited.has(id)) return true;
    if (this.depth !== 'all' && expansionDepth > this.depth) { this.stoppedAtDepth = true; this.remaining.add(id); return false; }
    if (this.visited.size >= this.maxArtifacts) { this.stoppedAtMaxArtifacts = true; this.remaining.add(id); return false; }
    this.visited.add(id); this.remaining.delete(id); return true;
  }
}
