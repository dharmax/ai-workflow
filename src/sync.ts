import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { WorkflowStore } from './store.ts';
import { parseAndStoreGuidelines } from './guidelines.ts';
import type { Entity, TicketLane } from './types.ts';

const LANES: TicketLane[] = ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'];

export async function exportMarkdown(store: WorkflowStore) {
  const root = store.root;
  const tickets = store.listEntities({ type: 'ticket' });
  const epics = store.listEntities({ type: 'epic' });
  const decisions = store.listEntities({ type: 'decision' });
  const health = store.getProjectHealth();

  // 1. kanban.md (Obsidian Kanban compatible)
  let kanban = `---\nkanban-plugin: board\n---\n\n# Kanban Board\n\n`;
  for (const lane of LANES) {
    kanban += `## ${lane}\n\n`;
    const laneTickets = tickets.filter(t => (t.lane || 'Backlog') === lane);
    if (laneTickets.length === 0) {
      kanban += `- No items\n\n`;
    } else {
      for (const t of laneTickets) {
        const checkbox = lane === 'Done' ? '[x]' : lane === 'In Progress' ? '[/]' : '[ ]';
        kanban += `- ${checkbox} **${t.id}**: ${t.title}\n`;
        if (t.body) {
          kanban += `  - Summary: ${t.body.replace(/\n/g, ' ')}\n`;
        }
      }
      kanban += `\n`;
    }
  }
  kanban += `%% kanban:settings\n\`\`\`\n{"kanban-plugin":"board"}\n\`\`\`\n%%\n`;
  await writeFile(path.join(root, 'kanban.md'), kanban, 'utf8');

  // 2. epics.md
  let epicsMd = `# Epics & Product Roadmap\n\n`;
  for (const epic of epics) {
    epicsMd += `## ${epic.id}: ${epic.title}\n\n`;
    if (epic.body) epicsMd += `${epic.body}\n\n`;
    const children = store.getOutgoing(epic.id, 'implements').concat(store.getIncoming(epic.id, 'implements'));
    if (children.length > 0) {
      epicsMd += `### Linked Tickets\n`;
      for (const c of children) {
        epicsMd += `- **${c.id}** [${c.lane || 'Backlog'}]: ${c.title}\n`;
      }
      epicsMd += `\n`;
    }
  }
  await writeFile(path.join(root, 'epics.md'), epicsMd, 'utf8');

  // 3. decisions.md (ADRs)
  let decisionsMd = `# Architectural Decision Records (ADRs)\n\n`;
  for (const dec of decisions) {
    decisionsMd += `## ${dec.id}: ${dec.title}\n`;
    decisionsMd += `- **Status**: \`${dec.status || 'accepted'}\`\n`;
    decisionsMd += `- **Date**: ${dec.createdAt || 'N/A'}\n\n`;
    if (dec.body) decisionsMd += `${dec.body}\n\n`;
    decisionsMd += `---\n\n`;
  }
  await writeFile(path.join(root, 'decisions.md'), decisionsMd, 'utf8');

  // 4. modules.md
  let modulesMd = `# Architecture & Modules\n\n`;
  modulesMd += `## Module Health\n\n`;
  modulesMd += `| Module | Completion | Symbols | Bugs 🔴 | Active Tickets |\n`;
  modulesMd += `| :--- | :---: | :---: | :---: | :--- |\n`;
  for (const m of health.modules) {
    modulesMd += `| \`${m.name}\` | **${m.completionPercent}%** | ${m.symbolCount} | ${m.bugsCount} | ${m.activeTickets.join(', ') || 'None'} |\n`;
  }
  modulesMd += `\n## Dependency Diagram\n\n\`\`\`mermaid\ngraph TD\n`;
  for (const m of health.modules) {
    const files = store.getOutgoing(m.path, 'contains');
    for (const f of files) {
      const deps = store.getOutgoing(f.id, 'depends_on');
      for (const d of deps) {
        if (d.id.startsWith('.') || d.id.startsWith('/')) {
          modulesMd += `  "${m.name}" --> "${d.id}"\n`;
        }
      }
    }
  }
  modulesMd += `\`\`\`\n`;
  await writeFile(path.join(root, 'modules.md'), modulesMd, 'utf8');
}

export async function importMarkdown(store: WorkflowStore) {
  const root = store.root;
  const kanbanPath = path.join(root, 'kanban.md');

  // Import Guidelines & Enforcement Policies
  await parseAndStoreGuidelines(store);

  if (existsSync(kanbanPath)) {
    const content = await readFile(kanbanPath, 'utf8');
    let currentLane: TicketLane | null = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      const laneMatch = trimmed.match(/^##\s+(Backlog|Todo|In Progress|Done|Blocked)/i);
      if (laneMatch) {
        currentLane = laneMatch[1] as TicketLane;
        continue;
      }

      if (currentLane && (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]') || trimmed.startsWith('- [/]'))) {
        const ticketMatch = trimmed.match(/-\s+\[.\]\s+\*\*([A-Z0-9_-]+)\*\*:\s*(.+)$/i) ||
                            trimmed.match(/-\s+\[.\]\s+([A-Z0-9_-]+)\s*:\s*(.+)$/i) ||
                            trimmed.match(/-\s+\[.\]\s+([A-Z0-9_-]+)\s+(.+)$/i);
        if (ticketMatch) {
          const id = ticketMatch[1].trim();
          const title = ticketMatch[2].trim();
          const existing = store.getEntity(id);

          const defaultStatus = currentLane === 'Done' ? 'verified' : currentLane === 'In Progress' ? 'partial' : 'planned';
          store.upsertEntity({
            id,
            type: 'ticket',
            title: title || existing?.title || id,
            lane: currentLane,
            status: existing?.status || defaultStatus,
            body: existing?.body ?? ''
          });
        }
      }
    }
  }
}
