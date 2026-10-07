import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import {
  Epic,
  Feature,
  UserStory,
  Ticket,
  Decision
} from '../src/graph/ontology.ts';
import { initializeTools, registry, type ToolContext } from '../src/tools/index.ts';
import { createDefaultAsker, proposeEpicStructure, type EpicStructureProposal } from '../src/product/decompose.ts';
import { saveConfig } from '../src/config.ts';
import { applyEpicStructure } from '../src/product/apply.ts';

describe('Epic Decomposition & Apply (Ticket 2)', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: ToolContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-decompose-test-'));
    store = new WorkflowStore(tempDir, true);
    initializeTools();
    ctx = { store, projectRoot: tempDir };
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('honors project default and task model routes in the shared Asker', () => {
    saveConfig(tempDir, {
      model: 'ollama/qwen-project',
      ollamaContextWindow: 24576,
      llmOutputTokens: 3072,
      providerOptions: {
        ollama: { top_k: 32, top_p: 0.85 }
      },
      modelRoutes: {
        design: 'openrouter/deepseek/deepseek-chat',
        'digest.review': 'google/gemini-review'
      }
    });
    const asker = createDefaultAsker(tempDir)!;
    expect(asker.getProvider('ollama')).toMatchObject({
      contextWindow: 24576,
      maxTokens: 3072,
      providerOptions: { top_k: 32, top_p: 0.85 }
    });
    expect(asker.getRouter().resolve(undefined, ['ollama', 'openrouter', 'google'])).toEqual({
      providerId: 'ollama',
      modelId: 'qwen-project'
    });
    expect(asker.getRouter().resolve('design', ['ollama', 'openrouter', 'google'])).toEqual({
      providerId: 'openrouter',
      modelId: 'deepseek/deepseek-chat'
    });
    expect(asker.getRouter().resolve('digest.review', ['ollama', 'openrouter', 'google'])).toEqual({
      providerId: 'google',
      modelId: 'gemini-review'
    });
  });

  // 1. Equivalent Feature reuse by existing ID
  it('reuses existing Feature by ID and does not create duplicate Feature', async () => {
    const existingFeat = await store.upsertEntity<Feature>(Feature.dcr, {
      id: 'FEAT-CALENDAR-CORE',
      title: 'Calendar Core Scheduling',
      body: 'Core capabilities for calendar event management',
      status: 'accepted'
    });

    const proposal = await proposeEpicStructure(store, {
      title: 'Calendar Attendee Invites',
      body: 'Allow adding attendees to meetings'
    }, {
      injectedSemanticOutput: {
        features: [
          {
            action: 'reuse',
            id: 'FEAT-CALENDAR-CORE',
            title: 'Calendar Core Scheduling'
          }
        ],
        stories: [
          {
            action: 'create',
            featureRef: 'FEAT-CALENDAR-CORE',
            title: 'Add attendee email to event invite',
            actor: 'Organizer',
            story: 'The organizer adds an attendee email to an existing meeting; AIWF validates it, saves the attendee, and the invite is ready to notify them.',
            acceptanceCriteria: ['Validates email syntax']
          }
        ],
        questions: []
      }
    });

    expect(proposal.features).toHaveLength(1);
    expect(proposal.features[0].action).toBe('reuse');
    expect(proposal.features[0].id).toBe('FEAT-CALENDAR-CORE');

    // Apply proposal
    const result = await applyEpicStructure(store, proposal);
    expect(result.applied).toBe(true);
    expect(result.featureIds).toEqual(['FEAT-CALENDAR-CORE']);
    expect(result.storyIds).toHaveLength(1);

    // Verify graph state
    const allFeatures = await store.listEntities<Feature>(Feature.dcr);
    expect(allFeatures).toHaveLength(1);
    expect(store.localId(allFeatures[0].id)).toBe('FEAT-CALENDAR-CORE');

    const createdStory = await store.getEntity<UserStory>(result.storyIds[0]);
    expect(createdStory).toBeDefined();

    // Verify capability relation: Feature enables Story
    const storiesInFeat = await store.getOutgoing(existingFeat.id, 'enables');
    expect(storiesInFeat.map(p => store.localId(p.targetId))).toContain(result.storyIds[0]);
  });

  // 2. Equivalent Story reuse by existing ID
  it('reuses existing Story by ID without duplicating it', async () => {
    const existingFeat = await store.upsertEntity<Feature>(Feature.dcr, {
      id: 'FEAT-NOTIFICATIONS',
      title: 'Notification Delivery'
    });
    const existingStory = await store.upsertEntity<UserStory>(UserStory.dcr, {
      id: 'STORY-EMAIL-ALERT',
      title: 'Send email alert on update'
    });
    await store.relate(existingFeat, 'enables', existingStory);

    const proposal = await proposeEpicStructure(store, {
      title: 'Alert Integration Epic'
    }, {
      injectedSemanticOutput: {
        features: [
          {
            action: 'reuse',
            id: 'FEAT-NOTIFICATIONS',
            title: 'Notification Delivery'
          }
        ],
        stories: [
          {
            action: 'reuse',
            id: 'STORY-EMAIL-ALERT',
            featureRef: 'FEAT-NOTIFICATIONS',
            title: 'Send email alert on update',
            acceptanceCriteria: []
          }
        ],
        questions: []
      }
    });

    expect(proposal.stories[0].action).toBe('reuse');
    expect(proposal.stories[0].id).toBe('STORY-EMAIL-ALERT');

    const result = await applyEpicStructure(store, proposal);
    expect(result.applied).toBe(true);
    expect(result.storyIds).toEqual(['STORY-EMAIL-ALERT']);

    const allStories = await store.listEntities<UserStory>(UserStory.dcr);
    expect(allStories).toHaveLength(1);
  });

  it('does not manufacture a Feature when a Story has no enabling capability', async () => {
    const proposal = await proposeEpicStructure(store, {
      title: 'Clarify support flow'
    }, {
      injectedSemanticOutput: {
        features: [],
        stories: [{
          action: 'create',
          title: 'Developer gets a precise unsupported-case explanation',
          actor: 'Developer',
          story: 'The developer asks for an unsupported operation; AIWF explains the missing capability and leaves project state unchanged.',
          acceptanceCriteria: ['The unsupported request ends with a truthful explanation']
        }],
        questions: []
      }
    });

    expect(proposal.features).toHaveLength(0);
    expect(proposal.stories).toHaveLength(1);
    expect(proposal.stories[0].featureId).toBeUndefined();

    const result = await applyEpicStructure(store, proposal);
    expect(result.applied).toBe(true);
    expect((await store.listEntities<Feature>(Feature.dcr))).toHaveLength(0);
    expect((await store.getIncoming(result.storyIds[0], 'enables'))).toHaveLength(0);
  });

  // 3. Zero graph mutation during proposal (and abort leaves graph completely untouched)
  it('leaves graph completely untouched during proposal generation', async () => {
    const initialEpics = await store.listEntities<Epic>(Epic.dcr);
    const initialFeatures = await store.listEntities<Feature>(Feature.dcr);
    const initialStories = await store.listEntities<UserStory>(UserStory.dcr);

    const proposal = await proposeEpicStructure(store, {
      title: 'Draft Uncommitted Epic',
      body: 'Should not create anything in SQLite store'
    }, {
      injectedSemanticOutput: {
        features: [
          { action: 'create', title: 'New Unsaved Feature', acceptanceCriteria: ['AC1'] }
        ],
        stories: [
          { action: 'create', featureRef: 'New Unsaved Feature', title: 'New Unsaved Story', acceptanceCriteria: ['AC2'] }
        ],
        questions: []
      }
    });

    // Proposal contains candidate IDs
    expect(proposal.epic.id).toMatch(/^EPIC-/);
    expect(proposal.features[0].id).toMatch(/^FEAT-/);
    expect(proposal.stories[0].id).toMatch(/^STORY-/);

    // Verify ZERO graph mutation occurred
    const postEpics = await store.listEntities<Epic>(Epic.dcr);
    const postFeatures = await store.listEntities<Feature>(Feature.dcr);
    const postStories = await store.listEntities<UserStory>(UserStory.dcr);

    expect(postEpics).toHaveLength(initialEpics.length);
    expect(postFeatures).toHaveLength(initialFeatures.length);
    expect(postStories).toHaveLength(initialStories.length);

    // Ensure entities cannot be retrieved
    expect(await store.getEntity(proposal.epic.id)).toBeNull();
    expect(await store.getEntity(proposal.features[0].id)).toBeNull();
    expect(await store.getEntity(proposal.stories[0].id)).toBeNull();
  });

  // 4. Candidate IDs are assigned deterministically once
  it('preserves candidate IDs through proposal and apply', async () => {
    const proposal = await proposeEpicStructure(store, {
      title: 'Candidate ID Consistency Epic'
    }, {
      injectedSemanticOutput: {
        features: [
          { action: 'create', title: 'Feature Alpha' }
        ],
        stories: [
          { action: 'create', featureRef: 'Feature Alpha', title: 'Story One', acceptanceCriteria: [] }
        ],
        questions: []
      }
    });

    const expectedEpicId = proposal.epic.id;
    const expectedFeatId = proposal.features[0].id;
    const expectedStoryId = proposal.stories[0].id;

    const result = await applyEpicStructure(store, proposal);
    expect(result.epicId).toBe(expectedEpicId);
    expect(result.featureIds[0]).toBe(expectedFeatId);
    expect(result.storyIds[0]).toBe(expectedStoryId);

    // Graph entities match exact candidate IDs
    const ep = await store.getEntity<Epic>(expectedEpicId);
    const feat = await store.getEntity<Feature>(expectedFeatId);
    const st = await store.getEntity<UserStory>(expectedStoryId);

    expect(ep).toBeDefined();
    expect(feat).toBeDefined();
    expect(st).toBeDefined();
  });

  // 5. Blocking question blocks apply
  it('throws an error and refuses to apply if proposal contains blocking questions', async () => {
    const proposal: EpicStructureProposal = {
      epic: { id: 'EPIC-BLOCK', action: 'create', title: 'Blocked Epic', status: 'planned' },
      features: [{ id: 'FEAT-BLOCK', action: 'create', title: 'Feature Blocked' }],
      stories: [],
      questions: [
        { id: 'Q1', blocking: true, text: 'Do we support LDAP or OAuth2?' },
        { id: 'Q2', blocking: false, text: 'What is the default timeout?' }
      ]
    };

    expect(applyEpicStructure(store, proposal)).rejects.toThrow(
      /Cannot apply proposal: blocking question\(s\) must be resolved first: \[Q1\] Do we support LDAP or OAuth2\?/
    );

    // Verify nothing written to graph
    expect(await store.getEntity('EPIC-BLOCK')).toBeNull();
  });

  // 6. Idempotent repeated apply
  it('safely tolerates repeated apply calls without duplicate nodes or broken edges', async () => {
    const proposal = await proposeEpicStructure(store, {
      title: 'Idempotency Epic'
    }, {
      injectedSemanticOutput: {
        features: [{ action: 'create', title: 'Idempotent Feature' }],
        stories: [{ action: 'create', featureRef: 'Idempotent Feature', title: 'Idempotent Story', acceptanceCriteria: [] }],
        questions: []
      }
    });

    // First apply
    const res1 = await applyEpicStructure(store, proposal);
    expect(res1.applied).toBe(true);

    // Second apply with identical proposal
    const res2 = await applyEpicStructure(store, proposal);
    expect(res2.applied).toBe(true);

    // Confirm count of entities
    const epics = await store.listEntities<Epic>(Epic.dcr);
    const features = await store.listEntities<Feature>(Feature.dcr);
    const stories = await store.listEntities<UserStory>(UserStory.dcr);

    expect(epics).toHaveLength(1);
    expect(features).toHaveLength(1);
    expect(stories).toHaveLength(1);

    // Check targets / contains edge count: Epic targets 1 Feature and 1 Story (total 2 edges, not duplicated across 2 applies)
    const targeted = await store.getOutgoing(proposal.epic.id, 'targets');
    expect(targeted).toHaveLength(2);
    const targetedIds = targeted.map(p => store.localId(p.targetId));
    expect(targetedIds).toContain(proposal.features[0].id);
    expect(targetedIds).toContain(proposal.stories[0].id);
  });

  // 7. Collision with unrelated entity type fails clearly
  it('fails if candidate ID collides with an existing entity of a different type', async () => {
    // Create a Ticket with an ID that collides
    await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'COLLISION-ID',
      title: 'Existing Ticket',
      lane: 'Todo'
    });

    const proposal: EpicStructureProposal = {
      epic: { id: 'COLLISION-ID', action: 'create', title: 'Colliding Epic', status: 'planned' },
      features: [],
      stories: [],
      questions: []
    };

    expect(applyEpicStructure(store, proposal)).rejects.toThrow(
      /Candidate Epic ID 'COLLISION-ID' collides with an existing 'Ticket' entity/
    );
  });

  // 8. Technical Epic with zero Stories is valid
  it('allows a technical Epic containing only Features with zero Stories', async () => {
    const proposal = await proposeEpicStructure(store, {
      title: 'Refactor Internal Database Layer',
      body: 'Migrate to SQLite memory cache'
    }, {
      injectedSemanticOutput: {
        features: [
          { action: 'create', title: 'SQLite In-Memory Cache Subsystem' }
        ],
        stories: [], // Zero stories!
        questions: []
      }
    });

    expect(proposal.features).toHaveLength(1);
    expect(proposal.stories).toHaveLength(0);

    const result = await applyEpicStructure(store, proposal);
    expect(result.applied).toBe(true);
    expect(result.storyIds).toHaveLength(0);

    const ep = await store.getEntity<Epic>(result.epicId);
    expect(ep).toBeDefined();

    const targeted = await store.getOutgoing(result.epicId, 'targets');
    expect(targeted).toHaveLength(1);
    expect(store.localId(targeted[0].targetId)).toBe(result.featureIds[0]);
  });
});
