import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { Aspect } from './ontology.ts';
import type { WorkflowStore } from './store.ts';
import { applyProductMutations, type ProductMutation } from '../product/mutation.ts';

export async function exportAspectProjection(store: WorkflowStore, root: string): Promise<void> {
  let text = '# Aspects & Cross-cutting Intent\n\n';
  for (const aspect of await store.listEntities<Aspect>(Aspect.dcr)) {
    const view = await aspect.view(store);
    text += `## ${view.id}: ${view.title}\n\n- **Status**: \`${view.status}\`\n- **Scopes**: ${view.scopes.map(id => `\`${id}\``).join(', ') || 'None'}\n\n`;
    text += `### Description\n${view.body || ''}\n\n### Acceptance Criteria\n${view.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n')}\n\n`;
    const a = view.assessment;
    text += `### Evidence (read-only)\n- Tickets: ${a.tickets.join(', ') || 'None'}\n- Tests: ${a.tests.join(', ') || 'None'}\n- Artifacts: ${a.artifacts.join(', ') || 'None'}\n- Decisions: ${a.decisions.join(', ') || 'None'}\n- Code: ${a.code.join(', ') || 'None'}\n- Gaps: ${a.gaps.join(', ') || 'None'}\n\n`;
  }
  await writeFile(path.join(root, 'aspects.md'), text.trimEnd() + '\n', 'utf8');
}

/** This projection owns only Aspect fields and applies_to; evidence relations are read-only. */
export async function importAspectProjection(store: WorkflowStore, root: string, lastExportedAt: number): Promise<number> {
  const file = path.join(root, 'aspects.md');
  if (!existsSync(file) || (await stat(file)).mtimeMs <= lastExportedAt + 50) return 0;
  const mutations: ProductMutation[] = [];
  let count = 0;
  for (const block of (await readFile(file, 'utf8')).split(/^## /m).slice(1)) {
    const [heading, ...lines] = block.split('\n');
    const header = heading.match(/^([^:]+):\s*(.+)$/);
    if (!header) throw new Error('Invalid Aspect projection heading.');
    const id = header[1].trim(), title = header[2].trim();
    let status = 'draft', section = '', body: string[] = [], criteria: string[] = [], scopes: string[] = [];
    for (const line of lines) {
      const state = line.match(/^- \*\*Status\*\*: `([^`]+)`$/);
      const scope = line.match(/^- \*\*Scopes\*\*: (.*)$/);
      if (state) { status = state[1]; continue; }
      if (scope) { scopes = [...scope[1].matchAll(/`([^`]+)`/g)].map(m => m[1]); continue; }
      if (line.startsWith('### ')) { section = line.slice(4); continue; }
      if (section === 'Description') body.push(line);
      if (section === 'Acceptance Criteria') { const criterion = line.match(/^- \[.\] (.+)$/); if (criterion) criteria.push(criterion[1]); }
    }
    const existing = await store.getEntity<Aspect>(id, Aspect.dcr);
    mutations.push({ kind: existing ? 'product_update' : 'product_create', entityType: 'Aspect', id,
      fields: { title, status, body: body.join('\n').trim(), acceptanceCriteria: criteria } });
    const previous = existing ? await store.getOutgoing(existing.id, 'applies_to') : [];
    for (const edge of previous) if (!scopes.includes(store.localId(edge.targetId))) mutations.push({ kind: 'product_unlink', sourceId: id, predicate: 'applies_to', targetId: store.localId(edge.targetId) });
    for (const targetId of new Set(scopes)) if (!previous.some(e => store.localId(e.targetId) === targetId)) mutations.push({ kind: 'product_link', sourceId: id, predicate: 'applies_to', targetId });
    count++;
  }
  if (mutations.length) await applyProductMutations(store, mutations);
  return count;
}
