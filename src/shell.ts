/**
 * Responsibility: Interactive Terminal REPL & Shell Bridge.
 * Scope: Dual-nature REPL supporting deterministic fast-path commands (<5ms),
 * mode switching ([DESIGN], [DEV], [TRIAGE], [PRODUCT]), and autonomous LLM wish execution.
 */

import readline from 'node:readline';
import { WorkflowStore, findProjectRoot } from './graph/store.ts';
import { initializeTools, registry, type ToolContext } from './tools/index.ts';
import { WorkflowActor, type ShellMode, MODE_CONFIGS } from './actor/engine.ts';
import { exportProjections, importProjections } from './graph/projections.ts';
import pubsub from '@dharmax/pubsub';

export interface ShellSession {
  store: WorkflowStore;
  actor: WorkflowActor;
  projectRoot: string;
}

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

  // 1. Session Control & Mode Switching
  if (lower === 'exit' || lower === 'quit' || lower === '/exit') {
    return { output: 'Goodbye!', exit: true };
  }

  if (lower === '/help' || lower === 'help') {
    return {
      output: `
AI-Workflow 2.0 Terminal REPL
Commands:
  status               - Working tree git status & active ticket leases
  next                 - Algorithmic recommendation for next task
  claim <ticketId>     - Atomically lease a ticket
  release <ticketId>   - Release active ticket lease
  tickets [lane]       - List tickets in Kanban
  sync                 - Bi-directional sync between SQLite Graph and Markdown
  eval <js-code>       - On-the-fly JavaScript evaluation
  /design              - Switch mode to [DESIGN] (Architecture & ADRs)
  /dev                 - Switch mode to [DEV] (Code authoring & patching)
  /triage              - Switch mode to [TRIAGE] (Failure analysis)
  /product             - Switch mode to [PRODUCT] (Epics, Stories, Backlog)
  exit                 - Exit shell
  <any natural wish>   - Autonomous execution via Cognitive Actor
`
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

  if (lower.startsWith('claim ')) {
    const ticketId = line.slice(6).trim();
    const res = await registry.execute('claim_ticket', { ticketId, agentId: 'human-operator' }, ctx);
    if (res.success) return { output: `Claimed ticket ${ticketId} for 30 minutes.` };
    return { output: `Failed to claim: ${res.message}` };
  }

  if (lower.startsWith('release ')) {
    const ticketId = line.slice(8).trim();
    const res = await registry.execute('release_ticket', { ticketId }, ctx);
    return { output: res.success ? `Released ticket ${ticketId}.` : `Ticket not found or lease inactive.` };
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
    return { output: `Reconciled ${imp.importedChanges} disk changes. Exported ${exp.exportedFiles.length} projections.` };
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
  return {
    output: `[${result.mode.toUpperCase()}] ${result.answer}`
  };
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

  const session: ShellSession = { store, actor, projectRoot: root };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  const prompt = () => {
    rl.setPrompt(`aiwf [${session.actor.mode.toUpperCase()}] > `);
    rl.prompt();
  };

  console.log(`\x1b[1;36m🏛️  AI-Workflow 2.0 Shell (Bun-First Context OS)\x1b[0m`);
  console.log(`Type 'help' for commands or write any instruction.\n`);

  prompt();

  rl.on('line', async (line) => {
    try {
      const res = await processShellInput(line, session);
      if (res.output) console.log(res.output);
      if (res.exit) {
        rl.close();
        return;
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
    prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

if (import.meta.main) {
  startShell();
}
