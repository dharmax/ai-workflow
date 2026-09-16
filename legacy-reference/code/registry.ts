import { z } from 'zod';
import type { WorkflowStore } from './store.ts';
import type { DecisionManager } from './decisions.ts';
import type { CodeletEngine } from './compiler.ts';
import type { LocalGitTransport } from './transport.ts';
import type { MetricsCollector } from './metrics.ts';
import { indexCodebase } from './indexer.ts';
import { exportMarkdown, importMarkdown } from './sync.ts';
import { getBlastRadius, getFeatureBlastRadius, generateDigest, recommendNextTask, doctorCheck } from './impact.ts';
import { auditCodebase } from './guidelines.ts';
import { packTicketContext } from './context.ts';
import {
  findProjectRoot,
  getEnvironmentInfo,
  getGitStatus,
  getGitHotspots,
  getGitDiff,
  getFileOutline,
  resolveTestTarget,
  appendScratchpadNote,
  readScratchpad,
  lintWorkflowGraph,
  triageTestFailures,
  recordTicketLesson,
  getSymbolSource,
  estimateTokenBudget,
  createSnapshotCheckpoint,
  generatePrSummary,
  getEpicProgress
} from './helpers.ts';

export interface CommandContext {
  store: WorkflowStore;
  decisions: DecisionManager;
  compiler: CodeletEngine;
  transport: LocalGitTransport;
  metrics: MetricsCollector;
  projectRoot: string;
}

export type CapabilityCategory = 
  | 'ticket' 
  | 'codelet' 
  | 'graph' 
  | 'impact' 
  | 'audit' 
  | 'decision' 
  | 'metrics' 
  | 'system';

export interface Capability<TArgs = any, TResult = any> {
  id: string;
  name: string;
  cliCommand: string;
  aliases: string[];
  category: CapabilityCategory;
  description: string;
  schema: z.ZodType<TArgs>;
  parseCliArgs?: (args: string[], flags: Record<string, any>) => TArgs;
  handler: (ctx: CommandContext, args: TArgs) => Promise<TResult>;
  renderTui?: (result: TResult) => string;
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();
  private aliasMap: Map<string, string> = new Map();

  register<TArgs, TResult>(cap: Capability<TArgs, TResult>) {
    this.capabilities.set(cap.name, cap);
    this.capabilities.set(cap.id, cap);
    this.aliasMap.set(cap.name.toLowerCase(), cap.name);
    this.aliasMap.set(cap.id.toLowerCase(), cap.name);

    for (const alias of cap.aliases) {
      this.aliasMap.set(alias.toLowerCase(), cap.name);
    }
  }

  get(nameOrAlias: string): Capability | undefined {
    const canonical = this.aliasMap.get(nameOrAlias.toLowerCase()) || nameOrAlias;
    return this.capabilities.get(canonical);
  }

  getAll(): Capability[] {
    const seen = new Set<string>();
    const list: Capability[] = [];
    for (const cap of this.capabilities.values()) {
      if (!seen.has(cap.name)) {
        seen.add(cap.name);
        list.push(cap);
      }
    }
    return list;
  }

  getByCategory(category: CapabilityCategory): Capability[] {
    return this.getAll().filter(c => c.category === category);
  }

  findForCli(commandParts: string[]): { capability?: Capability; args: string[] } {
    if (commandParts.length === 0) return { args: [] };

    // 1. Try 2-word verb (e.g. "codelet list", "ticket inspect", "decision propose")
    if (commandParts.length >= 2) {
      const twoWord = `${commandParts[0]}:${commandParts[1]}`;
      const twoWordSpace = `${commandParts[0]} ${commandParts[1]}`;
      const match = this.get(twoWord) || this.get(twoWordSpace);
      if (match) {
        return { capability: match, args: commandParts.slice(2) };
      }
    }

    // 2. Try single-word verb (e.g. "status", "sync", "next", "doctor", "audit", "metrics")
    const oneWord = commandParts[0];
    const matchOne = this.get(oneWord);
    if (matchOne) {
      return { capability: matchOne, args: commandParts.slice(1) };
    }

    // 3. Try matching default subcommands for namespaces (e.g. "ticket" -> "ticket:list", "codelet" -> "codelet:list", "decision" -> "decision:list")
    const defaultSubcommands: Record<string, string> = {
      'ticket': 'list_tickets',
      'tickets': 'list_tickets',
      'codelet': 'list_codelets',
      'codelets': 'list_codelets',
      'decision': 'list_decisions',
      'decisions': 'list_decisions'
    };
    if (defaultSubcommands[oneWord.toLowerCase()]) {
      const defCap = this.get(defaultSubcommands[oneWord.toLowerCase()]);
      if (defCap) {
        return { capability: defCap, args: commandParts.slice(1) };
      }
    }

    return { args: commandParts };
  }
}

export const registry = new CapabilityRegistry();

// ==========================================
// 1. GRAPH & PROJECT CAPABILITIES
// ==========================================

registry.register({
  id: 'project_overview',
  name: 'get_project_overview',
  cliCommand: 'status',
  aliases: ['status', 'view', 'project:summary', 'overview', 'health'],
  category: 'graph',
  description: 'Fetch complete module health, completion levels, bug indicators, and Kanban lanes',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return ctx.store.getProjectHealth();
  },
  renderTui: (res, ctx) => {
    // If ctx is available in render context, or we can format cleanly
    const { renderTuiDashboard } = require('./ui.ts');
    if (ctx && ctx.store) {
      return renderTuiDashboard(ctx.store);
    }
    let out = `\x1b[1;36m=================================================================\x1b[0m\n`;
    out += `\x1b[1;37m   AI-WORKFLOW CAUSAL OS & PROJECT VISIBILITY DASHBOARD\x1b[0m\n`;
    out += `\x1b[1;36m=================================================================\x1b[0m\n\n`;
    out += `Total Tickets: \x1b[1m${res.totalTickets}\x1b[0m | Backlog: ${res.laneCounts.Backlog || 0} | Todo: ${res.laneCounts.Todo || 0} | In Progress: ${res.laneCounts['In Progress'] || 0} | Done: ${res.laneCounts.Done || 0} | Blocked: ${res.laneCounts.Blocked || 0}\n`;
    out += `Open Bugs: \x1b[1;31m${res.openBugsCount} 🔴\x1b[0m | Accepted ADRs: \x1b[1;32m${res.acceptedDecisionsCount} 📜\x1b[0m\n\n`;
    out += `\x1b[1mModules (${res.modules.length}):\x1b[0m\n`;
    for (const m of res.modules) {
      const color = m.completionPercent >= 80 ? '\x1b[32m' : m.completionPercent >= 50 ? '\x1b[33m' : '\x1b[31m';
      out += `  - \x1b[1m${m.name.padEnd(20)}\x1b[0m ${color}${m.completionPercent}%\x1b[0m (${m.implementedSymbols}/${m.symbolCount} symbols) | Bugs: ${m.bugsCount} | Todo: ${m.todoCount}\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'project_sync',
  name: 'sync_project',
  cliCommand: 'sync',
  aliases: ['sync', 'reconcile', 'project:sync'],
  category: 'graph',
  description: 'Index codebase AST symbols & notes, and reconcile Markdown projections (kanban.md, epics.md, decisions.md, modules.md)',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    const idx = await indexCodebase(ctx.store);
    await importMarkdown(ctx.store);
    await exportMarkdown(ctx.store);
    return {
      indexedFiles: idx.filesCount,
      indexedSymbols: idx.symbolsCount,
      indexedNotes: idx.notesCount,
      projectionsUpdated: ['kanban.md', 'epics.md', 'decisions.md', 'modules.md']
    };
  },
  renderTui: (res) => {
    return `\x1b[32mSync complete! Indexed ${res.indexedFiles} files, ${res.indexedSymbols} AST symbols, ${res.indexedNotes} notes. Updated: ${res.projectionsUpdated.join(', ')} ✅\x1b[0m`;
  }
});

registry.register({
  id: 'project_ui_state',
  name: 'get_ui_state',
  cliCommand: 'ui-state',
  aliases: ['ui-state', 'ui:state', 'cockpit:state'],
  category: 'graph',
  description: 'Fetch unified cockpit state (health, lanes, claims, ADRs, module matrix)',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    const health = ctx.store.getProjectHealth();
    const tickets = ctx.store.listEntities({ type: 'ticket' });
    const claims = ctx.store.getActiveClaims();
    const decisions = ctx.store.listEntities({ type: 'decision' });
    const epics = ctx.store.listEntities({ type: 'epic' });
    return { health, tickets, claims, decisions, epics };
  }
});

registry.register({
  id: 'knowledge_search',
  name: 'search_knowledge',
  cliCommand: 'search <query>',
  aliases: ['search', 'find', 'search:knowledge', 'find_knowledge'],
  category: 'graph',
  description: 'Search across entities, epics, decisions, and in-code notes (TODO/FIXME/BUG)',
  schema: z.object({
    query: z.string()
  }),
  parseCliArgs: (args) => ({ query: args.join(' ') }),
  handler: async (ctx, { query }) => {
    const lower = query.toLowerCase();
    const entities = ctx.store.listEntities().filter(e => e.title.toLowerCase().includes(lower) || (e.body || '').toLowerCase().includes(lower));
    const notes = ctx.store.listCodeNotes().filter(n => n.body.toLowerCase().includes(lower) || n.filePath.toLowerCase().includes(lower));
    return { query, matchedEntities: entities, matchedNotes: notes };
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Search Results for "${res.query}" ===\x1b[0m\n`;
    out += `\x1b[1mMatched Entities (${res.matchedEntities.length}):\x1b[0m\n`;
    for (const e of res.matchedEntities.slice(0, 10)) {
      out += `  - [${e.type}] \x1b[1m${e.id}\x1b[0m: ${e.title}${e.lane ? ` (${e.lane})` : ''}\n`;
    }
    out += `\n\x1b[1mMatched Code Notes (${res.matchedNotes.length}):\x1b[0m\n`;
    for (const n of res.matchedNotes.slice(0, 10)) {
      out += `  - [${n.noteType}] \x1b[1m${n.filePath}:${n.line}\x1b[0m: ${n.body}\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'symbol_find',
  name: 'find_symbol',
  cliCommand: 'symbol <name>',
  aliases: ['symbol', 'find_symbol', 'symbol:find', 'symbol_lookup'],
  category: 'graph',
  description: 'Fast AST symbol lookup: finds definitions, files, callers, and callees in SQLite',
  schema: z.object({
    name: z.string()
  }),
  parseCliArgs: (args) => ({ name: args[0] || '' }),
  handler: async (ctx, { name }) => {
    const lower = name.toLowerCase();
    const symbols = ctx.store.listEntities({ type: 'symbol' }).filter(s => s.title.toLowerCase().includes(lower) || s.id.toLowerCase().includes(lower));
    const detailed = symbols.map(s => {
      const file = ctx.store.getIncoming(s.id, 'contains')[0]?.id || s.metadata?.file || 'unknown';
      const callers = ctx.store.getIncoming(s.id, 'calls');
      const callees = ctx.store.getOutgoing(s.id, 'calls');
      return {
        id: s.id,
        name: s.title,
        kind: s.metadata?.kind || 'symbol',
        file,
        line: s.metadata?.line || 1,
        callers: callers.map(c => c.title),
        callees: callees.map(c => c.title)
      };
    });
    return { query: name, count: detailed.length, symbols: detailed };
  },
  renderTui: (res) => {
    if (res.symbols.length === 0) return `No symbols found matching "${res.query}".`;
    let out = `\x1b[1;36m=== AST Symbol Matches for "${res.query}" (${res.count}) ===\x1b[0m\n`;
    for (const s of res.symbols.slice(0, 10)) {
      out += `- \x1b[1;33m${s.name}\x1b[0m (${s.kind}) in \x1b[1m${s.file}:${s.line}\x1b[0m\n`;
      if (s.callers.length > 0) out += `  Incoming Callers: ${s.callers.join(', ')}\n`;
      if (s.callees.length > 0) out += `  Outgoing Callees: ${s.callees.join(', ')}\n`;
    }
    return out.trim();
  }
});

// ==========================================
// 2. TICKET & CONTEXT CAPABILITIES
// ==========================================

registry.register({
  id: 'ticket_get_context',
  name: 'get_ticket_context',
  cliCommand: 'context <ticketId>',
  aliases: ['context', 'extract', 'ticket:context', 'extract_ticket', 'ticket_context'],
  category: 'ticket',
  description: 'Fetch bounded token context pack (ticket, epic, AST symbols, guidelines, lessons, and test command)',
  schema: z.object({
    ticketId: z.string(),
    maxTokens: z.number().optional(),
    format: z.enum(['xml', 'markdown', 'json']).optional()
  }),
  parseCliArgs: (args, flags) => ({
    ticketId: args[0] || '',
    maxTokens: flags.budget ? Number(flags.budget) : flags.maxTokens ? Number(flags.maxTokens) : undefined,
    format: flags.format || 'markdown'
  }),
  handler: async (ctx, { ticketId, maxTokens, format }) => {
    return packTicketContext(ctx.store, ticketId, { maxTokens, format });
  },
  renderTui: (res) => {
    return res.rendered || `Ticket not found.`;
  }
});

registry.register({
  id: 'ticket_deep_view',
  name: 'get_ticket_deep_view',
  cliCommand: 'ticket inspect <ticketId>',
  aliases: ['ticket:inspect', 'inspect_ticket', 'ticket_view', 'ticket:deep'],
  category: 'ticket',
  description: 'Get deep inspection payload for a ticket including AST symbols, callers, past run artifacts, and incoming/outgoing relations',
  schema: z.object({
    ticketId: z.string()
  }),
  parseCliArgs: (args) => ({ ticketId: args[0] || '' }),
  handler: async (ctx, { ticketId }) => {
    const ticket = ctx.store.getEntity(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found.`);
    const context = await packTicketContext(ctx.store, ticketId);
    const artifacts = ctx.store.getRunArtifacts(ticketId);
    const outgoing = ctx.store.getOutgoing(ticketId);
    const incoming = ctx.store.getIncoming(ticketId);
    return { ticket, context, artifacts, outgoing, incoming };
  },
  renderTui: (res) => {
    const t = res.ticket;
    let out = `\x1b[1;36m=== Deep Inspection: ${t.id} ===\x1b[0m\n`;
    out += `Title: \x1b[1m${t.title}\x1b[0m | Lane: \x1b[33m${t.lane}\x1b[0m | Status: \x1b[32m${t.status}\x1b[0m\n`;
    if (t.body) out += `Summary: ${t.body}\n`;
    if (t.metadata?.claim) {
      out += `Claim: Leased by ${t.metadata.claim.claimedBy} until ${t.metadata.claim.expiresAt}\n`;
    }
    out += `\nOutgoing Relations (${res.outgoing.length}): ${res.outgoing.map((e: any) => `${e.type}:${e.id}`).join(', ') || 'None'}\n`;
    out += `Incoming Relations (${res.incoming.length}): ${res.incoming.map((e: any) => `${e.type}:${e.id}`).join(', ') || 'None'}\n`;
    out += `Run Artifacts (${res.artifacts.length}): ${res.artifacts.map((a: any) => `${a.id} (${a.status})`).join(', ') || 'None'}`;
    return out.trim();
  }
});

registry.register({
  id: 'ticket_list',
  name: 'list_tickets',
  cliCommand: 'ticket list [lane]',
  aliases: ['tickets', 'ticket:list', 'list_tickets'],
  category: 'ticket',
  description: 'List tickets across Kanban lanes (Backlog, Todo, In Progress, Done, Blocked)',
  schema: z.object({
    lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).optional()
  }),
  parseCliArgs: (args) => ({
    lane: args[0] as any
  }),
  handler: async (ctx, { lane }) => {
    const filter = lane ? { type: 'ticket', lane } : { type: 'ticket' };
    return ctx.store.listEntities(filter);
  },
  renderTui: (tickets) => {
    if (tickets.length === 0) return 'No tickets found.';
    let out = `\x1b[1;36m=== Tickets (${tickets.length}) ===\x1b[0m\n`;
    for (const t of tickets) {
      const laneColor = t.lane === 'In Progress' ? '\x1b[34m' : t.lane === 'Done' ? '\x1b[32m' : t.lane === 'Blocked' ? '\x1b[31m' : '\x1b[33m';
      out += `- [${laneColor}${t.lane || 'Backlog'}\x1b[0m] \x1b[1m${t.id}\x1b[0m: ${t.title} (${t.status || 'planned'})\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'ticket_update',
  name: 'update_ticket_state',
  cliCommand: 'ticket move <ticketId> <lane> [status]',
  aliases: ['ticket:move', 'ticket_move', 'ticket:update', 'update_ticket'],
  category: 'ticket',
  description: 'Move a ticket, record execution output or failure lessons, and sync markdown',
  schema: z.object({
    ticketId: z.string(),
    lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']),
    status: z.enum(['planned', 'partial', 'implemented', 'verified']).optional(),
    lesson: z.record(z.any()).optional()
  }),
  parseCliArgs: (args) => ({
    ticketId: args[0] || '',
    lane: (args[1] as any) || 'Todo',
    status: (args[2] as any)
  }),
  handler: async (ctx, { ticketId, lane, status, lesson }) => {
    const existing = ctx.store.getEntity(ticketId);
    if (!existing) throw new Error(`Ticket ${ticketId} not found.`);

    const updated = ctx.store.upsertEntity({
      ...existing,
      lane,
      status: status ?? (lane === 'Done' ? 'verified' : lane === 'In Progress' ? 'partial' : 'planned')
    });

    if (lesson) {
      ctx.store.recordRunArtifact({
        id: `run-${Date.now()}`,
        ticketId,
        action: 'cli-update',
        status: lane === 'Done' ? 'passed' : 'failed',
        lessons: lesson
      });
    }

    await ctx.transport.sync();
    return updated;
  },
  renderTui: (t) => `\x1b[32mTicket ${t.id} moved to ${t.lane} (${t.status}). Synced with kanban.md ✅\x1b[0m`
});

registry.register({
  id: 'ticket_start',
  name: 'start_ticket',
  cliCommand: 'start <ticketId>',
  aliases: ['start', 'ticket:start'],
  category: 'ticket',
  description: 'Move ticket to In Progress lane and synchronize kanban.md',
  schema: z.object({
    ticketId: z.string()
  }),
  parseCliArgs: (args) => ({ ticketId: args[0] || '' }),
  handler: async (ctx, { ticketId }) => {
    const existing = ctx.store.getEntity(ticketId);
    const updated = ctx.store.upsertEntity({
      id: ticketId,
      type: 'ticket',
      title: existing?.title || ticketId,
      lane: 'In Progress',
      status: 'partial'
    });
    await ctx.transport.sync();
    return updated;
  },
  renderTui: (t) => `\x1b[32mTicket ${t.id} moved to In Progress. Synced with kanban.md ✅\x1b[0m`
});

registry.register({
  id: 'ticket_done',
  name: 'done_ticket',
  cliCommand: 'done <ticketId>',
  aliases: ['done', 'ticket:done'],
  category: 'ticket',
  description: 'Move ticket to Done lane (verified) and synchronize kanban.md',
  schema: z.object({
    ticketId: z.string()
  }),
  parseCliArgs: (args) => ({ ticketId: args[0] || '' }),
  handler: async (ctx, { ticketId }) => {
    const existing = ctx.store.getEntity(ticketId);
    const updated = ctx.store.upsertEntity({
      id: ticketId,
      type: 'ticket',
      title: existing?.title || ticketId,
      lane: 'Done',
      status: 'verified'
    });
    await ctx.transport.sync();
    return updated;
  },
  renderTui: (t) => `\x1b[32mTicket ${t.id} moved to Done (verified). Synced with kanban.md ✅\x1b[0m`
});

registry.register({
  id: 'ticket_create',
  name: 'create_ticket',
  cliCommand: 'ticket create <title...>',
  aliases: ['ticket:create', 'ticket:add', 'new_ticket', 'create_ticket'],
  category: 'ticket',
  description: 'Create a new ticket in Todo lane and sync with kanban.md',
  schema: z.object({
    id: z.string().optional(),
    title: z.string(),
    lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).optional(),
    body: z.string().optional()
  }),
  parseCliArgs: (args) => ({
    title: args.join(' '),
    lane: 'Todo'
  }),
  handler: async (ctx, { id: customId, title, lane, body }) => {
    const id = customId || `TKT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const ticket = ctx.store.upsertEntity({
      id,
      type: 'ticket',
      title,
      lane: lane || 'Todo',
      status: 'planned',
      body: body || ''
    });
    await ctx.transport.sync();
    return ticket;
  },
  renderTui: (t) => `\x1b[32mCreated ticket ${t.id}: "${t.title}" in ${t.lane} lane ✅\x1b[0m`
});

registry.register({
  id: 'ticket_claim',
  name: 'claim_ticket',
  cliCommand: 'claim <ticketId> [agentId] [durationMinutes]',
  aliases: ['claim', 'ticket:claim', 'ticket_claim'],
  category: 'ticket',
  description: 'Atomically lease a ticket for an AI agent to prevent task collision',
  schema: z.object({
    ticketId: z.string(),
    agentId: z.string(),
    durationMinutes: z.number().optional()
  }),
  parseCliArgs: (args) => ({
    ticketId: args[0] || '',
    agentId: args[1] || process.env.USER || 'agent-1',
    durationMinutes: args[2] ? Number(args[2]) : 30
  }),
  handler: async (ctx, { ticketId, agentId, durationMinutes }) => {
    const durationMs = (durationMinutes ?? 30) * 60 * 1000;
    return ctx.store.claimTicket(ticketId, agentId, durationMs);
  },
  renderTui: (res) => {
    if (res.success) {
      return `\x1b[32mTicket claimed by ${res.lease?.claimedBy} until ${res.lease?.expiresAt} ✅\x1b[0m`;
    }
    return `\x1b[31mFailed to claim ticket:\x1b[0m ${res.reason}`;
  }
});

registry.register({
  id: 'ticket_release',
  name: 'release_ticket',
  cliCommand: 'release <ticketId> [agentId]',
  aliases: ['release', 'ticket:release', 'ticket_release'],
  category: 'ticket',
  description: 'Release an active ticket claim/lease',
  schema: z.object({
    ticketId: z.string(),
    agentId: z.string().optional()
  }),
  parseCliArgs: (args) => ({
    ticketId: args[0] || '',
    agentId: args[1]
  }),
  handler: async (ctx, { ticketId, agentId }) => {
    return ctx.store.releaseTicket(ticketId, agentId);
  },
  renderTui: (res) => {
    if (res.success) return `\x1b[32mTicket lease released successfully ✅\x1b[0m`;
    return `\x1b[31mFailed to release ticket:\x1b[0m ${res.reason}`;
  }
});

registry.register({
  id: 'ticket_next',
  name: 'recommend_next_task',
  cliCommand: 'next',
  aliases: ['next', 'recommend_task', 'next_task', 'recommend_next_task'],
  category: 'ticket',
  description: 'Get the highest leverage task from the dependency graph and module priority',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return recommendNextTask(ctx.store);
  },
  renderTui: (res) => {
    const ticketStr = res.ticket ? `\x1b[1m${res.ticket.id}: ${res.ticket.title}\x1b[0m (${res.ticket.lane})` : 'None';
    return `\x1b[1;33mRecommended Next Task:\x1b[0m ${ticketStr}\nReason: ${res.reason}`;
  }
});

// ==========================================
// 3. IMPACT & BLAST RADIUS CAPABILITIES
// ==========================================

registry.register({
  id: 'impact_blast_radius',
  name: 'get_blast_radius',
  cliCommand: 'impact <target>',
  aliases: ['impact', 'blast_radius', 'impact:check', 'get_blast_radius'],
  category: 'impact',
  description: 'Analyze blast radius for a target file or AST symbol',
  schema: z.object({
    target: z.string()
  }),
  parseCliArgs: (args) => ({ target: args[0] || '' }),
  handler: async (ctx, { target }) => {
    return getBlastRadius(ctx.store, target);
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Blast Radius for "${res.target}" ===\x1b[0m\n`;
    out += `Affected Files (${res.affectedFilesCount}): ${res.affectedFiles.join(', ')}\n`;
    out += `Affected Active Tickets: ${res.affectedTickets.map((t: any) => t.id).join(', ') || 'None'}\n`;
    out += `Recommended Tests: \x1b[1;32m${res.recommendedTests.join(', ')}\x1b[0m`;
    return out.trim();
  }
});

registry.register({
  id: 'impact_gate',
  name: 'check_blast_gate',
  cliCommand: 'gate <target>',
  aliases: ['gate', 'gate:check', 'preflight_gate', 'check_gate'],
  category: 'impact',
  description: 'Pre-flight blast radius gate: gives subagents an exact checklist of verification gates before editing files',
  schema: z.object({
    target: z.string()
  }),
  parseCliArgs: (args) => ({ target: args[0] || '' }),
  handler: async (ctx, { target }) => {
    const blast = getBlastRadius(ctx.store, target);
    const inProgress = ctx.store.listEntities({ type: 'ticket', lane: 'In Progress' });
    const collidingTickets = inProgress.filter(t => 
      ctx.store.getOutgoing(t.id, 'modifies').some(f => blast.affectedFiles.includes(f.id))
    );
    const gatePassed = collidingTickets.length === 0;

    return {
      target,
      gatePassed,
      affectedFiles: blast.affectedFiles,
      collidingTickets: collidingTickets.map(t => ({ id: t.id, title: t.title })),
      verificationChecklist: blast.recommendedTests
    };
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Pre-Flight Gate for "${res.target}" ===\x1b[0m\n`;
    out += `Status: ${res.gatePassed ? '\x1b[1;32mPASSED (Safe to Edit) ✅\x1b[0m' : '\x1b[1;31mWARNING (Potential Collision) ⚠️\x1b[0m'}\n`;
    out += `Affected Files (${res.affectedFiles.length}): ${res.affectedFiles.join(', ')}\n`;
    if (res.collidingTickets.length > 0) {
      out += `\x1b[31mIn-Flight Collisions:\x1b[0m ${res.collidingTickets.map((t: any) => `${t.id}: ${t.title}`).join(', ')}\n`;
    }
    out += `Mandatory Verification Tests:\n`;
    for (const testCmd of res.verificationChecklist) {
      out += `  - \x1b[1;33m${testCmd}\x1b[0m\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'impact_feature',
  name: 'analyze_feature_blast_radius',
  cliCommand: 'feature-impact <wish...>',
  aliases: ['feature-impact', 'feature_blast_radius', 'feature:impact', 'analyze_feature_blast_radius'],
  category: 'impact',
  description: 'Analyze AI-driven semantic blast radius for a proposed feature or refactoring',
  schema: z.object({
    featureWish: z.string()
  }),
  parseCliArgs: (args) => ({ featureWish: args.join(' ') }),
  handler: async (ctx, { featureWish }) => {
    return getFeatureBlastRadius(ctx.store, featureWish);
  },
  renderTui: (res) => {
    return `\x1b[1;36m=== Feature Blast Radius ===\x1b[0m
Target: "${res.featureWish}"
Risk Level: \x1b[1;${res.riskLevel === 'High' ? '31' : res.riskLevel === 'Medium' ? '33' : '32'}m${res.riskLevel}\x1b[0m
Impacted Modules: ${res.impactedModules.join(', ') || 'None direct'}
Impacted Files: ${res.impactedFiles.join(', ') || 'None'}
Affected Tickets: ${res.affectedActiveTickets.map((t: any) => t.id).join(', ') || 'None'}
Recommended Tests: ${res.recommendedTests.join(', ')}
Assessment: ${res.architecturalSummary}`;
  }
});

registry.register({
  id: 'impact_digest',
  name: 'generate_digest',
  cliCommand: 'digest [hours]',
  aliases: ['digest', 'standup', 'daily_digest', 'generate_digest'],
  category: 'impact',
  description: 'Print daily standup summary (completed tasks, in-progress tasks, recent ADRs, open bugs)',
  schema: z.object({
    hours: z.number().optional()
  }),
  parseCliArgs: (args) => ({ hours: args[0] ? Number(args[0]) : 24 }),
  handler: async (ctx, { hours }) => {
    return generateDigest(ctx.store, hours ?? 24);
  },
  renderTui: (dig) => {
    let out = `\x1b[1;32m=== Daily Digest (Past 24h) ===\x1b[0m\n`;
    out += `Completed Tickets: ${dig.completedTickets.map((t: any) => t.id).join(', ') || 'None'}\n`;
    out += `In Progress: ${dig.inProgressTickets.map((t: any) => t.id).join(', ') || 'None'}\n`;
    out += `Recent ADR Decisions: ${dig.recentDecisions.map((d: any) => d.id).join(', ') || 'None'}\n`;
    out += `Open Bug Badges: ${dig.openBugsCount} 🔴`;
    return out;
  }
});

registry.register({
  id: 'impact_doctor',
  name: 'doctor_diagnose',
  cliCommand: 'doctor [--fix]',
  aliases: ['doctor', 'doctor_diagnose', 'diagnose', 'doctor_check'],
  category: 'impact',
  description: 'Run repository health diagnostics and optionally auto-create tickets for unlinked notes',
  schema: z.object({
    fix: z.boolean().optional()
  }),
  parseCliArgs: (args, flags) => ({ fix: flags.fix || args.includes('--fix') }),
  handler: async (ctx, { fix }) => {
    const res = doctorCheck(ctx.store, { fix });
    if (fix) await ctx.transport.sync();
    return res;
  },
  renderTui: (doc) => {
    let out = `\x1b[1;34m=== Repo Doctor Health Report ===\x1b[0m\n`;
    out += `Total Files: ${doc.totalFiles}\n`;
    out += `Unlinked Bug Notes (TODO/FIXME/BUG): ${doc.unlinkedBugNotes}\n`;
    if (doc.autoFixedTickets && doc.autoFixedTickets.length > 0) {
      out += `\x1b[32mAuto-created ${doc.autoFixedTickets.length} bug tickets in Todo lane.\x1b[0m`;
    } else if (doc.unlinkedBugNotes > 0) {
      out += `Tip: run 'ai-workflow doctor --fix' to auto-generate tickets for unlinked bug notes.`;
    }
    return out.trim();
  }
});

// ==========================================
// 4. AUDIT & METRICS CAPABILITIES
// ==========================================

registry.register({
  id: 'audit_codebase',
  name: 'audit_guidelines',
  cliCommand: 'audit [targetFiles...]',
  aliases: ['audit', 'audit_guidelines', 'check_rules', 'audit_codebase'],
  category: 'audit',
  description: 'Validate codebase against machine-enforced policies and architectural guidelines',
  schema: z.object({
    targetFiles: z.array(z.string()).optional()
  }),
  parseCliArgs: (args) => ({ targetFiles: args.length > 0 ? args : undefined }),
  handler: async (ctx, { targetFiles }) => {
    return auditCodebase(ctx.store, { targetFiles });
  },
  renderTui: (res) => {
    if (res.passed) {
      return `\x1b[32mAudit Passed! 0 guideline violations found across codebase. ✅\x1b[0m`;
    }
    let out = `\x1b[31mAudit Failed! Found ${res.violationsCount} violation(s):\x1b[0m\n`;
    for (const f of res.findings.slice(0, 15)) {
      out += `  \x1b[1m${f.file}:${f.line}\x1b[0m [${f.ruleId}]: ${f.message}\n`;
    }
    if (res.findings.length > 15) {
      out += `  ... and ${res.findings.length - 15} more findings.`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'telemetry_metrics',
  name: 'get_telemetry_metrics',
  cliCommand: 'metrics',
  aliases: ['metrics', 'telemetry', 'metrics:summary', 'get_telemetry_metrics'],
  category: 'metrics',
  description: 'Get context compression ratios, token savings, and execution latency metrics',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return ctx.metrics.getSummary();
  },
  renderTui: (summary) => {
    let out = `\x1b[1;36m=== Context & Performance Telemetry Metrics ===\x1b[0m\n`;
    out += `Total Context Packs: \x1b[1m${summary.totalContextPacks}\x1b[0m\n`;
    out += `Total Tokens Saved:  \x1b[1;32m${summary.totalTokensSaved.toLocaleString()} tokens\x1b[0m\n`;
    out += `Avg Compression:     \x1b[1;32m${summary.averageCompressionRatio}%\x1b[0m\n`;
    out += `Avg Context Pack:    \x1b[1m${summary.averageContextPackDurationMs}ms\x1b[0m`;
    if (Object.keys(summary.operationsSummary).length > 0) {
      out += `\n\n\x1b[1mOperations Breakdown:\x1b[0m\n`;
      for (const [op, stats] of Object.entries(summary.operationsSummary)) {
        out += `  - \x1b[33m${op}\x1b[0m: ${stats.count} calls (avg ${stats.avgDurationMs}ms, failure rate: ${stats.failureRate}%)\n`;
      }
    }
    return out.trim();
  }
});

// ==========================================
// 5. ARCHITECTURAL DECISIONS (ADR)
// ==========================================

registry.register({
  id: 'decision_list',
  name: 'list_decisions',
  cliCommand: 'decision list',
  aliases: ['decisions', 'decision:list', 'list_decisions'],
  category: 'decision',
  description: 'List all Architectural Decision Records (ADRs)',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return ctx.decisions.listDecisions();
  },
  renderTui: (list) => {
    if (list.length === 0) return 'No decisions found.';
    let out = `\x1b[1;34m=== Architectural Decision Records (ADRs) ===\x1b[0m\n`;
    for (const d of list) {
      const statusColor = d.status === 'accepted' ? '\x1b[32m' : d.status === 'reverted' ? '\x1b[31m' : '\x1b[33m';
      out += `- \x1b[1m${d.id}\x1b[0m [${statusColor}${d.status}\x1b[0m]: ${d.title}\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'decision_propose',
  name: 'propose_decision',
  cliCommand: 'decision propose <id> <title> [body...]',
  aliases: ['decision:propose', 'propose_decision'],
  category: 'decision',
  description: 'Propose an Architectural Decision Record (ADR) and link affected modules or epics',
  schema: z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    impactedModules: z.array(z.string()).optional(),
    epicId: z.string().optional()
  }),
  parseCliArgs: (args) => ({
    id: args[0] || '',
    title: args[1] || '',
    body: args.slice(2).join(' ') || ''
  }),
  handler: async (ctx, { id, title, body, impactedModules, epicId }) => {
    const dec = ctx.decisions.proposeDecision({ id, title, body, impactedModules, epicId });
    await ctx.transport.sync();
    return dec;
  },
  renderTui: (dec) => `\x1b[32mProposed decision ${dec.id}: "${dec.title}". Synced with decisions.md ✅\x1b[0m`
});

registry.register({
  id: 'decision_accept',
  name: 'accept_decision',
  cliCommand: 'decision accept <id>',
  aliases: ['decision:accept', 'accept_decision'],
  category: 'decision',
  description: 'Accept a proposed Architectural Decision Record (ADR)',
  schema: z.object({
    id: z.string()
  }),
  parseCliArgs: (args) => ({ id: args[0] || '' }),
  handler: async (ctx, { id }) => {
    const dec = ctx.decisions.acceptDecision(id);
    await ctx.transport.sync();
    return dec;
  },
  renderTui: (dec) => `\x1b[32mAccepted decision ${dec.id}. Synced with decisions.md ✅\x1b[0m`
});

registry.register({
  id: 'decision_revert',
  name: 'revert_decision',
  cliCommand: 'decision revert <id> [reason...]',
  aliases: ['decision:revert', 'revert_decision'],
  category: 'decision',
  description: 'Revert an Architectural Decision Record (ADR), cancel affected tickets, and log reason',
  schema: z.object({
    id: z.string(),
    reason: z.string()
  }),
  parseCliArgs: (args) => ({
    id: args[0] || '',
    reason: args.slice(1).join(' ') || 'Reverted by operator'
  }),
  handler: async (ctx, { id, reason }) => {
    const res = ctx.decisions.revertDecision(id, reason);
    await ctx.transport.sync();
    return res;
  },
  renderTui: (res) => `\x1b[33mReverted decision ${res.decision?.id}.\x1b[0m Affected tickets cancelled: ${res.affectedTickets.map((t: any) => t.id).join(', ') || 'None'}`
});

// ==========================================
// 6. CODELETS & DETERMINISTIC ROUTINES
// ==========================================

registry.register({
  id: 'codelet_list',
  name: 'list_codelets',
  cliCommand: 'codelet list',
  aliases: ['codelets', 'codelet:list', 'list_codelets'],
  category: 'codelet',
  description: 'List all compiled deterministic routines and codelets in the repository',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return ctx.compiler.listCodelets();
  },
  renderTui: (list) => {
    if (list.length === 0) return 'No compiled codelets found in .codelets/.';
    let out = `\x1b[1;36m=== Compiled Codelets (${list.length}) ===\x1b[0m\n`;
    for (const c of list) {
      out += `- \x1b[1m${c.meta?.title}\x1b[0m: ${c.meta?.doc || 'No doc'} (Tags: ${(c.meta?.tags || []).join(', ')})\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'codelet_search',
  name: 'search_codelets',
  cliCommand: 'codelet search <query>',
  aliases: ['codelet:search', 'search_codelets'],
  category: 'codelet',
  description: 'Search compiled routines by keyword, tag, or title',
  schema: z.object({
    query: z.string()
  }),
  parseCliArgs: (args) => ({ query: args.join(' ') }),
  handler: async (ctx, { query }) => {
    const list = await ctx.compiler.listCodelets();
    const lower = query.toLowerCase();
    return list.filter((c: any) => 
      c.meta?.title?.toLowerCase().includes(lower) || 
      c.meta?.doc?.toLowerCase().includes(lower) ||
      (c.meta?.tags || []).some((t: string) => t.toLowerCase().includes(lower))
    );
  },
  renderTui: (list) => {
    if (list.length === 0) return 'No matching codelets found.';
    let out = `\x1b[1;36m=== Matching Codelets (${list.length}) ===\x1b[0m\n`;
    for (const c of list) {
      out += `- \x1b[1m${c.meta?.title}\x1b[0m: ${c.meta?.doc || 'No doc'}\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'codelet_compile',
  name: 'compile_codelet',
  cliCommand: 'codelet compile <wish...>',
  aliases: ['codelet:compile', 'compile_codelet', 'run', 'compile'],
  category: 'codelet',
  description: 'Synthesize and compile a natural language wish into a tested, reusable JavaScript routine',
  schema: z.object({
    wish: z.string(),
    compound: z.number().optional(),
    tags: z.array(z.string()).optional()
  }),
  parseCliArgs: (args, flags) => ({
    wish: args.join(' '),
    compound: flags.compound ? Number(flags.compound) : undefined,
    tags: flags.tags ? flags.tags.split(',') : undefined
  }),
  handler: async (ctx, { wish, compound, tags }) => {
    const codelet = await ctx.compiler.compileWish(wish, { compound, tags });
    return {
      title: codelet.meta.title,
      titleHash: codelet.meta.titleHash,
      doc: codelet.meta.doc,
      sourceCode: codelet.sourceCode
    };
  },
  renderTui: (res) => {
    return `\x1b[32mCompiled codelet: ${res.title}\x1b[0m\nDoc: ${res.doc}\nSaved to .codelets/${res.title}.json ✅`;
  }
});

registry.register({
  id: 'codelet_run',
  name: 'run_codelet',
  cliCommand: 'codelet run <nameOrHash> [argsJson]',
  aliases: ['codelet:run', 'run_codelet'],
  category: 'codelet',
  description: 'Execute a pre-compiled routine by name or titleHash with input arguments',
  schema: z.object({
    nameOrHash: z.string(),
    args: z.record(z.any()).optional()
  }),
  parseCliArgs: (args) => ({
    nameOrHash: args[0] || '',
    args: args[1] ? JSON.parse(args[1]) : {}
  }),
  handler: async (ctx, { nameOrHash, args }) => {
    const result = await ctx.compiler.runCodelet(nameOrHash, args || {});
    return { nameOrHash, result };
  },
  renderTui: (res) => {
    return `\x1b[32mExecuted codelet ${res.nameOrHash} ✅\x1b[0m\nResult: ${JSON.stringify(res.result, null, 2)}`;
  }
});

registry.register({
  id: 'codelet_mock',
  name: 'compile_mock',
  cliCommand: 'codelet mock <intent...>',
  aliases: ['codelet:mock', 'compile_mock', 'codelet:stub', 'compile_stub'],
  category: 'codelet',
  description: 'Compile contract-conforming simulation stubs with runtime policies (mock, jit-promote, throw, suspend)',
  schema: z.object({
    intent: z.string(),
    stubPolicy: z.enum(['mock', 'jit-promote', 'throw', 'suspend']).optional(),
    inputSchema: z.record(z.any()).optional(),
    outputSchema: z.record(z.any()).optional()
  }),
  parseCliArgs: (args, flags) => ({
    intent: args.join(' '),
    stubPolicy: flags.policy as any || 'mock',
    inputSchema: flags.in ? JSON.parse(flags.in) : undefined,
    outputSchema: flags.out ? JSON.parse(flags.out) : undefined
  }),
  handler: async (ctx, { intent, stubPolicy, inputSchema, outputSchema }) => {
    const stub = await ctx.compiler.compileMock(intent, { stubPolicy, inputSchema, outputSchema });
    return {
      id: stub.id,
      title: stub.meta.title,
      isStub: stub.meta.isStub,
      stubPolicy: stub.meta.stubContract?.stubPolicy || stubPolicy || 'mock',
      doc: stub.meta.doc,
      sourceCode: stub.sourceCode
    };
  },
  renderTui: (res) => {
    return `\x1b[32mCompiled simulation stub: ${res.title}\x1b[0m\nPolicy: \x1b[33m${res.stubPolicy}\x1b[0m | IsStub: ${res.isStub}\nDoc: ${res.doc}\nSaved to .codelets/${res.title}.json ✅`;
  }
});

registry.register({
  id: 'codelet_promote',
  name: 'promote_stub',
  cliCommand: 'codelet promote <idOrTitle> [implementation]',
  aliases: ['codelet:promote', 'promote_stub', 'promote'],
  category: 'codelet',
  description: 'JIT hot-swap promotion of a simulation stub to a verified real implementation',
  schema: z.object({
    idOrTitle: z.string(),
    implementation: z.string().optional()
  }),
  parseCliArgs: (args) => ({
    idOrTitle: args[0] || '',
    implementation: args.slice(1).join(' ') || undefined
  }),
  handler: async (ctx, { idOrTitle, implementation }) => {
    const promoted = await ctx.compiler.promoteStub(idOrTitle, { implementation });
    return {
      id: promoted.id,
      title: promoted.meta.title,
      isStub: promoted.meta.isStub,
      tags: promoted.meta.tags,
      sourceCode: promoted.sourceCode
    };
  },
  renderTui: (res) => {
    return `\x1b[32mPromoted stub "${res.title}" to verified implementation (isStub: ${res.isStub}) ✅\x1b[0m`;
  }
});

registry.register({
  id: 'codelet_test',
  name: 'test_codelet',
  cliCommand: 'codelet test <nameOrHash>',
  aliases: ['codelet:test', 'test_codelet'],
  category: 'codelet',
  description: 'Execute verification test harness for a compiled codelet or function',
  schema: z.object({
    nameOrHash: z.string()
  }),
  parseCliArgs: (args) => ({ nameOrHash: args[0] || '' }),
  handler: async (ctx, { nameOrHash }) => {
    const testResult = await ctx.compiler.testCodelet(nameOrHash);
    return { nameOrHash, testResult };
  },
  renderTui: (res) => {
    const status = res.testResult.passed
      ? `\x1b[32mPASSED (${res.testResult.durationMs?.toFixed(2) || 0}ms) ✅\x1b[0m`
      : `\x1b[31mFAILED: ${res.testResult.error || 'Assertion error'} ❌\x1b[0m`;
    return `Test for codelet \x1b[1m${res.nameOrHash}\x1b[0m: ${status}`;
  }
});

registry.register({
  id: 'workflow_mermaid',
  name: 'render_workflow_mermaid',
  cliCommand: 'workflow mermaid <wish...>',
  aliases: ['workflow:mermaid', 'mermaid', 'to_mermaid'],
  category: 'codelet',
  description: 'Export compiled state machine workflow as a GitHub-compatible Mermaid state diagram',
  schema: z.object({
    wish: z.string()
  }),
  parseCliArgs: (args) => ({ wish: args.join(' ') }),
  handler: async (ctx, { wish }) => {
    const mermaid = await ctx.compiler.renderMermaid(wish);
    return { wish, mermaid };
  },
  renderTui: (res) => {
    return `\x1b[1;36m=== Mermaid State Diagram for "${res.wish}" ===\x1b[0m\n\`\`\`mermaid\n${res.mermaid}\n\`\`\``;
  }
});

registry.register({
  id: 'workflow_graph',
  name: 'render_workflow_graph',
  cliCommand: 'workflow graph <wish...>',
  aliases: ['workflow:graph', 'workflow_graph', 'to_graph'],
  category: 'codelet',
  description: 'Export compiled state machine as structured graph nodes and edges for UI canvas renderers',
  schema: z.object({
    wish: z.string()
  }),
  parseCliArgs: (args) => ({ wish: args.join(' ') }),
  handler: async (ctx, { wish }) => {
    const graph = await ctx.compiler.renderGraph(wish);
    return { wish, nodes: graph.nodes, edges: graph.edges };
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Workflow Graph Nodes (${res.nodes.length}) & Edges (${res.edges.length}) ===\x1b[0m\n`;
    out += `Nodes: ${res.nodes.map((n: any) => n.id).join(', ')}\n`;
    out += `Edges: ${res.edges.map((e: any) => `${e.from} -> ${e.to} [${e.label || ''}]`).join(', ')}`;
    return out.trim();
  }
});

registry.register({
  id: 'workflow_compile_and_execute',
  name: 'compile_and_execute',
  cliCommand: 'workflow run <instructions...>',
  aliases: ['workflow:run', 'compile_and_execute', 'execute_workflow'],
  category: 'codelet',
  description: 'Compile natural language instructions and immediately execute with context',
  schema: z.object({
    instructions: z.string(),
    context: z.record(z.any()).optional()
  }),
  parseCliArgs: (args, flags) => ({
    instructions: args.join(' '),
    context: flags.context ? JSON.parse(flags.context) : {}
  }),
  handler: async (ctx, { instructions, context }) => {
    const result = await ctx.compiler.compileAndExecute(instructions, context || {});
    return { instructions, result };
  },
  renderTui: (res) => {
    return `\x1b[1;32m=== Workflow Execution Result ===\x1b[0m\nStatus: ${res.result.status}\nSuccess: ${res.result.success}\nOutput: ${JSON.stringify(res.result.output, null, 2)}`;
  }
});

registry.register({
  id: 'codelet_sweep',
  name: 'sweep_bugs',
  cliCommand: 'sweep [--fix]',
  aliases: ['sweep', 'codelet:sweep', 'sweep_bugs', 'sweep_codebase'],
  category: 'codelet',
  description: 'Scan codebase for TODO/FIXME/BUG notes and optionally auto-generate Kanban Todo tickets',
  schema: z.object({
    maxBugs: z.number().optional(),
    autoTicket: z.boolean().optional()
  }),
  parseCliArgs: (args, flags) => ({
    maxBugs: flags.max ? Number(flags.max) : 20,
    autoTicket: flags.fix || flags.autoTicket || args.includes('--fix')
  }),
  handler: async (ctx, { maxBugs, autoTicket }) => {
    const bugNotes = ctx.store.listCodeNotes({ noteType: 'BUG' });
    const fixmeNotes = ctx.store.listCodeNotes({ noteType: 'FIXME' });
    const todoNotes = ctx.store.listCodeNotes({ noteType: 'TODO' });
    const all = [...bugNotes, ...fixmeNotes, ...todoNotes].slice(0, maxBugs ?? 20);

    const createdTickets: string[] = [];
    if (autoTicket) {
      for (const note of all) {
        if (!note.ticketId) {
          const id = `TKT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          ctx.store.upsertEntity({
            id,
            type: 'ticket',
            title: `[${note.noteType}] in ${note.filePath}:${note.line}`,
            lane: 'Todo',
            status: 'planned',
            body: note.body
          });
          createdTickets.push(id);
        }
      }
      await ctx.transport.sync();
    }

    return {
      totalFound: bugNotes.length + fixmeNotes.length + todoNotes.length,
      inspected: all.length,
      autoFixedTickets: createdTickets,
      notes: all.map(n => ({ file: n.filePath, line: n.line, type: n.noteType, body: n.body }))
    };
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Codebase Debt Sweep (${res.totalFound} found) ===\x1b[0m\n`;
    for (const n of res.notes.slice(0, 10)) {
      out += `  - [${n.type}] \x1b[1m${n.file}:${n.line}\x1b[0m: ${n.body}\n`;
    }
    if (res.autoFixedTickets.length > 0) {
      out += `\n\x1b[32mAuto-generated ${res.autoFixedTickets.length} Todo tickets on Kanban: ${res.autoFixedTickets.join(', ')} ✅\x1b[0m`;
    }
    return out.trim();
  }
});

// ==========================================
// 7. WORKSPACE, ENVIRONMENT & AGENT PRIMITIVES
// ==========================================

registry.register({
  id: 'workspace_root',
  name: 'get_project_root',
  cliCommand: 'root [startDir]',
  aliases: ['root', 'project_root', 'find_root'],
  category: 'system',
  description: 'Find real project root by traversing parent directories for root markers (.git, .ai-workflow, package.json, bun.lock)',
  schema: z.object({
    startDir: z.string().optional()
  }),
  parseCliArgs: (args) => ({ startDir: args[0] }),
  handler: async (ctx, { startDir }) => {
    return findProjectRoot(startDir || ctx.projectRoot);
  },
  renderTui: (res) => {
    return `\x1b[1;36mProject Root:\x1b[0m \x1b[1m${res.root}\x1b[0m (Marker: \x1b[33m${res.marker}\x1b[0m)`;
  }
});

registry.register({
  id: 'workspace_env',
  name: 'get_environment_info',
  cliCommand: 'env',
  aliases: ['env', 'environment', 'runtime_info'],
  category: 'system',
  description: 'Instant runtime, toolchain, package manager, and OS orientation snapshot',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return getEnvironmentInfo(ctx.projectRoot);
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Environment & Toolchain Orientation ===\x1b[0m\n`;
    out += `Root: \x1b[1m${res.root}\x1b[0m\n`;
    out += `Runtime: \x1b[1;32m${res.runtime}\x1b[0m | Platform: ${res.platform}\n`;
    out += `Package Manager: \x1b[1;33m${res.packageManager}\x1b[0m\n`;
    out += `Git Repository: ${res.isGit ? '\x1b[32mYES ✅\x1b[0m' : '\x1b[31mNO ❌\x1b[0m'} | AIWF State: ${res.hasAiWorkflowState ? '\x1b[32mActive ✅\x1b[0m' : '\x1b[33mUninitialized\x1b[0m'}`;
    return out.trim();
  }
});

registry.register({
  id: 'git_status',
  name: 'get_git_status',
  cliCommand: 'git-status',
  aliases: ['git-status', 'git:status', 'git_status'],
  category: 'graph',
  description: 'Fast parsed summary of current git branch, clean/dirty state, and modified files',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return getGitStatus(ctx.projectRoot);
  },
  renderTui: (res) => {
    if (!res.isGit) return `Not a git repository: ${res.message}`;
    let out = `\x1b[1;36m=== Git Working Tree: ${res.branch} ===\x1b[0m\n`;
    out += `Status: ${res.clean ? '\x1b[1;32mCLEAN ✅\x1b[0m' : `\x1b[1;31mDIRTY (${res.totalChanges} changes) ⚠️\x1b[0m`}\n`;
    if (res.staged.length > 0) out += `Staged (${res.staged.length}): ${res.staged.join(', ')}\n`;
    if (res.modified.length > 0) out += `Modified (${res.modified.length}): ${res.modified.join(', ')}\n`;
    if (res.untracked.length > 0) out += `Untracked (${res.untracked.length}): ${res.untracked.join(', ')}`;
    return out.trim();
  }
});

registry.register({
  id: 'file_outline',
  name: 'get_file_outline',
  cliCommand: 'outline <file>',
  aliases: ['outline', 'file:outline', 'signatures'],
  category: 'graph',
  description: 'Compact file outline: returns only function signatures, classes, interfaces, and lines from AST',
  schema: z.object({
    file: z.string()
  }),
  parseCliArgs: (args) => ({ file: args[0] || '' }),
  handler: async (ctx, { file }) => {
    return getFileOutline(ctx.store, file);
  },
  renderTui: (res) => {
    if (res.symbolCount === 0) return `No AST signatures indexed for ${res.file}. Run 'aiwf sync' to re-index.`;
    let out = `\x1b[1;36m=== AST Outline: ${res.file} (${res.symbolCount} symbols) ===\x1b[0m\n`;
    for (const s of res.signatures) {
      out += `  L${String(s.line).padEnd(4)} [${s.kind}] \x1b[1m${s.name}\x1b[0m\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'git_hotspots',
  name: 'get_project_hotspots',
  cliCommand: 'hotspots [days]',
  aliases: ['hotspots', 'churn', 'activity'],
  category: 'impact',
  description: 'Recent churn analysis: identifies top 10 most frequently modified files and active modules',
  schema: z.object({
    days: z.number().optional()
  }),
  parseCliArgs: (args) => ({ days: args[0] ? Number(args[0]) : 14 }),
  handler: async (ctx, { days }) => {
    return getGitHotspots(ctx.projectRoot, days ?? 14);
  },
  renderTui: (res) => {
    if (res.hotspots.length === 0) return `No recent file activity in the past ${res.sinceDays} days.`;
    let out = `\x1b[1;36m=== Recent Churn Hotspots (Past ${res.sinceDays} Days) ===\x1b[0m\n`;
    for (const h of res.hotspots) {
      out += `  - \x1b[1m${h.file.padEnd(36)}\x1b[0m \x1b[33m${h.changes} commits\x1b[0m\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'test_resolver',
  name: 'resolve_test_command',
  cliCommand: 'test-target <file>',
  aliases: ['test-target', 'resolve_test', 'test_target'],
  category: 'impact',
  description: 'Given any source file, deterministically resolves its paired test file and exact test runner command',
  schema: z.object({
    file: z.string()
  }),
  parseCliArgs: (args) => ({ file: args[0] || '' }),
  handler: async (ctx, { file }) => {
    return resolveTestTarget(ctx.projectRoot, file);
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Test Target Resolution for ${res.sourceFile} ===\x1b[0m\n`;
    out += `Paired Test File: \x1b[1m${res.testFile}\x1b[0m (${res.found ? '\x1b[32mFound ✅\x1b[0m' : '\x1b[33mNot found - fallback default\x1b[0m'})\n`;
    out += `Test Invocation: \x1b[1;32m${res.testCommand}\x1b[0m`;
    return out.trim();
  }
});

registry.register({
  id: 'agent_note',
  name: 'drop_agent_note',
  cliCommand: 'note <text...>',
  aliases: ['note', 'scratch', 'drop_note'],
  category: 'system',
  description: 'Drop an ephemeral timestamped note into .ai-workflow/scratchpad.md for subagent handoffs',
  schema: z.object({
    note: z.string()
  }),
  parseCliArgs: (args) => ({ note: args.join(' ') }),
  handler: async (ctx, { note }) => {
    return appendScratchpadNote(ctx.projectRoot, note);
  },
  renderTui: (res) => `\x1b[32mAppended note to scratchpad.md [${res.timestamp}] ✅\x1b[0m`
});

registry.register({
  id: 'agent_notes_read',
  name: 'read_scratchpad',
  cliCommand: 'notes',
  aliases: ['notes', 'scratchpad', 'read_notes'],
  category: 'system',
  description: 'Read the shared agent session scratchpad from .ai-workflow/scratchpad.md',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return readScratchpad(ctx.projectRoot);
  },
  renderTui: (res) => {
    return `\x1b[1;36m=== Shared Agent Scratchpad (${res.notesCount} notes) ===\x1b[0m\n${res.content}`;
  }
});

registry.register({
  id: 'ticket_diff',
  name: 'get_ticket_diff',
  cliCommand: 'diff [target]',
  aliases: ['diff', 'working_diff', 'ticket_diff'],
  category: 'ticket',
  description: 'Self-review working tree diff or file diff before ticket closure',
  schema: z.object({
    target: z.string().optional()
  }),
  parseCliArgs: (args) => ({ target: args[0] }),
  handler: async (ctx, { target }) => {
    return getGitDiff(ctx.projectRoot, target);
  },
  renderTui: (res) => {
    return `\x1b[1;36m=== Diff: ${res.target} ===\x1b[0m\n${res.diff}`;
  }
});

registry.register({
  id: 'graph_linter',
  name: 'lint_workflow_graph',
  cliCommand: 'lint-graph',
  aliases: ['lint-graph', 'lint_graph', 'graph:lint', 'orphans'],
  category: 'graph',
  description: 'Lint the causal graph for orphan tickets (no links), dead symbols, and stale expired claims',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return lintWorkflowGraph(ctx.store);
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Causal Graph Integrity Lint ===\x1b[0m\n`;
    out += `Status: ${res.clean ? '\x1b[1;32mCLEAN (Zero Integrity Issues) ✅\x1b[0m' : '\x1b[1;33mISSUES DETECTED ⚠️\x1b[0m'}\n`;
    out += `Orphan Tickets: \x1b[1m${res.orphanTicketsCount}\x1b[0m\n`;
    for (const t of res.orphanTickets.slice(0, 5)) {
      out += `  - ${t.id}: ${t.title} (${t.lane})\n`;
    }
    out += `Stale In-Progress Claims (>24h expired): \x1b[1m${res.staleInProgressClaimsCount}\x1b[0m\n`;
    for (const s of res.staleInProgressClaims) {
      out += `  - ${s.id}: ${s.title} (Claimed by ${s.expiredClaim?.claimedBy})\n`;
    }
    out += `Uncalled AST Symbols (Sample): ${res.deadSymbolsSampleCount}`;
    return out.trim();
  }
});

registry.register({
  id: 'test_triage',
  name: 'triage_test_failures',
  cliCommand: 'triage [command]',
  aliases: ['triage', 'test:triage', 'failed_tests'],
  category: 'impact',
  description: 'Parse and triage test suite failures into a compact, actionable JSON payload',
  schema: z.object({
    command: z.string().optional()
  }),
  parseCliArgs: (args) => ({ command: args.join(' ') || undefined }),
  handler: async (ctx, { command }) => {
    return triageTestFailures(ctx.projectRoot, command || 'bun test');
  },
  renderTui: (res) => {
    if (res.passed) return `\x1b[32m${res.summary}\x1b[0m`;
    let out = `\x1b[1;31m=== Test Triage: ${res.failingCount} Failure(s) ===\x1b[0m\n`;
    for (const f of res.failures) {
      out += `- \x1b[1;33m${f.testName}\x1b[0m\n  ${f.error.replace(/\n/g, '\n  ')}\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'ticket_lesson',
  name: 'record_ticket_lesson',
  cliCommand: 'lesson <ticketId> <text...>',
  aliases: ['lesson', 'record_lesson', 'add_lesson'],
  category: 'ticket',
  description: 'Record an execution lesson or bugfix pitfall into SQLite memory for future ticket context packs',
  schema: z.object({
    ticketId: z.string(),
    lesson: z.string()
  }),
  parseCliArgs: (args) => ({
    ticketId: args[0] || '',
    lesson: args.slice(1).join(' ')
  }),
  handler: async (ctx, { ticketId, lesson }) => {
    return recordTicketLesson(ctx.store, ticketId, lesson);
  },
  renderTui: (res) => `\x1b[32mRecorded lesson for ${res.ticketId} into SQLite memory ✅\x1b[0m`
});

registry.register({
  id: 'symbol_slice',
  name: 'get_symbol_source',
  cliCommand: 'slice <file> <symbol>',
  aliases: ['slice', 'symbol_source', 'extract_symbol'],
  category: 'graph',
  description: 'Surgical AST slice: reads only the target function/class source lines from a file',
  schema: z.object({
    file: z.string(),
    symbol: z.string()
  }),
  parseCliArgs: (args) => ({
    file: args[0] || '',
    symbol: args[1] || ''
  }),
  handler: async (ctx, { file, symbol }) => {
    return getSymbolSource(ctx.store, file, symbol);
  },
  renderTui: (res) => {
    if (!res.found) return `Symbol ${res.symbol} not found in ${res.file}.`;
    return `\x1b[1;36m=== ${res.symbol} in ${res.file} (L${res.startLine}-${res.startLine + res.lineCount - 1}) ===\x1b[0m\n${res.code}`;
  }
});

registry.register({
  id: 'token_budget',
  name: 'estimate_token_budget',
  cliCommand: 'token-count [files...]',
  aliases: ['token-count', 'tokens', 'budget_estimate'],
  category: 'system',
  description: 'Estimate prompt token budget across target files to prevent context window blowouts',
  schema: z.object({
    files: z.array(z.string())
  }),
  parseCliArgs: (args) => ({ files: args }),
  handler: async (ctx, { files }) => {
    return estimateTokenBudget(ctx.projectRoot, files);
  },
  renderTui: (res) => {
    let out = `\x1b[1;36m=== Token Budget Estimate (${res.fileCount} files) ===\x1b[0m\n`;
    out += `Total Estimated Tokens: \x1b[1;${res.budgetRisk === 'High' ? '31' : res.budgetRisk === 'Medium' ? '33' : '32'}m${res.totalEstimatedTokens.toLocaleString()} tokens\x1b[0m (Risk: ${res.budgetRisk})\n`;
    for (const f of res.estimates) {
      out += `  - ${f.file.padEnd(30)} ~${f.estimatedTokens.toLocaleString()} tokens (${f.chars.toLocaleString()} chars)\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'workspace_snapshot',
  name: 'create_snapshot_checkpoint',
  cliCommand: 'snapshot [label]',
  aliases: ['snapshot', 'checkpoint', 'backup'],
  category: 'system',
  description: 'Create a non-destructive patch snapshot in .ai-workflow/snapshots/ before experimental mutations',
  schema: z.object({
    label: z.string().optional()
  }),
  parseCliArgs: (args) => ({ label: args[0] }),
  handler: async (ctx, { label }) => {
    return createSnapshotCheckpoint(ctx.projectRoot, label);
  },
  renderTui: (res) => {
    if (!res.hasChanges) return `No uncommitted changes to snapshot.`;
    return `\x1b[32mCreated snapshot "${res.snapshotName}" (${res.diffBytes} bytes) at ${res.savedPath} ✅\x1b[0m`;
  }
});

registry.register({
  id: 'pr_summary',
  name: 'generate_pr_summary',
  cliCommand: 'pr-summary [ticketId]',
  aliases: ['pr-summary', 'commit_msg', 'pr'],
  category: 'ticket',
  description: 'Format conventional commit message and markdown PR summary from ticket metadata and ADRs',
  schema: z.object({
    ticketId: z.string().optional()
  }),
  parseCliArgs: (args) => ({ ticketId: args[0] }),
  handler: async (ctx, { ticketId }) => {
    return generatePrSummary(ctx.store, ticketId);
  },
  renderTui: (res) => {
    return `\x1b[1;36m=== Commit Title ===\x1b[0m\n${res.commitTitle}\n\n\x1b[1;36m=== PR Markdown Body ===\x1b[0m\n${res.prMarkdown}`;
  }
});

registry.register({
  id: 'epic_progress',
  name: 'get_epic_progress',
  cliCommand: 'burndown',
  aliases: ['burndown', 'epic:progress', 'epics_summary'],
  category: 'graph',
  description: 'Calculate real-time epic completion percentages, verified tickets, and open blockers',
  schema: z.object({}),
  parseCliArgs: () => ({}),
  handler: async (ctx) => {
    return getEpicProgress(ctx.store);
  },
  renderTui: (res) => {
    if (res.epics.length === 0) return 'No epics found in repository.';
    let out = `\x1b[1;36m=== Epic Burndown & Completion (${res.totalEpics} epics) ===\x1b[0m\n`;
    for (const ep of res.epics) {
      const color = ep.completionPercent === 100 ? '\x1b[32m' : ep.completionPercent >= 50 ? '\x1b[33m' : '\x1b[31m';
      out += `- \x1b[1m${ep.id}\x1b[0m: ${ep.title} -> ${color}${ep.completionPercent}%\x1b[0m (${ep.doneCount}/${ep.totalTickets} done, ${ep.inProgressCount} in-progress, ${ep.blockedCount} blocked)\n`;
    }
    return out.trim();
  }
});

registry.register({
  id: 'plan_track',
  name: 'track_plan_document',
  cliCommand: 'plan track <documentPath> [title]',
  aliases: ['plan:track', 'track_plan', 'track_plan_document'],
  category: 'ticket',
  description: 'Register an ongoing design or planning document as a first-class ticket and causal graph node',
  schema: z.object({
    documentPath: z.string(),
    title: z.string().optional(),
    lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).optional(),
    epicId: z.string().optional()
  }),
  parseCliArgs: (args, flags) => ({
    documentPath: args[0] || '',
    title: args.slice(1).join(' ') || undefined,
    lane: flags.lane as any || 'In Progress',
    epicId: flags.epic as string || undefined
  }),
  handler: async (ctx, { documentPath, title, lane, epicId }) => {
    const root = ctx.projectRoot;
    const fullPath = path.isAbsolute(documentPath) ? documentPath : path.join(root, documentPath);
    const relPath = path.relative(root, fullPath);

    let docTitle = title;
    if (!docTitle) {
      try {
        const { readFileSync } = await import('node:fs');
        const content = readFileSync(fullPath, 'utf8');
        const match = content.match(/^#\s+(.+)$/m);
        if (match && match[1]) {
          docTitle = match[1].replace(/^[^\w\s]+/, '').trim();
        }
      } catch {
        docTitle = path.basename(relPath, '.md').replace(/[-_]/g, ' ');
      }
    }
    docTitle = docTitle || path.basename(relPath, '.md');

    const slug = path.basename(relPath, '.md').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const ticketId = `TKT-PLAN-${slug || 'DOC'}`;
    const docId = `doc:${relPath}`;

    ctx.store.upsertEntity({
      id: docId,
      type: 'document',
      title: `Plan Document: ${docTitle}`,
      body: `Planning specification located at ${relPath}`,
      metadata: { path: relPath, isPlan: true }
    });

    const ticket = {
      id: ticketId,
      type: 'ticket' as const,
      title: `Design & Plan: ${docTitle}`,
      lane: (lane || 'In Progress') as any,
      status: 'in_design',
      body: `Active design & planning document: [${path.basename(relPath)}](${relPath})\n\nRepresents ongoing architectural design, RFC specifications, and implementation steps detailed in the plan document.`,
      metadata: {
        planDoc: relPath,
        planType: 'architecture_plan',
        epicId
      }
    };

    ctx.store.upsertEntity(ticket);
    ctx.store.addRelation({
      fromId: ticketId,
      toId: docId,
      relation: 'documents'
    });

    if (epicId) {
      ctx.store.addRelation({
        fromId: ticketId,
        toId: epicId,
        relation: 'implements'
      });
    }

    await ctx.transport.sync();
    return { ticket, docId, documentPath: relPath };
  },
  renderTui: (res) => {
    return `\x1b[32mTracked plan document "${res.documentPath}" as ticket \x1b[1m${res.ticket.id}\x1b[0m ("${res.ticket.title}") in ${res.ticket.lane} lane. Synced with kanban.md ✅\x1b[0m`;
  }
});



