#!/usr/bin/env bun
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WorkflowStore } from './store.ts';
import { indexCodebase } from './indexer.ts';
import { exportMarkdown, importMarkdown } from './sync.ts';
import { renderTuiDashboard, startWebServer } from './ui.ts';
import { InteractiveShell } from './shell.ts';
import { runMcpStdio } from './mcp.ts';
import { getBlastRadius, generateDigest, recommendNextTask, doctorCheck } from './impact.ts';
import { DecisionManager } from './decisions.ts';
import { CodeletEngine } from './compiler.ts';
import { auditCodebase } from './guidelines.ts';
import { MetricsCollector } from './metrics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.resolve(__dirname, 'cli.ts');
const mcpPath = path.resolve(__dirname, 'mcp.ts');

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase() || 'status';

let _store: WorkflowStore | null = null;
function getStore() {
  if (!_store) _store = new WorkflowStore();
  return _store;
}
function getDecisions() { return new DecisionManager(getStore()); }
function getCompiler() { return new CodeletEngine(getStore()); }
function getMetrics() { return new MetricsCollector(getStore()); }

function handleSetup(cliArgs: string[]) {
  const isJson = cliArgs.includes('--json');
  const isLinkOnly = cliArgs.includes('--link');
  const isClaude = cliArgs.includes('--claude');
  const isCursor = cliArgs.includes('--cursor');
  const isGemini = cliArgs.includes('--gemini');
  const isWindsurf = cliArgs.includes('--windsurf');

  const binDirs = [
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.bun', 'bin')
  ];

  const binaries = [
    { name: 'aiwf', target: cliPath },
    { name: 'ai-workflow', target: cliPath },
    { name: 'aiwf-mcp', target: mcpPath }
  ];

  const linkedPaths: string[] = [];
  for (const binDir of binDirs) {
    if (!fs.existsSync(binDir)) {
      try {
        fs.mkdirSync(binDir, { recursive: true });
      } catch {
        continue;
      }
    }
    for (const b of binaries) {
      const linkPath = path.join(binDir, b.name);
      try {
        if (fs.existsSync(linkPath) || fs.lstatSync(linkPath).isSymbolicLink()) {
          fs.unlinkSync(linkPath);
        }
      } catch {}
      try {
        fs.symlinkSync(b.target, linkPath);
        fs.chmodSync(b.target, 0o755);
        linkedPaths.push(linkPath);
      } catch {}
    }
  }

  const mcpConfig = {
    mcpServers: {
      "ai-workflow": {
        command: "bun",
        args: ["run", mcpPath]
      }
    }
  };

  const configs = {
    binaries: linkedPaths,
    mcpServerPath: mcpPath,
    cliPath: cliPath,
    claudeCodeCommand: `claude mcp add ai-workflow bun run ${mcpPath}`,
    mcpConfig
  };

  if (isJson) {
    console.log(JSON.stringify(configs, null, 2));
    return;
  }

  if (isLinkOnly) {
    console.log(`\x1b[32mSuccessfully linked binaries to PATH:\x1b[0m`);
    for (const p of linkedPaths) console.log(`  - ${p}`);
    return;
  }

  if (isClaude) {
    console.log(`\x1b[1;36m=== Claude Code CLI Command ===\x1b[0m`);
    console.log(`claude mcp add ai-workflow bun run ${mcpPath}\n`);
    console.log(`\x1b[1;36m=== Claude Desktop Config ===\x1b[0m`);
    console.log(JSON.stringify(mcpConfig, null, 2));
    return;
  }

  if (isCursor) {
    console.log(`\x1b[1;36m=== Cursor MCP Config (.cursor/mcp.json) ===\x1b[0m`);
    console.log(JSON.stringify(mcpConfig, null, 2));
    return;
  }

  if (isGemini) {
    console.log(`\x1b[1;36m=== Gemini CLI Config (~/.gemini/settings.json) ===\x1b[0m`);
    console.log(JSON.stringify(mcpConfig, null, 2));
    return;
  }

  if (isWindsurf) {
    console.log(`\x1b[1;36m=== Windsurf MCP Config (~/.codeium/windsurf/mcp_config.json) ===\x1b[0m`);
    console.log(JSON.stringify(mcpConfig, null, 2));
    return;
  }

  console.log(`\x1b[1;36m==================================================\x1b[0m`);
  console.log(`\x1b[1;37m   AI-WORKFLOW CLIENT & MCP SETUP WIZARD\x1b[0m`);
  console.log(`\x1b[1;36m==================================================\x1b[0m\n`);

  console.log(`\x1b[1;32m1. Global CLI Binaries Linked:\x1b[0m`);
  if (linkedPaths.length > 0) {
    for (const p of linkedPaths) console.log(`   - \x1b[1m${p}\x1b[0m`);
  } else {
    console.log(`   (Run: bun link or check permissions on ~/.local/bin)`);
  }
  console.log(`\n   You can now run: \x1b[1;33maiwf --help\x1b[0m or \x1b[1;33mai-workflow status\x1b[0m anywhere.\n`);

  console.log(`\x1b[1;32m2. Claude Code CLI Setup:\x1b[0m`);
  console.log(`   \x1b[1mclaude mcp add ai-workflow bun run ${mcpPath}\x1b[0m\n`);

  console.log(`\x1b[1;32m3. Claude Desktop / Cursor / Windsurf / Gemini CLI MCP Config:\x1b[0m`);
  console.log(JSON.stringify(mcpConfig, null, 2));
  console.log(`\n   Add to:`);
  console.log(`   - Claude Desktop: ~/.config/Claude/claude_desktop_config.json`);
  console.log(`   - Cursor: .cursor/mcp.json or Global Settings > Features > MCP`);
  console.log(`   - Gemini CLI: ~/.gemini/settings.json (mcpServers)`);
  console.log(`   - Windsurf: ~/.codeium/windsurf/mcp_config.json`);
  console.log(`\n\x1b[1;32mSetup complete! ✅\x1b[0m`);
}

async function main() {
  switch (command) {
    case 'sync': {
      console.log('\x1b[36mIndexing codebase...\x1b[0m');
      const store = getStore();
      const idx = await indexCodebase(store);
      console.log(`Indexed ${idx.filesCount} files, ${idx.symbolsCount} AST symbols, ${idx.notesCount} code notes.`);
      console.log('\x1b[36mReconciling Markdown projections and guidelines...\x1b[0m');
      await importMarkdown(store);
      await exportMarkdown(store);
      console.log('\x1b[32mSync complete! kanban.md, epics.md, decisions.md, and modules.md updated.\x1b[0m');
      break;
    }

    case 'audit': {
      console.log('\x1b[36mAuditing codebase against enforcement policies and guidelines...\x1b[0m');
      const res = await auditCodebase(getStore());
      if (res.passed) {
        console.log('\x1b[32mAudit Passed! 0 guideline violations found. ✅\x1b[0m');
      } else {
        console.log(`\x1b[31mAudit Failed! Found ${res.violationsCount} violation(s):\x1b[0m`);
        for (const f of res.findings.slice(0, 15)) {
          console.log(`  \x1b[1m${f.file}:${f.line}\x1b[0m [${f.ruleId}]: ${f.message}`);
        }
        if (res.findings.length > 15) {
          console.log(`  ... and ${res.findings.length - 15} more findings.`);
        }
      }
      break;
    }

    case 'metrics': {
      const summary = getMetrics().getSummary();
      console.log(`\x1b[1;36m=== Context & Performance Telemetry Metrics ===\x1b[0m`);
      console.log(`Total Context Packs: \x1b[1m${summary.totalContextPacks}\x1b[0m`);
      console.log(`Total Tokens Saved:  \x1b[1;32m${summary.totalTokensSaved.toLocaleString()} tokens\x1b[0m`);
      console.log(`Avg Compression:     \x1b[1;32m${summary.averageCompressionRatio}%\x1b[0m`);
      console.log(`Avg Context Pack:    \x1b[1m${summary.averageContextPackDurationMs}ms\x1b[0m`);
      if (Object.keys(summary.operationsSummary).length > 0) {
        console.log(`\n\x1b[1mOperations Breakdown:\x1b[0m`);
        for (const [op, stats] of Object.entries(summary.operationsSummary)) {
          console.log(`  - \x1b[33m${op}\x1b[0m: ${stats.count} calls (avg ${stats.avgDurationMs}ms, failure rate: ${stats.failureRate}%)`);
        }
      }
      break;
    }

    case 'status':
    case 'view': {
      console.log(renderTuiDashboard(getStore()));
      break;
    }

    case 'shell':
    case 'repl': {
      const shell = new InteractiveShell(getStore());
      await shell.start();
      break;
    }

    case 'mcp': {
      await runMcpStdio();
      break;
    }

    case 'impact': {
      const target = args[1];
      if (!target) {
        console.log('Usage: ai-workflow impact <file-or-symbol>');
        process.exit(1);
      }
      const res = getBlastRadius(getStore(), target);
      console.log(`\x1b[1;36mBlast Radius for "${target}":\x1b[0m ${res.affectedFilesCount} files affected.`);
      console.log(`Files: ${res.affectedFiles.join(', ')}`);
      console.log(`Affected Tickets: ${res.affectedTickets.map(t => t.id).join(', ') || 'None'}`);
      console.log(`Recommended Tests: ${res.recommendedTests.join(', ')}`);
      break;
    }

    case 'digest':
    case 'standup': {
      const hours = parseInt(args[1] || '24', 10);
      const dig = generateDigest(getStore(), hours);
      console.log(`\x1b[1;32m=== Daily Digest (Past ${hours}h) ===\x1b[0m`);
      console.log(`Completed Tickets: ${dig.completedTickets.map(t => t.id).join(', ') || 'None'}`);
      console.log(`In Progress: ${dig.inProgressTickets.map(t => t.id).join(', ') || 'None'}`);
      console.log(`Recent ADR Decisions: ${dig.recentDecisions.map(d => d.id).join(', ') || 'None'}`);
      console.log(`Open Bug Badges: ${dig.openBugsCount} 🔴`);
      break;
    }

    case 'next': {
      const next = recommendNextTask(getStore());
      console.log(`\x1b[1;33mRecommended Next Task:\x1b[0m ${next.ticket ? `${next.ticket.id}: ${next.ticket.title}` : 'None'}`);
      console.log(`Reason: ${next.reason}`);
      break;
    }

    case 'doctor': {
      const fix = args.includes('--fix');
      const doc = doctorCheck(getStore(), { fix });
      console.log(`\x1b[1;34m=== Repo Doctor Health Report ===\x1b[0m`);
      console.log(`Total Files: ${doc.totalFiles}`);
      console.log(`Unlinked Bug Notes (TODO/FIXME): ${doc.unlinkedBugNotes}`);
      if (fix) {
        console.log(`Auto-created ${doc.autoFixedTickets.length} bug tickets in Todo lane.`);
      } else if (doc.unlinkedBugNotes > 0) {
        console.log(`Tip: run 'ai-workflow doctor --fix' to auto-generate tickets for unlinked bug notes.`);
      }
      break;
    }

    case 'decision': {
      const sub = args[1]?.toLowerCase();
      const decisions = getDecisions();
      const store = getStore();
      if (sub === 'revert' && args[2]) {
        const reason = args.slice(3).join(' ') || 'Reverted by operator';
        const res = decisions.revertDecision(args[2], reason);
        await exportMarkdown(store);
        console.log(`\x1b[33mReverted decision ${args[2]}.\x1b[0m Affected tickets cancelled: ${res.affectedTickets.map(t => t.id).join(', ') || 'None'}`);
      } else if (sub === 'accept' && args[2]) {
        decisions.acceptDecision(args[2]);
        await exportMarkdown(store);
        console.log(`\x1b[32mAccepted decision ${args[2]}.\x1b[0m`);
      } else if (sub === 'propose' && args[2] && args[3]) {
        const id = args[2];
        const title = args[3];
        const body = args.slice(4).join(' ') || '';
        decisions.proposeDecision({ id, title, body });
        await exportMarkdown(store);
        console.log(`\x1b[32mProposed decision ${id}: ${title}\x1b[0m`);
      } else {
        const list = decisions.listDecisions();
        console.log(`\x1b[1;34m=== Architectural Decision Records (ADRs) ===\x1b[0m`);
        for (const d of list) {
          console.log(`- \x1b[1m${d.id}\x1b[0m [${d.status}]: ${d.title}`);
        }
      }
      break;
    }

    case 'ui': {
      const port = parseInt(args[1] || '3456', 10);
      startWebServer(getStore(), port);
      break;
    }

    case 'run': {
      const wish = args.slice(1).join(' ');
      if (!wish) {
        console.log('Usage: ai-workflow run <natural language wish>');
        process.exit(1);
      }
      console.log(`\x1b[33mSynthesizing and running routine for: "${wish}"...\x1b[0m`);
      const codelet = await getCompiler().compileWish(wish);
      console.log(`Compiled codelet: ${codelet.meta.title}`);
      const res = await codelet.execute({});
      console.log('Result:', res);
      break;
    }

    case 'claim': {
      const ticketId = args[1];
      const agentId = args[2] || process.env.USER || 'agent-1';
      const durationMin = parseInt(args[3] || '30', 10);
      if (!ticketId) {
        console.log('Usage: ai-workflow claim <ticketId> [agentId] [durationMinutes]');
        process.exit(1);
      }
      const res = getStore().claimTicket(ticketId, agentId, durationMin * 60 * 1000);
      if (res.success) {
        console.log(`\x1b[32mTicket ${ticketId} claimed by ${agentId} until ${res.lease?.expiresAt} ✅\x1b[0m`);
      } else {
        console.log(`\x1b[31mFailed to claim ticket:\x1b[0m ${res.reason}`);
      }
      break;
    }

    case 'release': {
      const ticketId = args[1];
      const agentId = args[2];
      if (!ticketId) {
        console.log('Usage: ai-workflow release <ticketId> [agentId]');
        process.exit(1);
      }
      const res = getStore().releaseTicket(ticketId, agentId);
      if (res.success) {
        console.log(`\x1b[32mTicket ${ticketId} released successfully ✅\x1b[0m`);
      } else {
        console.log(`\x1b[31mFailed to release ticket:\x1b[0m ${res.reason}`);
      }
      break;
    }

    case 'setup':
    case 'install': {
      handleSetup(args.slice(1));
      break;
    }

    case 'help':
    default: {
      console.log(`
ai-workflow - Bun-First Causal Engineering OS & Project Visibility Engine

Commands:
  setup / install            Link global CLI binaries & print/export AI client MCP configurations
  sync                       Index codebase, parse symbols & notes, and reconcile Markdown
  status / view              Print ANSI TUI project health & module dependency matrix
  audit                      Validate codebase against enforcement policies & guidelines
  metrics                    Display context compression & execution performance telemetry
  shell / repl               Launch interactive multi-mode REPL (/design, /product, /dev, /triage)
  mcp                        Start Model Context Protocol (MCP) server over stdio
  impact <target>            Run blast radius analysis on a file or AST symbol
  digest [hours]             Print daily standup summary (completed tasks, ADRs, bugs)
  next                       Recommend the next high-leverage task
  doctor [--fix]             Run repo health check and optionally auto-generate bug tickets
  decision <list|revert|...> Manage versioned Architectural Decision Records (ADRs)
  ui [port]                  Launch local web graph & health dashboard (default: 3456)
  run <wish>                 Synthesize and execute a deterministic JS routine
      `);
      break;
    }
  }
}

main().catch(err => {
  console.error('\x1b[31mError:\x1b[0m', err);
  process.exit(1);
});
