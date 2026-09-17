#!/usr/bin/env bun
/**
 * Responsibility: Unified CLI entrypoint for AI-Workflow 2.0.
 * Scope: sync, status, audit, doctor, metrics, init, setup, diff, tickets, next, claim,
 * release, symbol, slice, outline, blast, index, patch, config, exec, shell, mcp.
 */

import path from 'node:path';
import fs from 'node:fs';
import { WorkflowStore, findProjectRoot } from './graph/store.ts';
import { initializeTools, registry } from './tools/index.ts';
import { exportProjections, importProjections } from './graph/projections.ts';
import { indexCodebase } from './graph/indexer.ts';
import { startShell } from './shell.ts';
import { createMcpServer } from './mcp.ts';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WorkflowActor } from './actor/engine.ts';
import { runDiagnostics, formatDiagnosticReport } from './doctor.ts';
import { initProject, installGlobalBinary, configureMcp } from './setup.ts';
import { loadConfig, saveConfig } from './config.ts';

const args = process.argv.slice(2);
const command = args[0] || (process.stdin.isTTY ? 'shell' : 'help');

async function main() {
  const root = findProjectRoot().root;
  let storeInstance: WorkflowStore | null = null;
  const getStore = () => {
    if (!storeInstance) storeInstance = new WorkflowStore(root);
    return storeInstance;
  };
  initializeTools();

  switch (command) {
    case 'sync': {
      console.log(`🔄 Synchronizing AST+ Graph with Markdown Projections in ${root}...`);
      const store = getStore();
      const imp = await importProjections(store, root);
      const exp = await exportProjections(store, root);
      console.log(`✅ Reconciled ${imp.importedChanges} disk change(s).`);
      console.log(`✅ Exported ${exp.exportedFiles.length} file(s): ${exp.exportedFiles.join(', ')}`);
      break;
    }

    case 'status': {
      const store = getStore();
      const git = await registry.execute('get_git_status', {}, { store, projectRoot: root });
      const claims = await store.getActiveClaims();
      const tickets = await registry.execute('list_tickets', {}, { store, projectRoot: root });
      const env = await registry.execute('get_environment_info', {}, { store, projectRoot: root });

      console.log(`\x1b[1;36m🏛️  AI-Workflow 2.0 Status\x1b[0m`);
      console.log(`Project Root: ${root}`);
      console.log(`Runtime:      ${env.runtime} on ${env.platform}`);
      console.log(`Git:          Branch '${git.branch || 'unknown'}' (${git.clean ? 'clean' : `${git.totalChanges} changes`})`);
      console.log(`Tickets:      ${tickets.length} total across Kanban lanes`);
      console.log(`Active Leases: ${claims.length === 0 ? 'None' : claims.map((c: any) => `${c.ticketId} -> ${c.claim.agentId}`).join(', ')}`);
      break;
    }

    case 'doctor': {
      const store = getStore();
      const report = await runDiagnostics(store, root);
      console.log(formatDiagnosticReport(report));
      break;
    }

    case 'audit': {
      console.log(`🔍 Auditing AI-Workflow AST+ Graph & Codebase Health...`);
      const store = getStore();
      const tickets = await registry.execute('list_tickets', {}, { store, projectRoot: root });
      const blocked = tickets.filter((t: any) => t.lane === 'Blocked');
      const git = await registry.execute('get_git_status', {}, { store, projectRoot: root });

      let violations = 0;
      if (blocked.length > 0) {
        console.warn(`⚠️  Found ${blocked.length} blocked ticket(s): ${blocked.map((t: any) => t.id).join(', ')}`);
        violations += blocked.length;
      }

      if (!git.clean) {
        console.warn(`⚠️  Working tree has ${git.totalChanges} uncommitted change(s). Run 'aiwf sync' or commit.`);
      }

      console.log(`✨ Audit complete. Graph health: ${violations === 0 ? '100% HEALTHY' : `${violations} issue(s) flagged`}.`);
      break;
    }

    case 'metrics': {
      console.log(`📊 AI-Workflow Project Metrics`);
      const store = getStore();
      const tickets = await registry.execute('list_tickets', {}, { store, projectRoot: root });
      const lanes: Record<string, number> = {};
      for (const t of tickets) lanes[(t as any).lane] = (lanes[(t as any).lane] || 0) + 1;

      console.log(`Kanban Distribution:`);
      for (const [lane, count] of Object.entries(lanes)) {
        console.log(`  - ${lane.padEnd(14)}: ${count}`);
      }

      const hotspots = await registry.execute('get_git_hotspots', { days: 14 }, { store, projectRoot: root });
      if (hotspots.hotspots.length > 0) {
        console.log(`\nTop Code Churn Hotspots (14 days):`);
        for (const h of hotspots.hotspots.slice(0, 5)) {
          console.log(`  - ${h.file} (${h.changes} touches)`);
        }
      }
      break;
    }

    case 'init': {
      console.log(`🚀 Initializing AI-Workflow in ${root}...`);
      const initRes = await initProject(root);
      console.log(`✅ Indexed ${initRes.filesIndexed} file(s), ${initRes.symbolsIndexed} symbol(s), ${initRes.notesIndexed} note(s).`);
      console.log(`✅ Generated projections: ${initRes.projectionsExported.join(', ')}`);
      console.log(`✨ Ready! Run 'aiwf shell' or 'aiwf status' to begin.`);
      break;
    }

    case 'setup': {
      const isGlobal = args.includes('--global') || args.includes('-g') || args.includes('--link') || args.length === 1;
      const isMcp = args.includes('--mcp') || args.length === 1;

      console.log(`⚙️  Running AI-Workflow Setup...`);
      if (isGlobal) {
        const binRes = installGlobalBinary();
        console.log(`🔗 Symlinked CLI: ${binRes.symlinkTarget} -> ${binRes.binaryPath}`);
        if (!binRes.pathIncluded) {
          console.log(`ℹ️  Note: Ensure '${path.dirname(binRes.symlinkTarget)}' is in your $PATH.`);
        }
      }

      if (isMcp) {
        const mcpRes = configureMcp();
        console.log(`🔌 Configured MCP hosts: ${mcpRes.hostsUpdated.join(', ') || 'None'}`);
        console.log(`📄 Exported ${mcpRes.schemasCount} tool schema(s) to ${mcpRes.schemasDir}`);
      }

      console.log(`✨ Setup complete! 'aiwf' is ready globally and in your IDE.`);
      break;
    }

    case 'diff': {
      const store = getStore();
      const diff = await registry.execute('get_git_diff', {}, { store, projectRoot: root });
      if (diff.diff) {
        console.log(diff.diff.trim());
      } else {
        console.log(`Working tree clean. No uncommitted changes.`);
      }
      break;
    }

    case 'tickets': {
      const store = getStore();
      const lane = args[1] as any;
      const tickets = await registry.execute('list_tickets', { lane }, { store, projectRoot: root });
      if (tickets.length === 0) {
        console.log(`No tickets found${lane ? ` in lane '${lane}'` : ''}.`);
      } else {
        for (const t of tickets) {
          console.log(`[${t.lane.padEnd(11)}] ${t.id.padEnd(12)}: ${t.title}${t.claim ? ` (Claimed: ${t.claim.agentId})` : ''}`);
        }
      }
      break;
    }

    case 'next': {
      const store = getStore();
      const agentId = args[1];
      const nextTask = await registry.execute('recommend_next_task', { agentId }, { store, projectRoot: root });
      if (!nextTask.ticket) {
        console.log(`✨ No pending tasks. All tickets completed or leased!`);
      } else {
        console.log(`\x1b[1;32m👉 Recommended Task: [${nextTask.ticket.id}] ${nextTask.ticket.title}\x1b[0m`);
        console.log(`Lane:   ${nextTask.ticket.lane}`);
        console.log(`Reason: ${nextTask.reason}`);
      }
      break;
    }

    case 'claim': {
      const ticketId = args[1];
      if (!ticketId) {
        console.error(`Usage: aiwf claim <ticketId> [--agent <id>] [--minutes <n>]`);
        process.exit(1);
      }
      let agentId = 'human-operator';
      let durationMinutes = 30;
      const agentIdx = args.indexOf('--agent');
      if (agentIdx !== -1 && args[agentIdx + 1]) agentId = args[agentIdx + 1];
      const minIdx = args.indexOf('--minutes');
      if (minIdx !== -1 && args[minIdx + 1]) durationMinutes = Number(args[minIdx + 1]);

      const store = getStore();
      const res = await registry.execute('claim_ticket', { ticketId, agentId, durationMinutes }, { store, projectRoot: root });
      if (res.success) {
        console.log(`✅ Claimed ticket '${ticketId}' for ${durationMinutes} minutes by '${agentId}'.`);
      } else {
        console.error(`❌ Failed to claim ticket: ${res.message}`);
        process.exit(1);
      }
      break;
    }

    case 'release': {
      const ticketId = args[1];
      if (!ticketId) {
        console.error(`Usage: aiwf release <ticketId>`);
        process.exit(1);
      }
      const store = getStore();
      const res = await registry.execute('release_ticket', { ticketId }, { store, projectRoot: root });
      if (res.success) {
        console.log(`✅ Released lease on ticket '${ticketId}'.`);
      } else {
        console.error(`❌ Ticket '${ticketId}' not found or has no active lease.`);
        process.exit(1);
      }
      break;
    }

    case 'symbol': {
      const name = args[1];
      if (!name) {
        console.error(`Usage: aiwf symbol <symbolName>`);
        process.exit(1);
      }
      const store = getStore();
      const symbols = await registry.execute('find_symbol', { name }, { store, projectRoot: root });
      if (symbols.length === 0) {
        console.log(`No symbol found matching '${name}'.`);
      } else {
        for (const s of symbols) {
          console.log(`[${s.kind}] ${s.name} -> ${s.filePath}:${s.line || 1}${s.exported ? ' (exported)' : ''}`);
        }
      }
      break;
    }

    case 'slice': {
      const filePath = args[1];
      const symbolName = args[2];
      if (!filePath || !symbolName) {
        console.error(`Usage: aiwf slice <filePath> <symbolName>`);
        process.exit(1);
      }
      const store = getStore();
      const slice = await registry.execute('get_symbol_source', { filePath, symbolName }, { store, projectRoot: root });
      if (!slice.code) {
        console.error(`Symbol '${symbolName}' not found in ${filePath}.`);
        process.exit(1);
      }
      console.log(`// ${filePath}:${slice.startLine}-${slice.endLine}`);
      console.log(slice.code);
      break;
    }

    case 'outline': {
      const filePath = args[1];
      if (!filePath) {
        console.error(`Usage: aiwf outline <filePath>`);
        process.exit(1);
      }
      const store = getStore();
      const outline = await registry.execute('get_file_outline', { filePath }, { store, projectRoot: root });
      if (outline.symbols.length === 0) {
        console.log(`No symbols found in ${filePath}.`);
      } else {
        console.log(`${filePath} (${outline.symbolCount} symbols):`);
        for (const s of outline.symbols) {
          console.log(`  - Line ${(s.line || 1).toString().padEnd(4)} [${s.kind}] ${s.name}`);
        }
      }
      break;
    }

    case 'blast': {
      const target = args[1];
      if (!target) {
        console.error(`Usage: aiwf blast <targetFilePathOrSymbol>`);
        process.exit(1);
      }
      const store = getStore();
      const blast = await registry.execute('analyze_blast_radius', { target }, { store, projectRoot: root });
      console.log(`Blast Radius for '${target}':`);
      console.log(`  Affected Files (${blast.affectedFiles.length}): ${blast.affectedFiles.join(', ') || 'None'}`);
      console.log(`  Recommended Tests (${blast.recommendedTests.length}): ${blast.recommendedTests.join(', ') || 'None'}`);
      console.log(`  Dependent Tickets (${blast.dependentTickets.length}): ${blast.dependentTickets.join(', ') || 'None'}`);
      break;
    }

    case 'index': {
      console.log(`🔄 Indexing AST symbols across codebase...`);
      const store = getStore();
      const res = await indexCodebase(store, root);
      console.log(`✅ Indexed ${res.filesCount} file(s), ${res.symbolsCount} symbol(s), ${res.notesCount} note(s).`);
      break;
    }

    case 'patch': {
      const filePath = args[1];
      const targetContent = args[2];
      const replacementContent = args[3];
      if (!filePath || targetContent === undefined || replacementContent === undefined) {
        console.error(`Usage: aiwf patch <filePath> <targetContent> <replacementContent>`);
        process.exit(1);
      }
      const store = getStore();
      const res = await registry.execute('apply_block_patch', { filePath, targetContent, replacementContent }, { store, projectRoot: root });
      if (res.success) {
        console.log(`✅ Applied patch to ${filePath} (${res.bytesModified > 0 ? `+${res.bytesModified}` : res.bytesModified} bytes).`);
      } else {
        console.error(`❌ Patch failed: ${res.message}`);
        process.exit(1);
      }
      break;
    }

    case 'config': {
      const action = args[1] || 'get';
      if (action === 'get') {
        const cfg = loadConfig(root);
        const key = args[2];
        if (key) {
          console.log(`${key} = ${(cfg as any)[key] ?? 'undefined'}`);
        } else {
          console.log(JSON.stringify(cfg, null, 2));
        }
      } else if (action === 'set') {
        const key = args[2];
        const val = args[3];
        if (!key || val === undefined) {
          console.error(`Usage: aiwf config set <key> <value>`);
          process.exit(1);
        }
        let parsedVal: any = val;
        if (val === 'true') parsedVal = true;
        else if (val === 'false') parsedVal = false;
        else if (!isNaN(Number(val))) parsedVal = Number(val);

        const updated = saveConfig(root, { [key]: parsedVal });
        console.log(`✅ Updated config: ${key} = ${(updated as any)[key]}`);
      } else {
        console.error(`Usage: aiwf config [get|set] [key] [value]`);
      }
      break;
    }

    case 'exec': {
      const wish = args.slice(1).join(' ');
      if (!wish) {
        console.error(`Usage: aiwf exec "<instruction or wish>"`);
        process.exit(1);
      }
      const store = getStore();
      const actor = new WorkflowActor({ store, projectRoot: root, preferLocal: true });
      const res = await actor.execute(wish);
      console.log(`[${res.mode.toUpperCase()}] ${res.answer}`);
      break;
    }

    case 'eval': {
      const code = args.slice(1).join(' ');
      if (!code) {
        console.error(`Usage: aiwf eval "<code>"`);
        process.exit(1);
      }
      const store = getStore();
      const res = await registry.execute('script_eval', { code }, { store, projectRoot: root });
      if (res.success) {
        console.log(typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : res.result);
      } else {
        console.error(`Eval Error: ${res.error}`);
        process.exit(1);
      }
      break;
    }

    case 'shell': {
      const store = getStore();
      await startShell({ store, projectRoot: root });
      break;
    }

    case 'mcp': {
      const store = getStore();
      const { server } = createMcpServer({ store, projectRoot: root });
      const transport = new StdioServerTransport();
      await server.connect(transport);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`
\x1b[1;36m🏛️  AI-Workflow 2.0 (Bun-First Context OS)\x1b[0m

Usage: aiwf <command> [options]

Core Workflow Commands:
  status                                 Show working tree, active ticket leases, and project status
  sync                                   Synchronize SQLite Graph bi-directionally with Markdown Projections
  next [agentId]                         Algorithmic task selector: active lease -> P1 bugs -> Todo tasks
  tickets [lane]                         List tickets (Backlog, Todo, In Progress, Done, Blocked)
  claim <ticketId> [--agent <a>] [-m <m>] Atomically lease a ticket with TTL
  release <ticketId>                     Release active ticket lease

Intelligence & Code Navigation:
  diff                                   Show uncommitted git diff cleanly
  symbol <symbolName>                    Locate symbol across codebase in AST+ graph
  slice <filePath> <symbolName>          Extract exact source code snippet of a symbol
  outline <filePath>                     Print AST symbol outline for a file
  blast <targetFilePathOrSymbol>         Analyze blast radius, affected files, and recommended tests
  index                                  Re-index codebase AST symbols and modules into graph
  patch <file> <search> <replace>        Apply deterministic AST block patch via block-patcher

Diagnostics & Health:
  doctor                                 Run comprehensive environment, graph, LLM, and MCP diagnostics
  audit                                  Audit architecture and graph integrity
  metrics                                Show Kanban distribution and git churn hotspots

Configuration & Execution:
  init                                   Zero-config project initialization in current directory
  setup [--global] [--mcp]               Install global symlink (~/.local/bin/aiwf) and configure MCP
  config [get|set] [key] [val]           Inspect or update settings in .ai-workflow/config.json
  eval "<code>"                          Evaluate short TypeScript/JS code against live store
  exec "<wish>"                          Execute one-off autonomous task or query via Workflow Actor
  shell                                  Launch interactive dual-nature Terminal REPL (<5ms fast-paths)
  mcp                                    Run Stdio MCP server for Antigravity IDE, Claude Code, Cursor
  help                                   Show this help manual
`);
      break;
    }
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
