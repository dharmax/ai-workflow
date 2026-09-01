import {
  createContextManager,
  MemoryContextStore,
  type ContextBlock,
  type ContextFormat
} from '@dharmax/context-manager';
import { WorkflowStore } from './store.ts';
import { MetricsCollector } from './metrics.ts';
import type { TicketContext } from './types.ts';

export async function packTicketContext(
  store: WorkflowStore, 
  ticketId: string, 
  options: { maxTokens?: number; format?: 'xml' | 'markdown' | 'json' | 'plain' } = {}
): Promise<{ rendered: string; context: TicketContext | null; tokenCount: number; rawTokens: number; compressionRatio: number }> {
  const startTime = performance.now();
  const context = store.getTicketContext(ticketId);
  if (!context) {
    return { rendered: '', context: null, tokenCount: 0, rawTokens: 0, compressionRatio: 0 };
  }

  const inMemoryStore = new MemoryContextStore();
  const blocks: ContextBlock[] = [];

  // 1. Pinned: Active Ticket & Verification Requirement
  blocks.push({
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
    blocks.push({
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
    blocks.push({
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
    blocks.push({
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
    blocks.push({
      id: `decision:${dec.id}`,
      title: `ADR ${dec.id}: ${dec.title}`,
      body: dec.body || '',
      category: 'decision',
      tags: ['decision', 'adr'],
      priority: 'retrieved'
    });
  }

  for (const g of context.guidelines) {
    blocks.push({
      id: `guideline:${g.id}`,
      title: `Guideline: ${g.title}`,
      body: g.body || '',
      category: 'guideline',
      tags: ['guideline'],
      priority: 'retrieved'
    });
  }

  await inMemoryStore.add(blocks);

  const allBlocks = await inMemoryStore.list();
  const rawTokens = Math.round(allBlocks.reduce((acc, b) => acc + (b.title.length + b.body.length) / 4, 0));

  const format: ContextFormat = (options.format as ContextFormat) || 'markdown';
  const contextManager = createContextManager({
    store: inMemoryStore,
    defaultMaxTokens: options.maxTokens ?? 1200,
    format
  });

  const query = `${context.ticket.title} ${context.ticket.body || ''}`.trim();
  const resolution = await contextManager.resolve({
    query,
    categories: ['ticket', 'epic', 'code', 'debugging', 'decision', 'guideline'],
    maxTokens: options.maxTokens ?? 1200,
    output: { format }
  });

  let rendered = resolution.rendered;
  if (!rendered) {
    if (format === 'xml') {
      rendered = `<context>\n` + resolution.items.map(item => 
        `  <item id="${item.id}" title="${item.title}">\n    ${item.content.replace(/\n/g, '\n    ')}\n  </item>`
      ).join('\n') + `\n</context>`;
    } else if (format === 'markdown') {
      rendered = resolution.items.map(item => `### ${item.title}\n${item.content}`).join('\n\n');
    } else {
      rendered = JSON.stringify(resolution.items, null, 2);
    }
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
