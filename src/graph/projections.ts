/**
 * Responsibility: Bi-directional markdown projections of AST+ Graph entities.
 * Scope: Synchronizing kanban.md (Obsidian), epics.md, user-stories.md, decisions.md, and modules.md.
 */

import path from 'node:path';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { WorkflowStore } from './store.ts';
import {
  Ticket,
  Epic,
  UserStory,
  Decision,
  ModuleNode
} from './ontology.ts';
import type { TicketLane } from './types.ts';

const LANES: TicketLane[] = ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'];

export async function exportProjections(store: WorkflowStore, rootDir: string = store.root): Promise<{ exportedFiles: string[] }> {
  const exportedFiles: string[] = [];
  const tickets = await store.listEntities<Ticket>(Ticket.dcr);
  const epics = await store.listEntities<Epic>(Epic.dcr);
  const userStories = await store.listEntities<UserStory>(UserStory.dcr);
  const decisions = await store.listEntities<Decision>(Decision.dcr);
  const health = await store.getProjectHealth();

  // 1. kanban.md (Obsidian Kanban compatible)
  let kanban = `---\nkanban-plugin: board\n---\n\n# Kanban Board\n\n`;
  for (const lane of LANES) {
    kanban += `## ${lane}\n\n`;
    const laneTickets = tickets.filter(t => ((t as any).lane || 'Backlog') === lane);
    if (laneTickets.length === 0) {
      kanban += `- No items\n\n`;
    } else {
      for (const t of laneTickets) {
        const localId = store.localId(t.id);
        const checkbox = lane === 'Done' ? '[x]' : lane === 'In Progress' ? '[/]' : '[ ]';
        kanban += `- ${checkbox} **${localId}**: ${(t as any).title || localId}\n`;
        if ((t as any).body) {
          const cleanBody = (t as any).body.replace(/\n/g, ' ').trim();
          if (cleanBody) kanban += `  - Summary: ${cleanBody}\n`;
        }
        if ((t as any).claim) {
          const claim = (t as any).claim;
          kanban += `  - Claim: leased by @${claim.agentId} until ${claim.expiresAt}\n`;
        }
      }
      kanban += `\n`;
    }
  }
  kanban += `%% kanban:settings\n\`\`\`\n{"kanban-plugin":"board"}\n\`\`\`\n%%\n`;
  await writeFile(path.join(rootDir, 'kanban.md'), kanban, 'utf8');
  exportedFiles.push('kanban.md');

  // 2. epics.md
  let epicsMd = `# Epics & Product Roadmap\n\n`;
  for (const epic of epics) {
    const epicLocalId = store.localId(epic.id);
    epicsMd += `## ${epicLocalId}: ${(epic as any).title || epicLocalId}\n\n`;
    if ((epic as any).body) epicsMd += `${(epic as any).body}\n\n`;

    const implementsPreds = await store.getIncoming(epic.id, 'implements');
    const linkedTickets = tickets.filter(t => implementsPreds.some(p => p.sourceId === t.id));

    if (linkedTickets.length > 0) {
      epicsMd += `### Linked Tickets\n`;
      for (const t of linkedTickets) {
        const tLocalId = store.localId(t.id);
        epicsMd += `- **${tLocalId}** [${(t as any).lane || 'Backlog'}]: ${(t as any).title || tLocalId}\n`;
      }
      epicsMd += `\n`;
    }
  }
  await writeFile(path.join(rootDir, 'epics.md'), epicsMd, 'utf8');
  exportedFiles.push('epics.md');

  // 3. user-stories.md
  if (userStories.length > 0) {
    let storiesMd = `# User Stories & Behavioral Specifications\n\n`;
    for (const story of userStories) {
      const storyLocalId = store.localId(story.id);
      storiesMd += `## ${storyLocalId}\n`;
      storiesMd += `- **Actor**: ${(story as any).actor || 'User'}\n`;
      storiesMd += `- **Story**: ${(story as any).story || 'N/A'}\n`;
      if ((story as any).context) storiesMd += `- **Context**: ${(story as any).context}\n`;
      if ((story as any).acceptanceCriteria) storiesMd += `- **Acceptance Criteria**: ${(story as any).acceptanceCriteria}\n`;
      if ((story as any).sla) storiesMd += `- **Performance SLA**: ${(story as any).sla}\n`;
      storiesMd += `\n`;
    }
    await writeFile(path.join(rootDir, 'user-stories.md'), storiesMd, 'utf8');
    exportedFiles.push('user-stories.md');
  }

  // 4. decisions.md (ADRs)
  if (decisions.length > 0) {
    let decisionsMd = `# Architectural Decision Records (ADRs)\n\n`;
    for (const dec of decisions) {
      const decLocalId = store.localId(dec.id);
      decisionsMd += `## ${decLocalId}: ${(dec as any).title || decLocalId}\n`;
      decisionsMd += `- **Status**: \`${(dec as any).status || 'accepted'}\`\n`;
      decisionsMd += `- **Date**: ${(dec as any).createdAt || 'N/A'}\n\n`;
      if ((dec as any).context) decisionsMd += `### Context\n${(dec as any).context}\n\n`;
      if ((dec as any).decision) decisionsMd += `### Decision\n${(dec as any).decision}\n\n`;
      if ((dec as any).consequences) decisionsMd += `### Consequences\n${(dec as any).consequences}\n\n`;
      decisionsMd += `---\n\n`;
    }
    await writeFile(path.join(rootDir, 'decisions.md'), decisionsMd, 'utf8');
    exportedFiles.push('decisions.md');
  }

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
    const containsPreds = await store.getOutgoing(m.path, 'contains');
    for (const p of containsPreds) {
      const deps = await store.getOutgoing(p.targetId, 'depends_on');
      for (const d of deps) {
        modulesMd += `  "${m.name}" --> "${store.localId(d.targetId)}"\n`;
      }
    }
  }
  modulesMd += `\`\`\`\n`;
  await writeFile(path.join(rootDir, 'modules.md'), modulesMd, 'utf8');
  exportedFiles.push('modules.md');

  // Record export timestamp in sync-state.json
  const stateDir = path.join(rootDir, '.ai-workflow', 'state');
  try {
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      path.join(stateDir, 'sync-state.json'),
      JSON.stringify({ lastExportedAt: Date.now() }, null, 2),
      'utf8'
    );
  } catch {}

  return { exportedFiles };
}

export async function importProjections(store: WorkflowStore, rootDir: string = store.root): Promise<{ importedChanges: number }> {
  let importedChanges = 0;
  const kanbanPath = path.join(rootDir, 'kanban.md');
  const epicsPath = path.join(rootDir, 'epics.md');
  const userStoriesPath = path.join(rootDir, 'user-stories.md');
  const decisionsPath = path.join(rootDir, 'decisions.md');

  const stateFile = path.join(rootDir, '.ai-workflow', 'state', 'sync-state.json');
  let lastExportedAt = 0;
  if (existsSync(stateFile)) {
    try {
      const parsed = JSON.parse(await readFile(stateFile, 'utf8'));
      lastExportedAt = parsed.lastExportedAt || 0;
    } catch {}
  }

  // 1. Import kanban.md (only if edited since last export)
  if (existsSync(kanbanPath)) {
    const fileStat = await stat(kanbanPath);
    if (fileStat.mtimeMs > lastExportedAt + 50) {
      const kanbanContent = await readFile(kanbanPath, 'utf8');
      const sections = kanbanContent.split(/\n##\s+/);

      for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        const lines = section.split('\n');
        const laneName = lines[0].trim() as TicketLane;
        if (!LANES.includes(laneName)) continue;

        for (let j = 1; j < lines.length; j++) {
          const line = lines[j].trim();
          const cardMatch = line.match(/^-\s+\[(.)\]\s+\*\*([A-Z0-9_-]+)\*\*:\s*(.+)$/);
          if (cardMatch) {
            const checkChar = cardMatch[1];
            const ticketId = cardMatch[2];
            const title = cardMatch[3].trim();

            let resolvedLane = laneName;
            if (checkChar === 'x' || checkChar === 'X') resolvedLane = 'Done';
            else if (checkChar === '/') resolvedLane = 'In Progress';

            let summary = '';
            if (j + 1 < lines.length && lines[j + 1].trim().startsWith('- Summary:')) {
              summary = lines[j + 1].trim().replace(/^- Summary:\s*/, '');
            }

            const existingTicket = await store.getEntity<Ticket>(ticketId, Ticket.dcr);
            const existingClaim = existingTicket ? (existingTicket as any).claim : null;
            const isClaimActive = existingClaim && new Date(existingClaim.expiresAt) > new Date();

            let claim = existingClaim;
            if (resolvedLane === 'Done' || resolvedLane === 'Blocked') {
              claim = null;
            } else if (isClaimActive && resolvedLane === 'Todo') {
              resolvedLane = 'In Progress';
            }

            await store.upsertEntity<Ticket>(Ticket.dcr, {
              id: ticketId,
              title,
              lane: resolvedLane,
              body: summary,
              claim,
              status: resolvedLane === 'Done' ? 'verified' : resolvedLane === 'In Progress' ? 'in_progress' : 'planned'
            });
            importedChanges++;
          }
        }
      }
    }
  }

  // 2. Import epics.md
  if (existsSync(epicsPath)) {
    const epicsContent = await readFile(epicsPath, 'utf8');
    const epicBlocks = epicsContent.split(/\n##\s+/);

    for (let i = 1; i < epicBlocks.length; i++) {
      const block = epicBlocks[i];
      const lines = block.split('\n');
      const headerMatch = lines[0].match(/^([A-Z0-9_-]+):\s*(.+)$/);
      if (headerMatch) {
        const id = headerMatch[1].trim();
        const title = headerMatch[2].trim();
        const bodyLines = lines.slice(1).filter(l => !l.startsWith('### Linked Tickets') && !l.startsWith('- **'));
        const body = bodyLines.join('\n').trim();

        await store.upsertEntity<Epic>(Epic.dcr, {
          id,
          title,
          body,
          status: 'implemented'
        });
        importedChanges++;
      }
    }
  }

  // 3. Import user-stories.md
  if (existsSync(userStoriesPath)) {
    const storiesContent = await readFile(userStoriesPath, 'utf8');
    const lines = storiesContent.split('\n');
    let currentEpicId: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const epicHeader = line.match(/^##\s+([A-Z0-9_-]+):/);
      if (epicHeader) {
        currentEpicId = epicHeader[1].trim();
        continue;
      }

      const storyHeader = line.match(/^###\s+`?([A-Z0-9_-]+)`?:\s*(.+)$/);
      if (storyHeader) {
        const storyId = storyHeader[1].trim();
        const title = storyHeader[2].trim();
        let actor = '';
        let story = '';
        let context = '';
        let sla = '';
        let linkedTicket = '';
        const acceptanceCriteria: string[] = [];

        let k = i + 1;
        while (k < lines.length && !lines[k].trim().startsWith('###') && !lines[k].trim().startsWith('##')) {
          const l = lines[k].trim();
          const actorMatch = l.match(/-\s+\*\*Actor & Story\*\*:\s*As a\s+\*\*([^*]+)\*\*,\s*I want to\s+(.+)$/i);
          if (actorMatch) {
            actor = actorMatch[1].trim();
            story = actorMatch[2].trim();
          }
          const contextMatch = l.match(/-\s+\*\*Context\*\*:\s*(.+)$/i);
          if (contextMatch) context = contextMatch[1].trim();

          const slaMatch = l.match(/-\s+\*\*Performance SLA\*\*:\s*(.+)$/i);
          if (slaMatch) sla = slaMatch[1].trim();

          const ticketMatch = l.match(/-\s+\*\*Linked Ticket\*\*:\s*`?([A-Z0-9_-]+)`?/i);
          if (ticketMatch) linkedTicket = ticketMatch[1].trim();

          const acMatch = l.match(/-\s+\[.\]\s+(.+)$/);
          if (acMatch) acceptanceCriteria.push(acMatch[1].trim());

          k++;
        }

        const storyEntity = await store.upsertEntity<UserStory>(UserStory.dcr, {
          id: storyId,
          title,
          actor,
          story,
          context,
          sla,
          linkedTicket,
          epicId: currentEpicId ?? undefined,
          acceptanceCriteria
        });

        if (currentEpicId) {
          try {
            await store.relate(storyEntity, 'implements', currentEpicId);
          } catch {}
        }
        if (linkedTicket) {
          try {
            await store.relate(linkedTicket, 'implements', storyEntity);
          } catch {}
        }
      }
    }
  }

  // 4. Import decisions.md
  if (existsSync(decisionsPath)) {
    const decisionsContent = await readFile(decisionsPath, 'utf8');
    const blocks = decisionsContent.split(/\n##\s+/);

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const lines = block.split('\n');
      const headerMatch = lines[0].match(/^([A-Z0-9_-]+):\s*(.+)$/);
      if (headerMatch) {
        const id = headerMatch[1].trim();
        const title = headerMatch[2].trim();
        await store.upsertEntity<Decision>(Decision.dcr, {
          id,
          title,
          decision: block,
          status: 'accepted'
        });
        importedChanges++;
      }
    }
  }

  return { importedChanges };
}
