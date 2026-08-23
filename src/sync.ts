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
  const EPIC_ORDER = ['EPIC-ASG', 'EPIC-CTR', 'EPIC-JIT', 'EPIC-RT', 'EPIC-CON', 'EPIC-UI', 'EPIC-HUB'];
  const epics = store.listEntities({ type: 'epic' }).sort((a, b) => {
    const idxA = EPIC_ORDER.indexOf(a.id);
    const idxB = EPIC_ORDER.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.id.localeCompare(b.id);
  });
  const userStories = store.listEntities({ type: 'user_story' });
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
    const linkedTickets = children.filter(c => c.type === 'ticket');
    if (linkedTickets.length > 0) {
      epicsMd += `### Linked Tickets\n`;
      for (const c of linkedTickets) {
        epicsMd += `- **${c.id}** [${c.lane || 'Backlog'}]: ${c.title}\n`;
      }
      epicsMd += `\n`;
    }
  }
  await writeFile(path.join(root, 'epics.md'), epicsMd, 'utf8');

  // 3. user-stories.md
  const userStoriesPath = path.join(root, 'user-stories.md');
  if (userStories.length > 0) {
    let storiesMd = `# User Stories & Narrative Specifications\n### *The Human & Agent Behavior Specifications Bridging Epics and Execution Tickets*\n\n`;
    for (const epic of epics) {
      const epicStories = userStories
        .filter(us => (us.metadata?.epicId ? us.metadata.epicId === epic.id : store.getOutgoing(us.id, 'implements')[0]?.id === epic.id))
        .sort((a, b) => a.id.localeCompare(b.id));

      if (epicStories.length > 0) {
        storiesMd += `## ${epic.id}: ${epic.title}\n*(Linked Epic: \`${epic.id}\`)*\n\n`;
        for (const us of epicStories) {
          storiesMd += `### \`${us.id}\`: ${us.title}\n`;
          if (us.metadata?.actor && us.metadata?.story) {
            storiesMd += `- **Actor & Story**: As a **${us.metadata.actor}**, I want ${us.metadata.story.startsWith('to ') ? '' : 'to '}${us.metadata.story}\n`;
          }
          if (us.metadata?.context) {
            storiesMd += `- **Context**: ${us.metadata.context}\n`;
          }
          if (Array.isArray(us.metadata?.acceptanceCriteria) && us.metadata.acceptanceCriteria.length > 0) {
            storiesMd += `- **Acceptance Criteria**:\n`;
            for (const ac of us.metadata.acceptanceCriteria) {
              storiesMd += `  - [ ] ${ac}\n`;
            }
          }
          if (us.metadata?.sla) {
            storiesMd += `- **Performance SLA**: ${us.metadata.sla}\n`;
          }
          if (us.metadata?.linkedTicket) {
            storiesMd += `- **Linked Ticket**: \`${us.metadata.linkedTicket}\`\n\n`;
          } else {
            storiesMd += `\n`;
          }
        }
      }
    }
    await writeFile(userStoriesPath, storiesMd, 'utf8');
  }

  // 4. decisions.md (ADRs)
  let decisionsMd = `# Architectural Decision Records (ADRs)\n\n`;
  for (const dec of decisions) {
    decisionsMd += `## ${dec.id}: ${dec.title}\n`;
    decisionsMd += `- **Status**: \`${dec.status || 'accepted'}\`\n`;
    decisionsMd += `- **Date**: ${dec.createdAt || 'N/A'}\n\n`;
    if (dec.body) decisionsMd += `${dec.body}\n\n`;
    decisionsMd += `---\n\n`;
  }
  await writeFile(path.join(root, 'decisions.md'), decisionsMd, 'utf8');

  // 5. modules.md
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
  const epicsPath = path.join(root, 'epics.md');
  const userStoriesPath = path.join(root, 'user-stories.md');

  // 1. Import Guidelines & Enforcement Policies
  await parseAndStoreGuidelines(store);

  // 2. Import Epics
  if (existsSync(epicsPath)) {
    const epicsContent = await readFile(epicsPath, 'utf8');
    const epicBlocks = epicsContent.split(/\n##\s+/);
    for (let i = 1; i < epicBlocks.length; i++) {
      const block = epicBlocks[i];
      const lines = block.split('\n');
      const headerMatch = lines[0].match(/^([A-Z0-9_-]+):\s*(.+)$/) || lines[0].match(/^(?:.*?\s+)?([A-Z0-9_-]+):\s*(.+)$/);
      if (headerMatch) {
        const id = headerMatch[1].trim();
        const title = headerMatch[2].trim();
        const bodyLines = lines.slice(1).filter(l => !l.startsWith('### Linked Tickets') && !l.startsWith('- **TKT-'));
        const body = bodyLines.join('\n').trim();
        const existing = store.getEntity(id);
        store.upsertEntity({
          id,
          type: 'epic',
          title: title || existing?.title || id,
          status: existing?.status || 'planned',
          body: body || existing?.body || ''
        });
      }
    }
  }

  // 3. Import User Stories (Stateful Line Parser)
  if (existsSync(userStoriesPath)) {
    const storiesContent = await readFile(userStoriesPath, 'utf8');
    const lines = storiesContent.split('\n');
    let currentEpicId: string | null = null;
    let currentStory: { id: string; title: string; lines: string[] } | null = null;

    const processStory = (s: { id: string; title: string; lines: string[] }) => {
      const text = s.lines.join('\n');
      const actorMatch = text.match(/-\s+\*\*Actor & Story\*\*:\s*As an?\s+\*\*([^*]+)\*\*,\s*([\s\S]*?)(?=\n-|\n\n|$)/i);
      const contextMatch = text.match(/-\s+\*\*Context\*\*:\s*([\s\S]*?)(?=\n-|\n\n|$)/i);
      const slaMatch = text.match(/-\s+\*\*Performance SLA\*\*:\s*([\s\S]*?)(?=\n-|\n\n|$)/i);
      const criteriaMatches = Array.from(text.matchAll(/-\s+\[.\]\s+(.+)$/gm)).map(m => m[1].trim());
      const ticketMatch = text.match(/-\s+\*\*Linked Ticket\*\*:\s*`?([A-Z0-9_-]+)`?/i);

      let storyText = actorMatch ? actorMatch[2].trim() : undefined;
      if (storyText && storyText.startsWith('I want to ')) storyText = storyText.slice(10);
      else if (storyText && storyText.startsWith('I want ')) storyText = storyText.slice(7);

      const actor = actorMatch ? actorMatch[1].trim() : undefined;
      const context = contextMatch ? contextMatch[1].trim() : undefined;
      const sla = slaMatch ? slaMatch[1].trim() : undefined;
      const linkedTicket = ticketMatch ? ticketMatch[1].trim() : undefined;

      let storyEpicId = currentEpicId;
      const prefixMatch = s.id.match(/^US-([A-Z0-9]+)-/);
      if (prefixMatch) {
        storyEpicId = `EPIC-${prefixMatch[1]}`;
      }
      const existing = store.getEntity(s.id);
      store.upsertEntity({
        id: s.id,
        type: 'user_story',
        title: s.title || existing?.title || s.id,
        status: existing?.status || 'planned',
        body: text.trim(),
        metadata: {
          actor,
          story: storyText,
          context,
          sla,
          acceptanceCriteria: criteriaMatches,
          linkedTicket,
          epicId: storyEpicId
        }
      });

      store.clearRelations(s.id, 'implements');
      if (storyEpicId) {
        store.addRelation({
          fromId: s.id,
          toId: storyEpicId,
          relation: 'implements'
        });
      }
      if (linkedTicket) {
        store.clearRelations(linkedTicket, 'implements');
        store.addRelation({
          fromId: linkedTicket,
          toId: s.id,
          relation: 'implements'
        });
      }
    };

    for (const line of lines) {
      const epicMatch = line.match(/^##\s+([A-Z0-9_-]+):/) || line.match(/Linked Epic:\s*`?([A-Z0-9_-]+)`?/i);
      if (epicMatch) {
        currentEpicId = epicMatch[1].trim();
      }

      const storyHeaderMatch = line.match(/^###\s+`?([A-Z0-9_-]+)`?:\s*(.+)$/);
      if (storyHeaderMatch && (storyHeaderMatch[1].startsWith('US-') || storyHeaderMatch[1].startsWith('ST-'))) {
        if (currentStory) processStory(currentStory);
        currentStory = {
          id: storyHeaderMatch[1].trim(),
          title: storyHeaderMatch[2].trim(),
          lines: []
        };
      } else if (currentStory) {
        currentStory.lines.push(line);
      }
    }
    if (currentStory) processStory(currentStory);
  }

  // 4. Import Kanban Tickets
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
