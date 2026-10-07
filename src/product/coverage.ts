/**
 * Responsibility: Deterministic structural and causal coverage engine for Product Intent Graph.
 * Scope: Evaluates whether known Epics, Features, and Stories have expected relations to work, code, and evidence.
 */

import { WorkflowStore } from '../graph/store.ts';
import { Epic, Feature, Flow, UserStory, Ticket, TestNode, FileNode, SymbolNode, ModuleNode } from '../graph/ontology.ts';

export type CoverageGapKind =
  | 'missing_parent'
  | 'missing_acceptance_contract'
  | 'missing_work'
  | 'missing_code_grounding'
  | 'missing_verification'
  | 'missing_target_path'
  | 'blocked';

export interface CoverageGap {
  kind: CoverageGapKind;
  message: string;
  relatedIds?: string[];
}

export interface CoverageReport {
  entityId: string;
  entityType: 'Epic' | 'Feature' | 'UserStory';
  complete: boolean;
  gaps: CoverageGap[];
  related: {
    epics: string[];
    features: string[];
    stories: string[];
    tickets: string[];
    code: string[];
    tests: string[];
  };
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

export async function getCoverage(store: WorkflowStore, entityId: string): Promise<CoverageReport> {
  const entity = await store.getEntity(entityId);
  if (!entity) {
    throw new Error(`Entity '${entityId}' not found.`);
  }

  const localId = store.localId(entity.id);

  if (entity instanceof UserStory) {
    return await getUserStoryCoverage(store, entity, localId);
  } else if (entity instanceof Feature) {
    return await getFeatureCoverage(store, entity, localId);
  } else if (entity instanceof Epic) {
    return await getEpicCoverage(store, entity, localId);
  } else {
    throw new Error(`Entity '${entityId}' has unsupported type '${(entity as any).dcr?.name || entity.constructor.name}'. Expected Epic, Feature, or UserStory.`);
  }
}

async function getUserStoryCoverage(store: WorkflowStore, story: UserStory, localId: string): Promise<CoverageReport> {
  const [containsPreds, enablePreds, epicPreds, ticketPreds, testPreds, blockPreds] = await Promise.all([
    store.getIncoming(story.id, 'contains'),
    store.getIncoming(story.id, 'enables'),
    store.getIncoming(story.id, 'targets'),
    store.getIncoming(story.id, 'addresses'),
    store.getIncoming(story.id, 'verifies'),
    store.getIncoming(story.id, 'blocks')
  ]);

  const flows: string[] = [];
  const legacyFeatures: string[] = [];
  for (const pred of containsPreds) {
    const source = await store.getEntity(pred.sourceId);
    if (source instanceof Flow) flows.push(store.localId(source.id));
    else if (source instanceof Feature) legacyFeatures.push(store.localId(source.id));
  }
  const features = [...new Set([...enablePreds.map(p => store.localId(p.sourceId)), ...legacyFeatures])].sort();
  const epics = epicPreds.map(p => store.localId(p.sourceId)).sort();
  const tickets = ticketPreds.map(p => store.localId(p.sourceId)).sort();
  const tests = testPreds.map(p => store.localId(p.sourceId)).sort();

  const codeSet = new Set<string>();
  let hasBlockedTicket = false;
  for (const ticketId of ticketPreds.map(p => p.sourceId)) {
    const t = await store.getEntity<Ticket>(ticketId, Ticket.dcr);
    if (t && (t as any).lane === 'Blocked') {
      hasBlockedTicket = true;
    }
    const anchors = await getTicketCodeAnchors(store, ticketId);
    for (const c of anchors) codeSet.add(c);
  }
  const code = Array.from(codeSet).sort();

  const gaps: CoverageGap[] = [];
  const status = (story as any).status || 'draft';
  const acceptanceCriteria: string[] = Array.isArray((story as any).acceptanceCriteria) ? (story as any).acceptanceCriteria : [];

  const isBlocked = blockPreds.length > 0 || hasBlockedTicket;
  if (isBlocked) {
    gaps.push({
      kind: 'blocked',
      message: `UserStory '${localId}' is blocked by active blocker(s).`,
      relatedIds: blockPreds.map(p => store.localId(p.sourceId))
    });
  }

  // Contract: For an accepted Story, report independent structural and causal gaps.
  // Draft/proposed stories return facts without flagging unworked states as failures.
  if (status === 'accepted') {
    if (flows.length === 0) {
      gaps.push({
        kind: 'missing_parent',
        message: `Accepted UserStory '${localId}' is not contained by any Flow.`
      });
    }

    if (acceptanceCriteria.length === 0) {
      gaps.push({
        kind: 'missing_acceptance_contract',
        message: `Accepted UserStory '${localId}' has no acceptance criteria defined.`
      });
    }

    if (tickets.length === 0) {
      gaps.push({
        kind: 'missing_work',
        message: `Accepted UserStory '${localId}' has no addressing implementation Ticket.`
      });
    } else if (code.length === 0) {
      gaps.push({
        kind: 'missing_code_grounding',
        message: `Accepted UserStory '${localId}' has addressing Ticket(s) but no code modifications or targets.`,
        relatedIds: tickets
      });
    }

    if (tests.length === 0) {
      gaps.push({
        kind: 'missing_verification',
        message: `Accepted UserStory '${localId}' has no verifying Test.`
      });
    }
  }

  return {
    entityId: localId,
    entityType: 'UserStory',
    complete: gaps.length === 0,
    gaps,
    related: {
      epics,
      features,
      stories: [localId],
      tickets,
      code,
      tests
    }
  };
}

async function getFeatureCoverage(store: WorkflowStore, feature: Feature, localId: string): Promise<CoverageReport> {
  const [epicPreds, enabledStoryPreds, legacyStoryPreds, directTicketPreds, directTestPreds, blockPreds] = await Promise.all([
    store.getIncoming(feature.id, 'targets'),
    store.getOutgoing(feature.id, 'enables'),
    store.getOutgoing(feature.id, 'contains'),
    store.getIncoming(feature.id, 'implements'),
    store.getIncoming(feature.id, 'verifies'),
    store.getIncoming(feature.id, 'blocks')
  ]);

  const storyPreds = [...enabledStoryPreds, ...legacyStoryPreds];
  const epics = epicPreds.map(p => store.localId(p.sourceId)).sort();
  const stories = [...new Set(storyPreds.map(p => store.localId(p.targetId)))].sort();
  const directTickets = directTicketPreds.map(p => store.localId(p.sourceId));
  const directTests = directTestPreds.map(p => store.localId(p.sourceId));

  const allTicketsSet = new Set<string>(directTickets);
  const allTestsSet = new Set<string>(directTests);
  const codeSet = new Set<string>();
  let hasBlockedTicket = false;

  // Process direct tickets code grounding
  for (const tId of directTicketPreds.map(p => p.sourceId)) {
    const t = await store.getEntity<Ticket>(tId, Ticket.dcr);
    if (t && (t as any).lane === 'Blocked') hasBlockedTicket = true;
    const anchors = await getTicketCodeAnchors(store, tId);
    for (const c of anchors) codeSet.add(c);
  }

  // Contained stories inspection
  const acceptedContainedStories: UserStory[] = [];
  for (const sId of storyPreds.map(p => p.targetId)) {
    const story = await store.getEntity<UserStory>(sId, UserStory.dcr);
    if (story) {
      if ((story as any).status === 'accepted') {
        acceptedContainedStories.push(story);
      }
      // Collect story addressing tickets and tests
      const [storyTickets, storyTests] = await Promise.all([
        store.getIncoming(story.id, 'addresses'),
        store.getIncoming(story.id, 'verifies')
      ]);
      for (const st of storyTickets) {
        allTicketsSet.add(store.localId(st.sourceId));
        const t = await store.getEntity<Ticket>(st.sourceId, Ticket.dcr);
        if (t && (t as any).lane === 'Blocked') hasBlockedTicket = true;
        const anchors = await getTicketCodeAnchors(store, st.sourceId);
        for (const c of anchors) codeSet.add(c);
      }
      for (const st of storyTests) {
        allTestsSet.add(store.localId(st.sourceId));
      }
    }
  }

  const tickets = Array.from(allTicketsSet).sort();
  const tests = Array.from(allTestsSet).sort();
  const code = Array.from(codeSet).sort();

  const gaps: CoverageGap[] = [];
  const status = (feature as any).status || 'draft';

  const isBlocked = blockPreds.length > 0 || hasBlockedTicket;
  if (isBlocked) {
    gaps.push({
      kind: 'blocked',
      message: `Feature '${localId}' is blocked by active blocker(s).`,
      relatedIds: blockPreds.map(p => store.localId(p.sourceId))
    });
  }

  if (status === 'accepted') {
    // Check implementation work: direct implementing tickets or addressing tickets on contained stories
    if (tickets.length === 0) {
      gaps.push({
        kind: 'missing_work',
        message: `Accepted Feature '${localId}' has no implementing Ticket or story-addressing Ticket.`
      });
    } else if (code.length === 0) {
      gaps.push({
        kind: 'missing_code_grounding',
        message: `Accepted Feature '${localId}' has implementation Ticket(s) but no code modifications or targets.`,
        relatedIds: tickets
      });
    }

    // Verification evidence: direct test or story verification
    if (tests.length === 0) {
      gaps.push({
        kind: 'missing_verification',
        message: `Accepted Feature '${localId}' has no verification Test directly or via contained stories.`
      });
    }
  }

  return {
    entityId: localId,
    entityType: 'Feature',
    complete: gaps.length === 0,
    gaps,
    related: {
      epics,
      features: [localId],
      stories,
      tickets,
      code,
      tests
    }
  };
}

async function getEpicCoverage(store: WorkflowStore, epic: Epic, localId: string): Promise<CoverageReport> {
  const [targetPreds, containedTicketPreds, blockPreds] = await Promise.all([
    store.getOutgoing(epic.id, 'targets'),
    store.getOutgoing(epic.id, 'contains'),
    store.getIncoming(epic.id, 'blocks')
  ]);

  const targetFeatures: string[] = [];
  const targetStories: string[] = [];
  for (const pred of targetPreds) {
    const target = await store.getEntity(pred.targetId);
    if (target instanceof Feature) {
      targetFeatures.push(store.localId(target.id));
    } else if (target instanceof UserStory) {
      targetStories.push(store.localId(target.id));
    }
  }

  const containedTickets = containedTicketPreds.map(p => store.localId(p.targetId)).sort();

  const codeSet = new Set<string>();
  const testSet = new Set<string>();
  let hasBlockedTicket = false;

  // Map each contained ticket to its implemented features and addressed stories
  const ticketImplementedFeatures = new Map<string, Set<string>>();
  const ticketAddressedStories = new Map<string, Set<string>>();

  for (const tId of containedTicketPreds.map(p => p.targetId)) {
    const ticket = await store.getEntity<Ticket>(tId, Ticket.dcr);
    if (ticket && (ticket as any).lane === 'Blocked') hasBlockedTicket = true;

    const [implementsPreds, addressesPreds] = await Promise.all([
      store.getOutgoing(tId, 'implements'),
      store.getOutgoing(tId, 'addresses')
    ]);

    const featSet = new Set<string>();
    for (const p of implementsPreds) {
      featSet.add(store.localId(p.targetId));
    }
    ticketImplementedFeatures.set(tId, featSet);

    const storySet = new Set<string>();
    for (const p of addressesPreds) {
      storySet.add(store.localId(p.targetId));
    }
    ticketAddressedStories.set(tId, storySet);

    const anchors = await getTicketCodeAnchors(store, tId);
    for (const c of anchors) codeSet.add(c);
  }

  // Pre-load contained stories for targeted features for behavioral path matching
  const featureContainedStories = new Map<string, Set<string>>();
  for (const fId of targetFeatures) {
    const [enabled, legacy] = await Promise.all([
      store.getOutgoing(fId, 'enables'),
      store.getOutgoing(fId, 'contains')
    ]);
    const sSet = new Set<string>();
    for (const p of [...enabled, ...legacy]) sSet.add(store.localId(p.targetId));
    featureContainedStories.set(fId, sSet);
  }

  // Collect tests verifying targeted features and stories
  for (const fId of targetFeatures) {
    const tests = await store.getIncoming(fId, 'verifies');
    for (const t of tests) testSet.add(store.localId(t.sourceId));
  }
  for (const sId of targetStories) {
    const tests = await store.getIncoming(sId, 'verifies');
    for (const t of tests) testSet.add(store.localId(t.sourceId));
  }

  const gaps: CoverageGap[] = [];

  const isBlocked = blockPreds.length > 0 || hasBlockedTicket;
  if (isBlocked) {
    gaps.push({
      kind: 'blocked',
      message: `Epic '${localId}' is blocked by active blocker(s).`,
      relatedIds: blockPreds.map(p => store.localId(p.sourceId))
    });
  }

  // Check target path invariants:
  // For each targeted Feature F: at least one contained Ticket must implement F OR address a Story contained in F.
  for (const fId of targetFeatures) {
    let pathFound = false;
    const storiesInF = featureContainedStories.get(fId) || new Set<string>();

    for (const tId of containedTicketPreds.map(p => p.targetId)) {
      if (ticketImplementedFeatures.get(tId)?.has(fId)) {
        pathFound = true;
        break;
      }
      const addressed = ticketAddressedStories.get(tId) || new Set<string>();
      for (const s of addressed) {
        if (storiesInF.has(s)) {
          pathFound = true;
          break;
        }
      }
      if (pathFound) break;
    }

    if (!pathFound) {
      gaps.push({
        kind: 'missing_target_path',
        message: `Epic '${localId}' targets Feature '${fId}' but has no contained Ticket implementing it or addressing its stories.`,
        relatedIds: [fId]
      });
    }
  }

  // For each targeted UserStory S: at least one contained Ticket must address S.
  for (const sId of targetStories) {
    let pathFound = false;
    for (const tId of containedTicketPreds.map(p => p.targetId)) {
      if (ticketAddressedStories.get(tId)?.has(sId)) {
        pathFound = true;
        break;
      }
    }

    if (!pathFound) {
      gaps.push({
        kind: 'missing_target_path',
        message: `Epic '${localId}' targets UserStory '${sId}' but has no contained Ticket addressing it.`,
        relatedIds: [sId]
      });
    }
  }

  return {
    entityId: localId,
    entityType: 'Epic',
    complete: gaps.length === 0,
    gaps,
    related: {
      epics: [localId],
      features: targetFeatures.sort(),
      stories: targetStories.sort(),
      tickets: containedTickets,
      code: Array.from(codeSet).sort(),
      tests: Array.from(testSet).sort()
    }
  };
}
