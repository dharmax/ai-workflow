#!/usr/bin/env bun
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WorkflowStore } from './store.ts';
import { DecisionManager } from './decisions.ts';
import { CodeletEngine } from './compiler.ts';
import { LocalGitTransport } from './transport.ts';
import { MetricsCollector } from './metrics.ts';
import { registry, type CommandContext } from './registry.ts';
import { startWebServer } from './ui.ts';
import { InteractiveShell } from './shell.ts';
import { runMcpStdio } from './mcp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.resolve(__dirname, 'cli.ts');
const mcpPath = path.resolve(__dirname, 'mcp.ts');
const skillSourcePath = path.resolve(repoRoot, 'skills', 'ai-workflow', 'SKILL.md');

let _ctx: CommandContext | null = null;
function getContext(): CommandContext {
  if (!_ctx) {
    const store = new WorkflowStore();
    _ctx = {
      store,
      decisions: new DecisionManager(store),
      compiler: new CodeletEngine(store),
      transport: new LocalGitTransport(store),
      metrics: new MetricsCollector(store),
      projectRoot: store.root
    };
  }
  return _ctx;
}

function parseCliFlags(rawArgs: string[]): { flags: Record<string, any>; nonFlags: string[] } {
  const flags: Record<string, any> = {};
  const nonFlags: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=', 2);
        flags[k] = v;
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        flags[key] = rawArgs[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      flags[key] = true;
    } else {
      nonFlags.push(arg);
    }
  }

  return { flags, nonFlags };
}

function printHelp() {
  console.log(`
\x1b[1;36m========================================================================\x1b[0m
\x1b[1;37m   AI-WORKFLOW (aiwf) - Bun-First Causal Engineering OS & Agent Bridge\x1b[0m
\x1b[1;36m========================================================================\x1b[0m

\x1b[1;33mUsage:\x1b[0m
  aiwf <command> [subcommand] [arguments...] [--json]

\x1b[1;32m📊 Graph & Project Visibility:\x1b[0m
  status / view                         Print project health, lanes, and module completion matrix
  sync                                  Index codebase AST symbols, notes & reconcile Markdown
  search <query>                        Search entities, decisions, and in-code notes (TODO/BUG)
  symbol <name>                         Fast AST symbol lookup (definitions, callers, callees)
  slice <file> <symbol>                 Surgical AST slice: read only function/class source lines
  outline <file>                        Compact AST outline & signatures for a file
  burndown                              Real-time epic completion percentages & burndown
  git-status                            Parsed git working tree state & branch info
  lint-graph                            Check graph integrity (orphans, dead symbols, stale claims)
  ui-state                              Output unified cockpit JSON state

\x1b[1;32m🎟️ Ticket & Context Lifecycle:\x1b[0m
  context <ticketId> [--budget N]       Extract bounded token context pack (symbols, guidelines, tests)
  ticket list [lane]                    List tickets in Backlog, Todo, In Progress, Done, Blocked
  ticket inspect <ticketId>             Deep inspection (AST symbols, run artifacts, relations)
  ticket create <title...>              Create a new ticket in Todo lane and sync kanban.md
  ticket move <id> <lane> [status]      Move a ticket and record execution lessons
  lesson <ticketId> <text...>           Persist bug lesson into SQLite memory for future tickets
  pr-summary [ticketId]                 Format conventional commit & PR description
  start <ticketId>                      Move ticket to In Progress (with title preservation)
  done <ticketId>                       Mark ticket as Done (verified) and sync kanban.md
  claim <id> [agent] [mins]             Atomically lease a ticket to prevent agent collision
  release <ticketId>                    Release an active ticket lease
  diff [target]                         Self-review working tree or file diff before ticket closure
  next                                  Recommend highest leverage next task from causal graph

\x1b[1;32m💥 Impact, Pre-Flight Gates & Health:\x1b[0m
  impact <file-or-symbol>               Calculate blast radius, affected tickets & test targets
  gate <file-or-symbol>                 Pre-flight verification gate checklist before editing
  test-target <file>                    Resolve paired test file and exact test runner command
  triage [command]                      Triage & parse test failures into compact JSON summary
  hotspots [days]                       Identify recent churn hotspots & active files
  feature-impact <wish...>              Semantic AI blast radius for proposed features
  digest [hours]                        Print standup digest (completed tasks, ADRs, bugs)
  doctor [--fix]                        Run diagnostics & optionally auto-generate bug tickets

\x1b[1;32m⚡ Codelets & Deterministic Routines:\x1b[0m
  codelet list                          List all pre-compiled routines in .codelets/
  codelet search <query>                Search compiled routines by keyword/tag
  codelet compile <wish...>             Synthesize and compile natural language into routine
  codelet run <hash> [argsJson]         Execute pre-compiled routine deterministically
  sweep [--fix]                         Scan TODO/FIXME/BUG notes across codebase

\x1b[1;32m📜 Architectural Decisions (ADR):\x1b[0m
  decision list                         List all Architectural Decision Records
  decision propose <id> <title> [body]  Propose an ADR and link affected modules
  decision accept <id>                  Accept a proposed ADR
  decision revert <id> [reason]         Revert ADR and cancel dependent tickets

\x1b[1;32m⚙️ System, MCP & Shell:\x1b[0m
  root [dir]                            Find real project root by traversing parent markers
  env                                   Instant runtime, toolchain, and OS orientation
  token-count [files...]                Estimate prompt token budget across files
  snapshot [label]                      Create non-destructive working tree patch snapshot
  note <text...>                        Append ephemeral note to .ai-workflow/scratchpad.md
  notes                                 Read shared agent session scratchpad
  setup [--all|--link|--doctor]         Install CLI binaries, MCP configs & companion SKILL.md
  audit [files...]                      Validate codebase against policy enforcement rules
  metrics                               Display token savings, compression & execution telemetry
  shell / repl                          Launch interactive autonomous shell REPL
  mcp                                   Start Model Context Protocol (MCP) server over stdio
  ui [port]                             Launch web graph & Kanban dashboard (default: 3456)
  --json                                Output structured JSON for any command
  `);
}

function mergeJsonConfig(filePath: string, updater: (data: any) => any): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let data: any = {};
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        data = {};
      }
    }
    const updated = updater(data);
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function handleSetup(flags: Record<string, any>) {
  const isJson = flags.json;
  const isLinkOnly = flags.link;
  const isDoctor = flags.doctor;
  const isClaude = flags.claude;
  const isCursor = flags.cursor;
  const isGemini = flags.gemini;
  const isAntigravity = flags.antigravity || flags.agy;
  const isCodex = flags.codex;

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

  // Skill Installation Destinations
  const skillDestinations = [
    path.join(os.homedir(), '.gemini', 'config', 'skills', 'ai-workflow', 'SKILL.md'),
    path.join(os.homedir(), '.cursor', 'skills', 'ai-workflow', 'SKILL.md'),
    path.join(repoRoot, '.cursor', 'skills', 'ai-workflow', 'SKILL.md'),
    path.join(os.homedir(), '.claude', 'skills', 'ai-workflow', 'SKILL.md'),
    path.join(os.homedir(), '.codex', 'skills', 'ai-workflow', 'SKILL.md')
  ];

  const installedSkills: string[] = [];
  if (fs.existsSync(skillSourcePath)) {
    for (const dest of skillDestinations) {
      try {
        const destDir = path.dirname(dest);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(skillSourcePath, dest);
        installedSkills.push(dest);
      } catch {}
    }
  }

  const mcpServerEntry = {
    command: "bun",
    args: [mcpPath],
    instructions: "ai-workflow Causal Engineering OS: Use get_ticket_context before working on tickets; use get_project_overview for module health & bug counts; use audit_guidelines before claiming task completion; use propose_decision / revert_decision for architectural records; use compile_codelet / run_codelet for synthesized routines."
  };

  const updatedMcpHosts: string[] = [];

  // 1. Antigravity / Gemini CLI
  const geminiMcpPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
  if (mergeJsonConfig(geminiMcpPath, (d) => {
    d.mcpServers = d.mcpServers || {};
    d.mcpServers['ai-workflow'] = mcpServerEntry;
    return d;
  })) updatedMcpHosts.push(geminiMcpPath);

  // 2. Claude Desktop
  const claudeDesktopPath = path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  if (mergeJsonConfig(claudeDesktopPath, (d) => {
    d.mcpServers = d.mcpServers || {};
    d.mcpServers['ai-workflow'] = { command: "bun", args: ["run", mcpPath] };
    return d;
  })) updatedMcpHosts.push(claudeDesktopPath);

  // 3. Claude Code CLI (~/.claude.json)
  const claudeCodePath = path.join(os.homedir(), '.claude.json');
  if (fs.existsSync(claudeCodePath)) {
    if (mergeJsonConfig(claudeCodePath, (d) => {
      d.mcpServers = d.mcpServers || {};
      d.mcpServers['ai-workflow'] = { command: "bun", args: ["run", mcpPath] };
      return d;
    })) updatedMcpHosts.push(claudeCodePath);
  }

  // 4. Cursor Global & Local
  const cursorGlobalMcp = path.join(os.homedir(), '.cursor', 'mcp.json');
  if (mergeJsonConfig(cursorGlobalMcp, (d) => {
    d.mcpServers = d.mcpServers || {};
    d.mcpServers['ai-workflow'] = mcpServerEntry;
    return d;
  })) updatedMcpHosts.push(cursorGlobalMcp);

  const cursorLocalMcp = path.join(repoRoot, '.cursor', 'mcp.json');
  if (mergeJsonConfig(cursorLocalMcp, (d) => {
    d.mcpServers = d.mcpServers || {};
    d.mcpServers['ai-workflow'] = mcpServerEntry;
    return d;
  })) updatedMcpHosts.push(cursorLocalMcp);

  // 5. Windsurf (~/.codeium/windsurf/mcp_config.json)
  const windsurfMcpPath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  if (fs.existsSync(path.dirname(windsurfMcpPath))) {
    if (mergeJsonConfig(windsurfMcpPath, (d) => {
      d.mcpServers = d.mcpServers || {};
      d.mcpServers['ai-workflow'] = mcpServerEntry;
      return d;
    })) updatedMcpHosts.push(windsurfMcpPath);
  }

  // 6. Zed (~/.config/zed/settings.json)
  const zedSettingsPath = path.join(os.homedir(), '.config', 'zed', 'settings.json');
  if (fs.existsSync(path.dirname(zedSettingsPath))) {
    if (mergeJsonConfig(zedSettingsPath, (d) => {
      d.context_servers = d.context_servers || {};
      d.context_servers['ai-workflow'] = { command: "bun", args: ["run", mcpPath], env: {} };
      return d;
    })) updatedMcpHosts.push(zedSettingsPath);
  }

  // 7. Codex (~/.codex/config.json)
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.json');
  if (mergeJsonConfig(codexConfigPath, (d) => {
    d.mcp_servers = d.mcp_servers || {};
    d.mcp_servers['ai-workflow'] = { command: "bun", args: ["run", mcpPath] };
    return d;
  })) updatedMcpHosts.push(codexConfigPath);

  const configs = {
    binaries: linkedPaths,
    mcpServerPath: mcpPath,
    cliPath: cliPath,
    skillSource: skillSourcePath,
    installedSkills,
    updatedMcpHosts,
    claudeCodeCommand: `claude mcp add ai-workflow bun run ${mcpPath}`,
    mcpConfig: {
      mcpServers: {
        "ai-workflow": mcpServerEntry
      }
    }
  };

  if (isJson) {
    console.log(JSON.stringify(configs, null, 2));
    return;
  }

  if (isDoctor) {
    console.log(`\x1b[1;36m=== AIWF Pair Installation Diagnostic Check ===\x1b[0m`);
    console.log(`1. CLI Binary: ${linkedPaths.length > 0 ? '\x1b[32mOK (Linked) ✅\x1b[0m' : '\x1b[31mMISSING ❌\x1b[0m'}`);
    console.log(`2. MCP Server: ${fs.existsSync(mcpPath) ? '\x1b[32mOK (Ready) ✅\x1b[0m' : '\x1b[31mMISSING ❌\x1b[0m'}`);
    console.log(`3. Companion Skill: ${installedSkills.length > 0 ? '\x1b[32mOK (Installed) ✅\x1b[0m' : '\x1b[33mNOT DEPLOYED ⚠️\x1b[0m'}`);
    for (const s of installedSkills) console.log(`   - ${s}`);
    console.log(`4. Configured MCP Hosts: ${updatedMcpHosts.length} clients`);
    for (const h of updatedMcpHosts) console.log(`   - ${h}`);
    return;
  }

  if (isLinkOnly) {
    console.log(`\x1b[32mSuccessfully linked binaries to PATH:\x1b[0m`);
    for (const p of linkedPaths) console.log(`  - ${p}`);
    return;
  }

  console.log(`\x1b[1;36m========================================================================\x1b[0m`);
  console.log(`\x1b[1;37m   AI-WORKFLOW (aiwf) UNIVERSAL CLIENT & SKILL+MCP PAIR SETUP\x1b[0m`);
  console.log(`\x1b[1;36m========================================================================\x1b[0m\n`);

  console.log(`\x1b[1;32m1. Global CLI Binaries Linked:\x1b[0m`);
  if (linkedPaths.length > 0) {
    for (const p of linkedPaths) console.log(`   - \x1b[1m${p}\x1b[0m`);
  }
  console.log(`\n   You can now run \x1b[1;33maiwf --help\x1b[0m or \x1b[1;33mai-workflow status\x1b[0m anywhere.\n`);

  console.log(`\x1b[1;32m2. Companion Skill Deployed (Playbook/SOP):\x1b[0m`);
  if (installedSkills.length > 0) {
    for (const s of installedSkills) console.log(`   - \x1b[1m${s}\x1b[0m`);
  }

  console.log(`\n\x1b[1;32m3. Active MCP Server Configured in ${updatedMcpHosts.length} Host Tools:\x1b[0m`);
  for (const h of updatedMcpHosts) console.log(`   - \x1b[1m${h}\x1b[0m`);

  console.log(`\n\x1b[1;32m4. Claude Code One-Liner:\x1b[0m`);
  console.log(`   \x1b[1mclaude mcp add ai-workflow bun run ${mcpPath}\x1b[0m`);

  console.log(`\n\x1b[1;32mSetup complete! Universal Pair (MCP + Skill + CLI) is published and active. ✅\x1b[0m`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { flags, nonFlags } = parseCliFlags(rawArgs);

  if (flags.help || flags.h || (nonFlags.length === 1 && nonFlags[0] === 'help')) {
    printHelp();
    return;
  }

  if (nonFlags.length === 0) {
    // Default to status
    const ctx = getContext();
    const cap = registry.get('get_project_overview');
    if (cap) {
      const res = await cap.handler(ctx, {});
      if (flags.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(cap.renderTui ? cap.renderTui(res) : JSON.stringify(res, null, 2));
      }
    }
    return;
  }

  const firstArg = nonFlags[0].toLowerCase();

  // Special System Commands
  if (firstArg === 'setup' || firstArg === 'install') {
    handleSetup(flags);
    return;
  }

  if (firstArg === 'ui' || firstArg === 'serve' || firstArg === 'web') {
    const port = parseInt(nonFlags[1] || '3456', 10);
    startWebServer(getContext().store, port);
    return;
  }

  if (firstArg === 'mcp') {
    await runMcpStdio();
    return;
  }

  if (firstArg === 'shell' || firstArg === 'repl') {
    const shell = new InteractiveShell(getContext().store);
    await shell.start();
    return;
  }

  // Registry-Dispatched Commands
  const match = registry.findForCli(nonFlags);
  if (!match.capability) {
    console.error(`\x1b[31mUnknown command:\x1b[0m "${nonFlags.join(' ')}". Run \x1b[1;33maiwf --help\x1b[0m to view all available capabilities.`);
    process.exit(1);
  }

  const cap = match.capability;
  const ctx = getContext();
  let argsPayload: any = {};

  if (cap.parseCliArgs) {
    argsPayload = cap.parseCliArgs(match.args, flags);
  } else if (match.args.length > 0) {
    argsPayload = { input: match.args.join(' ') };
  }

  try {
    const result = await cap.handler(ctx, argsPayload);

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (typeof result === 'string') {
      console.log(result);
    } else if (cap.renderTui) {
      console.log(cap.renderTui(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err: any) {
    console.error(`\x1b[31mError executing ${cap.name}:\x1b[0m`, err.message || err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal Error:\x1b[0m', err);
  process.exit(1);
});
