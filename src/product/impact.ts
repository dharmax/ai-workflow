/**
 * Responsibility: Bounded product impact analysis for Product Intent Graph.
 * Scope: Extracts compact semantic neighborhood (intent, work, code anchors, verification, decisions)
 *        before modification/refactoring without unrestricted graph traversal or AST blast duplication.
 */

import { WorkflowStore } from '../graph/store.ts';
import { Epic, Feature, UserStory, Ticket, TestNode, Decision, FileNode, SymbolNode, ModuleNode } from '../graph/ontology.ts';

export interface ProductImpact {
  entityId: string;
  entityType: 'Epic' | 'Feature' | 'UserStory';
  epics: string[];
  features: string[];
  stories: string[];
  tickets: string[];
  code: string[];
  tests: string[];
  decisions: string[];
  blockers: string[];
  dependencies: string[];
}

async function getTicketCodeAnchors(store: WorkflowStore, ticketId: string): Promise<string[]> {
  const [modifiesPreds, targetsPreds] = await Promise.all([
    store.getOutgoing(ticketId, 'modifies'),
    store.getOutgoing(ticketId, 'targets')
  ]);
  const codeIds = new Set<string>();
  for (const pred of [...modifiesPreds, ...targetsPreds]) {
    const target = await store.getEntity(pred.targetId);
    if (target && (target instanceof FileNode || target instanceof SymbolNode || target instanceof ModuleNode)) {
      codeIds.add(store.localId(target.id));
    }
  }
  return Array.from(codeIds);
}

function isActiveOrPlannedEpic(epic: Epic): boolean {
  const status = (epic as any).status || 'draft';
  return status !== 'completed' && status !== 'cancelled';
}

export async function getProductImpact(store: WorkflowStore, entityId: string): Promise<ProductImpact> {
  const entity = await store.getEntity(entityId);
  if (!entity) {
    throw new Error(`Entity '${entityId}' not found.`);
  }

  const localId = store.localId(entity.id);

  if (entity instanceof UserStory) {
    return await getUserStoryImpact(store, entity, localId);
  } else if (entity instanceof Feature) {
    return await getFeatureImpact(store, entity, localId);
  } else if (entity instanceof Epic) {
    return await getEpicImpact(store, entity, localId);
  } else {
    throw new Error(`Entity '${entityId}' has unsupported type '${(entity as any).dcr?.name || entity.constructor.name}'. Expected Epic, Feature, or UserStory.`);
  }
}

async function getUserStoryImpact(store: WorkflowStore, story: UserStory, localId: string): Promise<ProductImpact> {
  const [featurePreds, epicPreds, ticketPreds, testPreds, decisionPreds, blockPreds, depPreds] = await Promise.all([
    store.getIncoming(story.id, 'contains'),
    store.getIncoming(story.id, 'targets'),
    store.getIncoming(story.id, 'addresses'),
    store.getIncoming(story.id, 'verifies'),
    store.getIncoming(story.id, 'governs'),
    store.getIncoming(story.id, 'blocks'),
    store.getOutgoing(story.id, 'depends_on')
  ]);

  const features = new Set<string>(featurePreds.map(p => store.localId(p.sourceId)));
  const tickets = new Set<string>(ticketPreds.map(p => store.localId(p.sourceId)));
  const tests = new Set<string>(testPreds.map(p => store.localId(p.sourceId)));
  const decisions = new Set<string>(decisionPreds.map(p => store.localId(p.sourceId)));
  const blockers = new Set<string>(blockPreds.map(p => store.localId(p.sourceId)));
  const dependencies = new Set<string>(depPreds.map(p => store.localId(p.targetId)));

  // Epics: active/planned Epics directly targeting the Story
  const epics = new Set<string>();
  for (const ep of epicPreds) {
    const epic = await store.getEntity<Epic>(ep.sourceId, Epic.dcr);
    if (epic && isActiveOrPlannedEpic(epic)) {
      epics.add(store.localId(epic.id));
    }
  }

  // Code anchors from addressing tickets
  const code = new Set<string>();
  for (const tId of ticketPreds.map(p => p.sourceId)) {
    const anchors = await getTicketCodeAnchors(store, tId);
    for (const a of anchors) code.add(a);

    // Blocker/dependencies on tickets
    const [tBlocks, tDeps] = await Promise.all([
      store.getIncoming(tId, 'blocks'),
      store.getOutgoing(tId, 'depends_on')
    ]);
    for (const b of tBlocks) blockers.add(store.localId(b.sourceId));
    for (const d of tDeps) dependencies.add(store.localId(d.targetId));
  }

  // Decisions governing containing features
  for (const fId of featurePreds.map(p => p.sourceId)) {
    const decs = await store.getIncoming(fId, 'governs');
    for (const d of decs) decisions.add(store.localId(d.sourceId));
  }

  // Decisions governing code anchors
  for (const cId of code) {
    const decs = await store.getIncoming(cId, 'governs');
    for (const d of decs) decisions.add(store.localId(d.sourceId));
  }

  return {
    entityId: localId,
    entityType: 'UserStory',
    epics: Array.from(epics).sort(),
    features: Array.from(features).sort(),
    stories: [localId],
    tickets: Array.from(tickets).sort(),
    code: Array.from(code).sort(),
    tests: Array.from(tests).sort(),
    decisions: Array.from(decisions).sort(),
    blockers: Array.from(blockers).sort(),
    dependencies: Array.from(dependencies).sort()
  };
}

async function getFeatureImpact(store: WorkflowStore, feature: Feature, localId: string): Promise<ProductImpact> {
  const [epicPreds, storyPreds, directTicketPreds, directTestPreds, decisionPreds, blockPreds, depPreds] = await Promise.all([
    store.getIncoming(feature.id, 'targets'),
    store.getOutgoing(feature.id, 'contains'),
    store.getIncoming(feature.id, 'implements'),
    store.getIncoming(feature.id, 'verifies'),
    store.getIncoming(feature.id, 'governs'),
    store.getIncoming(feature.id, 'blocks'),
    store.getOutgoing(feature.id, 'depends_on')
  ]);

  const epics = new Set<string>();
  for (const ep of epicPreds) {
    const epic = await store.getEntity<Epic>(ep.sourceId, Epic.dcr);
    if (epic && isActiveOrPlannedEpic(epic)) {
      epics.add(store.localId(epic.id));
    }
  }

  const stories = new Set<string>();
  const tickets = new Set<string>(directTicketPreds.map(p => store.localId(p.sourceId)));
  const tests = new Set<string>(directTestPreds.map(p => store.localId(p.sourceId)));
  const decisions = new Set<string>(decisionPreds.map(p => store.localId(p.sourceId)));
  const blockers = new Set<string>(blockPreds.map(p => store.localId(p.sourceId)));
  const dependencies = new Set<string>(depPreds.map(p => store.localId(p.targetId)));
  const code = new Set<string>();

  // Contained accepted stories only
  for (const sId of storyPreds.map(p => p.targetId)) {
    const story = await store.getEntity<UserStory>(sId, UserStory.dcr);
    if (story && (story as any).status === 'accepted') {
      const sLocalId = store.localId(story.id);
      stories.add(sLocalId);

      const [storyTickets, storyTests, storyDecs, sBlocks, sDeps] = await Promise.all([
        store.getIncoming(story.id, 'addresses'),
        store.getIncoming(story.id, 'verifies'),
        store.getIncoming(story.id, 'governs'),
        store.getIncoming(story.id, 'blocks'),
        store.getOutgoing(story.id, 'depends_on')
      ]);

      for (const st of storyTickets) tickets.add(store.localId(st.sourceId));
      for (const st of storyTests) tests.add(store.localId(st.sourceId));
      for (const sd of storyDecs) decisions.add(store.localId(sd.sourceId));
      for (const sb of sBlocks) blockers.add(store.localId(sb.sourceId));
      for (const sd of sDeps) dependencies.add(store.localId(sd.targetId));
    }
  }

  // Code anchors from all tickets
  for (const tId of tickets) {
    const anchors = await getTicketCodeAnchors(store, tId);
    for (const a of anchors) code.add(a);

    const [tBlocks, tDeps] = await Promise.all([
      store.getIncoming(tId, 'blocks'),
      store.getOutgoing(tId, 'depends_on')
    ]);
    for (const b of tBlocks) blockers.add(store.localId(b.sourceId));
    for (const d of tDeps) dependencies.add(store.localId(d.targetId));
  }

  // Decisions governing code anchors
  for (const cId of code) {
    const decs = await store.getIncoming(cId, 'governs');
    for (const d of decs) decisions.add(store.localId(d.sourceId));
  }

  return {
    entityId: localId,
    entityType: 'Feature',
    epics: Array.from(epics).sort(),
    features: [localId],
    stories: Array.from(stories).sort(),
    tickets: Array.from(tickets).sort(),
    code: Array.from(code).sort(),
    tests: Array.from(tests).sort(),
    decisions: Array.from(decisions).sort(),
    blockers: Array.from(blockers).sort(),
    dependencies: Array.from(dependencies).sort()
  };
}

async function getEpicImpact(store: WorkflowStore, epic: Epic, localId: string): Promise<ProductImpact> {
  const [targetPreds, containedTicketPreds, decisionPreds, blockPreds, depPreds, directTestPreds] = await Promise.all([
    store.getOutgoing(epic.id, 'targets'),
    store.getOutgoing(epic.id, 'contains'),
    store.getIncoming(epic.id, 'governs'),
    store.getIncoming(epic.id, 'blocks'),
    store.getOutgoing(epic.id, 'depends_on'),
    store.getIncoming(epic.id, 'verifies')
  ]);

  const features = new Set<string>();
  const stories = new Set<string>();

  for (const pred of targetPreds) {
    const target = await store.getEntity(pred.targetId);
    if (target instanceof Feature) {
      features.add(store.localId(target.id));
    } else if (target instanceof UserStory) {
      stories.add(store.localId(target.id));
    }
  }

  const tickets = new Set<string>(containedTicketPreds.map(p => store.localId(p.targetId)));
  const tests = new Set<string>(directTestPreds.map(p => store.localId(p.sourceId)));
  const decisions = new Set<string>(decisionPreds.map(p => store.localId(p.sourceId)));
  const blockers = new Set<string>(blockPreds.map(p => store.localId(p.sourceId)));
  const dependencies = new Set<string>(depPreds.map(p => store.localId(p.targetId)));
  const code = new Set<string>();

  // Tests & Decisions governing targeted features and stories
  for (const fId of features) {
    const [fTests, fDecs] = await Promise.all([
      store.getIncoming(fId, 'verifies'),
      store.getIncoming(fId, 'governs')
    ]);
    for (const t of fTests) tests.add(store.localId(t.sourceId));
    for (const d of fDecs) decisions.add(store.localId(d.sourceId));
  }

  for (const sId of stories) {
    const [sTests, sDecs] = await Promise.all([
      store.getIncoming(sId, 'verifies'),
      store.getIncoming(sId, 'governs')
    ]);
    for (const t of sTests) tests.add(store.localId(t.sourceId));
    for (const d of sDecs) decisions.add(store.localId(d.sourceId));
  }

  // Contained ticket edges: code anchors, blockers, dependencies
  for (const tId of containedTicketPreds.map(p => p.targetId)) {
    const anchors = await getTicketCodeAnchors(store, tId);
    for (const a of anchors) code.add(a);

    const [tBlocks, tDeps] = await Promise.all([
      store.getIncoming(tId, 'blocks'),
      store.getOutgoing(tId, 'depends_on')
    ]);
    for (const b of tBlocks) blockers.add(store.localId(b.sourceId));
    for (const d of tDeps) dependencies.add(store.localId(d.targetId));
  }

  // Decisions governing code anchors
  for (const cId of code) {
    const decs = await store.getIncoming(cId, 'governs');
    for (const d of decs) decisions.add(store.localId(d.sourceId));
  }

  return {
    entityId: localId,
    entityType: 'Epic',
    epics: [localId],
    features: Array.from(features).sort(),
    stories: Array.from(stories).sort(),
    tickets: Array.from(tickets).sort(),
    code: Array.from(code).sort(),
    tests: Array.from(tests).sort(),
    decisions: Array.from(decisions).sort(),
    blockers: Array.from(blockers).sort(),
    dependencies: Array.from(dependencies).sort()
  };
}
