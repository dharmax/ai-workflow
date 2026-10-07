/**
 * Responsibility: Semantic Epic Decomposition & Proposal Generator.
 * Scope: Transforms an Epic draft into a bounded, reviewable EpicStructureProposal
 *        reusing existing Features/Stories, surfacing questions, and performing ZERO graph mutation.
 */

import { z } from 'zod';
import type { Asker } from '@dharmax/llm-utils';
import { WorkflowStore } from '../graph/store.ts';
import { Goal, Concept, Flow, Epic, Feature, UserStory, Decision } from '../graph/ontology.ts';
import type { EpicStatus, IntentStatus } from '../graph/types.ts';
import { loadConfig } from '../config.ts';
import { createDefaultAsker } from '../model-runtime.ts';
export { createDefaultAsker } from '../model-runtime.ts';

export interface EpicStructureProposal {
  epic: {
    id: string;
    action: 'create' | 'existing';
    title: string;
    body?: string;
    status: EpicStatus;
  };

  features: Array<{
    id: string;
    action: 'reuse' | 'create';
    title: string;
    body?: string;
    acceptanceCriteria?: string[];
  }>;

  stories: Array<{
    id: string;
    action: 'reuse' | 'create';
    featureId?: string;
    title: string;
    actor?: string;
    story?: string;
    context?: string;
    acceptanceCriteria: string[];
  }>;

  questions: Array<{
    id: string;
    blocking: boolean;
    text: string;
  }>;
}

export const SemanticFeatureOutputSchema = z.object({
  action: z.enum(['reuse', 'create']),
  id: z.string().optional().describe('Existing feature ID if action=reuse, or optional reference key if create'),
  title: z.string().describe('Feature capability title'),
  body: z.string().optional().describe('Feature description and scope'),
  acceptanceCriteria: z.array(z.string()).optional().default([])
});

export const SemanticStoryOutputSchema = z.object({
  action: z.enum(['reuse', 'create']),
  id: z.string().optional().describe('Existing story ID if action=reuse, or optional reference key if create'),
  featureRef: z.string().optional().describe('Optional reference to a Feature that enables this Story (existing feature ID or proposed feature title/key)'),
  title: z.string().describe('Observable behavior/outcome title'),
  actor: z.string().optional(),
  story: z.string().optional(),
  context: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).default([])
});

export const SemanticQuestionOutputSchema = z.object({
  id: z.string(),
  blocking: z.boolean().default(false),
  text: z.string()
});

export const SemanticDecompositionOutputSchema = z.object({
  features: z.array(SemanticFeatureOutputSchema).default([]),
  stories: z.array(SemanticStoryOutputSchema).default([]),
  questions: z.array(SemanticQuestionOutputSchema).default([])
});

export type SemanticDecompositionOutput = z.infer<typeof SemanticDecompositionOutputSchema>;

function generateCandidateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export async function buildProductIntentContext(store: WorkflowStore): Promise<string> {
  const [goals, concepts, flows, features, stories, decisions, epics] = await Promise.all([
    store.listEntities<Goal>(Goal.dcr),
    store.listEntities<Concept>(Concept.dcr),
    store.listEntities<Flow>(Flow.dcr),
    store.listEntities<Feature>(Feature.dcr),
    store.listEntities<UserStory>(UserStory.dcr),
    store.listEntities<Decision>(Decision.dcr),
    store.listEntities<Epic>(Epic.dcr)
  ]);

  const nonDepFeatures = features.filter(f => (f as any).status !== 'deprecated');
  const nonDepStories = stories.filter(s => (s as any).status !== 'deprecated');
  const activeEpics = epics.filter(e => (e as any).status === 'active' || (e as any).status === 'planned');

  const lines: string[] = ['### Existing Product Intent Graph:'];

  if (goals.length > 0) {
    lines.push('\nGoals:');
    for (const item of goals) lines.push(`- [${store.localId(item.id)}] ${item.title}: ${(item as any).body || ''}`);
  }
  if (concepts.length > 0) {
    lines.push('\nProduct Concepts / Philosophy:');
    for (const item of concepts) lines.push(`- [${store.localId(item.id)}] ${item.title}: ${(item as any).body || ''}`);
  }
  if (flows.length > 0) {
    lines.push('\nActor Flows:');
    for (const item of flows) lines.push(`- [${store.localId(item.id)}] ${item.title}: ${(item as any).body || ''}`);
  }

  if (activeEpics.length > 0) {
    lines.push('\nActive/Planned Epics:');
    for (const e of activeEpics) {
      lines.push(`- [${store.localId(e.id)}] ${(e as any).title}`);
    }
  }

  if (nonDepFeatures.length > 0) {
    lines.push('\nExisting Features (stable capabilities):');
    for (const f of nonDepFeatures) {
      const fId = store.localId(f.id);
      lines.push(`- [${fId}] ${(f as any).title}`);
      if ((f as any).body) lines.push(`  Description: ${(f as any).body}`);
      const criteria = Array.isArray((f as any).acceptanceCriteria) ? (f as any).acceptanceCriteria : [];
      if (criteria.length > 0) lines.push(`  Criteria: ${criteria.join('; ')}`);
    }
  } else {
    lines.push('\nNo existing features.');
  }

  if (nonDepStories.length > 0) {
    lines.push('\nExisting User Stories:');
    for (const s of nonDepStories) {
      const sId = store.localId(s.id);
      lines.push(`- [${sId}] ${(s as any).title}`);
      if ((s as any).story) lines.push(`  Behavior: ${(s as any).story}`);
    }
  }

  if (decisions.length > 0) {
    lines.push('\nAccepted Architectural Decisions (ADRs):');
    for (const d of decisions) {
      const dId = store.localId(d.id);
      lines.push(`- [${dId}] ${(d as any).title}: ${(d as any).decision || ''}`);
    }
  }

  return lines.join('\n');
}

export type SemanticDecompositionInput = z.input<typeof SemanticDecompositionOutputSchema>;

export async function proposeEpicStructure(
  store: WorkflowStore,
  draft: {
    title: string;
    body?: string;
    status?: EpicStatus;
    existingEpicId?: string;
  },
  options?: {
    asker?: Asker;
    model?: string;
    injectedSemanticOutput?: SemanticDecompositionInput;
  }
): Promise<EpicStructureProposal> {
  let semanticOutput: SemanticDecompositionOutput;

  if (options?.injectedSemanticOutput) {
    // Deterministic test hook: zero model execution
    semanticOutput = SemanticDecompositionOutputSchema.parse(options.injectedSemanticOutput);
  } else {
    const asker = options?.asker || createDefaultAsker(store.root);
    if (!asker) {
      throw new Error('No LLM Asker or model connection available for proposeEpicStructure.');
    }

    const context = await buildProductIntentContext(store);

    const prompt = `You are a Technical Product Architect decomposing an Epic into Features and User Stories.

${context}

Epic Draft to decompose:
Title: "${draft.title}"
Description: ${draft.body || 'None provided'}

RULES:
1. Start from actor journeys, not Features. A User Story is a compact temporal episode: starting situation/intention, interaction/progression, and useful observable end state.
2. Feature = durable stable capability that ENABLES one or more Stories; a Feature does not own or contain a Story.
3. A Story may reference a Feature that enables it, but do not invent a Feature merely because a Story exists.
4. If an existing Feature or User Story already satisfies or matches the need, reuse it with its exact existing ID.
5. Only create new Features or Stories when the Epic's accepted product meaning actually requires them.
6. Technical Epics (refactoring, infrastructure, migrations) may legitimately have ZERO user stories. Do NOT invent product ceremony.
7. Respect relevant Goals, Flows, Concepts and Decisions from context. Surface missing upstream meaning as a question rather than guessing.
8. Do NOT invent implementation details (no specific internal code symbols, database tables, or low-level algorithms) and do not create Tickets/tasks here.
9. If requirements are ambiguous, contradictory, or missing critical decisions, surface them explicitly in "questions" (blocking when execution cannot safely proceed).
10. Keep the decomposition compact. Avoid story or capability explosion.

Respond ONLY with valid JSON conforming to the schema.`;

    const cfg = loadConfig(store.root);
    const modelTarget = options?.model || cfg.modelRoutes?.design || cfg.model;
    const response = await asker.json(prompt, SemanticDecompositionOutputSchema, {
      model: modelTarget, temperature: 0.2, maxRetries: 1, maxTokens: cfg.llmOutputTokens
    });
    if (!response.ok) throw new Error(`Semantic decomposition failed: ${response.failure?.message}`);
    semanticOutput = SemanticDecompositionOutputSchema.parse(response.data);
  }

  // ---------------------------------------------------------------------------
  // Host-Driven Candidate ID Assignment & Reference Binding
  // ---------------------------------------------------------------------------
  const epicId = draft.existingEpicId || generateCandidateId('EPIC');
  const epicAction: 'create' | 'existing' = draft.existingEpicId ? 'existing' : 'create';

  // Map of temporary/model feature identifier -> candidate/existing ID
  const featureRefMap = new Map<string, string>();
  // Index existing graph features & stories by ID and lowercase title for robust semantic reuse matching
  const [existingFeatures, existingStories] = await Promise.all([
    store.listEntities<Feature>(Feature.dcr),
    store.listEntities<UserStory>(UserStory.dcr)
  ]);
  const existingFeatByTitle = new Map<string, string>();
  for (const ef of existingFeatures) {
    existingFeatByTitle.set((ef as any).title.toLowerCase().trim(), store.localId(ef.id));
  }
  const existingStoryByTitle = new Map<string, string>();
  for (const es of existingStories) {
    existingStoryByTitle.set((es as any).title.toLowerCase().trim(), store.localId(es.id));
  }

  const existingFeatIds = new Set(existingFeatures.map(ef => store.localId(ef.id)));
  const existingStoryIds = new Set(existingStories.map(es => store.localId(es.id)));

  const resolvedFeatures: EpicStructureProposal['features'] = [];
  for (const f of semanticOutput.features) {
    let resolvedId: string;
    if (f.action === 'reuse') {
      const candidateKey = (f.id || '').trim();
      const titleKey = (f.title || '').trim();
      const matched = (candidateKey && existingFeatIds.has(candidateKey))
        ? candidateKey
        : (existingFeatIds.has(titleKey)
          ? titleKey
          : (existingFeatByTitle.get(titleKey.toLowerCase()) || existingFeatByTitle.get(candidateKey.toLowerCase())));
      resolvedId = matched || f.id || generateCandidateId('FEAT');
    } else {
      resolvedId = generateCandidateId('FEAT');
    }

    // Map model id, candidate id, and title to resolved ID
    if (f.id) featureRefMap.set(f.id, resolvedId);
    featureRefMap.set(f.title.toLowerCase().trim(), resolvedId);
    featureRefMap.set(resolvedId, resolvedId);

    resolvedFeatures.push({
      id: resolvedId,
      action: f.action,
      title: f.title,
      body: f.body,
      acceptanceCriteria: f.acceptanceCriteria
    });
  }

  const resolvedStories: EpicStructureProposal['stories'] = [];
  for (const s of semanticOutput.stories) {
    let resolvedId: string;
    if (s.action === 'reuse') {
      const candidateKey = (s.id || '').trim();
      const titleKey = (s.title || '').trim();
      const matched = (candidateKey && existingStoryIds.has(candidateKey))
        ? candidateKey
        : (existingStoryIds.has(titleKey)
          ? titleKey
          : (existingStoryByTitle.get(titleKey.toLowerCase()) || existingStoryByTitle.get(candidateKey.toLowerCase())));
      resolvedId = matched || s.id || generateCandidateId('STORY');
    } else {
      resolvedId = generateCandidateId('STORY');
    }

    // A Feature may enable this Story, but the Story does not require Feature ownership.
    let targetFeatureId: string | undefined;
    if (s.featureRef?.trim()) {
      const featureRef = s.featureRef.trim();
      targetFeatureId = featureRefMap.get(featureRef) || featureRefMap.get(featureRef.toLowerCase());
      if (!targetFeatureId) {
        const directMatch = resolvedFeatures.find(rf => rf.id === featureRef);
        targetFeatureId = directMatch?.id;
      }
      if (!targetFeatureId) {
        semanticOutput.questions.push({
          id: `feature-ref-${resolvedId}`,
          blocking: true,
          text: `Story '${s.title}' references unknown enabling Feature '${featureRef}'. Reuse or define the intended capability explicitly.`
        });
      }
    }

    resolvedStories.push({
      id: resolvedId,
      action: s.action,
      featureId: targetFeatureId,
      title: s.title,
      actor: s.actor,
      story: s.story,
      context: s.context,
      acceptanceCriteria: s.acceptanceCriteria || []
    });
  }

  return {
    epic: {
      id: epicId,
      action: epicAction,
      title: draft.title,
      body: draft.body,
      status: draft.status || 'draft'
    },
    features: resolvedFeatures,
    stories: resolvedStories,
    questions: semanticOutput.questions
  };
}
