/**
 * Responsibility: Define Semantika Entity and Predicate descriptors for the AST+ Semantic Graph.
 * Scope: Complete ontological graph model connecting code, architecture, roadmap, and artifacts.
 */

import {
  AbstractEntity,
  EntityDcr,
  PredicateDcr,
  RawOntology
} from '@dharmax/semantika';

import { CompletenessSchema, scopeTarget, ticketCompleteness, type CompletenessLevel } from '../artifact-policy.ts';
import type { WorkflowStore } from './store.ts';

import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts';

const completenessValidator = { validate: (v: unknown) => ({ value: v == null ? undefined : CompletenessSchema.parse(v) }) };

const anyValidator = { validate: (v: any) => ({ value: v }) };

const baseTemplate = {
  id: anyValidator,
  _id: anyValidator,
  title: anyValidator,
  status: { validate: (v: any) => ({ value: v ?? 'implemented' }) },
  body: { validate: (v: any) => ({ value: v ?? '' }) },
  metadata: { validate: (v: any) => ({ value: v ?? {} }) },
  createdAt: anyValidator,
  updatedAt: anyValidator
};

// -----------------------------------------------------------------------------
// Durable Domain Entities (aiwf-durable)
// -----------------------------------------------------------------------------

export abstract class WorkflowEntity extends AbstractEntity {
  declare title?: string;
  static readonly dcr: EntityDcr;

  override typeName(): string {
    return (this.constructor as typeof WorkflowEntity).dcr?.name || this.constructor.name;
  }

  override get descriptor(): EntityDcr {
    return (this.constructor as typeof WorkflowEntity).dcr || super.descriptor;
  }
}

export class Idea extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  static template = {
    ...baseTemplate,
    feasibility: anyValidator,
    impact: anyValidator
  };
  static readonly dcr = new EntityDcr(Idea, Idea.template, 'Idea');
}

export class Epic extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(Epic.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    priority: { validate: (v: any) => ({ value: v ?? 1 }) }
  };
  static readonly dcr = new EntityDcr(Epic, Epic.template, 'Epic');
}

export class Feature extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(Feature.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    acceptanceCriteria: anyValidator
  };
  static readonly dcr = new EntityDcr(Feature, Feature.template, 'Feature');
}

export class UserStory extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(UserStory.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    actor: anyValidator,
    story: anyValidator,
    context: anyValidator,
    acceptanceCriteria: anyValidator,
    sla: anyValidator
  };
  static readonly dcr = new EntityDcr(UserStory, UserStory.template, 'UserStory');
}

export class Aspect extends WorkflowEntity {
  declare title: string;
  declare body: string;
  declare status: 'draft' | 'proposed' | 'accepted' | 'deprecated';
  declare acceptanceCriteria?: string[];
  static template = { ...baseTemplate, status: { validate: (v: unknown) => ({ value: v ?? 'draft' }) }, acceptanceCriteria: anyValidator };
  static readonly dcr = new EntityDcr(Aspect, Aspect.template, 'Aspect');
  static async create(store: WorkflowStore, data: { id: string; title: string; body?: string; status?: 'draft' | 'proposed' | 'accepted' | 'deprecated'; acceptanceCriteria?: string[] }) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    const { id, ...fields } = data;
    await applyProductMutations(store, [{ kind: 'product_create', entityType: 'Aspect', id, fields }]);
    return (await store.getEntity<Aspect>(id, Aspect.dcr))!;
  }
  async revise(store: WorkflowStore, fields: { title?: string; body?: string; status?: 'draft' | 'proposed' | 'accepted' | 'deprecated'; acceptanceCriteria?: string[] }) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    await applyProductMutations(store, [{ kind: 'product_update', entityType: 'Aspect', id: store.localId(this.id), fields }]);
    return (await store.getEntity<Aspect>(this.id, Aspect.dcr))!;
  }
  async view(store: WorkflowStore) {
    const scopes = (await store.getOutgoing(this.id, 'applies_to')).map(e => store.localId(e.targetId)).sort();
    return { id: store.localId(this.id), title: this.title, body: this.body, status: this.status, acceptanceCriteria: this.acceptanceCriteria ?? [], scopes,
      assessment: (await assessAspects(this, store, [this])).aspects[0] };
  }
  async applyTo(scope: WorkflowEntity, store: WorkflowStore) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    await applyProductMutations(store, [{ kind: 'product_link', sourceId: store.localId(this.id), predicate: 'applies_to', targetId: store.localId(scope.id) }]);
  }
  async removeFrom(scope: WorkflowEntity, store: WorkflowStore) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    await applyProductMutations(store, [{ kind: 'product_unlink', sourceId: store.localId(this.id), predicate: 'applies_to', targetId: store.localId(scope.id) }]);
  }
  assess(scope: WorkflowEntity, store: WorkflowStore) { return assessAspects(scope, store, [this]); }
}

export class Ticket extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  getCompletenessContext(store: WorkflowStore, override?: CompletenessLevel) { return ticketCompleteness(this, store, override); }
  static template = {
    ...baseTemplate,
    lane: { validate: (v: any) => ({ value: v ?? 'Backlog' }) },
    priority: { validate: (v: any) => ({ value: v ?? 'P2' }) },
    claim: anyValidator,
    estimateTokens: anyValidator
  };
  static readonly dcr = new EntityDcr(Ticket, Ticket.template, 'Ticket');
}

export class ModuleNode extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(ModuleNode.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    path: anyValidator
  };
  static readonly dcr = new EntityDcr(ModuleNode, ModuleNode.template, 'ModuleNode');
}

export class FileNode extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    path: anyValidator,
    language: anyValidator,
    fileKind: anyValidator,
    size: anyValidator,
    hash: anyValidator,
    mtime: anyValidator
  };
  static readonly dcr = new EntityDcr(FileNode, FileNode.template, 'FileNode');
}

export class SymbolNode extends WorkflowEntity {
  declare title?: string;
  body?: string;
  status?: string;
  filePath?: string;
  kind?: string;
  exported?: boolean;
  line?: number;
  column?: number;
  signature?: string;
  containerName?: string;

  static template = {
    ...baseTemplate,
    filePath: anyValidator,
    kind: anyValidator,
    exported: { validate: (v: any) => ({ value: Boolean(v) }) },
    line: { validate: (v: any) => ({ value: Number(v) || 1 }) },
    column: { validate: (v: any) => ({ value: Number(v) || 0 }) },
    signature: anyValidator,
    containerName: anyValidator
  };
  static readonly dcr = new EntityDcr(SymbolNode, SymbolNode.template, 'SymbolNode');
}

export class TestNode extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    targetPath: anyValidator,
    framework: anyValidator,
    lastRun: anyValidator,
    passed: anyValidator
  };
  static readonly dcr = new EntityDcr(TestNode, TestNode.template, 'TestNode');
}

export class Decision extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    decision: anyValidator,
    context: anyValidator,
    consequences: anyValidator
  };
  static readonly dcr = new EntityDcr(Decision, Decision.template, 'Decision');
}

export class Lesson extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    ticketId: anyValidator,
    filePath: anyValidator,
    noteType: { validate: (v: any) => ({ value: v ?? 'LESSON' }) },
    preventionPattern: anyValidator
  };
  static readonly dcr = new EntityDcr(Lesson, Lesson.template, 'Lesson');
}

export class Artifact extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    action: anyValidator,
    output: anyValidator,
    patchPath: anyValidator,
    reportUrl: anyValidator
  };
  static readonly dcr = new EntityDcr(Artifact, Artifact.template, 'Artifact');
}

// -----------------------------------------------------------------------------
// Ephemeral In-Memory Entities (aiwf-ephemeral)
// -----------------------------------------------------------------------------

export class CallSite extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    callerFile: anyValidator,
    calleeName: anyValidator,
    line: anyValidator,
    column: anyValidator
  };
  static readonly dcr = new EntityDcr(CallSite, CallSite.template, 'CallSite');
}

export class TraceNode extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    traceId: anyValidator,
    step: anyValidator,
    input: anyValidator,
    output: anyValidator,
    durationMs: anyValidator
  };
  static readonly dcr = new EntityDcr(TraceNode, TraceNode.template, 'TraceNode');
}

// Aliases for compatibility
export {
  Idea as IdeaEntity,
  Epic as EpicEntity,
  Feature as FeatureEntity,
  UserStory as UserStoryEntity,
  Ticket as TicketEntity,
  ModuleNode as ModuleEntity,
  FileNode as FileEntity,
  SymbolNode as SymbolEntity,
  TestNode as TestEntity,
  Decision as DecisionEntity,
  Lesson as LessonEntity,
  Artifact as ArtifactEntity
};

export const durableEntityDescriptors = [
  Aspect.dcr,
  Idea.dcr,
  Epic.dcr,
  Feature.dcr,
  UserStory.dcr,
  Ticket.dcr,
  ModuleNode.dcr,
  FileNode.dcr,
  SymbolNode.dcr,
  TestNode.dcr,
  Decision.dcr,
  Lesson.dcr,
  Artifact.dcr
];

export const ephemeralEntityDescriptors = [
  CallSite.dcr,
  TraceNode.dcr
];

export const entityDescriptors = [
  ...durableEntityDescriptors,
  ...ephemeralEntityDescriptors
];

for (const dcr of entityDescriptors) {
  dcr.collectionName = dcr.name;
}

// Predicate payload schema
export const predicatePayloadTemplate = {
  confidence: anyValidator,
  state: anyValidator,
  weight: anyValidator,
  note: anyValidator,
  sourceRange: anyValidator,
  timestamp: anyValidator
};

export const semanticPredicates = {
  applies_to: new PredicateDcr('applies_to', [], { target: ['title'] }, predicatePayloadTemplate),
  contains: new PredicateDcr('contains', [], { target: ['title'] }, predicatePayloadTemplate),
  calls: new PredicateDcr('calls', [], { target: ['title'] }, predicatePayloadTemplate),
  inherits: new PredicateDcr('inherits', [], { target: ['title'] }, predicatePayloadTemplate),
  depends_on: new PredicateDcr('depends_on', [], { target: ['title'] }, predicatePayloadTemplate),
  imports: new PredicateDcr('imports', [], { target: ['title'] }, predicatePayloadTemplate),
  implements: new PredicateDcr('implements', [], { target: ['title'] }, predicatePayloadTemplate),
  addresses: new PredicateDcr('addresses', [], { target: ['title'] }, predicatePayloadTemplate),
  modifies: new PredicateDcr('modifies', [], { target: ['title'] }, predicatePayloadTemplate),
  targets: new PredicateDcr('targets', [], { target: ['title'] }, predicatePayloadTemplate),
  verifies: new PredicateDcr('verifies', [], { target: ['title'] }, predicatePayloadTemplate),
  fuzzy_relates: new PredicateDcr('fuzzy_relates', [], { target: ['title'] }, predicatePayloadTemplate),
  potentially_affects: new PredicateDcr('potentially_affects', [], { target: ['title'] }, predicatePayloadTemplate),
  governs: new PredicateDcr('governs', [], { target: ['title'] }, predicatePayloadTemplate),
  blocks: new PredicateDcr('blocks', [], { target: ['title'] }, predicatePayloadTemplate),
  inspires: new PredicateDcr('inspires', [], { target: ['title'] }, predicatePayloadTemplate),
  generates: new PredicateDcr('generates', [], { target: ['title'] }, predicatePayloadTemplate),
  trace_links: new PredicateDcr('trace_links', [], { target: ['title'] }, predicatePayloadTemplate)
};

export const predicateDescriptors = Object.values(semanticPredicates);

export const durableOntology = new RawOntology(durableEntityDescriptors, predicateDescriptors);
export const ephemeralOntology = new RawOntology(ephemeralEntityDescriptors, predicateDescriptors);
export const graphOntology = new RawOntology(entityDescriptors, predicateDescriptors);
