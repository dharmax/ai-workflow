import { WorkflowStore } from './store.ts';
import type { Entity, CodeNote } from './types.ts';

export function getBlastRadius(store: WorkflowStore, target: string) {
  const incomingDeps = store.getIncoming(target, 'depends_on');
  const directFiles = store.listEntities({ type: 'file' }).filter(f => f.id === target || f.id.includes(target));
  
  const affectedFileIds = new Set<string>();
  for (const f of directFiles) affectedFileIds.add(f.id);
  for (const d of incomingDeps) affectedFileIds.add(d.id);

  const affectedTickets: Entity[] = [];
  const testFiles: string[] = [];

  for (const fileId of affectedFileIds) {
    if (fileId.includes('test') || fileId.endsWith('.test.ts') || fileId.endsWith('.spec.ts')) {
      testFiles.push(fileId);
    }
    const tickets = store.getIncoming(fileId, 'modifies').concat(store.getOutgoing(fileId, 'modifies'))
      .filter(e => e.type === 'ticket' && e.lane !== 'Done');
    for (const t of tickets) affectedTickets.push(t);
  }

  return {
    target,
    affectedFilesCount: affectedFileIds.size,
    affectedFiles: Array.from(affectedFileIds),
    affectedTickets,
    recommendedTests: testFiles.length > 0 ? testFiles : ['bun test']
  };
}

export function generateDigest(store: WorkflowStore, hours: number = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const tickets = store.listEntities({ type: 'ticket' });
  const decisions = store.listEntities({ type: 'decision' });
  const notes = store.listCodeNotes();

  const completed = tickets.filter(t => t.lane === 'Done' && (t.updatedAt ?? '') >= since);
  const inProgress = tickets.filter(t => t.lane === 'In Progress');
  const blocked = tickets.filter(t => t.lane === 'Blocked');
  const newDecisions = decisions.filter(d => (d.createdAt ?? '') >= since);
  const bugs = notes.filter(n => n.noteType === 'BUG' || n.noteType === 'FIXME');

  return {
    timespanHours: hours,
    completedTickets: completed,
    inProgressTickets: inProgress,
    blockedTickets: blocked,
    recentDecisions: newDecisions,
    openBugsCount: bugs.length,
    highPriorityBugs: bugs.slice(0, 5)
  };
}

export function recommendNextTask(store: WorkflowStore): { ticket: Entity | null; reason: string } {
  const isAvailable = (t: Entity) => !store.isTicketClaimed(t.id);

  const inProgress = store.listEntities({ type: 'ticket', lane: 'In Progress' }).filter(isAvailable);
  if (inProgress.length > 0) {
    return { ticket: inProgress[0], reason: 'Active task currently in progress.' };
  }

  const todoBugs = store.listEntities({ type: 'ticket', lane: 'Todo' })
    .filter(t => isAvailable(t) && (t.id.startsWith('BUG') || t.title.toLowerCase().includes('bug') || t.title.toLowerCase().includes('fix')));
  if (todoBugs.length > 0) {
    return { ticket: todoBugs[0], reason: 'High-priority bug fix pending in Todo lane.' };
  }

  const todoTasks = store.listEntities({ type: 'ticket', lane: 'Todo' }).filter(isAvailable);
  if (todoTasks.length > 0) {
    return { ticket: todoTasks[0], reason: 'Next planned task in Todo lane.' };
  }

  return { ticket: null, reason: 'All planned tasks are complete or currently leased by other agents.' };
}

export function doctorCheck(store: WorkflowStore, options: { fix?: boolean } = {}) {
  const files = store.listEntities({ type: 'file' });
  const notes = store.listCodeNotes();
  const unlinkedNotes = notes.filter(n => !n.ticketId && (n.noteType === 'BUG' || n.noteType === 'FIXME'));
  
  const createdTickets: Entity[] = [];
  if (options.fix && unlinkedNotes.length > 0) {
    for (const n of unlinkedNotes.slice(0, 10)) {
      const id = `BUG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const ticket = store.upsertEntity({
        id,
        type: 'ticket',
        title: `Fix ${n.noteType} in ${n.filePath}:${n.line}`,
        lane: 'Todo',
        status: 'implemented',
        body: n.body
      });
      store.addRelation({ fromId: id, toId: n.filePath, relation: 'modifies' });
      createdTickets.push(ticket);
    }
  }

  return {
    totalFiles: files.length,
    unlinkedBugNotes: unlinkedNotes.length,
    autoFixedTickets: createdTickets
  };
}

export async function getFeatureBlastRadius(
  store: WorkflowStore,
  featureWish: string,
  asker?: any
): Promise<{
  featureWish: string;
  impactedModules: string[];
  impactedFiles: string[];
  conflictingDecisions: Entity[];
  affectedActiveTickets: Entity[];
  recommendedTests: string[];
  riskLevel: 'Low' | 'Medium' | 'High';
  architecturalSummary: string;
}> {
  const wishLower = featureWish.toLowerCase();
  const allModules = store.listEntities({ type: 'module' });
  const allFiles = store.listEntities({ type: 'file' });
  const allDecisions = store.listEntities({ type: 'decision' });
  const activeTickets = store.listEntities({ type: 'ticket' }).filter(t => t.lane !== 'Done');

  // Match impacted modules & files
  const impactedModules = new Set<string>();
  const impactedFiles = new Set<string>();
  const testFiles = new Set<string>(['bun test']);

  for (const m of allModules) {
    const modName = m.title.toLowerCase();
    const cleanMod = modName.replace(/^src\//, '');
    if (wishLower.includes(cleanMod) || wishLower.includes(modName)) {
      impactedModules.add(m.title);
    }
  }

  // File match heuristics
  for (const f of allFiles) {
    const base = f.title.toLowerCase();
    if (wishLower.includes(base) || wishLower.includes(f.id.toLowerCase())) {
      impactedFiles.add(f.id);
      const parentMod = f.id.split('/')[0];
      if (parentMod) impactedModules.add(parentMod);
    }
  }

  // If no direct matches, scan module files for keywords
  if (impactedFiles.size === 0) {
    for (const f of allFiles.slice(0, 15)) {
      if (wishLower.split(/\s+/).some(w => w.length > 3 && f.id.toLowerCase().includes(w))) {
        impactedFiles.add(f.id);
      }
    }
  }

  // Run blast radius on matched files
  const affectedTickets: Entity[] = [];
  for (const fileId of impactedFiles) {
    const radius = getBlastRadius(store, fileId);
    for (const af of radius.affectedFiles) impactedFiles.add(af);
    for (const at of radius.affectedTickets) affectedTickets.push(at);
    for (const rt of radius.recommendedTests) testFiles.add(rt);
  }

  // Conflicting or governing ADRs
  const conflictingDecisions: Entity[] = [];
  for (const d of allDecisions) {
    const dLower = (d.title + ' ' + (d.body || '')).toLowerCase();
    if (wishLower.split(/\s+/).some(w => w.length > 4 && dLower.includes(w))) {
      conflictingDecisions.push(d);
    }
  }

  const riskLevel: 'Low' | 'Medium' | 'High' = 
    impactedFiles.size > 8 || conflictingDecisions.length > 1 ? 'High' :
    impactedFiles.size > 3 || conflictingDecisions.length === 1 ? 'Medium' : 'Low';

  let architecturalSummary = `Impact analysis for "${featureWish}": ${impactedModules.size} modules and ${impactedFiles.size} files in causal scope. Risk Level: ${riskLevel}.`;

  if (asker && typeof asker.ask === 'function') {
    try {
      const prompt = `Analyze architectural risk and blast radius for this proposed feature wish:
Feature: "${featureWish}"
Impacted Subsystems: ${Array.from(impactedModules).join(', ') || 'General'}
Impacted Files: ${Array.from(impactedFiles).join(', ') || 'General'}
Related ADRs: ${conflictingDecisions.map(d => `${d.id}: ${d.title}`).join(', ') || 'None'}

Provide a 2-sentence executive architectural summary evaluating potential risks and recommended precautions.`;
      const res = await asker.ask(prompt, { timeoutMs: 3500, task: 'reasoning' });
      if (res.ok && res.text) {
        architecturalSummary = res.text.trim();
      }
    } catch {
      // Deterministic fallback
    }
  }

  return {
    featureWish,
    impactedModules: Array.from(impactedModules),
    impactedFiles: Array.from(impactedFiles),
    conflictingDecisions,
    affectedActiveTickets: affectedTickets,
    recommendedTests: Array.from(testFiles),
    riskLevel,
    architecturalSummary
  };
}
