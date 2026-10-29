/**
 * Responsibility: Generate explicit product-manifest.md projection and recoverable authored snapshot.
 * Scope: Product Manifest view and deterministic versioned snapshot of non-reproducible authored state.
 */

import path from 'node:path';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { WorkflowStore } from '../graph/store.ts';
import {
  Product,
  Feature,
  Goal,
  Concept,
  Flow,
  UserStory,
  Aspect,
  Decision,
  ModuleNode,
  Epic,
  Ticket
} from '../model/ontology.ts';
import { PRODUCT_RELATIONS, productEdgeRows, type ProductEdgeRow } from './mutation.ts';
import { canonical } from '../kb/canonical.ts';

export async function generateProductManifest(store: WorkflowStore): Promise<string> {
  const product = await store.getEntity<Product>('PRODUCT', Product.dcr);
  const allFeatures = await store.listEntities<Feature>(Feature.dcr);
  const allGoals = await store.listEntities<Goal>(Goal.dcr);
  const allConcepts = await store.listEntities<Concept>(Concept.dcr);

  let md = `# Product Manifest\n\n`;

  if (!product) {
    md += `*No top-level Product charter defined yet.*\n\n`;
  } else {
    md += `## Product Charter: ${product.title || 'Product'}\n\n`;
    md += `- **Status**: \`${product.status || 'draft'}\`\n`;
    if (product.version) md += `- **Revision**: \`v${product.version}\`\n`;
    if (product.purpose) md += `- **Purpose**: ${product.purpose}\n`;
    if (product.scope) md += `- **Scope**: ${product.scope}\n`;
    if (product.actors && product.actors.length > 0) {
      md += `- **Actors**: ${product.actors.join(', ')}\n`;
    }
    if (product.nonGoals && product.nonGoals.length > 0) {
      md += `- **Non-Goals**:\n${product.nonGoals.map(ng => `  - ${ng}`).join('\n')}\n`;
    }
    if (product.bounds) md += `- **Bounds**: ${product.bounds}\n`;
    md += `\n`;
  }

  // Features referenced in manifest (via Product contains Feature edges)
  const productOutgoing = product ? await store.getOutgoing(product.id, 'contains') : [];
  const manifestFeatureIds = new Set<string>();
  const manifestGoalIds = new Set<string>();
  const manifestConceptIds = new Set<string>();

  for (const edge of productOutgoing) {
    const localTarget = store.localId(edge.targetId);
    const targetEntity = await store.getEntity(edge.targetId);
    if (targetEntity instanceof Feature) manifestFeatureIds.add(localTarget);
    else if (targetEntity instanceof Goal) manifestGoalIds.add(localTarget);
    else if (targetEntity instanceof Concept) manifestConceptIds.add(localTarget);
  }

  // Sorted manifest features
  const manifestFeatures = allFeatures
    .filter(f => manifestFeatureIds.has(store.localId(f.id)))
    .sort((a, b) => store.localId(a.id).localeCompare(store.localId(b.id)));

  const otherFeatures = allFeatures
    .filter(f => !manifestFeatureIds.has(store.localId(f.id)))
    .sort((a, b) => store.localId(a.id).localeCompare(store.localId(b.id)));

  md += `## Features\n\n`;
  if (manifestFeatures.length === 0) {
    md += `*No features linked to Product charter.*\n\n`;
  } else {
    for (const feat of manifestFeatures) {
      const fid = store.localId(feat.id);
      md += `### ${fid}: ${feat.title || fid}\n\n`;
      md += `- **Status**: \`${feat.status || 'draft'}\`\n`;
      if (feat.version) md += `- **Revision**: \`v${feat.version}\`\n`;
      md += `- **Responsibility**: ${feat.body || '*(none)*'}\n`;
      if (feat.scope) md += `- **Scope**: ${feat.scope}\n`;
      if (feat.boundaries) md += `- **Boundaries**: ${feat.boundaries}\n`;
      if (feat.outcomes && feat.outcomes.length > 0) {
        md += `- **Outcomes**:\n${feat.outcomes.map(o => `  - ${o}`).join('\n')}\n`;
      }
      if (feat.behavioralRules && feat.behavioralRules.length > 0) {
        md += `- **Behavioral Rules**:\n${feat.behavioralRules.map(r => `  - ${r}`).join('\n')}\n`;
      }

      // Enabled Stories
      const enablesEdges = await store.getOutgoing(feat.id, 'enables');
      if (enablesEdges.length > 0) {
        md += `- **Enabled Stories**: ${enablesEdges.map(e => store.localId(e.targetId)).sort().join(', ')}\n`;
      }

      // Applicable Aspects
      const aspectEdges = await store.getIncoming(feat.id, 'applies_to');
      if (aspectEdges.length > 0) {
        md += `- **Applicable Aspects**: ${aspectEdges.map(e => store.localId(e.sourceId)).sort().join(', ')}\n`;
      }

      md += `\n`;
    }
  }

  if (otherFeatures.length > 0) {
    md += `## Other Features (Unlinked)\n\n`;
    for (const feat of otherFeatures) {
      const fid = store.localId(feat.id);
      md += `- **${fid}**: ${feat.title || fid} (\`${feat.status || 'draft'}\`) — ${feat.body || '*(no responsibility stated)*'}\n`;
    }
    md += `\n`;
  }

  // Linked Goals & Concepts
  const manifestGoals = allGoals
    .filter(g => manifestGoalIds.has(store.localId(g.id)))
    .sort((a, b) => store.localId(a.id).localeCompare(store.localId(b.id)));
  if (manifestGoals.length > 0) {
    md += `## Product Goals\n\n`;
    for (const goal of manifestGoals) {
      const gid = store.localId(goal.id);
      md += `### ${gid}: ${goal.title || gid} (\`${goal.status || 'draft'}\`)\n${goal.body || ''}\n\n`;
    }
  }

  const manifestConcepts = allConcepts
    .filter(c => manifestConceptIds.has(store.localId(c.id)))
    .sort((a, b) => store.localId(a.id).localeCompare(store.localId(b.id)));
  if (manifestConcepts.length > 0) {
    md += `## Product Concepts\n\n`;
    for (const concept of manifestConcepts) {
      const cid = store.localId(concept.id);
      md += `### ${cid}: ${concept.title || cid} (\`${concept.status || 'draft'}\`)\n${concept.body || ''}\n\n`;
    }
  }

  return md;
}

export async function exportProductManifest(store: WorkflowStore, rootDir: string = store.root): Promise<string> {
  const content = await generateProductManifest(store);
  const targetPath = path.join(rootDir, 'product-manifest.md');
  await writeFile(targetPath, content, 'utf8');
  return targetPath;
}

export interface AuthoredSnapshot {
  version: 1;
  exportedAt: string;
  entities: Array<{
    id: string;
    kind: string;
    fields: Record<string, unknown>;
  }>;
  relations: Array<{
    sourceId: string;
    sourceKind: string;
    predicate: string;
    targetId: string;
    targetKind: string;
    payload?: Record<string, unknown>;
  }>;
}

export async function exportAuthoredState(store: WorkflowStore, rootDir: string = store.root): Promise<string> {
  const authoredEntities: AuthoredSnapshot['entities'] = [];

  // Export Product singleton if defined
  const product = await store.getEntity<Product>('PRODUCT', Product.dcr);
  if (product) {
    authoredEntities.push({
      id: 'PRODUCT',
      kind: 'Product',
      fields: {
        title: product.title,
        status: product.status,
        purpose: product.purpose,
        actors: product.actors,
        scope: product.scope,
        nonGoals: product.nonGoals,
        bounds: product.bounds
      }
    });
  }

  // Export Features
  const features = await store.listEntities<Feature>(Feature.dcr);
  for (const f of features) {
    authoredEntities.push({
      id: store.localId(f.id),
      kind: 'Feature',
      fields: {
        title: f.title,
        body: f.body,
        status: f.status,
        priority: f.priority,
        acceptanceCriteria: f.acceptanceCriteria,
        outcomes: f.outcomes,
        scope: f.scope,
        boundaries: f.boundaries,
        behavioralRules: f.behavioralRules,
        completenessTarget: f.completenessTarget
      }
    });
  }

  // Export Goals
  const goals = await store.listEntities<Goal>(Goal.dcr);
  for (const g of goals) {
    authoredEntities.push({
      id: store.localId(g.id),
      kind: 'Goal',
      fields: {
        title: g.title,
        body: g.body,
        status: g.status
      }
    });
  }

  // Export Concepts
  const concepts = await store.listEntities<Concept>(Concept.dcr);
  for (const c of concepts) {
    authoredEntities.push({
      id: store.localId(c.id),
      kind: 'Concept',
      fields: {
        title: c.title,
        body: c.body,
        status: c.status
      }
    });
  }

  // Export Flows
  const flows = await store.listEntities<Flow>(Flow.dcr);
  for (const fl of flows) {
    authoredEntities.push({
      id: store.localId(fl.id),
      kind: 'Flow',
      fields: {
        title: fl.title,
        body: fl.body,
        status: fl.status,
        actor: (fl as any).actor,
        context: (fl as any).context
      }
    });
  }

  // Export UserStories
  const stories = await store.listEntities<UserStory>(UserStory.dcr);
  for (const s of stories) {
    authoredEntities.push({
      id: store.localId(s.id),
      kind: 'UserStory',
      fields: {
        title: s.title,
        status: s.status,
        actor: s.actor,
        intent: s.intent,
        initialState: s.initialState,
        action: s.action,
        expectedResult: s.expectedResult,
        exceptions: s.exceptions,
        bounds: s.bounds,
        story: s.story,
        context: s.context,
        sla: s.sla,
        acceptanceCriteria: s.acceptanceCriteria,
        completenessTarget: s.completenessTarget
      }
    });
  }

  // Export Aspects
  const aspects = await store.listEntities<Aspect>(Aspect.dcr);
  for (const a of aspects) {
    authoredEntities.push({
      id: store.localId(a.id),
      kind: 'Aspect',
      fields: {
        title: a.title,
        body: a.body,
        status: a.status,
        acceptanceCriteria: a.acceptanceCriteria
      }
    });
  }

  // Export ModuleNode authored intent fields (for existing modules)
  const modules = await store.listEntities<ModuleNode>(ModuleNode.dcr);
  for (const m of modules) {
    if (m.body || m.responsibilities?.length || m.boundaries || m.intentStatus) {
      authoredEntities.push({
        id: store.localId(m.id),
        kind: 'Module',
        fields: {
          path: (m as any).path,
          body: m.body,
          responsibilities: m.responsibilities,
          boundaries: m.boundaries,
          intentStatus: m.intentStatus,
          completenessTarget: m.completenessTarget
        }
      });
    }
  }

  // Export Decisions
  const decisions = await store.listEntities<Decision>(Decision.dcr);
  for (const d of decisions) {
    authoredEntities.push({
      id: store.localId(d.id),
      kind: 'Decision',
      fields: {
        title: d.title,
        status: d.status,
        decision: (d as any).decision,
        context: (d as any).context,
        consequences: (d as any).consequences,
        body: d.body
      }
    });
  }

  // Export Governed Human Relations (mode 'H')
  const predicates = await store.sp.predicateCollection(store.sp.ontology.pdcr('applies_to'));
  const allPredicateRows = await predicates.findSome<ProductEdgeRow>({});
  const relationWhitelist = new Set(
    PRODUCT_RELATIONS.filter(r => r.mode === 'H').map(r => `${r.sourceKind}::${r.predicate}::${r.targetKind}`)
  );

  const authoredRelations: AuthoredSnapshot['relations'] = [];
  for (const row of allPredicateRows) {
    const key = `${row.sourceType}::${row.predicateName}::${row.targetType}`;
    if (!relationWhitelist.has(key)) continue;
    authoredRelations.push({
      sourceId: store.localId(row.sourceId),
      sourceKind: row.sourceType,
      predicate: row.predicateName,
      targetId: store.localId(row.targetId),
      targetKind: row.targetType,
      ...(row.payload && Object.keys(row.payload).length > 0 ? { payload: row.payload } : {})
    });
  }

  // Sort relations deterministically
  authoredRelations.sort((a, b) =>
    JSON.stringify([a.sourceId, a.predicate, a.targetId]).localeCompare(
      JSON.stringify([b.sourceId, b.predicate, b.targetId])
    )
  );

  authoredEntities.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));

  const snapshot: AuthoredSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entities: authoredEntities,
    relations: authoredRelations
  };

  const targetDir = path.join(rootDir, '.ai-workflow');
  await mkdir(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, 'authored-snapshot.json');
  await writeFile(targetFile, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  return targetFile;
}

export async function restoreAuthoredState(
  store: WorkflowStore,
  snapshot: AuthoredSnapshot
): Promise<{ restoredEntities: number; restoredRelations: number }> {
  store.assertCanWrite();
  if (!snapshot || snapshot.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${snapshot?.version}`);
  }

  let restoredEntities = 0;
  let restoredRelations = 0;

  for (const item of snapshot.entities) {
    if (item.kind === 'Product') {
      await store.upsertEntity(Product.dcr, {
        id: 'PRODUCT',
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'Feature') {
      await store.upsertEntity(Feature.dcr, {
        id: item.id,
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'Goal') {
      await store.upsertEntity(Goal.dcr, {
        id: item.id,
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'Concept') {
      await store.upsertEntity(Concept.dcr, {
        id: item.id,
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'Flow') {
      await store.upsertEntity(Flow.dcr, {
        id: item.id,
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'UserStory') {
      await store.upsertEntity(UserStory.dcr, {
        id: item.id,
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'Aspect') {
      await store.upsertEntity(Aspect.dcr, {
        id: item.id,
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'Decision') {
      await store.upsertEntity(Decision.dcr, {
        id: item.id,
        ...item.fields
      });
      restoredEntities++;
    } else if (item.kind === 'Module') {
      const existing = await store.getEntity<ModuleNode>(item.id, ModuleNode.dcr);
      if (existing) {
        await store.upsertEntity(ModuleNode.dcr, {
          id: item.id,
          ...item.fields
        });
      } else {
        await store.upsertEntity(ModuleNode.dcr, {
          id: item.id,
          title: (item.fields as any).path || item.id,
          path: (item.fields as any).path || item.id,
          status: 'implemented',
          ...item.fields
        });
      }
      restoredEntities++;
    }
  }

  // Restore relations
  for (const rel of snapshot.relations) {
    const source = await store.getEntity(rel.sourceId);
    const target = await store.getEntity(rel.targetId);
    if (source && target) {
      const existing = await store.getOutgoing(source.id, rel.predicate as any);
      if (!existing.some(e => store.localId(e.targetId) === rel.targetId)) {
        await store.relate(source, rel.predicate as any, target, rel.payload);
        restoredRelations++;
      }
    }
  }

  return { restoredEntities, restoredRelations };
}
