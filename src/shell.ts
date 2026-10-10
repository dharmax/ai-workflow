/**
 * Responsibility: Interactive Terminal REPL & Shell Bridge.
 * Scope: Dual-nature REPL supporting deterministic fast-path commands (<5ms),
 * mode switching ([DESIGN], [DEV], [TRIAGE], [PRODUCT]), and autonomous LLM wish execution.
 * Powered by @dharmax/shell-ui for raw TTY editing, smart completions, and interactive facilitation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { queryPerformance, performanceQueryArgs } from './performance-metrics.ts';
import { artifactCommand, ARTIFACT_HELP } from './artifact-command.ts';
import os from 'node:os';
import {formatShellTrace, saveShellTrace, openShellTrace, type ShellTrace} from './shell-trace.ts';
import type {ActorStepRecord} from '@dharmax/llm-utils';
import {
  TtyInputReader,
  SmartCompleter,
  InteractivePrompter,
  ParameterFacilitator,
  TerminalFormatter,
  ProcessViewport,
  type UiRenderer,
  type CommandSchema
} from '@dharmax/shell-ui';
import { WorkflowStore, findProjectRoot } from './graph/store.ts';
import { Ticket } from './graph/ontology.ts';
import { initializeTools, registry, type ToolContext } from './tools/index.ts';
import { WorkflowActor, type ShellMode, MODE_CONFIGS } from './actor/engine.ts';
import { exportProjections, importProjections } from './graph/projections.ts';
import { indexCodebase, ensureAstFresh } from './graph/indexer.ts';
import { runDiagnostics, formatDiagnosticReport } from './doctor.ts';
import { loadConfig, saveConfig } from './config.ts';
import {runConfigCommand, formatConfigResult, configView} from './config-command.ts';
import {runSetupCommand, formatSetupResult, setupView} from './setup-command.ts';
import { buildEntityView, resolveEntityViewKind, saveEntityView, type EntityViewKind } from './entity-view.ts';

export interface ShellSession {
  store: WorkflowStore;
  actor: WorkflowActor;
  projectRoot: string;
  prompter?: InteractivePrompter;
  facilitator?: ParameterFacilitator;
  interactive?: boolean;
  viewport?: ProcessViewport<ActorStepRecord & {elapsedMs?: number}>;
  trace?: ShellTrace;
  renderer?: UiRenderer;
  /** Undefined means semantic auto-mode; set by standalone /design|/dev|/triage|/product. */
  modeOverride?: ShellMode;
}

async function presentEntityView(
  session: ShellSession,
  ctx: ToolContext,
  kind: EntityViewKind,
  id: string,
  mode: 'readonly' | 'edit',
): Promise<string | null> {
  if (!session.renderer) return null
  const result = await session.renderer.view(await buildEntityView(ctx, kind, id, mode))
  if (result.status === 'unavailable') return null
  if (result.status === 'submitted') {
    await saveEntityView(ctx, kind, id, result.values)
    await exportProjections(session.store, session.projectRoot)
    return `Saved ${kind} '${id}'.`
  }
  return ''
}

export const SHELL_COMMANDS = [
  'resolve', 'prepare', 'investigate', 'process', 'completeness',
  'resolve_ticket', 'prepare_ticket', 'investigate_ticket', 'process_epic', 'process_feature', 'process_story',
  'status',
  'next',
  'claim',
  'release',
  'create',
  'new',
  'done',
  'move',
  'tickets',
  'ticket',
  'edit',
  'epics',
  'epic',
  'epic-create',
  'epic-add',
  'features',
  'feature',
  'stories',
  'story',
  'aspect',
  'coverage',
  'impact',
  'sync',
  'diff',
  'symbol',
  'rename',
  'refactor',
  'change',
  'graph',
  'callers',
  'deps',
  'slice',
  'outline',
  'blast',
  'index',
  'doctor',
  'audit',
  'metrics',
  'trace',
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
  '/auto',
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

  const facilitator = session.facilitator || new ParameterFacilitator(session.renderer || session.prompter);
  const isInteractive = session.interactive ?? (session.prompter ? session.prompter.getIsTty() : false);

  // 1. Session Control & Mode Switching
  if (lower === 'exit' || lower === 'quit' || lower === '/exit') {
    return { output: 'Goodbye!', exit: true };
  }

  if (lower === '/help' || lower === 'help') {
    return {
      output: `
\x1b[1;36m🏛️  AI-Workflow 2.0 Terminal REPL\x1b[0m

${ARTIFACT_HELP}

Drill-down and project commands:
  status                     - Working tree git status & active ticket leases
  next                       - Algorithmic recommendation for next task
  claim <ticketId> [agent]   - Atomically lease a ticket (default 30m)
  release <ticketId>         - Release active ticket lease
  done <ticketId>            - Mark ticket as Done, release lease, and sync Kanban
  move <ticketId> <lane>     - Move ticket to lane (Backlog|Todo|In Progress|Done|Blocked)
  create <title>             - Create ticket in Todo lane
  tickets [lane]             - List Kanban tickets (Backlog|Todo|In Progress|Done|Blocked)
  ticket <ticketId>           - Open ticket View (interactive shell)
  edit <entityId>             - Open Ticket/Epic/Feature/Story/Aspect directly in edit mode
  epics [status]             - List epics in the Product Intent Graph
  epic <epicId>              - Show epic details, targeted features/stories, and tickets
  epic-create <title>        - Create Epic with semantic decomposition and proposal review
  features [status]          - List features in the Product Intent Graph
  feature <featureId>        - Show feature details, containing stories, and tickets
  stories [status]           - List user stories in the Product Intent Graph
  story <storyId>            - Show story details, containing feature, tickets, tests
  aspect <aspectId>           - Open Aspect View (interactive shell)
  coverage <entityId>        - Show structural and causal coverage for an Epic, Feature, or Story
  impact <entityId>          - Show bounded product impact and code anchors
  sync                       - Bi-directional sync between SQLite Graph and Markdown
  diff                       - Display uncommitted git diff
  symbol <name>              - Find symbol in AST+ semantic graph (supports --exact, --kind)
  graph [query]              - Search/traverse AST+ knowledge graph entities & relations
  callers <symbol>           - Find all call sites invoking a symbol
  deps <fileOrModule>        - List static dependencies and imports for a target
  slice <file> <symbol>      - Slice and extract source code of a symbol
  outline <file>             - Display AST symbol outline for a file
  blast <target>             - Analyze blast radius of file or symbol
  index                      - Re-index codebase AST symbols and modules into graph
  doctor                     - Run comprehensive environment & graph diagnostics
  audit                      - Run architecture & graph integrity audit
  metrics [--operation ...]  - Query persisted performance metrics (--ticket, --since, --tag)
  trace [on|off|show|open]   - Show the last execution; open a scrollable floating view (Alt+O)
  config [get|set key val]   - View or update settings (.ai-workflow/config.json)
  eval <js-code>             - On-the-fly JavaScript evaluation
  model (or /model)          - Show gateway, provider keys, and mode model assignments
  radar [refresh]            - View SOTA model benchmark rankings & Pareto scores
  escalate [policy]          - View or toggle escalation policy (auto|local_only|prompt|sota)
  /design                    - Switch mode to [DESIGN] (Architecture & ADRs)
  /dev                       - Switch mode to [DEV] (Code authoring & patching)
  /triage                    - Switch mode to [TRIAGE] (Diagnostics & Test Triage)
  /product                   - Lock mode to [PRODUCT] (Roadmap & Story Grooming)
  /auto                      - Return to semantic automatic mode selection
  exit                       - Exit shell
  <any natural instruction>  - Autonomous cognitive execution via Workflow Actor
`
    };
  }

  if (lower === 'model' || lower === '/model' || lower.startsWith('model ') || lower.startsWith('/model ')) {
    const parts = line.replace(/^\/?model\s*/i, '').trim().split(/\s+/).filter(Boolean);
    const cfg = loadConfig(session.projectRoot);

    if (parts[0] === 'set' && parts[1] && parts[2]) {
      const mode = parts[1].toLowerCase();
      const modelTarget = parts[2];
      const updatedRoutes = { ...(cfg.modelRoutes || {}), [mode]: modelTarget };
      saveConfig(session.projectRoot, { modelRoutes: updatedRoutes });
      session.actor.reloadConfig();
      return { output: `\x1b[1;32m✔ Set model for [${mode.toUpperCase()}] to: ${modelTarget}\x1b[0m` };
    }

    const providers = session.actor.getConfiguredProviders();
    const recs = session.actor.radar.getRecommendations();
    let text = `\x1b[1;36m🤖 AI-Workflow Model & Gateway Configuration\x1b[0m\n`;
    text += `Active Gateway:     \x1b[1m${cfg.gateway}\x1b[0m\n`;
    text += `Available Providers: ${providers.map((p) => `\x1b[32m${p}\x1b[0m`).join(', ')}\n`;
    text += `Escalation Policy:   \x1b[1;33m${cfg.escalation?.policy || 'auto'}\x1b[0m (Blast threshold: ${cfg.escalation?.blastRadiusThreshold ?? 3})\n\n`;
    text += `\x1b[1mMode Routing:\x1b[0m\n`;
    const modes = ['design', 'dev', 'triage', 'product'] as const;
    for (const m of modes) {
      const effective = session.actor.getEffectiveRoute(m)?.target || 'unknown';
      const rec = recs[m];
      const override = cfg.modelRoutes?.[m] ? ` (Override: ${cfg.modelRoutes[m]})` : '';
      text += `  [${m.toUpperCase().padEnd(7)}] Effective: \x1b[1;32m${effective.padEnd(32)}\x1b[0m | Local: ${cfg.model} | Cloud: ${rec}${override}\n`;
    }
    const lastCall = session.actor.getLastExecutionMetrics();
    if (lastCall) {
      text += `\n\x1b[1mLast Execution:\x1b[0m ${lastCall.providerId}/${lastCall.modelId} (${lastCall.latencyMs}ms, ${lastCall.totalTokens} tokens, success: ${lastCall.success})\n`;
    }
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
      const values = await facilitator.facilitate({
        policy: {
          type: 'string',
          description: 'Select escalation policy',
          choices: ['auto', 'local_only', 'prompt', 'sota'],
          required: true
        }
      }, {}, {interactive: true});
      target = values.policy;
    }

    if (['auto', 'local_only', 'prompt', 'sota'].includes(target)) {
      saveConfig(session.projectRoot, {
        escalation: {
          ...cfg.escalation,
          policy: target
        }
      });
      session.actor.reloadConfig();
      return { output: `✔ Escalation policy updated to: \x1b[1;32m${target}\x1b[0m` };
    }
    return {
      output: `Current Escalation Policy: \x1b[1;33m${cfg.escalation?.policy || 'auto'}\x1b[0m\nUsage: /escalate [auto | local_only | prompt | sota]`
    };
  }

  if (lower === '/design') {
    session.modeOverride = 'design';
    session.actor.setMode('design');
    return { output: 'Locked mode to [DESIGN] (Reasoning & Architecture)', newMode: 'design' };
  }
  if (lower === '/dev') {
    session.modeOverride = 'dev';
    session.actor.setMode('dev');
    return { output: 'Locked mode to [DEV] (Implementation & Patching)', newMode: 'dev' };
  }
  if (lower === '/triage') {
    session.modeOverride = 'triage';
    session.actor.setMode('triage');
    return { output: 'Locked mode to [TRIAGE] (Diagnostics & Test Triage)', newMode: 'triage' };
  }
  if (lower === '/product') {
    session.modeOverride = 'product';
    session.actor.setMode('product');
    return { output: 'Locked mode to [PRODUCT] (Roadmap & Story Grooming)', newMode: 'product' };
  }
  if (lower === '/auto') {
    session.modeOverride = undefined;
    return { output: 'Switched to [AUTO] semantic mode selection.' };
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

  if (lower === 'edit' || lower.startsWith('edit ')) {
    const entityId = line.replace(/^edit\s*/i, '').trim();
    if (!entityId) return { output: 'Usage: edit <entityId>' };
    try {
      const kind = await resolveEntityViewKind(ctx, entityId);
      const rendered = await presentEntityView(session, ctx, kind, entityId, 'edit');
      return { output: rendered ?? 'Interactive View unavailable.' };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
  }

  if (lower === 'ticket' || lower.startsWith('ticket ')) {
    const ticketId = line.replace(/^ticket\s*/i, '').trim();
    if (!ticketId) return { output: 'Usage: ticket <ticketId>' };
    try {
      const rendered = await presentEntityView(session, ctx, 'ticket', ticketId, 'readonly');
      if (rendered !== null) return { output: rendered };
      const ticket = await session.store.getEntity<Ticket>(ticketId, Ticket.dcr) as any;
      if (!ticket) return { output: `Ticket '${ticketId}' not found.` };
      return {
        output: [
          `${ticketId}: ${ticket.title || ''}`,
          `Lane:     ${ticket.lane || ''}`,
          `Priority: ${ticket.priority || ''}`,
          `Status:   ${ticket.status || ''}`,
          ticket.body ? `Body:     ${ticket.body}` : null,
          ticket.acceptanceCriteria?.length
            ? `Criteria:\n${ticket.acceptanceCriteria.map((item: string) => `  - ${item}`).join('\n')}`
            : null
        ].filter(Boolean).join('\n')
      };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
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

  if (lower === 'epics' || lower.startsWith('epics ')) {
    const status = line.split(/\s+/)[1] as any;
    const epics = await registry.execute('list_epics', { status }, ctx);
    if (epics.length === 0) return { output: 'No epics found.' };
    return {
      output: epics.map((e: any) => `[${e.status}] ${e.id}: ${e.title} (Priority: ${e.priority})`).join('\n')
    };
  }

  if (lower === 'epic' || lower.startsWith('epic ')) {
    const epicId = line.replace(/^epic\s*/i, '').trim();
    if (!epicId) return { output: 'Usage: epic <epicId>' };
    try {
      const rendered = await presentEntityView(session, ctx, 'epic', epicId, 'readonly');
      if (rendered !== null) return { output: rendered };
      const e = await registry.execute('get_epic', { epicId }, ctx);
      return {
        output: [
          `${e.id}: ${e.title}`,
          `Status:   ${e.status}`,
          `Priority: ${e.priority}`,
          e.body ? `Body:     ${e.body}` : null,
          `Features: ${e.targetedFeatures.join(', ') || 'None'}`,
          `Stories:  ${e.targetedStories.join(', ') || 'None'}`,
          `Tickets:  ${e.containedTickets.join(', ') || 'None'}`
        ].filter(Boolean).join('\n')
      };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
  }

  if (lower === 'epic-create' || lower.startsWith('epic-create ') || lower === 'epic-add' || lower.startsWith('epic-add ')) {
    const rest = line.replace(/^(epic-create|epic-add)\s*/i, '').trim();
    const parts = rest.split(/\s+/).filter(Boolean);
    const flags: Record<string, any> = {};
    const positional: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '--no-decompose') {
        flags.noDecompose = true;
      } else if (parts[i] === '--apply') {
        flags.apply = true;
      } else if (parts[i] === '--body' && parts[i + 1]) {
        flags.body = parts[++i];
      } else if (parts[i] === '--priority' && parts[i + 1]) {
        flags.priority = parseInt(parts[++i], 10);
      } else {
        positional.push(parts[i]);
      }
    }

    const title = positional.join(' ');
    let args: any;
    try {
      args = await facilitator.facilitate(
        {
          id: 'epic-create',
          description: 'Create an Epic with semantic decomposition and review',
          inputs: {
            title: {
              type: 'string',
              required: true,
              description: 'Epic title'
            }
          }
        },
        title ? { title } : {},
        { interactive: isInteractive }
      );
    } catch {
      return { output: 'Usage: epic-create "<title>" [--body <description>] [--priority <number>] [--no-decompose] [--apply]' };
    }

    if (!args.title) return { output: 'Usage: epic-create "<title>" [--body <description>] [--priority <number>] [--no-decompose] [--apply]' };

    if (flags.noDecompose) {
      const created = await registry.execute('create_epic', {
        title: args.title,
        body: flags.body,
        priority: flags.priority || 1,
        status: 'planned'
      }, ctx);
      await exportProjections(session.store, session.projectRoot);
      return { output: `Created Epic '${created.id}' without decomposition and synced projections.` };
    }

    const proposal = await registry.execute('propose_epic_structure', {
      title: args.title,
      body: flags.body,
      status: 'planned'
    }, ctx);

    const lines: string[] = [];
    lines.push(`📋 Proposed Epic Structure:`);
    lines.push(`Epic: [${proposal.epic.action.toUpperCase()}] ${proposal.epic.id}: ${proposal.epic.title}`);

    lines.push(`\nFeatures (${proposal.features.length}):`);
    for (const f of proposal.features) {
      lines.push(`  [${f.action.toUpperCase()}] ${f.id}: ${f.title}`);
      if (f.acceptanceCriteria && f.acceptanceCriteria.length > 0) {
        lines.push(`    Criteria: ${f.acceptanceCriteria.join('; ')}`);
      }
    }

    lines.push(`\nUser Stories (${proposal.stories.length}):`);
    for (const s of proposal.stories) {
      lines.push(`  [${s.action.toUpperCase()}] ${s.id} (Feature: ${s.featureId}): ${s.title}`);
      if (s.story) lines.push(`    Outcome: ${s.story}`);
    }

    if (proposal.questions.length > 0) {
      lines.push(`\nQuestions / Ambiguities (${proposal.questions.length}):`);
      for (const q of proposal.questions) {
        lines.push(`  [${q.blocking ? 'BLOCKING ⚠️' : 'INFO'}] ${q.id}: ${q.text}`);
      }
    }

    const hasBlocking = proposal.questions.some((q: any) => q.blocking);
    if (hasBlocking) {
      lines.push(`\n⚠️  Cannot apply proposal automatically: blocking questions require resolution.`);
      return { output: lines.join('\n') };
    }

    let shouldApply = flags.apply;
    if (!shouldApply && session.prompter && isInteractive) {
      const confirmed = await session.prompter.confirm('Apply this structure to graph?', true);
      shouldApply = confirmed;
    }

    if (!shouldApply) {
      lines.push(`\nProposal review complete. (Run with --apply or confirm in interactive prompt to persist to graph.)`);
      return { output: lines.join('\n') };
    }

    const applied = await registry.execute('apply_epic_structure', { proposal }, ctx);
    await exportProjections(session.store, session.projectRoot);
    lines.push(`\n✅ Applied Epic structure to graph and synced projections:`);
    lines.push(`  Epic:     ${applied.epicId}`);
    lines.push(`  Features: ${applied.featureIds.join(', ') || 'None'}`);
    lines.push(`  Stories:  ${applied.storyIds.join(', ') || 'None'}`);

    const cov = await registry.execute('get_product_coverage', { entityId: applied.epicId }, ctx);
    lines.push(`\nStructural Coverage for ${applied.epicId}: ${cov.complete ? 'COMPLETE ✅' : 'IN PROGRESS (gaps present)'}`);
    if (cov.gaps.length > 0) {
      for (const g of cov.gaps) lines.push(`  - [${g.kind}] ${g.message}`);
    }

    return { output: lines.join('\n') };
  }

  if (lower === 'features' || lower.startsWith('features ')) {
    const status = line.split(/\s+/)[1] as any;
    const features = await registry.execute('list_features', { status }, ctx);
    if (features.length === 0) return { output: 'No features found.' };
    return {
      output: features.map((f: any) => `[${f.status}] ${f.id}: ${f.title}`).join('\n')
    };
  }

  if (lower === 'feature' || lower.startsWith('feature ')) {
    const featureId = line.replace(/^feature\s*/i, '').trim();
    if (!featureId) return { output: 'Usage: feature <featureId>' };
    try {
      const rendered = await presentEntityView(session, ctx, 'feature', featureId, 'readonly');
      if (rendered !== null) return { output: rendered };
      const f = await registry.execute('get_feature', { featureId }, ctx);
      return {
        output: [
          `${f.id}: ${f.title}`,
          `Status:   ${f.status}`,
          f.body ? `Body:     ${f.body}` : null,
          `Epics:    ${f.targetingEpics.join(', ') || 'None'}`,
          `Stories:  ${f.containedStories.join(', ') || 'None'}`,
          `Tickets:  ${f.implementingTickets.join(', ') || 'None'}`,
          `Tests:    ${f.verifyingTests.join(', ') || 'None'}`,
          f.acceptanceCriteria.length > 0 ? `Criteria:\n${f.acceptanceCriteria.map((c: string) => `  - ${c}`).join('\n')}` : null
        ].filter(Boolean).join('\n')
      };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
  }

  if (lower === 'stories' || lower.startsWith('stories ')) {
    const status = line.split(/\s+/)[1] as any;
    const stories = await registry.execute('list_user_stories', { status }, ctx);
    if (stories.length === 0) return { output: 'No user stories found.' };
    return {
      output: stories.map((s: any) => `[${s.status}] ${s.id}: ${s.title}`).join('\n')
    };
  }

  if (lower === 'story' || lower.startsWith('story ')) {
    const storyId = line.replace(/^story\s*/i, '').trim();
    if (!storyId) return { output: 'Usage: story <storyId>' };
    try {
      const rendered = await presentEntityView(session, ctx, 'story', storyId, 'readonly');
      if (rendered !== null) return { output: rendered };
      const s = await registry.execute('get_user_story', { storyId }, ctx);
      return {
        output: [
          `${s.id}: ${s.title}`,
          `Status:   ${s.status}`,
          `Actor:    ${s.actor || 'User'}`,
          `Story:    ${s.story || ''}`,
          s.context ? `Context:  ${s.context}` : null,
          s.sla ? `SLA:      ${s.sla}` : null,
          `Features: ${s.containingFeatures.join(', ') || 'None'}`,
          `Epics:    ${s.targetingEpics.join(', ') || 'None'}`,
          `Tickets:  ${s.addressingTickets.join(', ') || 'None'}`,
          `Tests:    ${s.verifyingTests.join(', ') || 'None'}`,
          s.acceptanceCriteria.length > 0 ? `Criteria:\n${s.acceptanceCriteria.map((c: string) => `  - ${c}`).join('\n')}` : null
        ].filter(Boolean).join('\n')
      };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
  }

  if (lower === 'aspect' || lower.startsWith('aspect ')) {
    const aspectId = line.replace(/^aspect\s*/i, '').trim();
    if (!aspectId) return { output: 'Usage: aspect <aspectId>' };
    try {
      const rendered = await presentEntityView(session, ctx, 'aspect', aspectId, 'readonly');
      if (rendered !== null) return { output: rendered };
      const aspect = await registry.execute('get_aspect', { id: aspectId }, ctx);
      return { output: JSON.stringify(aspect, null, 2) };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
  }

  if (lower === 'coverage' || lower.startsWith('coverage ')) {
    const entityId = line.replace(/^coverage\s*/i, '').trim();
    if (!entityId) return { output: 'Usage: coverage <entityId>' };
    try {
      const cov = await registry.execute('get_product_coverage', { entityId }, ctx);
      const lines = [
        `Coverage for ${cov.entityType} '${cov.entityId}':`,
        `  Complete: ${cov.complete ? 'YES ✅' : 'NO ❌'}`
      ];
      if (cov.gaps.length > 0) {
        lines.push('  Gaps:');
        for (const g of cov.gaps) lines.push(`    - [${g.kind}] ${g.message}`);
      }
      lines.push('  Related Entities:');
      lines.push(`    Epics:    ${cov.related.epics.join(', ') || 'None'}`);
      lines.push(`    Features: ${cov.related.features.join(', ') || 'None'}`);
      lines.push(`    Stories:  ${cov.related.stories.join(', ') || 'None'}`);
      lines.push(`    Tickets:  ${cov.related.tickets.join(', ') || 'None'}`);
      lines.push(`    Code:     ${cov.related.code.join(', ') || 'None'}`);
      lines.push(`    Tests:    ${cov.related.tests.join(', ') || 'None'}`);
      return { output: lines.join('\n') };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
  }

  if (lower === 'impact' || lower.startsWith('impact ')) {
    const entityId = line.replace(/^impact\s*/i, '').trim();
    if (!entityId) return { output: 'Usage: impact <entityId>' };
    try {
      const imp = await registry.execute('get_product_impact', { entityId }, ctx);
      return {
        output: [
          `Product Impact for ${imp.entityType} '${imp.entityId}':`,
          `  Epics:        ${imp.epics.join(', ') || 'None'}`,
          `  Features:     ${imp.features.join(', ') || 'None'}`,
          `  Stories:      ${imp.stories.join(', ') || 'None'}`,
          `  Tickets:      ${imp.tickets.join(', ') || 'None'}`,
          `  Code Anchors: ${imp.code.join(', ') || 'None'}`,
          `  Tests:        ${imp.tests.join(', ') || 'None'}`,
          `  Decisions:    ${imp.decisions.join(', ') || 'None'}`,
          `  Blockers:     ${imp.blockers.join(', ') || 'None'}`,
          `  Dependencies: ${imp.dependencies.join(', ') || 'None'}`
        ].join('\n')
      };
    } catch (err: any) {
      return { output: err.message || String(err) };
    }
  }

  if (lower === 'sync') {
    const imp = await importProjections(session.store, session.projectRoot);
    const freshness = await ensureAstFresh(session.store, session.projectRoot);
    const exp = await exportProjections(session.store, session.projectRoot);
    return { output: `Reconciled ${imp.importedChanges} disk change(s). Code index: ${freshness.updatedFiles.length} updated, ${freshness.deletedFiles.length} deleted. Exported ${exp.exportedFiles.length} projection(s): ${exp.exportedFiles.join(', ')}.` };
  }

  if (lower === 'diff') {
    const diff = await registry.execute('get_git_diff', {}, ctx);
    return { output: diff.diff ? diff.diff.trim() : 'Working tree is clean. No uncommitted changes.' };
  }

  if (lower === 'symbol' || lower.startsWith('symbol ')) {
    const raw = line.replace(/^symbol\s*/i, '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    let name = parts[0] && !parts[0].startsWith('-') ? parts[0] : '';
    const exact = parts.includes('--exact') || parts.includes('-e');
    const regex = parts.includes('--regex') || parts.includes('-r');
    let kind: string | undefined;
    const kIdx = parts.indexOf('--kind') !== -1 ? parts.indexOf('--kind') : parts.indexOf('-k');
    if (kIdx !== -1 && parts[kIdx + 1]) kind = parts[kIdx + 1];

    if (!name) {
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
          {},
          { interactive: isInteractive }
        );
        name = args.name;
      } catch {
        return { output: 'Usage: symbol <name>' };
      }
    }

    const symbols = await registry.execute('find_symbol', { name, exact, regex, kind }, ctx);
    if (symbols.length === 0) return { output: `No symbol found matching '${name}'${kind ? ` (kind: ${kind})` : ''}.` };
    return {
      output: symbols.map((s: any) => `[${s.kind}] ${s.fullName || s.name} -> ${s.filePath}:${s.line || 1}${s.exported ? ' (exported)' : ''}${s.signature ? ` // ${s.signature}` : ''}`).join('\n')
    };
  }

  if (lower === 'graph' || lower.startsWith('graph ')) {
    const raw = line.replace(/^graph\s*/i, '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    const query = parts[0] && !parts[0].startsWith('-') ? parts[0] : undefined;

    let entityType: any;
    const tIdx = parts.indexOf('--type') !== -1 ? parts.indexOf('--type') : parts.indexOf('-t');
    if (tIdx !== -1 && parts[tIdx + 1]) entityType = parts[tIdx + 1];

    let predicate: any;
    const pIdx = parts.indexOf('--pred') !== -1 ? parts.indexOf('--pred') : parts.indexOf('-p');
    if (pIdx !== -1 && parts[pIdx + 1]) predicate = parts[pIdx + 1];

    let sourceId: string | undefined;
    const srcIdx = parts.indexOf('--from') !== -1 ? parts.indexOf('--from') : parts.indexOf('--source');
    if (srcIdx !== -1 && parts[srcIdx + 1]) sourceId = parts[srcIdx + 1];

    let targetId: string | undefined;
    const tgtIdx = parts.indexOf('--to') !== -1 ? parts.indexOf('--to') : parts.indexOf('--target');
    if (tgtIdx !== -1 && parts[tgtIdx + 1]) targetId = parts[tgtIdx + 1];

    let maxDepth = 1;
    const dIdx = parts.indexOf('--depth') !== -1 ? parts.indexOf('--depth') : parts.indexOf('-d');
    if (dIdx !== -1 && parts[dIdx + 1]) maxDepth = Number(parts[dIdx + 1]) || 1;

    const res = await registry.execute('search_graph', {
      query,
      entityType,
      predicate,
      sourceId,
      targetId,
      maxDepth
    }, ctx);

    if (res.mode === 'traversal') {
      let out = `Traversal from '${res.startId}' (depth: ${res.depth}, ${res.entitiesCount} entities, ${res.predicatesCount} connections):\nEntities:\n`;
      for (const e of res.entities) out += `  - [${e.type}] ${e.title || e.id} (${e.id})\n`;
      out += `Connections:\n`;
      for (const p of res.predicates) out += `  - ${p.sourceId} --(${p.predicate})--> ${p.targetId}\n`;
      return { output: out.trim() };
    }
    if (res.mode === 'predicate_search') {
      if (res.results.length === 0) return { output: `No connections found for predicate '${res.predicateFilter}'.` };
      return {
        output: res.results.map((p: any) => `${p.sourceId} --(${p.predicate})--> ${p.targetId}`).join('\n')
      };
    }
    if (res.results.length === 0) return { output: `No entities found matching '${res.query}'.` };
    return {
      output: res.results.map((e: any) => `[${e.type}${e.kind ? `:${e.kind}` : ''}] ${e.title || e.id} (${e.id})${e.filePath ? ` -> ${e.filePath}:${e.line || 1}` : ''}`).join('\n')
    };
  }

  if (lower === 'rename' || lower.startsWith('rename ')) {
    const raw = line.replace(/^rename\s*/i, '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return { output: 'Usage: rename <symbolName|filePath> <newName> [--file <path>] [--yes]' };
    }

    const isFileRename = parts[0].includes('/') || parts[0].endsWith('.ts') || parts[0].endsWith('.js');
    const autoApply = parts.includes('--yes') || parts.includes('-y');
    const targetArg = parts[0];
    const newName = parts[1];

    let fileFilter: string | undefined;
    const fIdx = parts.indexOf('--file') !== -1 ? parts.indexOf('--file') : parts.indexOf('-f');
    if (fIdx !== -1 && parts[fIdx + 1]) fileFilter = parts[fIdx + 1];

    const changeReq: any = isFileRename
      ? { action: 'rename_file', oldPath: targetArg, newPath: newName }
      : { action: 'rename_symbol', target: { type: 'symbol', symbolName: targetArg, filePath: fileFilter || '' }, newName };

    try {
      const preview = await registry.execute('preview_change', changeReq, ctx);
      if (preview.blocked) {
        return { output: `❌ Cannot rename: ${preview.blockReason}` };
      }

      const lines: string[] = [];
      lines.push(`🔍 Change Preview (${preview.fingerprint.slice(0, 10)}):`);
      lines.push(`  ${preview.summary}`);
      lines.push(`  Affected files (${preview.affectedFiles.length}): ${preview.affectedFiles.join(', ')}`);

      let confirmed = autoApply;
      if (!confirmed && session.prompter && isInteractive) {
        confirmed = await session.prompter.confirm(`Apply changes across ${preview.affectedFiles.length} file(s)?`, false);
      }

      if (confirmed) {
        const applyRes = await registry.execute('apply_change', { request: changeReq, fingerprint: preview.fingerprint }, ctx);
        if (applyRes.ok) {
          lines.push(`\n✅ Applied successfully. Touched: ${applyRes.filesTouched.join(', ') || 'none'}. Verification: ${applyRes.verification.passed ? 'PASSED' : 'CHECK FAILED'}`);
        } else {
          lines.push(`\n❌ Apply failed: ${applyRes.error}`);
        }
      } else {
        lines.push(`\nOperation cancelled. To apply later, run: apply_change with fingerprint ${preview.fingerprint}`);
      }

      return { output: lines.join('\n') };
    } catch (err: any) {
      return { output: `Rename error: ${err.message || String(err)}` };
    }
  }

  if (lower === 'refactor' || lower.startsWith('refactor ')) {
    const raw = line.replace(/^refactor\s*/i, '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return { output: 'Usage: refactor <kind> <symbolName|filePath:startLine:startChar-endLine:endChar> [options]\nExamples:\n  refactor extract-function src/math.ts:2:2-3:28\n  refactor inline-variable myVar --file src/math.ts\n  refactor move-to-file myFunc --target src/other.ts --file src/math.ts' };
    }

    const kind = parts[0];
    const targetArg = parts[1];
    const autoApply = parts.includes('--yes') || parts.includes('-y');

    let fileFilter: string | undefined;
    const fIdx = parts.indexOf('--file') !== -1 ? parts.indexOf('--file') : parts.indexOf('-f');
    if (fIdx !== -1 && parts[fIdx + 1]) fileFilter = parts[fIdx + 1];

    let targetFileArg: string | undefined;
    const tIdx = parts.indexOf('--target') !== -1 ? parts.indexOf('--target') : parts.indexOf('-t');
    if (tIdx !== -1 && parts[tIdx + 1]) targetFileArg = parts[tIdx + 1];

    let targetObj: any;
    const rangeMatch = targetArg.match(/^([^:]+):(\d+):(\d+)-(\d+):(\d+)$/);
    if (rangeMatch) {
      targetObj = {
        type: 'range',
        filePath: rangeMatch[1],
        startLine: parseInt(rangeMatch[2], 10),
        startCharacter: parseInt(rangeMatch[3], 10),
        endLine: parseInt(rangeMatch[4], 10),
        endCharacter: parseInt(rangeMatch[5], 10)
      };
    } else {
      targetObj = {
        type: 'symbol',
        symbolName: targetArg,
        filePath: fileFilter || ''
      };
    }

    const changeReq: any = {
      action: 'refactor',
      target: targetObj,
      refactorKind: kind,
      arguments: targetFileArg ? { targetFile: targetFileArg } : undefined
    };

    try {
      const preview = await registry.execute('preview_change', changeReq, ctx);
      if (preview.blocked) {
        if (preview.requiredArguments && preview.requiredArguments.length > 0) {
          return { output: `⚠️  Refactor requires missing argument(s): ${preview.requiredArguments.join(', ')}\n${preview.blockReason}` };
        }
        return { output: `❌ Cannot refactor: ${preview.blockReason}` };
      }

      const lines: string[] = [];
      lines.push(`🔍 Change Preview (${preview.fingerprint.slice(0, 10)}):`);
      lines.push(`  ${preview.summary}`);
      lines.push(`  Affected files (${preview.affectedFiles.length}): ${preview.affectedFiles.join(', ')}`);

      let confirmed = autoApply;
      if (!confirmed && session.prompter && isInteractive) {
        confirmed = await session.prompter.confirm(`Apply refactoring across ${preview.affectedFiles.length} file(s)?`, false);
      }

      if (confirmed) {
        const applyRes = await registry.execute('apply_change', { request: changeReq, fingerprint: preview.fingerprint }, ctx);
        if (applyRes.ok) {
          lines.push(`\n✅ Applied successfully. Touched: ${applyRes.filesTouched.join(', ') || 'none'}. Verification: ${applyRes.verification.passed ? 'PASSED' : 'CHECK FAILED'}`);
        } else {
          lines.push(`\n❌ Apply failed: ${applyRes.error}`);
        }
      } else {
        lines.push(`\nOperation cancelled. To apply later, run: apply_change with fingerprint ${preview.fingerprint}`);
      }

      return { output: lines.join('\n') };
    } catch (err: any) {
      return { output: `Refactor error: ${err.message || String(err)}` };
    }
  }

  if (lower === 'callers' || lower.startsWith('callers ')) {
    const sym = line.replace(/^callers\s*/i, '').trim();
    if (!sym) return { output: 'Usage: callers <symbolName>' };
    const res = await registry.execute('search_graph', { predicate: 'calls', targetId: sym }, ctx);
    if (res.results.length === 0) return { output: `No recorded call sites found calling '${sym}'.` };
    return {
      output: res.results.map((p: any) => `${p.sourceId} calls ${p.targetId}`).join('\n')
    };
  }

  if (lower === 'deps' || lower.startsWith('deps ')) {
    const target = line.replace(/^deps\s*/i, '').trim();
    if (!target) return { output: 'Usage: deps <fileOrModule>' };
    const res = await registry.execute('search_graph', { sourceId: target, predicate: 'depends_on' }, ctx);
    if (res.results.length === 0) return { output: `No dependencies recorded for '${target}'.` };
    return {
      output: res.results.map((p: any) => `- ${p.targetId}`).join('\n')
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
    return { output: `// ${slice.exact ? 'exact' : 'excerpt'} ${args.filePath}:${slice.startLine}-${slice.endLine}\n${slice.code}` };
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

  if (lower === 'metrics' || lower.startsWith('metrics ')) {
    const { rows, ...summary } = queryPerformance(session.projectRoot, performanceQueryArgs(line.trim().split(/\s+/).slice(1)));
    return { output: '📊 AIWF Performance Metrics\n' + JSON.stringify(summary, null, 2) };
  }

  if (lower === 'trace' || lower.startsWith('trace ')) {
    const arg = line.slice(5).trim().toLowerCase()
    if (arg === 'show' || arg === 'last') return {output: formatShellTrace(session)}
    if (arg === 'open' || arg === 'window') return {output: await openShellTrace(session)}
    if (!session.viewport) return {output: 'Trace viewport unavailable.'}
    if (!arg) {
      return {output: `Trace mode: ${session.viewport.getMode()}`}
    }
    if (arg === 'on' || arg === 'full') {
      session.viewport.setMode('full')
      return {output: 'Trace mode: full'}
    }
    if (arg === 'off' || arg === 'fold') {
      session.viewport.setMode('fold')
      return {output: 'Trace mode: fold'}
    }
    if (arg === 'compact') {
      session.viewport.setMode('compact')
      return {output: 'Trace mode: compact'}
    }
    return {output: 'Usage: trace [on|off|full|fold|compact|show|open]'}
  }

  if (lower === 'setup' || lower.startsWith('setup ')) {
    try {
      const tokens = line.slice(5).trim().split(/\s+/).filter(Boolean);
      if (isInteractive && session.renderer && !tokens.includes('--check')) {
        const inspected = await runSetupCommand(session.projectRoot, [...tokens, '--check']);
        if (inspected.some(step => step.state === 'needed')) {
          const review = await session.renderer.review({id: 'setup:apply', title: 'Review setup changes', content: formatSetupResult(inspected), actions: ['accept', 'cancel']});
          if (review.status !== 'accepted') return {output: 'Cancelled.'};
        }
      }
      const steps = await runSetupCommand(session.projectRoot, tokens);
      if (isInteractive && session.renderer && !tokens.includes('--check')) {
        const viewed = await session.renderer.view(setupView(steps));
        if (viewed.status !== 'unavailable') return {output: ''};
      }
      return {output: formatSetupResult(steps)};
    } catch (error) { return {output: error instanceof Error ? error.message : String(error)}; }
  }

  if (lower === 'config' || lower.startsWith('config ')) {
    try {
      const tokens = line.slice(6).trim().split(/\s+/).filter(Boolean);
      const result = await runConfigCommand(session.projectRoot, tokens, isInteractive ? facilitator : undefined);
      if (!result) return {output: 'Cancelled.'};
      if (result.mutated) session.actor.reloadConfig();
      if (!result.mutated && isInteractive && session.renderer) {
        const viewed = await session.renderer.view(configView(result));
        if (viewed.status !== 'unavailable') return {output: ''};
      }
      return {output: formatConfigResult(result)};
    } catch (error) { return {output: error instanceof Error ? error.message : String(error)}; }
  }

  if (lower.startsWith('eval ')) {
    const code = line.slice(5).trim();
    const res = await registry.execute('script_eval', { code }, ctx);
    return {
      output: res.success ? JSON.stringify(res.result, null, 2) : `Script Error: ${res.error}`
    };
  }

  // 3. Autonomous Cognitive Fallback
  const delegation = artifactCommand(line.split(/\s+/));
  if (delegation) return { output: JSON.stringify(await registry.execute(delegation.tool, delegation.args, ctx), null, 2) };
  const inlineMode = /^\/(design|dev|triage|product|auto)\b/i.test(line);
  session.viewport ??= new ProcessViewport({mode: 'fold', interactive: false, traceHint: 'trace show · trace open'});
  session.trace = {instruction: line, mode: session.actor.mode};
  session.viewport.start('Discovering tools...');
  const startedAt = Date.now();
  let result;
  try {
    result = await session.actor.execute(
      line,
      inlineMode ? undefined : session.modeOverride,
      {
        onDiscovery: (tools, mode) => {
          session.trace!.initialTools ??= tools;
          session.trace!.discoveryElapsedMs ??= Date.now() - startedAt;
          session.trace!.tools = tools; session.trace!.mode = mode;
        },
        onStep: ({thought: _privateReasoning, ...step}) => session.viewport!.onStep({...step, thought: '', elapsedMs: Date.now() - startedAt})
      }
    );
    const {events: _privateEvents, ...summary} = result;
    session.trace.result = summary;
    session.trace.mode = result.mode;
    session.trace.tools = result.discoveredTools ?? session.trace.tools;
  } catch (error) {
    session.trace.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    session.viewport.stop(!result || result.offlineFallback || result.failed ? 'fail' : 'success');
    try { saveShellTrace(session); }
    catch (error) { console.error(`Could not save shell trace: ${error instanceof Error ? error.message : String(error)}`); }
  }

  let prefix = `[${result.mode.toUpperCase()}]`;
  if (result.escalated) {
    prefix += result.targetModel
      ? ` \x1b[35m[Escalated ➜ ${result.targetModel}]\x1b[0m`
      : ` \x1b[35m[Escalated]\x1b[0m`;
  } else if (result.targetModel) {
    prefix += ` \x1b[90m[${result.targetModel}]\x1b[0m`;
  }
  const discoveryLine = session.viewport?.getMode() === 'full'
    ? `[DISCOVERY] ${result.discoveredTools?.length ? result.discoveredTools.join(', ') : '(none)'}\n`
    : '';
  return {
    output: `${discoveryLine}${prefix} ${TerminalFormatter.format(result.answer)}`
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
      trace: ['on', 'off', 'full', 'fold', 'compact', 'show', 'open'],
      radar: ['refresh'],
      '/radar': ['refresh'],
      graph: ['--type', '--pred', '--from', '--to', '--depth']
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

    if (['resolve', 'prepare', 'investigate', 'resolve_ticket', 'prepare_ticket', 'investigate_ticket', 'claim', 'release', 'done'].includes(verb)) {
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

  let renderer: UiRenderer | undefined;
  if (tty.getIsTty()) {
    const { OpenTuiRenderer } = await import('@dharmax/shell-ui');
    renderer = new OpenTuiRenderer();
  }

  const session: ShellSession = {
    store,
    actor,
    projectRoot: root,
    prompter,
    facilitator,
    interactive: tty.getIsTty(),
    viewport: new ProcessViewport({
      mode: 'fold',
      interactive: tty.getIsTty(),
      traceHint: 'Alt+O · trace show · trace open'
    }),
    renderer
  };

  const completer = buildSmartCompleter(session);

  console.log(`\x1b[1;36m🏛️  AI-Workflow 2.0 Shell (Developer Supreme)\x1b[0m`);
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
      cwd: session.projectRoot,
      onToggleProcessView: async () => { const output = await openShellTrace(session); if (output) console.log(output); }
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
  await renderer?.dispose();
}

if (import.meta.main) {
  startShell();
}
