/**
 * Responsibility: Compose and publish the canonical graph ontology.
 * Scope: Descriptor order, durable/ephemeral registration and stable entity exports.
 */
import { RawOntology } from '@dharmax/semantika'
import { Idea } from './idea.ts'
import { Goal } from './goal.ts'
import { Concept } from './concept.ts'
import { Flow } from './flow.ts'
import { Product } from './product.ts'
import { Epic } from './epic.ts'
import { Feature } from './feature.ts'
import { UserStory } from './user-story.ts'
import { Aspect } from './aspect.ts'
import { Ticket } from './ticket.ts'
import { ModuleNode } from './module-node.ts'
import { FileNode } from './file-node.ts'
import { SymbolNode } from './symbol-node.ts'
import { TestNode } from './test-node.ts'
import { Decision } from './decision.ts'
import { Lesson } from './lesson.ts'
import { Artifact } from './artifact.ts'
import { Rule } from './rule.ts'
import { CallSite } from './call-site.ts'
import { TraceNode } from './trace-node.ts'
import { predicateDescriptors } from './predicates.ts'

export { WorkflowEntity } from './workflow-entity.ts'
export { Idea } from './idea.ts'
export { Goal } from './goal.ts'
export { Concept } from './concept.ts'
export { Flow } from './flow.ts'
export { Product } from './product.ts'
export { Epic } from './epic.ts'
export { Feature } from './feature.ts'
export { UserStory } from './user-story.ts'
export { Aspect } from './aspect.ts'
export { Ticket } from './ticket.ts'
export { ModuleNode } from './module-node.ts'
export { FileNode } from './file-node.ts'
export { SymbolNode } from './symbol-node.ts'
export { TestNode } from './test-node.ts'
export { Decision } from './decision.ts'
export { Lesson } from './lesson.ts'
export { Artifact } from './artifact.ts'
export { Rule } from './rule.ts'
export { CallSite } from './call-site.ts'
export { TraceNode } from './trace-node.ts'
export { UserStoryStateSchema } from './user-story.ts'
export { predicatePayloadTemplate, semanticPredicates, predicateDescriptors } from './predicates.ts'

export {
    Product as ProductEntity,
    Artifact as ArtifactEntity,
    Decision as DecisionEntity,
    Epic as EpicEntity,
    Feature as FeatureEntity,
    FileNode as FileEntity,
    Idea as IdeaEntity,
    Lesson as LessonEntity,
    ModuleNode as ModuleEntity,
    SymbolNode as SymbolEntity,
    TestNode as TestEntity,
    Ticket as TicketEntity,
    UserStory as UserStoryEntity
}

export const durableEntityDescriptors = [
    Product.dcr,
    Aspect.dcr,
    Idea.dcr,
    Goal.dcr,
    Concept.dcr,
    Flow.dcr,
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
    Artifact.dcr,
    Rule.dcr
]

export const ephemeralEntityDescriptors = [CallSite.dcr, TraceNode.dcr]

export const entityDescriptors = [...durableEntityDescriptors, ...ephemeralEntityDescriptors]

for (const dcr of entityDescriptors) {
    dcr.collectionName = dcr.name
}

export const durableOntology = new RawOntology(durableEntityDescriptors, predicateDescriptors)
export const ephemeralOntology = new RawOntology(ephemeralEntityDescriptors, predicateDescriptors)
export const graphOntology = new RawOntology(entityDescriptors, predicateDescriptors)
