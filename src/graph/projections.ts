import { CompletenessSchema, type CompletenessLevel } from '../artifact-policy.ts';
/**
 * Responsibility: Bi-directional markdown projections of AST+ Graph entities.
 * Scope: Synchronizing kanban.md (Obsidian), epics.md, features.md, user-stories.md, decisions.md, and modules.md.
 */

import path from 'node:path';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { WorkflowStore } from './store.ts';
import {
  Ticket,
  Epic,
  Feature,
  UserStory,
  Decision,
  ModuleNode,
  TestNode
} from './ontology.ts';
import type { TicketLane, EpicStatus, IntentStatus } from './types.ts';
import { getCoverage } from '../product/coverage.ts';
import { exportAspectProjection, importAspectProjection } from './aspect-projections.ts';
import { ticketState } from './ticket-state.ts';

const LANES: TicketLane[] = ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'];

export async function exportProjections(store: WorkflowStore, rootDir: string = store.root): Promise<{ exportedFiles: string[] }> {
  const exportedFiles: string[] = [];
  const tickets = await store.listEntities<Ticket>(Ticket.dcr);
  const epics = await store.listEntities<Epic>(Epic.dcr);
  const features = await store.listEntities<Feature>(Feature.dcr);
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

  // 2. epics.md (owns Epic --targets--> Feature/UserStory)
  let epicsMd = `# Epics & Product Roadmap\n\n`;
  if (epics.length === 0) {
    epicsMd += `*No epics recorded yet.*\n`;
  } else {
    for (const epic of epics) {
      const epicLocalId = store.localId(epic.id);
      epicsMd += `## ${epicLocalId}: ${(epic as any).title || epicLocalId}\n\n`;
      epicsMd += `- **Status**: \`${(epic as any).status || 'draft'}\`\n`;
      if (epic.completenessTarget) epicsMd += `- **Completeness Target**: \`${epic.completenessTarget}\`\n`;
      epicsMd += `- **Priority**: ${(epic as any).priority ?? 1}\n\n`;

      if ((epic as any).body) {
        epicsMd += `${(epic as any).body}\n\n`;
      }

      const [targetPreds, containedTicketPreds] = await Promise.all([
        store.getOutgoing(epic.id, 'targets'),
        store.getOutgoing(epic.id, 'contains')
      ]);

      const targetedFeatures: Feature[] = [];
      const targetedStories: UserStory[] = [];
      for (const pred of targetPreds) {
        const target = await store.getEntity(pred.targetId);
        if (target instanceof Feature) targetedFeatures.push(target);
        else if (target instanceof UserStory) targetedStories.push(target);
      }

      if (targetedFeatures.length > 0) {
        epicsMd += `### Targeted Features\n`;
        for (const feat of targetedFeatures) {
          const fId = store.localId(feat.id);
          epicsMd += `- **${fId}**: ${(feat as any).title || fId}\n`;
        }
        epicsMd += `\n`;
      }

      if (targetedStories.length > 0) {
        epicsMd += `### Targeted Stories\n`;
        for (const story of targetedStories) {
          const sId = store.localId(story.id);
          epicsMd += `- **${sId}**: ${(story as any).title || sId}\n`;
        }
        epicsMd += `\n`;
      }

      const linkedTickets = tickets.filter(t => containedTicketPreds.some(p => p.targetId === t.id));
      if (linkedTickets.length > 0) {
        epicsMd += `### Contained Tickets\n`;
        for (const t of linkedTickets) {
          const tLocalId = store.localId(t.id);
          epicsMd += `- **${tLocalId}** [${(t as any).lane || 'Backlog'}]: ${(t as any).title || tLocalId}\n`;
        }
        epicsMd += `\n`;
      }

      // Read-only coverage display
      try {
        const cov = await getCoverage(store, epic.id);
        epicsMd += `### Coverage\n`;
        epicsMd += `- **Complete**: ${cov.complete ? 'Yes' : 'No'}\n`;
        if (cov.gaps.length > 0) {
          epicsMd += `- **Gaps**:\n`;
          for (const g of cov.gaps) {
            epicsMd += `  - [ ] ${g.kind}: ${g.message}\n`;
          }
        }
        epicsMd += `\n`;
      } catch {}
    }
  }
  await writeFile(path.join(rootDir, 'epics.md'), epicsMd, 'utf8');
  exportedFiles.push('epics.md');

  // 3. features.md (owns Feature --contains--> UserStory)
  let featuresMd = `# Features & Functional Capabilities\n\n`;
  if (features.length === 0) {
    featuresMd += `*No features recorded yet.*\n`;
  } else {
    for (const feature of features) {
      const featLocalId = store.localId(feature.id);
      const [epicPreds, storyPreds, ticketPreds, testPreds] = await Promise.all([
        store.getIncoming(feature.id, 'targets'),
        store.getOutgoing(feature.id, 'contains'),
        store.getIncoming(feature.id, 'implements'),
        store.getIncoming(feature.id, 'verifies')
      ]);

      const epicIds = epicPreds.map(p => store.localId(p.sourceId));
      const containedStories = userStories.filter(s => storyPreds.some(p => p.targetId === s.id));
      const criteria = Array.isArray((feature as any).acceptanceCriteria) ? (feature as any).acceptanceCriteria : [];

      featuresMd += `## ${featLocalId}: ${(feature as any).title || featLocalId}\n\n`;
      featuresMd += `- **Status**: \`${(feature as any).status || 'draft'}\`\n`;
      if (feature.completenessTarget) featuresMd += `- **Completeness Target**: \`${feature.completenessTarget}\`\n`;
      if (epicIds.length > 0) {
        featuresMd += `- **Epics**: ${epicIds.map(id => `\`${id}\``).join(', ')}\n`;
      }
      featuresMd += `\n`;

      if ((feature as any).body) {
        featuresMd += `${(feature as any).body}\n\n`;
      }

      if (criteria.length > 0) {
        featuresMd += `### Acceptance Criteria\n`;
        for (const criterion of criteria) {
          featuresMd += `- [ ] ${criterion}\n`;
        }
        featuresMd += `\n`;
      }

      if (containedStories.length > 0) {
        featuresMd += `### User Stories\n`;
        for (const story of containedStories) {
          const sId = store.localId(story.id);
          featuresMd += `- **${sId}**: ${(story as any).title || sId}\n`;
        }
        featuresMd += `\n`;
      }

      const implementingTickets = tickets.filter(t => ticketPreds.some(p => p.sourceId === t.id));
      if (implementingTickets.length > 0) {
        featuresMd += `### Implementing Tickets\n`;
        for (const t of implementingTickets) {
          const tId = store.localId(t.id);
          featuresMd += `- **${tId}** [${(t as any).lane || 'Backlog'}]: ${(t as any).title || tId}\n`;
        }
        featuresMd += `\n`;
      }

      const verifyingTests = testPreds.map(p => store.localId(p.sourceId));
      if (verifyingTests.length > 0) {
        featuresMd += `### Verifying Tests\n`;
        for (const tId of verifyingTests) {
          featuresMd += `- **${tId}**\n`;
        }
        featuresMd += `\n`;
      }

      try {
        const cov = await getCoverage(store, feature.id);
        featuresMd += `### Coverage\n`;
        featuresMd += `- **Complete**: ${cov.complete ? 'Yes' : 'No'}\n`;
        if (cov.gaps.length > 0) {
          featuresMd += `- **Gaps**:\n`;
          for (const g of cov.gaps) {
            featuresMd += `  - [ ] ${g.kind}: ${g.message}\n`;
          }
        }
        featuresMd += `\n`;
      } catch {}
    }
  }
  await writeFile(path.join(rootDir, 'features.md'), featuresMd, 'utf8');
  exportedFiles.push('features.md');

  // 4. user-stories.md (owns Story intrinsic text/status/criteria/SLA only)
  let storiesMd = `# User Stories & Behavioral Specifications\n\n`;
  if (userStories.length === 0) {
    storiesMd += `*No user stories recorded yet.*\n`;
  } else {
    for (const story of userStories) {
      const storyLocalId = store.localId(story.id);
      const [featurePreds, epicPreds, ticketPreds, testPreds] = await Promise.all([
        store.getIncoming(story.id, 'contains'),
        store.getIncoming(story.id, 'targets'),
        store.getIncoming(story.id, 'addresses'),
        store.getIncoming(story.id, 'verifies')
      ]);

      const featureIds = featurePreds.map(p => store.localId(p.sourceId));
      const epicIds = epicPreds.map(p => store.localId(p.sourceId));
      const ticketIds = ticketPreds.map(p => store.localId(p.sourceId));
      const testIds = testPreds.map(p => store.localId(p.sourceId));
      const criteria = Array.isArray((story as any).acceptanceCriteria) ? (story as any).acceptanceCriteria : [];

      storiesMd += `## ${storyLocalId}: ${(story as any).title || storyLocalId}\n`;
      storiesMd += `- **Status**: \`${(story as any).status || 'draft'}\`\n`;
      if (story.completenessTarget) storiesMd += `- **Completeness Target**: \`${story.completenessTarget}\`\n`;
      if (featureIds.length > 0) storiesMd += `- **Feature**: ${featureIds.map(id => `\`${id}\``).join(', ')}\n`;
      if (epicIds.length > 0) storiesMd += `- **Epics**: ${epicIds.map(id => `\`${id}\``).join(', ')}\n`;
      storiesMd += `- **Actor**: ${(story as any).actor || 'User'}\n`;
      storiesMd += `- **Story**: ${(story as any).story || ''}\n`;
      if ((story as any).context) storiesMd += `- **Context**: ${(story as any).context}\n`;
      if ((story as any).sla) storiesMd += `- **Performance SLA**: ${(story as any).sla}\n`;
      if (ticketIds.length > 0) storiesMd += `- **Tickets**: ${ticketIds.map(id => `\`${id}\``).join(', ')}\n`;
      if (testIds.length > 0) storiesMd += `- **Tests**: ${testIds.map(id => `\`${id}\``).join(', ')}\n`;
      if (criteria.length > 0) {
        storiesMd += `- **Acceptance Criteria**:\n`;
        for (const criterion of criteria) storiesMd += `  - [ ] ${criterion}\n`;
      }

      try {
        const cov = await getCoverage(store, story.id);
        storiesMd += `- **Coverage**: ${cov.complete ? 'Complete' : cov.gaps.map(g => g.kind).join(', ')}\n`;
      } catch {}

      storiesMd += `\n`;
    }
  }
  await writeFile(path.join(rootDir, 'user-stories.md'), storiesMd, 'utf8');
  exportedFiles.push('user-stories.md');

  // 5. decisions.md (ADRs)
  let decisionsMd = `# Architectural Decision Records (ADRs)\n\n`;
  if (decisions.length === 0) {
    decisionsMd += `*No architectural decisions recorded yet. Propose decisions via \`aiwf exec "propose decision ..."\` or \`propose_decision\` tool.*\n`;
  } else {
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
  }
  await writeFile(path.join(rootDir, 'decisions.md'), decisionsMd, 'utf8');
  exportedFiles.push('decisions.md');

  // 6. modules.md
  let modulesMd = `# Architecture & Modules\n\n`;
  modulesMd += `## Module Health\n\n`;
  modulesMd += `| Module | Completeness Target | Symbols | Bugs 🔴 | Active Tickets |\n`;
  modulesMd += `| :--- | :---: | :---: | :---: | :--- |\n`;
  for (const m of health.modules) {
    modulesMd += `| \`${m.name}\` | ${m.completenessTarget || 'project default'} | ${m.symbolCount} | ${m.bugsCount} | ${m.activeTickets.join(', ') || 'None'} |\n`;
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
  await exportAspectProjection(store, rootDir);
  exportedFiles.push('aspects.md');

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
  const featuresPath = path.join(rootDir, 'features.md');
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
          const cardMatch = line.match(/^-\s+\[(.)\]\s+\*\*\[?([A-Z0-9_-]+)\]?\*\*:\s*(.+)$/);
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
              body: summary,
              claim,
              ...ticketState(resolvedLane, resolvedLane === 'Done' && (existingTicket as Ticket | null)?.status === 'rejected' ? 'rejected' : undefined)
            });
            importedChanges++;
          }
        }
      }
    }
  }

  // 2. Import epics.md (owns Epic --targets--> Feature/UserStory)
  if (existsSync(epicsPath)) {
    const fileStat = await stat(epicsPath);
    if (fileStat.mtimeMs > lastExportedAt + 50) {
      const epicsContent = await readFile(epicsPath, 'utf8');
      const epicBlocks = epicsContent.split(/\n##\s+/);

      for (let i = 1; i < epicBlocks.length; i++) {
        const block = epicBlocks[i];
        const lines = block.split('\n');
        const headerMatch = lines[0].match(/^([A-Z0-9_-]+):\s*(.+)$/);
        if (!headerMatch) continue;

        const id = headerMatch[1].trim();
        const title = headerMatch[2].trim();
        let completenessTarget: CompletenessLevel | null = null;
        let status: EpicStatus = 'draft';
        let priority = 1;

        const targetedFeatures: string[] = [];
        const targetedStories: string[] = [];
        const bodyLines: string[] = [];

        let currentSection: 'body' | 'features' | 'stories' | 'tickets' | 'coverage' = 'body';

        for (const rawLine of lines.slice(1)) {
          const line = rawLine.trim();

          const completenessMatch = line.match(/^-\s+\*\*Completeness Target\*\*:\s*`?([a-z]+)`?/i);
          if (completenessMatch) { completenessTarget = CompletenessSchema.parse(completenessMatch[1]); continue; }

          const statusMatch = line.match(/^-\s+\*\*Status\*\*:\s*`?([a-z_-]+)`?/i);
          if (statusMatch) {
            status = statusMatch[1] as EpicStatus;
            continue;
          }

          const prioMatch = line.match(/^-\s+\*\*Priority\*\*:\s*(\d+)/i);
          if (prioMatch) {
            priority = parseInt(prioMatch[1], 10);
            continue;
          }

          if (line.startsWith('### Targeted Features')) {
            currentSection = 'features';
            continue;
          } else if (line.startsWith('### Targeted Stories')) {
            currentSection = 'stories';
            continue;
          } else if (line.startsWith('### Contained Tickets') || line.startsWith('### Linked Tickets')) {
            currentSection = 'tickets';
            continue;
          } else if (line.startsWith('### Coverage')) {
            currentSection = 'coverage';
            continue;
          } else if (line.startsWith('### ')) {
            currentSection = 'body';
          }

          if (currentSection === 'features') {
            const featMatch = line.match(/^-\s+\*\*([A-Z0-9_-]+)\*\*/);
            if (featMatch) targetedFeatures.push(featMatch[1]);
          } else if (currentSection === 'stories') {
            const storyMatch = line.match(/^-\s+\*\*([A-Z0-9_-]+)\*\*/);
            if (storyMatch) targetedStories.push(storyMatch[1]);
          } else if (currentSection === 'body') {
            bodyLines.push(rawLine);
          }
        }

        const body = bodyLines.join('\n').trim();

        const epicEntity = await store.upsertEntity<Epic>(Epic.dcr, {
          id,
          title,
          body,
          priority,
          completenessTarget,
          status
        });

        // Reconcile owned relation: Epic --targets--> Feature/UserStory
        const wantedTargetIds = new Set<string>([...targetedFeatures, ...targetedStories]);
        const existingTargets = await store.getOutgoing(epicEntity.id, 'targets');

        for (const link of existingTargets) {
          const localTarget = store.localId(link.targetId);
          if (!wantedTargetIds.has(localTarget)) {
            await store.unrelate(epicEntity.id, 'targets', link.targetId);
          }
        }

        for (const targetLocalId of wantedTargetIds) {
          const alreadyLinked = existingTargets.some(p => store.localId(p.targetId) === targetLocalId);
          if (!alreadyLinked) {
            const targetEntity = await store.getEntity(targetLocalId);
            if (targetEntity && (targetEntity instanceof Feature || targetEntity instanceof UserStory)) {
              await store.relate(epicEntity, 'targets', targetEntity);
            }
          }
        }

        importedChanges++;
      }
    }
  }

  // 3. Import features.md (owns Feature --contains--> UserStory)
  if (existsSync(featuresPath)) {
    const fileStat = await stat(featuresPath);
    if (fileStat.mtimeMs > lastExportedAt + 50) {
      const featuresContent = await readFile(featuresPath, 'utf8');
      const featureBlocks = featuresContent.split(/\n##\s+/);

      for (let i = 1; i < featureBlocks.length; i++) {
        const block = featureBlocks[i];
        const lines = block.split('\n');
        const headerMatch = lines[0].match(/^([A-Z0-9_-]+):\s*(.+)$/);
        if (!headerMatch) continue;

        const id = headerMatch[1].trim();
        const title = headerMatch[2].trim();
        let completenessTarget: CompletenessLevel | null = null;
        let status: IntentStatus = 'draft';
        const acceptanceCriteria: string[] = [];
        const containedStories: string[] = [];
        const bodyLines: string[] = [];

        let currentSection: 'body' | 'criteria' | 'stories' | 'tickets' | 'tests' | 'coverage' = 'body';

        for (const rawLine of lines.slice(1)) {
          const line = rawLine.trim();

          const completenessMatch = line.match(/^-\s+\*\*Completeness Target\*\*:\s*`?([a-z]+)`?/i);
          if (completenessMatch) { completenessTarget = CompletenessSchema.parse(completenessMatch[1]); continue; }

          const statusMatch = line.match(/^-\s+\*\*Status\*\*:\s*`?([a-z_-]+)`?/i);
          if (statusMatch) {
            status = statusMatch[1] as IntentStatus;
            continue;
          }

          if (line.startsWith('### Acceptance Criteria')) {
            currentSection = 'criteria';
            continue;
          } else if (line.startsWith('### User Stories')) {
            currentSection = 'stories';
            continue;
          } else if (line.startsWith('### Implementing Tickets')) {
            currentSection = 'tickets';
            continue;
          } else if (line.startsWith('### Verifying Tests')) {
            currentSection = 'tests';
            continue;
          } else if (line.startsWith('### Coverage')) {
            currentSection = 'coverage';
            continue;
          } else if (line.startsWith('### ')) {
            currentSection = 'body';
          }

          if (currentSection === 'criteria') {
            const critMatch = line.match(/^-\s+\[.\]\s+(.+)$/);
            if (critMatch) acceptanceCriteria.push(critMatch[1].trim());
          } else if (currentSection === 'stories') {
            const storyMatch = line.match(/^-\s+\*\*([A-Z0-9_-]+)\*\*/);
            if (storyMatch) containedStories.push(storyMatch[1]);
          } else if (currentSection === 'body') {
            if (!line.startsWith('- **Epics**:')) {
              bodyLines.push(rawLine);
            }
          }
        }

        const body = bodyLines.join('\n').trim();

        const featEntity = await store.upsertEntity<Feature>(Feature.dcr, {
          id,
          title,
          body,
          acceptanceCriteria,
          completenessTarget,
          status
        });

        // Reconcile owned relation: Feature --contains--> UserStory
        const wantedStories = new Set<string>(containedStories);
        const existingContains = await store.getOutgoing(featEntity.id, 'contains');

        for (const link of existingContains) {
          const localStory = store.localId(link.targetId);
          if (!wantedStories.has(localStory)) {
            await store.unrelate(featEntity.id, 'contains', link.targetId);
          }
        }

        for (const storyLocalId of wantedStories) {
          const alreadyLinked = existingContains.some(p => store.localId(p.targetId) === storyLocalId);
          if (!alreadyLinked) {
            const storyEntity = await store.getEntity<UserStory>(storyLocalId, UserStory.dcr);
            if (storyEntity) {
              await store.relate(featEntity, 'contains', storyEntity);
            }
          }
        }

        importedChanges++;
      }
    }
  }

  // 4. Import user-stories.md (owns Story intrinsic text/status/criteria/SLA only)
  if (existsSync(userStoriesPath)) {
    const fileStat = await stat(userStoriesPath);
    if (fileStat.mtimeMs > lastExportedAt + 50) {
      const storiesContent = await readFile(userStoriesPath, 'utf8');
      const blocks = storiesContent.split(/\n##\s+/);

      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const lines = block.split('\n');
        const headerMatch = lines[0].match(/^([A-Z0-9_-]+):\s*(.+)$/);
        if (!headerMatch) continue;

        const storyId = headerMatch[1].trim();
        const title = headerMatch[2].trim();
        let completenessTarget: CompletenessLevel | null = null;
        let status: IntentStatus = 'draft';
        let actor = '';
        let storyText = '';
        let context = '';
        let sla = '';
        const acceptanceCriteria: string[] = [];

        for (const rawLine of lines.slice(1)) {
          const line = rawLine.trim();

          const completenessMatch = line.match(/^-\s+\*\*Completeness Target\*\*:\s*`?([a-z]+)`?/i);
          if (completenessMatch) { completenessTarget = CompletenessSchema.parse(completenessMatch[1]); continue; }

          const statusMatch = line.match(/^-\s+\*\*Status\*\*:\s*`?([a-z_-]+)`?/i);
          if (statusMatch) status = statusMatch[1] as IntentStatus;

          const actorMatch = line.match(/^-\s+\*\*Actor\*\*:\s*(.*)$/i);
          if (actorMatch) actor = actorMatch[1].trim();

          const storyMatch = line.match(/^-\s+\*\*Story\*\*:\s*(.*)$/i);
          if (storyMatch) storyText = storyMatch[1].trim();

          const contextMatch = line.match(/^-\s+\*\*Context\*\*:\s*(.*)$/i);
          if (contextMatch) context = contextMatch[1].trim();

          const slaMatch = line.match(/^-\s+\*\*Performance SLA\*\*:\s*(.*)$/i);
          if (slaMatch) sla = slaMatch[1].trim();

          const criterion = line.match(/^-\s+\[.\]\s+(.+)$/);
          if (criterion) acceptanceCriteria.push(criterion[1].trim());
        }

        // Update intrinsic fields ONLY. Does NOT mutate graph relations.
        await store.upsertEntity<UserStory>(UserStory.dcr, {
          id: storyId,
          title,
          actor,
          story: storyText,
          context,
          sla,
          acceptanceCriteria,
          completenessTarget,
          status
        });

        importedChanges++;
      }
    }
  }

  // 5. Import decisions.md
  if (existsSync(decisionsPath)) {
    const fileStat = await stat(decisionsPath);
    if (fileStat.mtimeMs > lastExportedAt + 50) {
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
  }

  importedChanges += await importAspectProjection(store, rootDir, lastExportedAt);
  return { importedChanges };
}
