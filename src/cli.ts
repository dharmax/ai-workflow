#!/usr/bin/env bun
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

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase() || 'status';

const store = new WorkflowStore();
const decisions = new DecisionManager(store);
const compiler = new CodeletEngine(store);
const metrics = new MetricsCollector(store);

async function main() {
  switch (command) {
    case 'sync': {
      console.log('\x1b[36mIndexing codebase...\x1b[0m');
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
      const res = await auditCodebase(store);
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
      const summary = metrics.getSummary();
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
      console.log(renderTuiDashboard(store));
      break;
    }

    case 'shell':
    case 'repl': {
      const shell = new InteractiveShell(store);
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
      const res = getBlastRadius(store, target);
      console.log(`\x1b[1;36mBlast Radius for "${target}":\x1b[0m ${res.affectedFilesCount} files affected.`);
      console.log(`Files: ${res.affectedFiles.join(', ')}`);
      console.log(`Affected Tickets: ${res.affectedTickets.map(t => t.id).join(', ') || 'None'}`);
      console.log(`Recommended Tests: ${res.recommendedTests.join(', ')}`);
      break;
    }

    case 'digest':
    case 'standup': {
      const hours = parseInt(args[1] || '24', 10);
      const dig = generateDigest(store, hours);
      console.log(`\x1b[1;32m=== Daily Digest (Past ${hours}h) ===\x1b[0m`);
      console.log(`Completed Tickets: ${dig.completedTickets.map(t => t.id).join(', ') || 'None'}`);
      console.log(`In Progress: ${dig.inProgressTickets.map(t => t.id).join(', ') || 'None'}`);
      console.log(`Recent ADR Decisions: ${dig.recentDecisions.map(d => d.id).join(', ') || 'None'}`);
      console.log(`Open Bug Badges: ${dig.openBugsCount} 🔴`);
      break;
    }

    case 'next': {
      const next = recommendNextTask(store);
      console.log(`\x1b[1;33mRecommended Next Task:\x1b[0m ${next.ticket ? `${next.ticket.id}: ${next.ticket.title}` : 'None'}`);
      console.log(`Reason: ${next.reason}`);
      break;
    }

    case 'doctor': {
      const fix = args.includes('--fix');
      const doc = doctorCheck(store, { fix });
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
      startWebServer(store, port);
      break;
    }

    case 'run': {
      const wish = args.slice(1).join(' ');
      if (!wish) {
        console.log('Usage: ai-workflow run <natural language wish>');
        process.exit(1);
      }
      console.log(`\x1b[33mSynthesizing and running routine for: "${wish}"...\x1b[0m`);
      const codelet = await compiler.compileWish(wish);
      console.log(`Compiled codelet: ${codelet.meta.title}`);
      const res = await codelet.execute({});
      console.log('Result:', res);
      break;
    }

    case 'help':
    default: {
      console.log(`
ai-workflow - Bun-First Causal Engineering OS & Project Visibility Engine

Commands:
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
