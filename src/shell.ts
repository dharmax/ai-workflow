import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Asker } from '@dharmax/llm-utils';
import { WorkflowStore } from './store.ts';
import { CodeletEngine } from './compiler.ts';
import { DecisionManager } from './decisions.ts';
import { renderTuiDashboard } from './ui.ts';
import { getBlastRadius, getFeatureBlastRadius, generateDigest, recommendNextTask, doctorCheck } from './impact.ts';
import { LocalGitTransport } from './transport.ts';
import { auditCodebase } from './guidelines.ts';
import { MetricsCollector } from './metrics.ts';
import { packTicketContext } from './context.ts';

export type ShellMode = 'design' | 'product' | 'dev' | 'triage';

export class InteractiveShell {
  public mode: ShellMode = 'design';
  public asker: Asker;
  public compiler: CodeletEngine;
  public decisions: DecisionManager;
  public transport: LocalGitTransport;
  public metrics: MetricsCollector;

  constructor(public store: WorkflowStore, asker?: Asker) {
    const host = process.env.OLLAMA_HOST || 'http://lotus:11434';
    this.asker = asker ?? new Asker({
      providers: [
        { id: 'ollama', host, baseUrl: host, available: true, enabled: true }
      ],
      defaultModel: { providerId: 'ollama', modelId: 'qwen2.5-coder:7b' },
      preferLocal: true
    });
    this.compiler = new CodeletEngine(store, this.asker);
    this.decisions = new DecisionManager(store);
    this.transport = new LocalGitTransport(store);
    this.metrics = new MetricsCollector(store);
  }

  async start() {
    const rl = readline.createInterface({ input, output });
    console.log(`\x1b[1;36m==================================================\x1b[0m`);
    console.log(`\x1b[1;37m   AI-WORKFLOW REPL & CAUSAL ENGINEERING OS\x1b[0m`);
    console.log(`\x1b[1;36m==================================================\x1b[0m`);
    console.log(`Modes: /design (Architect) | /product (PM) | /dev (Engineer) | /triage (Reviewer)`);
    console.log(`Commands: sync, status, next, impact <target>, digest, doctor, audit, metrics, claim, release, exit\n`);

    while (true) {
      const modeColor = this.mode === 'design' ? '\x1b[35m' : this.mode === 'product' ? '\x1b[34m' : this.mode === 'dev' ? '\x1b[32m' : '\x1b[33m';
      const prompt = `${modeColor}[${this.mode.toUpperCase()}]\x1b[0m \x1b[1m>\x1b[0m `;
      const line = (await rl.question(prompt)).trim();

      if (!line) continue;
      if (line === 'exit' || line === 'quit') break;

      const isFastCmd = ['sync', 'status', 'view', 'next', 'impact', 'digest', 'standup', 'doctor', 'audit', 'metrics', 'start', 'done', 'claim', 'release', 'decision', 'help'].includes(line.split(/\s+/)[0].toLowerCase()) || line.startsWith('/');

      if (!isFastCmd) {
        process.stdout.write(`\x1b[36mExecuting action...\x1b[0m\r`);
      }

      const res = await this.executeCommand(line);
      if (res) {
        if (!isFastCmd) {
          process.stdout.write(`                   \r`);
        }
        console.log(res + '\n');
      }
    }
    rl.close();
  }

  async executeCommand(line: string): Promise<string> {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Mode Switch
    if (trimmed.startsWith('/')) {
      const targetMode = trimmed.slice(1).toLowerCase();
      if (['design', 'product', 'dev', 'triage'].includes(targetMode)) {
        this.mode = targetMode as ShellMode;
        return `\x1b[32mSwitched to ${this.mode.toUpperCase()} mode.\x1b[0m`;
      }
      return `\x1b[31mUnknown mode: ${targetMode}. Valid modes: /design, /product, /dev, /triage\x1b[0m`;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // Fast direct commands
    switch (cmd) {
      case 'sync': {
        await this.transport.sync();
        return `\x1b[32mSynced Markdown (kanban.md, epics.md, decisions.md, modules.md) with SQLite.\x1b[0m`;
      }

      case 'status':
      case 'view': {
        return renderTuiDashboard(this.store);
      }

      case 'next': {
        const rec = recommendNextTask(this.store);
        const ticketStr = rec.ticket ? `\x1b[1m${rec.ticket.id}: ${rec.ticket.title}\x1b[0m` : 'None';
        return `\x1b[1;33mNext Recommended Task:\x1b[0m ${ticketStr}\nReason: ${rec.reason}`;
      }

      case 'impact': {
        const target = parts[1];
        if (!target) return 'Usage: impact <file-or-symbol>';
        const res = getBlastRadius(this.store, target);
        return `\x1b[1;36mBlast Radius for ${target}:\x1b[0m ${res.affectedFilesCount} files affected.\nFiles: ${res.affectedFiles.join(', ')}\nAffected Tickets: ${res.affectedTickets.map(t => t.id).join(', ') || 'None'}\nRecommended Tests: ${res.recommendedTests.join(', ')}`;
      }

      case 'digest':
      case 'standup': {
        const hours = parseInt(parts[1] || '24', 10);
        const dig = generateDigest(this.store, hours);
        return `\x1b[1;32m=== Daily Digest (Past ${hours}h) ===\x1b[0m\nCompleted Tickets: ${dig.completedTickets.map(t => t.id).join(', ') || 'None'}\nIn Progress: ${dig.inProgressTickets.map(t => t.id).join(', ') || 'None'}\nRecent ADR Decisions: ${dig.recentDecisions.map(d => d.id).join(', ') || 'None'}\nOpen Bug Badges: ${dig.openBugsCount} 🔴`;
      }

      case 'doctor': {
        const fix = parts.includes('--fix');
        const doc = doctorCheck(this.store, { fix });
        let out = `\x1b[1;34m=== Repo Doctor Health Report ===\x1b[0m\nTotal Files: ${doc.totalFiles}\nUnlinked Bug Notes (TODO/FIXME): ${doc.unlinkedBugNotes}`;
        if (fix) {
          out += `\nAuto-created ${doc.autoFixedTickets.length} bug tickets in Todo lane.`;
        }
        return out;
      }

      case 'audit': {
        const res = await auditCodebase(this.store);
        if (res.passed) {
          return `\x1b[32mAudit Passed! 0 guideline violations found. ✅\x1b[0m`;
        }
        let out = `\x1b[31mAudit Failed! Found ${res.violationsCount} violation(s):\x1b[0m\n`;
        for (const f of res.findings.slice(0, 10)) {
          out += `  \x1b[1m${f.file}:${f.line}\x1b[0m [${f.ruleId}]: ${f.message}\n`;
        }
        return out.trim();
      }

      case 'metrics': {
        const summary = this.metrics.getSummary();
        return `\x1b[1;36m=== Context & Performance Telemetry Metrics ===\x1b[0m\nTotal Context Packs: ${summary.totalContextPacks}\nTotal Tokens Saved: ${summary.totalTokensSaved.toLocaleString()} tokens\nAvg Compression: ${summary.averageCompressionRatio}%\nAvg Context Pack: ${summary.averageContextPackDurationMs}ms`;
      }

      case 'start': {
        const ticketId = parts[1];
        if (!ticketId) return 'Usage: start <ticketId>';
        const existing = this.store.getEntity(ticketId);
        this.store.upsertEntity({
          id: ticketId,
          type: 'ticket',
          title: existing?.title || ticketId,
          lane: 'In Progress'
        });
        await this.transport.sync();
        return `\x1b[32mTicket ${ticketId} moved to In Progress. Synced with kanban.md.\x1b[0m`;
      }

      case 'done': {
        const ticketId = parts[1];
        if (!ticketId) return 'Usage: done <ticketId>';
        const existing = this.store.getEntity(ticketId);
        this.store.upsertEntity({
          id: ticketId,
          type: 'ticket',
          title: existing?.title || ticketId,
          lane: 'Done',
          status: 'verified'
        });
        await this.transport.sync();
        return `\x1b[32mTicket ${ticketId} moved to Done. Synced with kanban.md.\x1b[0m`;
      }

      case 'claim': {
        const ticketId = parts[1];
        const agentId = parts[2] || process.env.USER || 'agent-1';
        const durationMin = parseInt(parts[3] || '30', 10);
        if (!ticketId) return 'Usage: claim <ticketId> [agentId] [durationMinutes]';
        const res = this.store.claimTicket(ticketId, agentId, durationMin * 60 * 1000);
        if (res.success) {
          return `\x1b[32mTicket ${ticketId} claimed by ${agentId} until ${res.lease?.expiresAt} ✅\x1b[0m`;
        }
        return `\x1b[31mFailed to claim ticket:\x1b[0m ${res.reason}`;
      }

      case 'release': {
        const ticketId = parts[1];
        const agentId = parts[2];
        if (!ticketId) return 'Usage: release <ticketId> [agentId]';
        const res = this.store.releaseTicket(ticketId, agentId);
        if (res.success) {
          return `\x1b[32mTicket ${ticketId} released successfully ✅\x1b[0m`;
        }
        return `\x1b[31mFailed to release ticket:\x1b[0m ${res.reason}`;
      }

      case 'decision': {
        const sub = parts[1]?.toLowerCase();
        if (sub === 'revert' && parts[2]) {
          const reason = parts.slice(3).join(' ') || 'Reverted by operator';
          const res = this.decisions.revertDecision(parts[2], reason);
          await this.transport.sync();
          return `\x1b[33mReverted decision ${parts[2]}.\x1b[0m Affected tickets cancelled: ${res.affectedTickets.map(t => t.id).join(', ') || 'None'}`;
        }
        if (sub === 'accept' && parts[2]) {
          this.decisions.acceptDecision(parts[2]);
          await this.transport.sync();
          return `\x1b[32mAccepted decision ${parts[2]}.\x1b[0m`;
        }
        if (sub === 'propose' && parts[2] && parts[3]) {
          const id = parts[2];
          const title = parts[3];
          const body = parts.slice(4).join(' ') || '';
          this.decisions.proposeDecision({ id, title, body });
          await this.transport.sync();
          return `\x1b[32mProposed decision ${id}: ${title}\x1b[0m`;
        }
        const list = this.decisions.listDecisions();
        let out = `\x1b[1;34m=== Architectural Decision Records (ADRs) ===\x1b[0m\n`;
        for (const d of list) {
          out += `- \x1b[1m${d.id}\x1b[0m [${d.status}]: ${d.title}\n`;
        }
        return out.trim();
      }

      case 'help': {
        return `
\x1b[1;36mAI-Workflow Interactive Shell Commands & Natural Language Operations:\x1b[0m
  /design, /product, /dev, /triage   Switch reasoning mode
  sync                               Reconcile Markdown ledgers & AST index
  status / view                      Display project health matrix & Kanban
  next                               Get recommended next priority task
  impact <file|symbol>               Calculate blast radius & test targets
  digest [hours]                     Generate daily standup digest
  doctor [--fix]                     Repository diagnostics & auto-ticket creation
  audit                              Audit codebase against policy rules
  metrics                            Display context compression & telemetry
  start <ticketId>                   Move ticket to In Progress
  done <ticketId>                    Move ticket to Done (verified)
  claim <ticketId> [agent] [mins]    Atomically lease a ticket
  release <ticketId> [agent]         Release ticket lease
  decision <list|propose|accept|revert>  Manage Architectural Decision Records (ADRs)
  exit / quit                        Exit shell

\x1b[1;33mNatural Language Directives (Tool-Aware):\x1b[0m
  "how many todo items do we have?"      -> Queries exact ticket counts from SQLite
  "can you handle the next one?"         -> Autonomously claims, starts, and packs context for top task
  "what breaks if we add OAuth2?"        -> Runs AI-driven feature blast radius
  "create a ticket to optimize store.ts" -> Inserts ticket & relates to file
        `.trim();
      }
    }

    // Natural Language Tool-Aware Autonomous Action Loop
    return this.handleToolAwareWish(trimmed);
  }

  private async handleToolAwareWish(line: string): Promise<string> {
    const lower = line.toLowerCase();

    // 1. Directive: "Handle next task" / "Take next ticket" / "Start next"
    if (
      lower.includes('handle the next') || 
      lower.includes('take the next') || 
      lower.includes('start the next') || 
      lower.includes('work on the next') ||
      lower.includes('handle next') ||
      lower.includes('next task') && (lower.includes('do') || lower.includes('take') || lower.includes('start'))
    ) {
      const rec = recommendNextTask(this.store);
      if (!rec.ticket) {
        return `\x1b[32mNo pending tasks available.\x1b[0m Reason: ${rec.reason}`;
      }

      const ticketId = rec.ticket.id;
      // 1. Claim lease
      this.store.claimTicket(ticketId, 'shell-agent', 30 * 60 * 1000);
      // 2. Move to In Progress
      const claimedEntity = this.store.getEntity(ticketId) || rec.ticket;
      this.store.upsertEntity({
        ...claimedEntity,
        lane: 'In Progress'
      });
      await this.transport.sync();

      // 3. Pack bounded context
      const packed = await packTicketContext(this.store, ticketId);

      return `\x1b[1;32m⚡ Autonomously dispatched next task:\x1b[0m \x1b[1m${ticketId}: ${rec.ticket.title}\x1b[0m
- \x1b[36mLease:\x1b[0m Claimed by 'shell-agent' (30m lease)
- \x1b[36mLane Transition:\x1b[0m Moved from Todo -> In Progress (synced with kanban.md)
- \x1b[36mBounded Context:\x1b[0m Packed ${packed.tokenCount} tokens (${packed.compressionRatio}% compression ratio)
- \x1b[36mLinked AST Symbols:\x1b[0m ${packed.context?.linkedSymbols.length || 0} symbols identified
- \x1b[36mVerification Target:\x1b[0m \`${packed.context?.verificationCommand || 'bun test'}\`
- \x1b[33mReady for implementation in codebase.\x1b[0m`;
    }

    // 2. Directive: "How many todo / in progress / done items"
    if (lower.includes('how many') && (lower.includes('todo') || lower.includes('done') || lower.includes('ticket') || lower.includes('bug') || lower.includes('in progress'))) {
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
      return out;
    }

    // 3. Directive: "What breaks if..." / "Feature blast radius..."
    if (lower.includes('what breaks') || lower.includes('blast radius of') || lower.includes('impact of') || lower.includes('if we add') || lower.includes('if we change')) {
      const featureText = line.replace(/^(what breaks if we|what breaks if|blast radius of|impact of|what happens if we)\s+/i, '');
      const blast = await getFeatureBlastRadius(this.store, featureText, this.asker);
      return `\x1b[1;36m=== AI-Driven Feature Blast Radius ===\x1b[0m
Target: "${blast.featureWish}"
Risk Level: \x1b[1;${blast.riskLevel === 'High' ? '31' : blast.riskLevel === 'Medium' ? '33' : '32'}m${blast.riskLevel}\x1b[0m
Impacted Modules: ${blast.impactedModules.join(', ') || 'None direct'}
Impacted Files (${blast.impactedFiles.length}): ${blast.impactedFiles.join(', ') || 'None'}
Affected Active Tickets: ${blast.affectedActiveTickets.map(t => t.id).join(', ') || 'None'}
Recommended Tests: ${blast.recommendedTests.join(', ')}
Architectural Assessment: ${blast.architecturalSummary}`;
    }

    // 4. Directive: "Create ticket <title>" / "Add ticket <title>"
    if (lower.startsWith('create ticket') || lower.startsWith('add ticket') || lower.startsWith('new ticket')) {
      const title = line.replace(/^(create ticket|add ticket|new ticket)\s*:?\s*/i, '').trim();
      if (!title) return 'Usage: create ticket <title>';
      const id = `TKT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const ticket = this.store.upsertEntity({
        id,
        type: 'ticket',
        title,
        lane: 'Todo',
        status: 'implemented',
        body: `Created via autonomous shell directive: "${line}"`
      });
      await this.transport.sync();
      return `\x1b[32mCreated ticket ${id}: "${title}" in Todo lane. Synced with kanban.md ✅\x1b[0m`;
    }

    // 5. Directive: "Audit" / "Check rules"
    if (lower.includes('audit') || lower.includes('check rules') || lower.includes('guidelines')) {
      const res = await auditCodebase(this.store);
      if (res.passed) return `\x1b[32mAudit Passed! 0 guideline violations found across codebase. ✅\x1b[0m`;
      let out = `\x1b[31mAudit Failed! Found ${res.violationsCount} violation(s):\x1b[0m\n`;
      for (const f of res.findings.slice(0, 10)) {
        out += `  ${f.file}:${f.line} [${f.ruleId}]: ${f.message}\n`;
      }
      return out.trim();
    }

    // 6. Dev Mode Natural Language Routine Compilation
    if (this.mode === 'dev') {
      try {
        const codelet = await this.compiler.compileWish(line);
        const testRes = await codelet.test();
        return `\x1b[32mCompiled routine: ${codelet.meta.title} (Hash: ${codelet.meta.titleHash})\x1b[0m\nDoc: ${codelet.meta.doc}\nAutomated Test Verification: ${testRes.passed ? 'PASSED ✅' : 'FAILED ❌'}`;
      } catch (err: any) {
        return `\x1b[31mSynthesis error:\x1b[0m ${err.message}`;
      }
    }

    // 7. General Architecture Reasoning with Live Causal Graph Grounding
    const projectContext = this.buildLiveProjectContext();
    const systemPrompt = `You are the AI-Workflow Causal Assistant & Autonomous Engineer in ${this.mode.toUpperCase()} mode.
You have live access to the local project causal graph, tickets, modules, and ADR decisions provided below.
Always answer questions directly using the live project context, citing specific ticket IDs, modules, or ADRs when relevant.
Keep answers concise, direct, professional, and actionable.

${projectContext}`;

    try {
      const res = await this.asker.ask(line, {
        system: systemPrompt,
        timeoutMs: 45000
      });
      if (res.ok && res.text) {
        return res.text;
      }
      if (res.failure) {
        return `\x1b[31mLLM failure (${res.failure.kind}):\x1b[0m ${res.failure.message}`;
      }
      return 'No response generated.';
    } catch (err: any) {
      return `\x1b[31mLLM error:\x1b[0m ${err.message}`;
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
