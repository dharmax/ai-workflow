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
  private hasCustomAsker: boolean;

  constructor(public store: WorkflowStore, asker?: Asker) {
    this.hasCustomAsker = Boolean(asker);
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

\x1b[1;33mConversational AI Assistant:\x1b[0m
  Any natural language text, architectural discussion, questions, multi-sentence intents,
  or complex instructions will be directly reasoned over by the Autonomous Engineering OS Agent.
    `.trim();
  }

  private async handleNaturalLanguage(line: string): Promise<string> {
    const isOnline = this.hasCustomAsker || (await this.probeOllamaHealth());

    if (isOnline) {
      // Autonomous Conversational Agent Turn with Full Multi-Tool Execution & Multi-Turn Reasoning
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
          return turnRes.output;
        }
      } catch (err: any) {
        return `\x1b[31mAgent error:\x1b[0m ${err.message}`;
      }
    }

    return `\x1b[33mNotice: LLM provider (${this.ollamaHost}) is offline or unreachable.\x1b[0m\n- Deterministic CLI operations: Type \x1b[1;36mhelp\x1b[0m for instant local commands.\n- Start Ollama or configure \x1b[1mexport OLLAMA_HOST="http://localhost:11434"\x1b[0m.`;
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
