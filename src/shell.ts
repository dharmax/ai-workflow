/**
 * Responsibility: Interactive Terminal REPL & Shell Bridge.
 * Scope: Dual-nature REPL supporting deterministic fast-path commands (<5ms),
 * mode switching ([DESIGN], [DEV], [TRIAGE], [PRODUCT]), and autonomous LLM wish execution.
 * Powered by @dharmax/ai-shell for raw TTY editing, smart completions, and interactive facilitation.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  TtyInputReader,
  SmartCompleter,
  InteractivePrompter,
  ParameterFacilitator,
  TerminalFormatter,
  type CommandSchema
} from '@dharmax/ai-shell';
import { WorkflowStore, findProjectRoot } from './graph/store.ts';
import { Ticket } from './graph/ontology.ts';
import { initializeTools, registry, type ToolContext } from './tools/index.ts';
import { WorkflowActor, type ShellMode, MODE_CONFIGS } from './actor/engine.ts';
import { exportProjections, importProjections } from './graph/projections.ts';
import { indexCodebase } from './graph/indexer.ts';
import { runDiagnostics, formatDiagnosticReport } from './doctor.ts';
import { loadConfig, saveConfig } from './config.ts';

export interface ShellSession {
  store: WorkflowStore;
  actor: WorkflowActor;
  projectRoot: string;
  prompter?: InteractivePrompter;
  facilitator?: ParameterFacilitator;
  interactive?: boolean;
}

export const SHELL_COMMANDS = [
  'status',
  'next',
  'claim',
  'release',
  'create',
  'new',
  'done',
  'move',
  'tickets',
  'sync',
  'diff',
  'symbol',
  'slice',
  'outline',
  'blast',
  'index',
  'doctor',
  'audit',
  'metrics',
  'config',
  'eval',
  'model',
  '/model',
  'radar',
  '/radar',
  'escalate',
  '/escalate',
  '/design',
  '/dev',
  '/triage',
  '/product',
  'help',
  '/help',
  'exit',
  'quit'
];

export async function processShellInput(
  input: string,
  session: ShellSession
): Promise<{ output: string; exit?: boolean; newMode?: ShellMode }> {
  const line = input.trim();
  if (!line) return { output: '' };

  const lower = line.toLowerCase();
  const ctx: ToolContext = {
    store: session.store,
    projectRoot: session.projectRoot
  };

  const facilitator = session.facilitator || new ParameterFacilitator(session.prompter);
  const isInteractive = session.interactive ?? (session.prompter ? session.prompter.getIsTty() : false);

  // 1. Session Control & Mode Switching
  if (lower === 'exit' || lower === 'quit' || lower === '/exit') {
    return { output: 'Goodbye!', exit: true };
  }

  if (lower === '/help' || lower === 'help') {
    return {
      output: `
\x1b[1;36m🏛️  AI-Workflow 2.0 Terminal REPL\x1b[0m

Commands:
  status                     - Working tree git status & active ticket leases
  next                       - Algorithmic recommendation for next task
  claim <ticketId> [agent]   - Atomically lease a ticket (default 30m)
  release <ticketId>         - Release active ticket lease
  done <ticketId>            - Mark ticket as Done, release lease, and sync Kanban
  move <ticketId> <lane>     - Move ticket to lane (Backlog|Todo|In Progress|Done|Blocked)
  create <title>             - Create ticket in Todo lane
  tickets [lane]             - List Kanban tickets (Backlog|Todo|In Progress|Done|Blocked)
  sync                       - Bi-directional sync between SQLite Graph and Markdown
  diff                       - Display uncommitted git diff
  symbol <name>              - Find symbol in AST+ semantic graph
  slice <file> <symbol>      - Slice and extract source code of a symbol
  outline <file>             - Display AST symbol outline for a file
  blast <target>             - Analyze blast radius of file or symbol
  index                      - Re-index codebase AST symbols and modules into graph
  doctor                     - Run comprehensive environment & graph diagnostics
  audit                      - Run architecture & graph integrity audit
  metrics                    - Show Kanban distribution & code churn hotspots
  config [get|set key val]   - View or update settings (.ai-workflow/config.json)
  eval <js-code>             - On-the-fly JavaScript evaluation
  model (or /model)          - Show gateway, provider keys, and mode model assignments
  radar [refresh]            - View SOTA model benchmark rankings & Pareto scores
  escalate [policy]          - View or toggle escalation policy (auto|local_only|prompt|sota)
  /design                    - Switch mode to [DESIGN] (Architecture & ADRs)
  /dev                       - Switch mode to [DEV] (Code authoring & patching)
  /triage                    - Switch mode to [TRIAGE] (Diagnostics & Test Triage)
  /product                   - Switch mode to [PRODUCT] (Roadmap & Story Grooming)
  exit                       - Exit shell
  <any natural instruction>  - Autonomous cognitive execution via Workflow Actor
`
    };
  }

  if (lower === 'model' || lower === '/model') {
    const cfg = loadConfig(session.projectRoot);
    const providers = session.actor.getConfiguredProviders();
    const recs = session.actor.radar.getRecommendations();
    let text = `\x1b[1;36m🤖 AI-Workflow Model & Gateway Configuration\x1b[0m\n`;
    text += `Active Gateway:     \x1b[1m${cfg.gateway}\x1b[0m\n`;
    text += `Available Providers: ${providers.map((p) => `\x1b[32m${p}\x1b[0m`).join(', ')}\n`;
    text += `Escalation Policy:   \x1b[1;33m${cfg.escalation?.policy || 'auto'}\x1b[0m (Blast threshold: ${cfg.escalation?.blastRadiusThreshold ?? 3})\n\n`;
    text += `\x1b[1mMode Routing:\x1b[0m\n`;
    text += `  [DESIGN]  Local: ${cfg.model} | Cloud: ${recs.design} ${cfg.modelRoutes?.design ? `(Override: ${cfg.modelRoutes.design})` : ''}\n`;
    text += `  [DEV]     Local: ${cfg.model} | Cloud: ${recs.dev} ${cfg.modelRoutes?.dev ? `(Override: ${cfg.modelRoutes.dev})` : ''}\n`;
    text += `  [TRIAGE]  Local: ${cfg.model} | Cloud: ${recs.triage} ${cfg.modelRoutes?.triage ? `(Override: ${cfg.modelRoutes.triage})` : ''}\n`;
    text += `  [PRODUCT] Local: ${cfg.model} | Cloud: ${recs.product} ${cfg.modelRoutes?.product ? `(Override: ${cfg.modelRoutes.product})` : ''}\n`;
    return { output: text };
  }

  if (lower.startsWith('radar') || lower.startsWith('/radar')) {
    const force = lower.includes('refresh') || lower.includes('--refresh');
    let data = session.actor.radar.getData();
    if (force) {
      data = await session.actor.radar.probe(true);
    }
    let text = `\x1b[1;36m📡 SOTA Model Radar (Source: ${data.source.toUpperCase()}, Updated: ${new Date(data.lastUpdated).toLocaleDateString()})\x1b[0m\n`;
    text += `\x1b[90mPareto Score = (Coding Elo - 1000)² / ln(Blended Cost + 1)\x1b[0m\n\n`;
    text += `  \x1b[1m${'Model Target'.padEnd(32)} ${'Elo'.padEnd(6)} ${'$/1M (in/out)'.padEnd(16)} ${'Pareto'.padEnd(8)} Recommended\x1b[0m\n`;
    text += `  ${'─'.repeat(75)}\n`;
    for (const m of data.models) {
      const priceStr = m.promptPricePer1M === 0 ? 'FREE' : `$${m.promptPricePer1M}/$${m.completionPricePer1M}`;
      const best = m.bestFor.map((b) => `[${b.toUpperCase()}]`).join(' ');
      text += `  ${m.id.padEnd(32)} ${String(m.codingElo).padEnd(6)} ${priceStr.padEnd(16)} \x1b[1;32m${String(m.paretoScore).padEnd(8)}\x1b[0m ${best}\n`;
    }
    text += `\nType 'radar refresh' to fetch live metadata from OpenRouter.`;
    return { output: text };
  }

  if (lower.startsWith('escalate') || lower.startsWith('/escalate')) {
    const parts = line.replace(/^\/?escalate\s*/i, '').trim().split(/\s+/).filter(Boolean);
    let target = parts[0] as any;
    const cfg = loadConfig(session.projectRoot);

    if (!target && isInteractive) {
      const prompter = facilitator.getPrompter();
      target = await prompter.select(
        'Select escalation policy',
        ['auto', 'local_only', 'prompt', 'sota'],
        cfg.escalation?.policy || 'auto'
      );
    }

    if (['auto', 'local_only', 'prompt', 'sota'].includes(target)) {
      saveConfig(session.projectRoot, {
        escalation: {
          ...cfg.escalation,
          policy: target
        }
      });
      return { output: `✔ Escalation policy updated to: \x1b[1;32m${target}\x1b[0m` };
    }
    return {
      output: `Current Escalation Policy: \x1b[1;33m${cfg.escalation?.policy || 'auto'}\x1b[0m\nUsage: /escalate [auto | local_only | prompt | sota]`
    };
  }

  if (lower === '/design') {
    session.actor.setMode('design');
    return { output: 'Switched mode to [DESIGN] (Reasoning & Architecture)', newMode: 'design' };
  }
  if (lower === '/dev') {
    session.actor.setMode('dev');
    return { output: 'Switched mode to [DEV] (Implementation & Patching)', newMode: 'dev' };
  }
  if (lower === '/triage') {
    session.actor.setMode('triage');
    return { output: 'Switched mode to [TRIAGE] (Diagnostics & Test Triage)', newMode: 'triage' };
  }
  if (lower === '/product') {
    session.actor.setMode('product');
    return { output: 'Switched mode to [PRODUCT] (Roadmap & Story Grooming)', newMode: 'product' };
  }

  // 2. Deterministic Fast-Paths (<5ms, 0 tokens)
  if (lower === 'status') {
    const gitStatus = await registry.execute('get_git_status', {}, ctx);
    const claims = await session.store.getActiveClaims();
    let text = `[Git]: Branch '${gitStatus.branch || 'unknown'}' (${gitStatus.clean ? 'Clean' : `${gitStatus.totalChanges} uncommitted changes`})\n`;
    text += `[Active Leases]: ${claims.length === 0 ? 'None' : claims.map(c => `${c.ticketId} (${c.claim.agentId})`).join(', ')}`;
    return { output: text };
  }

  if (lower === 'next') {
    const nextTask = await registry.execute('recommend_next_task', {}, ctx);
    if (!nextTask.ticket) return { output: 'No pending tasks found. All tickets clean!' };
    return {
      output: `Recommended Task: [${nextTask.ticket.id}] ${nextTask.ticket.title} (${nextTask.ticket.lane})\nReason: ${nextTask.reason}`
    };
  }

  if (lower === 'claim' || lower.startsWith('claim ')) {
    const rawTokens = line.replace(/^claim\s*/i, '').trim().split(/\s+/).filter(Boolean);
    const rawArgs: Record<string, any> = {};
    if (rawTokens[0]) rawArgs.ticketId = rawTokens[0];
    if (rawTokens[1]) rawArgs.agentId = rawTokens[1];
    if (rawTokens[2]) rawArgs.durationMinutes = rawTokens[2];

    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'claim',
          description: 'Atomically lease a ticket',
          inputs: {
            ticketId: {
              type: 'string',
              required: true,
              description: 'Ticket ID to claim (e.g. TKT-1)',
              choices: async () => {
                try {
                  const tickets = await session.store.listEntities(Ticket.dcr);
                  return tickets.map((t: any) => t.id);
                } catch {
                  return [];
                }
              }
            },
            agentId: {
              type: 'string',
              default: 'human-operator',
              description: 'Agent ID leasing the ticket'
            },
            durationMinutes: {
              type: 'number',
              default: 30,
              description: 'Lease duration in minutes'
            }
          }
        },
        rawArgs,
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: claim <ticketId> [agent] [minutes]' };
    }

    const res = await registry.execute(
      'claim_ticket',
      {
        ticketId: args.ticketId,
        agentId: args.agentId || 'human-operator',
        durationMinutes: args.durationMinutes || 30
      },
      ctx
    );
    if (res.success) return { output: `Claimed ticket ${args.ticketId} for ${args.durationMinutes}m by '${args.agentId}'.` };
    return { output: `Failed to claim: ${res.message}` };
  }

  if (lower === 'release' || lower.startsWith('release ')) {
    const ticketId = line.replace(/^release\s*/i, '').trim();
    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'release',
          description: 'Release active ticket lease',
          inputs: {
            ticketId: {
              type: 'string',
              required: true,
              description: 'Ticket ID to release',
              choices: async () => {
                try {
                  const claims = await session.store.getActiveClaims();
                  return claims.map((c: any) => c.ticketId);
                } catch {
                  return [];
                }
              }
            }
          }
        },
        ticketId ? { ticketId } : {},
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: release <ticketId>' };
    }

    const res = await registry.execute('release_ticket', { ticketId: args.ticketId }, ctx);
    return { output: res.success ? `Released ticket ${args.ticketId}.` : `Ticket '${args.ticketId}' not found or lease inactive.` };
  }

  if (lower === 'create' || lower === 'new' || lower.startsWith('create ') || lower.startsWith('new ')) {
    const title = line.replace(/^(create|new)\s*/i, '').trim();
    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'create',
          description: 'Create a new ticket in Todo lane',
          inputs: {
            title: {
              type: 'string',
              required: true,
              description: 'Ticket title'
            }
          }
        },
        title ? { title } : {},
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: create <title>' };
    }

    if (!args.title) return { output: 'Usage: create <title>' };
    const res = await registry.execute('create_ticket', { title: args.title, lane: 'Todo' }, ctx);
    await exportProjections(session.store, session.projectRoot);
    return { output: `Created ticket '${res.id}' in lane '${res.lane}' and synced Kanban.` };
  }

  if (lower === 'done' || lower.startsWith('done ')) {
    const ticketId = line.replace(/^done\s*/i, '').trim();
    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'done',
          description: 'Mark ticket as Done, release lease, and sync Kanban',
          inputs: {
            ticketId: {
              type: 'string',
              required: true,
              description: 'Ticket ID to mark Done',
              choices: async () => {
                try {
                  const tickets = await session.store.listEntities(Ticket.dcr);
                  return tickets.filter((t: any) => t.lane !== 'Done').map((t: any) => t.id);
                } catch {
                  return [];
                }
              }
            }
          }
        },
        ticketId ? { ticketId } : {},
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: done <ticketId>' };
    }

    await registry.execute('update_ticket_state', { ticketId: args.ticketId, lane: 'Done' }, ctx);
    await registry.execute('release_ticket', { ticketId: args.ticketId }, ctx);
    await exportProjections(session.store, session.projectRoot);
    return { output: `Marked ticket '${args.ticketId}' as Done and synced Kanban.` };
  }

  if (lower === 'move' || lower.startsWith('move ')) {
    const parts = line.replace(/^move\s*/i, '').trim().split(/\s+/).filter(Boolean);
    const rawArgs: Record<string, any> = {};
    if (parts[0]) rawArgs.ticketId = parts[0];
    if (parts.length > 1) rawArgs.lane = parts.slice(1).join(' ');

    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'move',
          description: 'Move ticket to lane',
          inputs: {
            ticketId: {
              type: 'string',
              required: true,
              description: 'Ticket ID to move (e.g. TKT-1)',
              choices: async () => {
                try {
                  const tickets = await session.store.listEntities(Ticket.dcr);
                  return tickets.map((t: any) => t.id);
                } catch {
                  return [];
                }
              }
            },
            lane: {
              type: 'string',
              required: true,
              description: 'Target lane',
              choices: ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']
            }
          }
        },
        rawArgs,
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: move <ticketId> <Backlog|Todo|"In Progress"|Done|Blocked>' };
    }

    if (!args.ticketId || !args.lane) {
      return { output: 'Usage: move <ticketId> <Backlog|Todo|"In Progress"|Done|Blocked>' };
    }

    await registry.execute('update_ticket_state', { ticketId: args.ticketId, lane: args.lane }, ctx);
    await exportProjections(session.store, session.projectRoot);
    return { output: `Moved ticket '${args.ticketId}' to '${args.lane}'.` };
  }

  if (lower.startsWith('tickets') || lower === 'list') {
    const parts = line.split(/\s+/);
    const lane = parts[1] as any;
    const tickets = await registry.execute('list_tickets', { lane }, ctx);
    if (tickets.length === 0) return { output: `No tickets found${lane ? ` in lane '${lane}'` : ''}.` };
    return {
      output: tickets.map((t: any) => `[${t.lane}] ${t.id}: ${t.title}${t.claim ? ` (Claimed: ${t.claim.agentId})` : ''}`).join('\n')
    };
  }

  if (lower === 'sync') {
    const imp = await importProjections(session.store, session.projectRoot);
    const exp = await exportProjections(session.store, session.projectRoot);
    return { output: `Reconciled ${imp.importedChanges} disk change(s). Exported ${exp.exportedFiles.length} projection(s): ${exp.exportedFiles.join(', ')}.` };
  }

  if (lower === 'diff') {
    const diff = await registry.execute('get_git_diff', {}, ctx);
    return { output: diff.diff ? diff.diff.trim() : 'Working tree is clean. No uncommitted changes.' };
  }

  if (lower === 'symbol' || lower.startsWith('symbol ')) {
    const name = line.replace(/^symbol\s*/i, '').trim();
    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'symbol',
          description: 'Find symbol in AST+ semantic graph',
          inputs: {
            name: {
              type: 'string',
              required: true,
              description: 'Symbol name to find'
            }
          }
        },
        name ? { name } : {},
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: symbol <name>' };
    }

    const symbols = await registry.execute('find_symbol', { name: args.name }, ctx);
    if (symbols.length === 0) return { output: `No symbol found matching '${args.name}'.` };
    return {
      output: symbols.map((s: any) => `[${s.kind}] ${s.name} -> ${s.filePath}:${s.line || 1}${s.exported ? ' (exported)' : ''}`).join('\n')
    };
  }

  if (lower === 'slice' || lower.startsWith('slice ')) {
    const parts = line.replace(/^slice\s*/i, '').trim().split(/\s+/).filter(Boolean);
    const rawArgs: Record<string, any> = {};
    if (parts[0]) rawArgs.filePath = parts[0];
    if (parts[1]) rawArgs.symbolName = parts[1];

    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'slice',
          description: 'Slice and extract source code of a symbol',
          inputs: {
            filePath: {
              type: 'string',
              required: true,
              description: 'File path containing symbol'
            },
            symbolName: {
              type: 'string',
              required: true,
              description: 'Symbol name to extract'
            }
          }
        },
        rawArgs,
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: slice <filePath> <symbolName>' };
    }

    const slice = await registry.execute('get_symbol_source', { filePath: args.filePath, symbolName: args.symbolName }, ctx);
    if (!slice.code) return { output: `Symbol '${args.symbolName}' not found in ${args.filePath}.` };
    return { output: `// ${args.filePath}:${slice.startLine}-${slice.endLine}\n${slice.code}` };
  }

  if (lower === 'outline' || lower.startsWith('outline ')) {
    const filePath = line.replace(/^outline\s*/i, '').trim();
    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'outline',
          description: 'Display AST symbol outline for a file',
          inputs: {
            filePath: {
              type: 'string',
              required: true,
              description: 'File path to outline'
            }
          }
        },
        filePath ? { filePath } : {},
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: outline <filePath>' };
    }

    const outline = await registry.execute('get_file_outline', { filePath: args.filePath }, ctx);
    if (outline.symbols.length === 0) return { output: `No symbols indexed for ${args.filePath}.` };
    return {
      output: `${args.filePath} (${outline.symbolCount} symbols):\n` +
        outline.symbols.map((s: any) => `  - Line ${(s.line || 1).toString().padEnd(4)} [${s.kind}] ${s.name}`).join('\n')
    };
  }

  if (lower === 'blast' || lower.startsWith('blast ')) {
    const target = line.replace(/^blast\s*/i, '').trim();
    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'blast',
          description: 'Analyze blast radius of file or symbol',
          inputs: {
            target: {
              type: 'string',
              required: true,
              description: 'File path or symbol name to analyze'
            }
          }
        },
        target ? { target } : {},
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: blast <target>' };
    }

    const blast = await registry.execute('analyze_blast_radius', { target: args.target }, ctx);
    let out = `Blast Radius for '${args.target}':\n`;
    out += `  Affected Files (${blast.affectedFiles.length}): ${blast.affectedFiles.join(', ') || 'None'}\n`;
    out += `  Recommended Tests (${blast.recommendedTests.length}): ${blast.recommendedTests.join(', ') || 'None'}\n`;
    out += `  Dependent Tickets (${blast.dependentTickets.length}): ${blast.dependentTickets.join(', ') || 'None'}`;
    return { output: out };
  }

  if (lower === 'index') {
    const res = await indexCodebase(session.store, session.projectRoot);
    return { output: `Indexed ${res.filesCount} file(s), ${res.symbolsCount} symbol(s), ${res.notesCount} note(s).` };
  }

  if (lower === 'doctor') {
    const report = await runDiagnostics(session.store, session.projectRoot);
    return { output: formatDiagnosticReport(report) };
  }

  if (lower === 'audit') {
    const tickets = await registry.execute('list_tickets', {}, ctx);
    const blocked = tickets.filter((t: any) => t.lane === 'Blocked');
    const git = await registry.execute('get_git_status', {}, ctx);

    let violations = 0;
    let out = '🔍 AI-Workflow Audit:\n';
    if (blocked.length > 0) {
      out += `  ⚠️  ${blocked.length} blocked ticket(s): ${blocked.map((t: any) => t.id).join(', ')}\n`;
      violations += blocked.length;
    }
    if (!git.clean) {
      out += `  ⚠️  ${git.totalChanges} uncommitted git change(s).\n`;
    }
    out += `  ✨ Graph Health: ${violations === 0 ? '100% HEALTHY' : `${violations} issue(s) flagged`}`;
    return { output: out };
  }

  if (lower === 'metrics') {
    const tickets = await registry.execute('list_tickets', {}, ctx);
    const lanes: Record<string, number> = {};
    for (const t of tickets) lanes[(t as any).lane] = (lanes[(t as any).lane] || 0) + 1;

    let out = '📊 AI-Workflow Project Metrics:\nKanban Lanes:\n';
    for (const [lane, count] of Object.entries(lanes)) {
      out += `  - ${lane.padEnd(14)}: ${count}\n`;
    }
    const hotspots = await registry.execute('get_git_hotspots', { days: 14 }, ctx);
    if (hotspots.hotspots.length > 0) {
      out += '\nTop Git Churn Hotspots (14 days):\n';
      for (const h of hotspots.hotspots.slice(0, 5)) {
        out += `  - ${h.file} (${h.changes} touches)\n`;
      }
    }
    return { output: out.trim() };
  }

  if (lower.startsWith('config')) {
    const parts = line.slice(6).trim().split(/\s+/);
    const action = parts[0] || 'get';
    if (action === 'get') {
      const cfg = loadConfig(session.projectRoot);
      const key = parts[1];
      if (key) return { output: `${key} = ${(cfg as any)[key] ?? 'undefined'}` };
      return { output: JSON.stringify(cfg, null, 2) };
    }
    if (action === 'set') {
      const key = parts[1];
      const val = parts[2];
      if (!key || val === undefined) return { output: 'Usage: config set <key> <value>' };
      let parsedVal: any = val;
      if (val === 'true') parsedVal = true;
      else if (val === 'false') parsedVal = false;
      else if (!isNaN(Number(val))) parsedVal = Number(val);

      const updated = saveConfig(session.projectRoot, { [key]: parsedVal });
      return { output: `Updated config: ${key} = ${(updated as any)[key]}` };
    }
    return { output: 'Usage: config [get|set] [key] [value]' };
  }

  if (lower.startsWith('eval ')) {
    const code = line.slice(5).trim();
    const res = await registry.execute('script_eval', { code }, ctx);
    return {
      output: res.success ? JSON.stringify(res.result, null, 2) : `Script Error: ${res.error}`
    };
  }

  // 3. Autonomous Cognitive Fallback
  const result = await session.actor.execute(line);
  let prefix = `[${result.mode.toUpperCase()}]`;
  if (result.escalated) {
    prefix += ` \x1b[35m[Escalated ➜ ${result.targetModel}]\x1b[0m`;
  }
  return {
    output: `${prefix} ${result.answer}`
  };
}

export function shellCompleter(line: string): [string[], string] {
  const hits = SHELL_COMMANDS.filter((c) => c.startsWith(line));
  return [hits.length ? hits : SHELL_COMMANDS, line];
}

export function getTicketIdsSync(store: WorkflowStore): string[] {
  try {
    const rows = store.db.query('SELECT _id FROM aiwf_Ticket').all() as { _id: string }[];
    return rows.map((r) => r._id.replace(/^aiwf_Ticket_/, ''));
  } catch {
    return [];
  }
}

export function buildSmartCompleter(session: ShellSession): SmartCompleter {
  const completer = new SmartCompleter({
    builtins: SHELL_COMMANDS,
    subcommands: {
      move: ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'],
      tickets: ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'],
      escalate: ['auto', 'local_only', 'prompt', 'sota'],
      '/escalate': ['auto', 'local_only', 'prompt', 'sota'],
      config: ['get', 'set'],
      radar: ['refresh'],
      '/radar': ['refresh']
    }
  });

  // Dynamic ticket and lane completion provider
  completer.addCustomCompleter((line, cursorPos) => {
    const beforeCursor = line.slice(0, cursorPos);
    const trimmedStart = beforeCursor.trimStart();
    if (!trimmedStart) return null;

    const endsWithSpace = beforeCursor.endsWith(' ');
    const tokens = trimmedStart.trim().split(/\s+/).filter(Boolean);
    const verb = tokens[0]?.toLowerCase();

    if (['claim', 'release', 'done'].includes(verb)) {
      if ((tokens.length === 1 && endsWithSpace) || (tokens.length === 2 && !endsWithSpace)) {
        const prefix = endsWithSpace ? '' : tokens[1];
        const ticketIds = getTicketIdsSync(session.store);
        const matches = ticketIds.filter((id: string) => id.startsWith(prefix));
        if (matches.length > 0) {
          return {
            completions: matches,
            prefix,
            startIndex: beforeCursor.length - prefix.length,
            endIndex: cursorPos
          };
        }
      }
    }

    if (verb === 'move') {
      if ((tokens.length === 1 && endsWithSpace) || (tokens.length === 2 && !endsWithSpace)) {
        const prefix = endsWithSpace ? '' : tokens[1];
        const ticketIds = getTicketIdsSync(session.store);
        const matches = ticketIds.filter((id: string) => id.startsWith(prefix));
        if (matches.length > 0) {
          return {
            completions: matches,
            prefix,
            startIndex: beforeCursor.length - prefix.length,
            endIndex: cursorPos
          };
        }
      }

      if ((tokens.length === 2 && endsWithSpace) || (tokens.length >= 3 && !endsWithSpace)) {
        const laneTokens = endsWithSpace ? [] : tokens.slice(2);
        const prefix = laneTokens.join(' ');
        const lanes = ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'];
        const matches = lanes.filter((l) => l.toLowerCase().startsWith(prefix.toLowerCase()));
        if (matches.length > 0) {
          return {
            completions: matches,
            prefix,
            startIndex: beforeCursor.length - prefix.length,
            endIndex: cursorPos
          };
        }
      }
    }

    return null;
  });

  return completer;
}

export async function startShell(options: {
  store?: WorkflowStore;
  projectRoot?: string;
  actor?: WorkflowActor;
} = {}) {
  const root = options.projectRoot || findProjectRoot().root;
  const store = options.store || new WorkflowStore(root);
  initializeTools();

  const actor = options.actor || new WorkflowActor({
    store,
    projectRoot: root,
    preferLocal: true
  });

  const tty = new TtyInputReader();
  const prompter = new InteractivePrompter(tty);
  const facilitator = new ParameterFacilitator(prompter);

  const session: ShellSession = {
    store,
    actor,
    projectRoot: root,
    prompter,
    facilitator,
    interactive: tty.getIsTty()
  };

  const completer = buildSmartCompleter(session);

  console.log(`\x1b[1;36m🏛️  AI-Workflow 2.0 Shell (Bun-First Context OS)\x1b[0m`);
  console.log(`Type 'help' for commands or write any instruction. Tab completion active.\n`);

  const historyDir = path.join(os.homedir(), '.local', 'share', 'ai-workflow');
  const historyFile = path.join(historyDir, 'history');
  let history: string[] = [];
  try {
    if (fs.existsSync(historyFile)) {
      history = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(-1000);
    }
  } catch {}

  while (true) {
    const promptStr = `aiwf [${session.actor.mode.toUpperCase()}] > `;
    const line = await tty.readLine(promptStr, {
      completer,
      history,
      cwd: session.projectRoot
    });

    if (line === null) {
      // EOF
      break;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Record history
    if (history[history.length - 1] !== trimmed) {
      history.push(trimmed);
      try {
        if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
        fs.appendFileSync(historyFile, trimmed + '\n', 'utf8');
      } catch {}
    }

    try {
      const res = await processShellInput(trimmed, session);
      if (res.output) console.log(res.output);
      if (res.exit) {
        break;
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  }
}

if (import.meta.main) {
  startShell();
}
