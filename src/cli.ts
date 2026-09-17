#!/usr/bin/env bun
/**
 * Responsibility: Unified CLI entrypoint for AI-Workflow 2.0.
 * Scope: sync, status, audit, metrics, shell, mcp, exec, setup.
 */

import path from 'node:path';
import fs from 'node:fs';
import { WorkflowStore, findProjectRoot } from './graph/store.ts';
import { initializeTools, registry } from './tools/index.ts';
import { exportProjections, importProjections } from './graph/projections.ts';
import { startShell } from './shell.ts';
import { createMcpServer } from './mcp.ts';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WorkflowActor, classifyIntentMode } from './actor/engine.ts';

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  const root = findProjectRoot().root;
  const store = new WorkflowStore(root);
  initializeTools();

  switch (command) {
    case 'sync': {
      console.log(`🔄 Synchronizing AST+ Graph with Markdown Projections in ${root}...`);
      const imp = await importProjections(store, root);
      const exp = await exportProjections(store, root);
      console.log(`✅ Reconciled ${imp.importedChanges} disk change(s).`);
      console.log(`✅ Exported ${exp.exportedFiles.length} file(s): ${exp.exportedFiles.join(', ')}`);
      break;
    }

    case 'status': {
      const git = await registry.execute('get_git_status', {}, { store, projectRoot: root });
      const claims = await store.getActiveClaims();
      const tickets = await registry.execute('list_tickets', {}, { store, projectRoot: root });
      const env = await registry.execute('get_environment_info', {}, { store, projectRoot: root });

      console.log(`\x1b[1;36m🏛️  AI-Workflow 2.0 Status\x1b[0m`);
      console.log(`Project Root: ${root}`);
      console.log(`Runtime:      ${env.runtime} on ${env.platform}`);
      console.log(`Git:          Branch '${git.branch || 'unknown'}' (${git.clean ? 'clean' : `${git.totalChanges} changes`})`);
      console.log(`Tickets:      ${tickets.length} total across Kanban lanes`);
      console.log(`Active Leases: ${claims.length === 0 ? 'None' : claims.map(c => `${c.ticketId} -> ${c.claim.agentId}`).join(', ')}`);
      break;
    }

    case 'audit': {
      console.log(`🔍 Auditing AI-Workflow AST+ Graph & Codebase Health...`);
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

    case 'shell': {
      await startShell({ store, projectRoot: root });
      break;
    }

    case 'mcp': {
      const { server } = createMcpServer({ store, projectRoot: root });
      const transport = new StdioServerTransport();
      await server.connect(transport);
      break;
    }

    case 'exec': {
      const wish = args.slice(1).join(' ');
      if (!wish) {
        console.error(`Usage: aiwf exec "<instruction or wish>"`);
        process.exit(1);
      }
      const actor = new WorkflowActor({ store, projectRoot: root, preferLocal: true });
      const res = await actor.execute(wish);
      console.log(`[${res.mode.toUpperCase()}] ${res.answer}`);
      break;
    }

    case 'setup': {
      const link = args.includes('--link');
      const stateDir = path.join(root, '.ai-workflow', 'state');
      fs.mkdirSync(stateDir, { recursive: true });
      await exportProjections(store, root);

      if (link) {
        const binDir = path.join(process.env.HOME || '~', '.local', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const targetSymlink = path.join(binDir, 'aiwf');
        const cliPath = path.resolve(__filename);
        try {
          if (fs.existsSync(targetSymlink)) fs.unlinkSync(targetSymlink);
          fs.symlinkSync(cliPath, targetSymlink);
          console.log(`🔗 Symlinked ${cliPath} -> ${targetSymlink}`);
        } catch (err: any) {
          console.warn(`Could not symlink aiwf: ${err.message}`);
        }
      }
      console.log(`✅ AI-Workflow initialized successfully in ${root}`);
      break;
    }

    case 'help':
    default: {
      console.log(`
\x1b[1;36m🏛️  AI-Workflow 2.0 (Bun-First Context OS)\x1b[0m

Usage: aiwf <command> [options]

Commands:
  sync           Synchronize SQLite Graph bi-directionally with Markdown Projections
  status         Show working tree, active ticket leases, and project status
  audit          Run architecture and graph integrity audit
  metrics        Show Kanban distribution and code churn hotspots
  shell          Launch interactive dual-nature Terminal REPL
  mcp            Run Stdio MCP server for AGY, Claude Code, Cursor
  exec <wish>    Execute one-off autonomous task or query
  setup [--link] Initialize .ai-workflow state and optionally symlink binary
  help           Show this help manual
`);
      break;
    }
  }

  store.close();
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
