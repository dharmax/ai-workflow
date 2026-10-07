import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorkflowStore } from '../src/graph/store.ts'
import { Goal, Concept, Flow, Feature, UserStory, Ticket } from '../src/graph/ontology.ts'
import { initializeTools, registry, type ToolContext } from '../src/tools/index.ts'

describe('top-level Product Intent actor journeys', () => {
  let root: string
  let store: WorkflowStore
  let ctx: ToolContext

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-top-level-'))
    store = new WorkflowStore(root)
    initializeTools()
    ctx = { store, projectRoot: root }
  })

  afterEach(() => {
    store.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('J1.2 extends an actor journey with a reusable capability instead of making the Feature own the Story', async () => {
    await registry.execute('create_goal', {
      id: 'GOAL-TRUST',
      title: 'Keep daily engineering work trustworthy',
      body: 'A developer should be able to delegate routine work without reconstructing repository state.'
    }, ctx)
    await registry.execute('create_concept', {
      id: 'CONCEPT-ARTIFACT',
      title: 'Artifact-first engineering',
      body: 'Durable project artifacts and evidence are authoritative; chat is not project state.'
    }, ctx)
    await registry.execute('create_flow', {
      id: 'FLOW-DAILY',
      title: 'Choose and execute daily work',
      actor: 'Developer',
      context: 'The developer opens AIWF in an existing repository.',
      body: 'The developer asks what to do next, understands why it matters, delegates the work, and sees verified completion.'
    }, ctx)
    await registry.execute('create_user_story', {
      id: 'STORY-NEXT',
      title: 'Developer asks what to work on next',
      actor: 'Developer',
      context: 'There are several open work items.',
      story: 'The developer asks for the next recommended ticket; AIWF returns an actionable recommendation with a concise reason and the developer can continue immediately.',
      acceptanceCriteria: ['The recommendation is actionable and grounded in current project state'],
      status: 'accepted'
    }, ctx)
    await registry.execute('create_feature', {
      id: 'FEAT-RECOMMEND',
      title: 'Work recommendation',
      body: 'Select and explain the next actionable work item.',
      acceptanceCriteria: ['Recommendation respects current actionable project state'],
      status: 'accepted'
    }, ctx)

    await registry.execute('link_product', { sourceId: 'FLOW-DAILY', predicate: 'serves', targetId: 'GOAL-TRUST' }, ctx)
    await registry.execute('link_product', { sourceId: 'CONCEPT-ARTIFACT', predicate: 'governs', targetId: 'FLOW-DAILY' }, ctx)
    await registry.execute('link_product', { sourceId: 'FLOW-DAILY', predicate: 'contains', targetId: 'STORY-NEXT' }, ctx)
    await registry.execute('link_product', { sourceId: 'FEAT-RECOMMEND', predicate: 'enables', targetId: 'STORY-NEXT' }, ctx)

    const story = await registry.execute('get_user_story', { storyId: 'STORY-NEXT' }, ctx)
    const feature = await registry.execute('get_feature', { featureId: 'FEAT-RECOMMEND' }, ctx)

    expect(story.containingFlows).toEqual(['FLOW-DAILY'])
    expect(story.enablingFeatures).toEqual(['FEAT-RECOMMEND'])
    expect(feature.enabledStories).toEqual(['STORY-NEXT'])
    expect(await store.getOutgoing('FEAT-RECOMMEND', 'contains')).toEqual([])
  })

  it('J2.3 carries Goal Concept Flow Story and Feature meaning into Ticket investigation', async () => {
    const goal = await store.upsertEntity<Goal>(Goal.dcr, {
      id: 'GOAL-SIMPLE',
      title: 'Keep ordinary work simple',
      body: 'Routine engineering should not require orchestration archaeology.',
      status: 'accepted'
    })
    const concept = await store.upsertEntity<Concept>(Concept.dcr, {
      id: 'CONCEPT-PRIME',
      title: 'Prime Directive',
      body: 'Prefer the simplest general solution over symptom patches.',
      status: 'accepted'
    })
    const flow = await store.upsertEntity<Flow>(Flow.dcr, {
      id: 'FLOW-WORK',
      title: 'Delegate a normal ticket',
      actor: 'Coding agent',
      body: 'The agent delegates one ticket and receives truthful verified completion.',
      status: 'accepted'
    })
    const story = await store.upsertEntity<UserStory>(UserStory.dcr, {
      id: 'STORY-DELEGATE',
      title: 'Agent delegates a ticket',
      actor: 'Coding agent',
      story: 'The agent gives AIWF a ticket; AIWF executes the work and returns verified completion without the agent reproducing its internals.',
      acceptanceCriteria: ['Delegation reaches a truthful terminal outcome'],
      status: 'accepted'
    })
    const feature = await store.upsertEntity<Feature>(Feature.dcr, {
      id: 'FEAT-RESOLVE',
      title: 'Ticket resolution',
      body: 'Own ticket execution through verification.',
      acceptanceCriteria: ['Ticket lifecycle is completed truthfully'],
      status: 'accepted'
    })
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-REAL',
      title: 'Repair normal ticket delegation',
      body: 'Keep normal ticket resolution aligned with the product journey.',
      lane: 'Todo',
      acceptanceCriteria: ['The delegated path remains truthful and simple']
    })

    await store.relate(flow, 'serves', goal)
    await store.relate(concept, 'governs', flow)
    await store.relate(flow, 'contains', story)
    await store.relate(feature, 'enables', story)
    await store.relate(ticket, 'implements', feature)
    await store.relate(ticket, 'addresses', story)

    const result = await ticket.investigate(store, { systemOne: { assess: async () => null } as any })
    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return

    const evidence = new Map(result.value.evidence.map(item => [item.id, item]))
    for (const id of ['GOAL-SIMPLE', 'CONCEPT-PRIME', 'FLOW-WORK', 'STORY-DELEGATE', 'FEAT-RESOLVE']) {
      expect(evidence.has(id)).toBe(true)
    }
    expect(evidence.get('GOAL-SIMPLE')?.provenance).toBe('Flow served Goal')
    expect(evidence.get('CONCEPT-PRIME')?.provenance).toBe('Scope governing Concept')
  })

  it('J1.2 gives Story processing the upstream Goal Concept and Flow context', async () => {
    const goal = await store.upsertEntity<Goal>(Goal.dcr, {
      id: 'GOAL-CLEAR', title: 'Keep work clear', body: 'The developer should understand why a change exists.', status: 'accepted'
    })
    const concept = await store.upsertEntity<Concept>(Concept.dcr, {
      id: 'CONCEPT-JOURNEY', title: 'Journey first', body: 'Capabilities derive from actor journeys.', status: 'accepted'
    })
    const flow = await store.upsertEntity<Flow>(Flow.dcr, {
      id: 'FLOW-DESIGN', title: 'Shape a product change', actor: 'Developer',
      body: 'The developer starts with intent and ends with grounded work.', status: 'accepted'
    })
    const story = await store.upsertEntity<UserStory>(UserStory.dcr, {
      id: 'STORY-SHAPE', title: 'Developer shapes one change', actor: 'Developer',
      story: 'The developer describes a change, sees how it serves existing intent, and accepts a grounded product shape.',
      acceptanceCriteria: ['The proposed work preserves its upstream product meaning'], status: 'accepted'
    })
    await store.relate(flow, 'serves', goal)
    await store.relate(concept, 'governs', flow)
    await store.relate(flow, 'contains', story)

    let context: any
    const result = await story.process(store, {
      critic: 'none',
      systemOne: { assess: async () => null } as any,
      propose: async input => {
        context = input
        return { items: [], aspectIds: [], gaps: [], required: [], rationale: 'No new work in this context test.' }
      }
    })

    expect(result.status).toBe('complete')
    const byId = new Map(context.existing.map((item: any) => [item.id, item]))
    expect(byId.get('FLOW-DESIGN')?.provenance).toBe('Story containing Flow')
    expect(byId.get('GOAL-CLEAR')?.provenance).toBe('Flow served Goal')
    expect(byId.get('CONCEPT-JOURNEY')?.provenance).toBe('Scope governing Concept')
  })

  it('J6.1 leaves pure technical work as a direct Ticket without inventing product ceremony', async () => {
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-TECH',
      title: 'Remove obsolete persistence adapter',
      body: 'Delete the unused adapter and keep current tests green.',
      lane: 'Todo',
      acceptanceCriteria: ['Obsolete adapter is gone', 'Existing persistence tests remain green']
    })

    const result = await ticket.investigate(store, { systemOne: { assess: async () => null } as any })
    expect(result.status).toBe('complete')
    expect((await store.listEntities(Goal.dcr)).length).toBe(0)
    expect((await store.listEntities(Flow.dcr)).length).toBe(0)
    expect((await store.listEntities(UserStory.dcr)).length).toBe(0)
    expect((await store.listEntities(Feature.dcr)).length).toBe(0)
  })
})
