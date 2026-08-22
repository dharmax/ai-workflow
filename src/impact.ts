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
  const inProgress = store.listEntities({ type: 'ticket', lane: 'In Progress' });
  if (inProgress.length > 0) {
    return { ticket: inProgress[0], reason: 'Active task currently in progress.' };
  }

  const todoBugs = store.listEntities({ type: 'ticket', lane: 'Todo' })
    .filter(t => t.id.startsWith('BUG') || t.title.toLowerCase().includes('bug') || t.title.toLowerCase().includes('fix'));
  if (todoBugs.length > 0) {
    return { ticket: todoBugs[0], reason: 'High-priority bug fix pending in Todo lane.' };
  }

  const todoTasks = store.listEntities({ type: 'ticket', lane: 'Todo' });
  if (todoTasks.length > 0) {
    return { ticket: todoTasks[0], reason: 'Next planned task in Todo lane.' };
  }

  return { ticket: null, reason: 'All planned tasks are complete. Backlog is clear.' };
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
