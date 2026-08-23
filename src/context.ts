import { HeuristicContextManager, LeanContextCompressor, MemoryContextStore } from '@dharmax/context-manager';
import { WorkflowStore } from './store.ts';
import { MetricsCollector } from './metrics.ts';
import type { TicketContext } from './types.ts';

export async function packTicketContext(
  store: WorkflowStore, 
  ticketId: string, 
  options: { maxTokens?: number; format?: 'xml' | 'markdown' | 'json' } = {}
): Promise<{ rendered: string; context: TicketContext | null; tokenCount: number; rawTokens: number; compressionRatio: number }> {
  const startTime = performance.now();
  const context = store.getTicketContext(ticketId);
  if (!context) {
    return { rendered: '', context: null, tokenCount: 0, rawTokens: 0, compressionRatio: 0 };
  }

  const inMemoryStore = new MemoryContextStore();

  // 1. Pinned: Active Ticket & Verification Requirement
  await inMemoryStore.add({
    id: `ticket:${context.ticket.id}`,
    title: `Ticket ${context.ticket.id}: ${context.ticket.title}`,
    body: [
      `State: ${context.ticket.lane || 'Todo'}`,
      context.ticket.body ? `Summary: ${context.ticket.body}` : '',
      `Verification Command: ${context.verificationCommand}`
    ].filter(Boolean).join('\n'),
    category: 'ticket',
    tags: ['ticket', context.ticket.id.toLowerCase(), 'auth', 'payment', 'stripe', 'webhook', 'metrics'],
    priority: 'pinned'
  });

  // 2. Pinned: Parent Epic
  if (context.epic) {
    await inMemoryStore.add({
      id: `epic:${context.epic.id}`,
      title: `Parent Epic ${context.epic.id}: ${context.epic.title}`,
      body: context.epic.body || 'No epic body specified.',
      category: 'epic',
      tags: ['epic', context.epic.id.toLowerCase()],
      priority: 'pinned'
    });
  }

  // 3. Working: Linked Source Files & AST Symbols
  if (context.linkedSymbols.length > 0) {
    const symbolLines = context.linkedSymbols.map(s => `- ${s.kind} ${s.name} (${s.file}:${s.line})`);
    await inMemoryStore.add({
      id: `symbols:${context.ticket.id}`,
      title: 'Target Codebase Symbols',
      body: symbolLines.join('\n'),
      category: 'code',
      tags: ['symbols', 'code'],
      priority: 'working'
    });
  }

  // 4. Working: Past Failed Attempts & Lessons Learned
  if (context.pastLessons.length > 0) {
    const lessonLines = context.pastLessons.map((l, idx) => 
      `Attempt ${idx + 1} (${l.action}): ${l.status.toUpperCase()} -> Lessons: ${JSON.stringify(l.lessons)}`
    );
    await inMemoryStore.add({
      id: `lessons:${context.ticket.id}`,
      title: 'Past Failure Lessons (DO NOT REPEAT)',
      body: lessonLines.join('\n'),
      category: 'debugging',
      tags: ['lessons', 'debugging'],
      priority: 'working'
    });
  }

  // 5. Retrieved: Active Guidelines & Decisions
  for (const dec of context.decisions) {
    await inMemoryStore.add({
      id: `decision:${dec.id}`,
      title: `ADR ${dec.id}: ${dec.title}`,
      body: dec.body || '',
      category: 'decision',
      tags: ['decision', 'adr'],
      priority: 'retrieved'
    });
  }

  for (const g of context.guidelines) {
    await inMemoryStore.add({
      id: `guideline:${g.id}`,
      title: `Guideline: ${g.title}`,
      body: g.body || '',
      category: 'guideline',
      tags: ['guideline'],
      priority: 'retrieved'
    });
  }

  const allBlocks = await inMemoryStore.list();
  const rawTokens = Math.round(allBlocks.reduce((acc, b) => acc + (b.title.length + b.body.length) / 4, 0));

  const hcm = new HeuristicContextManager({
    store: inMemoryStore,
    defaultMaxTokens: options.maxTokens ?? 1200
  });

  const query = `${context.ticket.title} ${context.ticket.body || ''}`.trim();
  const resolution = await hcm.resolve({
    query,
    categories: ['ticket', 'epic', 'code', 'debugging', 'decision', 'guideline']
  });

  const format = options.format ?? 'xml';
  let rendered = '';

  if (format === 'xml') {
    rendered = `<context>\n` + resolution.items.map(item => 
      `  <item id="${item.id}" title="${item.title}">\n    ${item.content.replace(/\n/g, '\n    ')}\n  </item>`
    ).join('\n') + `\n</context>`;
  } else if (format === 'markdown') {
    rendered = resolution.items.map(item => `### ${item.title}\n${item.content}`).join('\n\n');
  } else {
    rendered = JSON.stringify(resolution.items, null, 2);
  }

  const packedTokens = Math.round(rendered.length / 4);
  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

  const collector = new MetricsCollector(store);
  const metric = collector.recordContextPacking({
    ticketId,
    rawTokens,
    packedTokens,
    durationMs
  });

  return {
    rendered,
    context,
    tokenCount: packedTokens,
    rawTokens,
    compressionRatio: metric.compressionRatio
  };
}
