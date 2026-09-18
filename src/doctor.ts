/**
 * Responsibility: Comprehensive System Diagnostics & Environment Audit.
 * Scope: Verifies Bun, Git, SQLite AST+ Graph, Projections, Leases, LLM Connectivity, and MCP Integrations.
 */

import path from 'node:path';
import fs from 'node:fs';
import { WorkflowStore } from './graph/store.ts';
import { Ticket, Epic, ModuleNode, FileNode, SymbolNode, Lesson } from './graph/ontology.ts';
import { loadConfig, resolveCloudCredentials } from './config.ts';
import { ModelRadar } from './actor/radar.ts';

export interface DiagnosticCheck {
  category: string;
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  details?: Record<string, any>;
}

export interface DiagnosticReport {
  timestamp: string;
  projectRoot: string;
  healthy: boolean;
  checks: DiagnosticCheck[];
}

export async function runDiagnostics(store: WorkflowStore, projectRoot: string): Promise<DiagnosticReport> {
  const config = loadConfig(projectRoot);
  const checks: DiagnosticCheck[] = [];

  // 1. Runtime Environment (Bun)
  const bunVersion = typeof Bun !== 'undefined' ? Bun.version : 'unknown';
  const bunOk = typeof Bun !== 'undefined';
  checks.push({
    category: 'Runtime',
    name: 'Bun Engine',
    status: bunOk ? 'ok' : 'error',
    message: bunOk ? `Bun v${bunVersion} active` : 'Bun runtime not detected'
  });

  // 2. Git Working Tree
  try {
    const gitDir = path.join(projectRoot, '.git');
    if (!fs.existsSync(gitDir)) {
      checks.push({
        category: 'VCS',
        name: 'Git Repository',
        status: 'warn',
        message: 'Current project is not inside a git repository'
      });
    } else {
      const proc = Bun.spawn(['git', 'status', '--porcelain', '-b'], {
        cwd: projectRoot,
        stdout: 'pipe',
        stderr: 'pipe'
      });
      const out = await new Response(proc.stdout).text();
      const lines = out.trim().split('\n').filter(Boolean);
      const branchLine = lines[0] || '## unknown';
      const changeCount = lines.slice(1).length;
      checks.push({
        category: 'VCS',
        name: 'Git Status',
        status: 'ok',
        message: `${branchLine.replace('## ', 'Branch: ')} (${changeCount === 0 ? 'Clean' : `${changeCount} uncommitted change(s)`})`,
        details: { changes: changeCount }
      });
    }
  } catch (err: any) {
    checks.push({
      category: 'VCS',
      name: 'Git Status',
      status: 'warn',
      message: `Could not query git: ${err.message}`
    });
  }

  // 3. AST+ Semantic Graph (SQLite)
  try {
    const dbPath = path.join(projectRoot, '.ai-workflow', 'state', 'workflow.db');
    const dbExists = fs.existsSync(dbPath);
    const tickets = await store.listEntities<Ticket>(Ticket.dcr);
    const epics = await store.listEntities<Epic>(Epic.dcr);
    const files = await store.listEntities<FileNode>(FileNode.dcr);
    const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr);

    checks.push({
      category: 'Graph',
      name: 'AST+ Semantic Graph',
      status: 'ok',
      message: `${tickets.length} tickets, ${epics.length} epics, ${files.length} indexed files, ${symbols.length} symbols`,
      details: { tickets: tickets.length, epics: epics.length, files: files.length, symbols: symbols.length }
    });
  } catch (err: any) {
    checks.push({
      category: 'Graph',
      name: 'AST+ Semantic Graph',
      status: 'error',
      message: `Graph access error: ${err.message}`
    });
  }

  // 4. Markdown Projections
  const projFiles = ['kanban.md', 'epics.md', 'modules.md', 'decisions.md'];
  const missingProj = projFiles.filter(f => !fs.existsSync(path.join(projectRoot, f)));
  if (missingProj.length > 0) {
    checks.push({
      category: 'Projections',
      name: 'Markdown Sync',
      status: 'warn',
      message: `Missing projection(s): ${missingProj.join(', ')}. Run 'aiwf sync' or 'aiwf init'.`
    });
  } else {
    checks.push({
      category: 'Projections',
      name: 'Markdown Sync',
      status: 'ok',
      message: 'All core projections present (kanban, epics, modules, decisions)'
    });
  }

  // 5. Active Ticket Leases & Blocked Tickets
  try {
    const claims = await store.getActiveClaims();
    const tickets = await store.listEntities<Ticket>(Ticket.dcr);
    const blocked = tickets.filter((t: any) => t.lane === 'Blocked');

    let leaseStatus: 'ok' | 'warn' = 'ok';
    let leaseMsg = `${claims.length} active lease(s)`;
    if (blocked.length > 0) {
      leaseStatus = 'warn';
      leaseMsg += `, ${blocked.length} blocked ticket(s)`;
    }

    checks.push({
      category: 'Tickets',
      name: 'Lease & Flow Health',
      status: leaseStatus,
      message: leaseMsg,
      details: { activeClaims: claims.length, blockedTickets: blocked.length }
    });
  } catch (err: any) {
    checks.push({
      category: 'Tickets',
      name: 'Lease & Flow Health',
      status: 'warn',
      message: `Could not inspect leases: ${err.message}`
    });
  }

  // 6. Cognitive Engine (Local Ollama / OpenAI Connectivity)
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 1500);
    const resp = await fetch(`${config.ollamaUrl}/api/version`, { signal: ctrl.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json() as any;
      checks.push({
        category: 'Cognitive',
        name: 'LLM Host (Ollama)',
        status: 'ok',
        message: `Connected to ${config.ollamaUrl} (v${data.version || 'unknown'})`
      });
    } else {
      checks.push({
        category: 'Cognitive',
        name: 'LLM Host (Ollama)',
        status: 'warn',
        message: `${config.ollamaUrl} returned HTTP ${resp.status}; offline grounded mode active`
      });
    }
  } catch {
    checks.push({
      category: 'Cognitive',
      name: 'LLM Host (Ollama)',
      status: 'ok',
      message: `Offline grounded mode active (${config.ollamaUrl} not reached)`
    });
  }

  // 7. Dynamic Gateway & Cloud Providers
  const creds = resolveCloudCredentials();
  const configuredProviders: string[] = ['ollama'];
  if (creds.openrouterApiKey) configuredProviders.push('openrouter');
  if (creds.anthropicApiKey) configuredProviders.push('anthropic');
  if (creds.geminiApiKey) configuredProviders.push('google');
  if (creds.openaiApiKey) configuredProviders.push('openai');

  const radar = new ModelRadar({
    projectRoot,
    probeIntervalDays: config.modelRadar?.probeIntervalDays ?? 3
  });
  const cachedRadar = radar.loadCache();
  const recs = radar.getRecommendations();

  checks.push({
    category: 'Routing',
    name: 'Model Gateway & Providers',
    status: 'ok',
    message: `Gateway: ${config.gateway} | Escalation: ${config.escalation?.policy || 'auto'} | Active providers: ${configuredProviders.join(', ')}`,
    details: {
      gateway: config.gateway,
      policy: config.escalation?.policy,
      blastThreshold: config.escalation?.blastRadiusThreshold,
      providers: configuredProviders,
      credentialsFound: {
        openrouter: !!creds.openrouterApiKey,
        anthropic: !!creds.anthropicApiKey,
        gemini: !!creds.geminiApiKey,
        openai: !!creds.openaiApiKey
      }
    }
  });

  // 8. Model Radar & SOTA Benchmark Cache
  checks.push({
    category: 'Radar',
    name: 'Model Radar (SOTA Discovery)',
    status: 'ok',
    message: cachedRadar
      ? `Cache active (${cachedRadar.models.length} models, updated ${new Date(cachedRadar.lastUpdated).toLocaleDateString()}) | Dev: ${recs.dev}, Design: ${recs.design}`
      : `Baseline active (6 models) | Dev: ${recs.dev}, Design: ${recs.design}. Run 'aiwf model radar --refresh' to probe OpenRouter.`,
    details: {
      source: cachedRadar ? cachedRadar.source : 'baseline',
      recommendations: recs
    }
  });

  // 9. MCP Integrations
  const home = process.env.HOME || '~';
  const ideMcp = path.join(home, '.config', 'Antigravity IDE', 'User', 'mcp_config.json');
  const cliMcp = path.join(home, '.gemini', 'config', 'mcp_config.json');
  let mcpInstalled = false;

  if (fs.existsSync(ideMcp)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ideMcp, 'utf8'));
      if (parsed.mcpServers?.['ai-workflow']) mcpInstalled = true;
    } catch {}
  }
  if (!mcpInstalled && fs.existsSync(cliMcp)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cliMcp, 'utf8'));
      if (parsed.mcpServers?.['ai-workflow']) mcpInstalled = true;
    } catch {}
  }

  checks.push({
    category: 'MCP',
    name: 'IDE/CLI Integration',
    status: mcpInstalled ? 'ok' : 'warn',
    message: mcpInstalled ? 'Registered in Antigravity MCP hosts' : 'Not registered in Antigravity MCP. Run `aiwf setup`'
  });

  const healthy = !checks.some(c => c.status === 'error');
  return {
    timestamp: new Date().toISOString(),
    projectRoot,
    healthy,
    checks
  };
}

export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [];
  lines.push(`\x1b[1;36m🩺 AI-Workflow 2.0 Doctor Report\x1b[0m`);
  lines.push(`Project Root: ${report.projectRoot}`);
  lines.push(`Overall Health: ${report.healthy ? '\x1b[32mHEALTHY ✅\x1b[0m' : '\x1b[31mDEGRADED ❌\x1b[0m'}\n`);

  for (const check of report.checks) {
    const icon = check.status === 'ok' ? '\x1b[32m[OK]\x1b[0m' : check.status === 'warn' ? '\x1b[33m[WARN]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    lines.push(`  ${icon} \x1b[1m${check.category} / ${check.name}\x1b[0m: ${check.message}`);
  }

  return lines.join('\n');
}
