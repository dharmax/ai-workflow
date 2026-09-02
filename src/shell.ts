import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Asker } from '@dharmax/llm-utils';
import { WorkflowStore } from './store.ts';
import { CodeletEngine } from './compiler.ts';
import { DecisionManager } from './decisions.ts';
import { LocalGitTransport } from './transport.ts';
import { MetricsCollector } from './metrics.ts';
import { registry, type CommandContext } from './registry.ts';
import { recommendNextTask, getFeatureBlastRadius } from './impact.ts';
import { packTicketContext } from './context.ts';
import { ShellAgent, type ShellAgentMode } from './shell-agent.ts';

export type ShellMode = 'design' | 'product' | 'dev' | 'triage';

export class InteractiveShell {
  public mode: ShellMode = 'design';
  public asker: Asker;
  public compiler: CodeletEngine;
  public decisions: DecisionManager;
  public transport: LocalGitTransport;
  public metrics: MetricsCollector;
  public agent: ShellAgent;
  private ctx: CommandContext;
  private ollamaHost: string;

  constructor(public store: WorkflowStore, asker?: Asker) {
    this.ollamaHost = process.env.OLLAMA_HOST || 'http://lotus:11434';
    this.asker = asker ?? new Asker({
      providers: [
        { id: 'ollama', host: this.ollamaHost, baseUrl: this.ollamaHost, available: true, enabled: true }
      ],
      defaultModel: { providerId: 'ollama', modelId: 'qwen2.5-coder:7b' },
      preferLocal: true
    });
    this.compiler = new CodeletEngine(store, this.asker);
    this.decisions = new DecisionManager(store);
    this.transport = new LocalGitTransport(store);
    this.metrics = new MetricsCollector(store);

    this.ctx = {
      store: this.store,
      compiler: this.compiler,
      decisions: this.decisions,
      transport: this.transport,
      metrics: this.metrics,
      projectRoot: store.root
    };

    this.agent = new ShellAgent(this.ctx, this.asker, this.mode);
  }

  async start() {
    const allCommands = [
      'status', 'sync', 'tickets', 'context', 'inspect', 'start', 'done',
      'claim', 'release', 'next', 'gate', 'impact', 'hotspots', 'outline',
      'slice', 'test-target', 'triage', 'token-count', 'snapshot', 'pr-summary',
      'burndown', 'symbol', 'search', 'sweep', 'digest', 'doctor', 'audit',
      'metrics', 'decision', 'root', 'env', 'git-status', 'lint-graph', 'notes',
      'note', 'codelet list', 'codelet run', 'codelet compile', 'codelet search',
      '/design', '/product', '/dev', '/triage', 'help', 'exit', 'quit'
    ];

    const completer = (linePartial: string) => {
      const hits = allCommands.filter(c => c.startsWith(linePartial));
      return [hits.length ? hits : allCommands, linePartial];
    };

    const rl = readline.createInterface({ input, output, completer });
    console.log(`\x1b[1;36m========================================================================\x1b[0m`);
    console.log(`\x1b[1;37m   AI-WORKFLOW (aiwf) INTERACTIVE REPL & CAUSAL ENGINEERING OS\x1b[0m`);
    console.log(`\x1b[1;36m========================================================================\x1b[0m`);
    console.log(`Modes: /design (Architect) | /product (PM) | /dev (Engineer) | /triage (Reviewer)`);
    console.log(`Type 'help' for command list, or press [Tab] for command completion.\n`);

    while (true) {
      const modeColor = this.mode === 'design' ? '\x1b[35m' : this.mode === 'product' ? '\x1b[34m' : this.mode === 'dev' ? '\x1b[32m' : '\x1b[33m';
      const prompt = `${modeColor}[${this.mode.toUpperCase()}]\x1b[0m \x1b[1m>\x1b[0m `;
      const line = (await rl.question(prompt)).trim();

      if (!line) continue;
      if (line === 'exit' || line === 'quit') break;

      const res = await this.executeCommand(line);
      if (res) {
        console.log(res + '\n');
      }
    }
    rl.close();
  }

  async executeCommand(line: string): Promise<string> {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // 1. Mode Switch & Clear
    if (trimmed.startsWith('/')) {
      const target = trimmed.slice(1).toLowerCase();
      if (target === 'clear') {
        this.agent.clear();
        return `\x1b[32mCleared conversational agent memory.\x1b[0m`;
      }
      if (['design', 'product', 'dev', 'triage'].includes(target)) {
        this.mode = target as ShellMode;
        this.agent.setMode(this.mode);
        return `\x1b[32mSwitched to ${this.mode.toUpperCase()} mode.\x1b[0m`;
      }
      return `\x1b[31mUnknown mode: /${target}. Valid modes: /design, /product, /dev, /triage | /clear\x1b[0m`;
    }

    // 2. Help Command
    if (trimmed.toLowerCase() === 'help') {
      return this.renderShellHelp();
    }

    const parts = trimmed.split(/\s+/);

    // 3. Match from CapabilityRegistry (Handles "list codelets", "codelet list", "status", "tickets", "next", "gate", "sweep", etc.)
    const normalizedParts = (parts[0].toLowerCase() === 'list' && parts.length > 1)
      ? [parts[1], 'list', ...parts.slice(2)]
      : parts;

    const match = registry.findForCli(normalizedParts) || registry.findForCli(parts);
    if (match && match.capability) {
      const cap = match.capability;
      let argsPayload: any = {};
      if (cap.parseCliArgs) {
        argsPayload = cap.parseCliArgs(match.args, {});
      } else if (match.args.length > 0) {
        argsPayload = { input: match.args.join(' ') };
      }

      try {
        const result = await cap.handler(this.ctx, argsPayload);
        if (typeof result === 'string') return result;
        if (cap.renderTui) return cap.renderTui(result);
        return JSON.stringify(result, null, 2);
      } catch (err: any) {
        return `\x1b[31mError executing ${cap.name}:\x1b[0m ${err.message}`;
      }
    }

    // 4. Natural Language Tool-Aware Directives
    return this.handleNaturalLanguage(trimmed);
  }

  private renderShellHelp(): string {
    return `
\x1b[1;36mAI-Workflow Interactive Commands (Deterministic & Instant):\x1b[0m
  /design, /product, /dev, /triage      Switch reasoning role
  status / view                         Project health, lanes, and module completion matrix
  sync                                  Reconcile Markdown ledgers & AST index
  tickets / ticket list [lane]          List tickets across Kanban lanes
  context <ticketId>                    Bounded context extraction pack
  ticket inspect <ticketId>             Deep AST symbols and execution artifacts
  start <ticketId>                      Move ticket to In Progress
  done <ticketId>                       Move ticket to Done (verified)
  claim <ticketId> [agent] [mins]       Atomically lease ticket
  release <ticketId>                    Release ticket lease
  next                                  Get recommended priority task
  impact <file|symbol>                  Calculate blast radius & test targets
  gate <file|symbol>                    Pre-flight safety gate checklist
  symbol <name>                         AST fast symbol lookup (callers, callees, location)
  codelets / codelet list               List compiled deterministic routines
  codelet run <hash> [argsJson]         Execute routine deterministically
  sweep [--fix]                         Scan technical debt & auto-create Kanban tickets
  digest [hours]                        Generate standup summary
  doctor [--fix]                        Diagnostics & health check
  audit                                 Validate codebase against policy rules
  metrics                               Context compression & latency telemetry
  decision <list|propose|accept|revert> Manage Architectural Decision Records (ADRs)
  exit / quit                           Exit REPL

\x1b[1;33mNatural Language Directives:\x1b[0m
  "how many todo items do we have?"      -> Queries ticket counts from SQLite
  "can you handle the next one?"         -> Autonomously claims, starts, and packs context for top task
  "what breaks if we refactor auth?"     -> AI-driven semantic feature blast radius
  "create ticket <title>"                -> Creates ticket and syncs kanban.md
    `.trim();
  }

  private async handleNaturalLanguage(line: string): Promise<string> {
    const lower = line.toLowerCase();
    const responses: string[] = [];

    // 1. Directive: "Handle next task" / "Take next ticket"
    if (
      lower.includes('handle the next') ||
      lower.includes('take the next') ||
      lower.includes('start the next') ||
      lower.includes('work on the next') ||
      lower.includes('handle next') ||
      (lower.includes('next task') && (lower.includes('do') || lower.includes('take') || lower.includes('start')))
    ) {
      const rec = recommendNextTask(this.store);
      if (!rec.ticket) {
        responses.push(`\x1b[32mNo pending tasks available.\x1b[0m Reason: ${rec.reason}`);
      } else {
        const ticketId = rec.ticket.id;
        this.store.claimTicket(ticketId, 'shell-agent', 30 * 60 * 1000);
        const claimedEntity = this.store.getEntity(ticketId) || rec.ticket;
        this.store.upsertEntity({ ...claimedEntity, lane: 'In Progress' });
        await this.transport.sync();
        const packed = await packTicketContext(this.store, ticketId);
        responses.push(`\x1b[1;32m⚡ Autonomously dispatched next task:\x1b[0m \x1b[1m${ticketId}: ${rec.ticket.title}\x1b[0m`);
        responses.push(`- \x1b[36mLease:\x1b[0m Claimed by 'shell-agent' (30m lease)`);
        responses.push(`- \x1b[36mLane Transition:\x1b[0m Moved from Todo -> In Progress (synced with kanban.md)`);
        responses.push(`- \x1b[36mBounded Context:\x1b[0m Packed ${packed.tokenCount} tokens (${packed.compressionRatio}% compression ratio)`);
        responses.push(`- \x1b[36mLinked AST Symbols:\x1b[0m ${packed.context?.linkedSymbols.length || 0} symbols identified`);
        responses.push(`- \x1b[36mVerification Target:\x1b[0m \`${packed.context?.verificationCommand || 'bun test'}\``);
        responses.push(`- \x1b[33mReady for implementation in codebase.\x1b[0m`);
      }
    }

    // 2. Directive: "How many todo / in progress / done items"
    if (lower.includes('how many') && (lower.includes('todo') || lower.includes('done') || lower.includes('ticket') || lower.includes('bug') || lower.includes('in progress')) ) {
      const health = this.store.getProjectHealth();
      const todos = this.store.listEntities({ type: 'ticket', lane: 'Todo' });
      const inProg = this.store.listEntities({ type: 'ticket', lane: 'In Progress' });
      const done = this.store.listEntities({ type: 'ticket', lane: 'Done' });
      let out = `\x1b[1;36m=== Project Ticket Counts ===\x1b[0m\n`;
      out += `Total Tickets: \x1b[1m${health.totalTickets}\x1b[0m\n`;
      out += `- Todo: \x1b[1;33m${todos.length}\x1b[0m\n`;
      for (const t of todos) out += `  • ${t.id}: ${t.title}\n`;
      out += `- In Progress: \x1b[1;34m${inProg.length}\x1b[0m\n`;
      for (const t of inProg) out += `  • ${t.id}: ${t.title}\n`;
      out += `- Done: \x1b[1;32m${done.length}\x1b[0m (Verified: ${done.filter(d => d.status === 'verified').length})\n`;
      out += `- Open Bug Badges: \x1b[1;31m${health.openBugsCount} 🔴\x1b[0m`;
      responses.push(out);
    }

    // 3. Directive: "What breaks if..." / blast radius
    if (lower.includes('what breaks') || lower.includes('blast radius of') || lower.includes('impact of') || lower.includes('if we add') || lower.includes('if we change')) {
      const featureText = line.replace(/^(what breaks if we|what breaks if|blast radius of|impact of|what happens if)\s+/i, '');
      const blast = await getFeatureBlastRadius(this.store, featureText, this.asker);
      const out = `\x1b[1;36m=== AI-Driven Feature Blast Radius ===\x1b[0m\n` +
        `Target: \"${blast.featureWish}\"\n` +
        `Risk Level: \x1b[1;${blast.riskLevel === 'High' ? '31' : blast.riskLevel === 'Medium' ? '33' : '32'}m${blast.riskLevel}\x1b[0m\n` +
        `Impacted Modules: ${blast.impactedModules.join(', ') || 'None direct'}\n` +
        `Impacted Files (${blast.impactedFiles.length}): ${blast.impactedFiles.join(', ') || 'None'}\n` +
        `Affected Active Tickets: ${blast.affectedActiveTickets.map(t => t.id).join(', ') || 'None'}\n` +
        `Recommended Tests: ${blast.recommendedTests.join(', ')}\n` +
        `Architectural Assessment: ${blast.architecturalSummary}`;
      responses.push(out);
    }

    // 4. Directive: "Why are tests failing / test triage"
    if (lower.includes('why are test') || lower.includes('test fail') || lower.includes('failing test') || lower.includes('triage test')) {
      const cap = registry.get('triage_test_failures');
      if (cap) {
        const res = await cap.handler(this.ctx, {});
        responses.push(cap.renderTui ? cap.renderTui(res) : JSON.stringify(res, null, 2));
      }
    }

    // 5. Directive: "Recent active files / hotspots"
    if (lower.includes('hotspot') || lower.includes('recent active') || lower.includes('most changed') || lower.includes('active files')) {
      const cap = registry.get('get_project_hotspots');
      if (cap) {
        const res = await cap.handler(this.ctx, { days: 14 });
        responses.push(cap.renderTui ? cap.renderTui(res) : JSON.stringify(res, null, 2));
      }
    }

    // 6. Directive: "Epic progress / burndown"
    if (lower.includes('burndown') || lower.includes('epic progress') || lower.includes('epics status')) {
      const cap = registry.get('get_epic_progress');
      if (cap) {
        const res = await cap.handler(this.ctx, {});
        responses.push(cap.renderTui ? cap.renderTui(res) : JSON.stringify(res, null, 2));
      }
    }

    // 7. Directive: "Environment info / toolchain"
    if (lower.includes('environment info') || lower.includes('toolchain') || lower.includes('runtime info') || lower === 'env') {
      const cap = registry.get('get_environment_info');
      if (cap) {
        const res = await cap.handler(this.ctx, {});
        responses.push(cap.renderTui ? cap.renderTui(res) : JSON.stringify(res, null, 2));
      }
    }

    // 7b. Additional directive: "metrics"
    if (lower.includes('metrics')) {
      try {
        const res = await this.executeCommand('metrics');
        if (res) responses.push(res);
      } catch (e) {
        // ignore errors
      }
    }

    // 7c. Directive: "open tickets"
    if (lower.includes('open tickets')) {
      let out = `\x1b[1;36m=== Open tickets ===\x1b[0m\n`;
      const openTickets = this.store.listEntities({ type: 'ticket' }).filter(t => t.lane !== 'Done' && t.lane !== 'Blocked');
      if (openTickets.length > 0) {
        for (const t of openTickets) {
          out += `- ${t.id}: ${t.title} (${t.lane})\n`;
        }
      } else {
        out += 'No open tickets.\n';
      }
      responses.push(out);
    }

    // 7d. Directive: "blocked tickets"
    if (lower.includes('blocked tickets')) {
      let out = `\x1b[1;36m=== Blocked tickets ===\x1b[0m\n`;
      const blocked = this.store.listEntities({ type: 'ticket', lane: 'Blocked' });
      if (blocked.length > 0) {
        for (const t of blocked) {
          out += `- ${t.id}: ${t.title}\n`;
        }
      } else {
        out += 'No blocked tickets.\n';
      }
      responses.push(out);
    }
    // 8. Directive: "Create ticket <title>"
    if (lower.startsWith('create ticket') || lower.startsWith('add ticket') || lower.startsWith('new ticket')) {
      const title = line.replace(/^(create ticket|add ticket|new ticket)\s*:?\s*/i, '').trim();
      if (!title) {
        responses.push('Usage: create ticket <title>');
      } else {
        const id = `TKT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        this.store.upsertEntity({
          id,
          type: 'ticket',
          title,
          lane: 'Todo',
          status: 'planned',
          body: `Created via autonomous shell directive: \"${line}\"`
        });
        await this.transport.sync();
        responses.push(`\x1b[32mCreated ticket ${id}: \"${title}\" in Todo lane. Synced with kanban.md ✅\x1b[0m`);
      }
    }

    // 9. Dev mode compilation
    if (this.mode === 'dev') {
      try {
        const codelet = await this.compiler.compileWish(line);
        responses.push(`\x1b[32mCompiled routine: ${codelet.meta.title}\x1b[0m\nDoc: ${codelet.meta.doc}\nSaved to .codelets/${codelet.meta.title}.json ✅`);
      } catch (err: any) {
        responses.push(`\x1b[31mSynthesis error:\x1b[0m ${err.message}`);
      }
    }

    // If a deterministic directive already handled the request, return immediately
    if (responses.length > 0) {
      return responses.filter(r => r !== undefined && r !== null && r !== '').join('\n');
    }

    // 10. Health check for Ollama
    const isOnline = await this.probeOllamaHealth();
    if (!isOnline) {
      if (responses.length === 0) {
        responses.push(`\x1b[33mNotice: Ollama endpoint (${this.ollamaHost}) is offline or unreachable.\x1b[0m\n- Deterministic operations: Type \x1b[1;36mhelp\x1b[0m to see all local instant commands (status, codelets, tickets, gate, sync, etc.).\n- External LLM: Start Ollama or configure \x1b[1mexport OLLAMA_HOST="http://localhost:11434"\x1b[0m.`);
      }
    } else {
      // 11. Autonomous Conversational Agent Turn with Tool Execution
      try {
        const turnRes = await this.agent.turn(line, this.mode as ShellAgentMode, {
          onStep: (trace) => {
            if (trace.toolCall) {
              if (trace.toolCall.tool === 'exec_os_shell') {
                console.log(`\x1b[35m⚡ [OS: ${trace.toolCall.args.command || ''}]\x1b[0m`);
              } else {
                console.log(`\x1b[36m⚡ [Tool: ${trace.toolCall.tool}]\x1b[0m`);
              }
            }
          }
        });
        if (turnRes.output) {
          responses.push(turnRes.output);
        }
      } catch (err: any) {
        responses.push(`\x1b[31mAgent error:\x1b[0m ${err.message}`);
      }
    }

    // Return aggregated response (joined with newline). Empty response fallback.
    return responses.filter(r => r !== undefined && r !== null && r !== '').join('\n');
  }

  private async probeOllamaHealth(): Promise<boolean> {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.BUN_TEST);
    const timeoutMs = isTest ? 100 : 1200;
    try {
      const res = await fetch(`${this.ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildLiveProjectContext(): string {
    const health = this.store.getProjectHealth();
    const tickets = this.store.listEntities({ type: 'ticket' });
    const decisions = this.store.listEntities({ type: 'decision' });
    const claims = this.store.getActiveClaims();

    const sortedTickets = [...tickets].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const recentTickets = sortedTickets.slice(0, 10);

    let out = `=== LIVE PROJECT CAUSAL GRAPH CONTEXT (${path.basename(this.store.root)}) ===\n`;
    out += `Total Tickets: ${health.totalTickets} | Backlog: ${health.laneCounts.Backlog || 0} | Todo: ${health.laneCounts.Todo || 0} | In Progress: ${health.laneCounts['In Progress'] || 0} | Done: ${health.laneCounts.Done || 0} | Blocked: ${health.laneCounts.Blocked || 0}\n`;
    out += `Open Bug Badges: ${health.openBugsCount} 🔴 | Accepted ADRs: ${health.acceptedDecisionsCount} 📜\n`;

    if (claims.length > 0) {
      out += `Active Subagent Claims: ${claims.map(c => `${c.ticketId} (held by ${c.claimedBy})`).join(', ')}\n`;
    }

    out += `\nModules (${health.modules.length}):\n`;
    for (const m of health.modules) {
      out += `- ${m.name}: ${m.completionPercent}% complete, ${m.symbolCount} symbols, ${m.bugsCount} bugs\n`;
    }

    out += `\nRecently Updated & Completed Tickets:\n`;
    for (const t of recentTickets) {
      out += `- [${t.lane || 'Backlog'}] ${t.id}: ${t.title} (${t.status || 'planned'}) - Updated: ${t.updatedAt || 'N/A'}${t.body ? ` | Summary: ${t.body}` : ''}\n`;
    }

    if (decisions.length > 0) {
      out += `\nArchitectural Decisions (ADRs):\n`;
      for (const d of decisions) {
        out += `- [${d.status || 'accepted'}] ${d.id}: ${d.title}\n`;
      }
    }

    return out;
  }
}
