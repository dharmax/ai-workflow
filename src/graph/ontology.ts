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
  static readonly dcr: EntityDcr;

  override typeName(): string {
    return (this.constructor as typeof WorkflowEntity).dcr?.name || this.constructor.name;
  }

  override get descriptor(): EntityDcr {
    return (this.constructor as typeof WorkflowEntity).dcr || super.descriptor;
  }
}

export class Idea extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    feasibility: anyValidator,
    impact: anyValidator
  };
  static readonly dcr = new EntityDcr(Idea, Idea.template, 'Idea');
}

export class Epic extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    priority: { validate: (v: any) => ({ value: v ?? 1 }) }
  };
  static readonly dcr = new EntityDcr(Epic, Epic.template, 'Epic');
}

export class Feature extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    acceptanceCriteria: anyValidator
  };
  static readonly dcr = new EntityDcr(Feature, Feature.template, 'Feature');
}

export class UserStory extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    actor: anyValidator,
    story: anyValidator,
    context: anyValidator,
    acceptanceCriteria: anyValidator,
    sla: anyValidator
  };
  static readonly dcr = new EntityDcr(UserStory, UserStory.template, 'UserStory');
}

export class Ticket extends WorkflowEntity {
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
  static template = {
    ...baseTemplate,
    path: anyValidator,
    completionPercent: { validate: (v: any) => ({ value: v ?? 0 }) }
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
  title?: string;
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
