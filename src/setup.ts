/**
 * Responsibility: Frictionless Project and Global Setup Engine.
 * Scope: Zero-config project initialization, global binary symlinking, multi-host MCP wiring,
 * and canonical skill synchronization across AI developer environments (Codex, Claude, Cursor, Antigravity, Windsurf).
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from './graph/store.ts';
import { indexCodebase } from './graph/indexer.ts';
import { exportProjections } from './graph/projections.ts';
import { Ticket, Epic } from './graph/ontology.ts';
import { saveConfig } from './config.ts';
import { exportMcpSchemas } from './mcp.ts';
import { initializeTools, registry } from './tools/index.ts';

export interface InitResult {
  projectRoot: string;
  filesIndexed: number;
  symbolsIndexed: number;
  notesIndexed: number;
  projectionsExported: string[];
}

export interface GlobalInstallResult {
  binaryPath: string;
  symlinkTarget: string;
  pathIncluded: boolean;
}

export interface McpSetupResult {
  hostsUpdated: string[];
  schemasCount: number;
  schemasDir: string;
  skillsSynced: string[];
}

export interface ConfigureMcpOptions {
  cliPath?: string;
  mcpPath?: string;
  homeDir?: string;
}

export const MCP_INSTRUCTIONS_2_0 =
  'ai-workflow 2.0 Causal Context & Engineering OS: Use recommend_next_task & list_tickets to select work; use claim_ticket before mutating code; use find_symbol, get_symbol_source, get_file_outline & analyze_blast_radius for surgical context; use resolve_test_target & triage_test_failures for verification; use apply_block_patch, compile_codelet & promote_codelet for code mutations; update_ticket_state & release_ticket upon completion.';

export const CANONICAL_SKILL_MD = `---
name: ai-workflow
description: Governs the AI agent workflow lifecycle using ai-workflow (aiwf) tools. Use when checking project status, inspecting tickets, managing claims, calculating blast radius, auditing guidelines, running codelets, or extracting bounded ticket contexts.
---

# 🏛️ AI-Workflow 2.0 Skill: Causal Context & Engineering OS

AI-Workflow provides high-efficiency deterministic tools and a causal AST+ Context Graph for human pair programming and autonomous coding agents.

---

## 🚀 The Zero-Token Discovery Protocol (Always Follow This Order)

1. **Orientation & Health**:
   - Run \`aiwf status\` (or MCP \`get_git_status\` + \`list_tickets\`) to inspect working tree status and active leases.
   - Run \`aiwf doctor\` to verify graph database, projections, and MCP connectivity.
2. **Next Task Recommendation**:
   - Run \`aiwf next\` (or MCP \`recommend_next_task\`) to select the active sprint priority:
     \`Active Agent Lease -> P0/P1 High-Priority Bugs -> Unleased Todo Tasks\`.
3. **Lease Before Edit (Mandatory Safety)**:
   - Always lease the target ticket before touching code: \`aiwf claim <ticketId>\` (or MCP \`claim_ticket\`). Never mutate code without an active lease.
4. **Surgical Slicing & Blast Radius**:
   - Use \`aiwf symbol <name>\` (MCP \`find_symbol\`) to locate symbols.
   - Use \`aiwf slice <file> <symbol>\` (MCP \`get_symbol_source\`) to inspect 30-50 line function bodies without dumping full files.
   - Use \`aiwf outline <file>\` (MCP \`get_file_outline\`) to inspect file exports and signatures.
   - Use \`aiwf blast <target>\` (MCP \`analyze_blast_radius\`) before modifying shared files.
5. **Deterministic Patching**:
   - Use \`aiwf patch <file> <target> <replacement>\` (or MCP \`apply_block_patch\`) for surgical block replacement via \`@dharmax/block-patcher\`.
   - Use \`compile_codelet\` and \`promote_codelet\` for JIT synthesis and dynamic tool expansion.
6. **Pair-Test Verification**:
   - Resolve paired test target via MCP \`resolve_test_target\`.
   - Execute verification tests via MCP \`triage_test_failures\`.
7. **Synchronize Ledgers & Close Lease**:
   - Move completed ticket to \`Done\` via MCP \`update_ticket_state(ticketId, lane="Done")\`.
   - Release lease via \`aiwf release <ticketId>\` (or MCP \`release_ticket\`).
   - Run \`aiwf sync\` to ensure Obsidian Markdown projections (\`kanban.md\`, \`epics.md\`, \`decisions.md\`, \`modules.md\`) mirror the SQLite Graph.

---

## 🛠️ MCP Tools vs. CLI Commands Reference

All capabilities are unified across stdio MCP and the CLI:

| Capability / Action | CLI Command | MCP Tool |
| :--- | :--- | :--- |
| **Working Tree & Leases** | \`aiwf status\` | \`get_git_status\`, \`list_tickets\` |
| **System Diagnostics** | \`aiwf doctor\` | \`get_environment_info\` |
| **Next Task Recommendation** | \`aiwf next [agentId]\` | \`recommend_next_task\` |
| **List Kanban Tickets** | \`aiwf tickets [lane]\` | \`list_tickets\` |
| **Lease Ticket** | \`aiwf claim <id> [--agent <a>]\` | \`claim_ticket\` |
| **Release Lease** | \`aiwf release <id>\` | \`release_ticket\` |
| **Mark Ticket Done** | \`aiwf done <id>\` | \`update_ticket_state\` |
| **Move Ticket Lane** | \`aiwf move <id> <lane>\` | \`update_ticket_state\` |
| **Uncommitted Diff** | \`aiwf diff\` | \`get_git_diff\` |
| **Locate Symbol** | \`aiwf symbol <name>\` | \`find_symbol\` |
| **Surgical Code Slice** | \`aiwf slice <file> <sym>\` | \`get_symbol_source\` |
| **File Outline** | \`aiwf outline <file>\` | \`get_file_outline\` |
| **Blast Radius & Tests** | \`aiwf blast <target>\` | \`analyze_blast_radius\` |
| **Re-index AST Symbols** | \`aiwf index\` | \`indexCodebase\` (via setup) |
| **AST Block Patching** | \`aiwf patch <file> <s> <r>\` | \`apply_block_patch\` |
| **JIT Codelet Compiler** | *(via shell / MCP)* | \`compile_codelet\`, \`run_codelet\` |
| **Promote Codelet to Tool** | *(via shell / MCP)* | \`promote_codelet\` |
| **Test Target Resolution** | *(via shell / MCP)* | \`resolve_test_target\` |
| **Failure Triage** | *(via shell / MCP)* | \`triage_test_failures\` |
| **Playwright Testing** | *(via shell / MCP)* | \`run_playwright\` |
| **Architectural Decisions**| *(via shell / MCP)* | \`propose_decision\` |
| **Shared Scratchpad** | *(via shell / MCP)* | \`read_scratchpad\`, \`append_scratchpad_note\` |
| **Bun JS Scripting** | \`aiwf eval <js>\` | \`script_eval\` |
| **Autonomous Execution** | \`aiwf exec "<wish>"\` | \`execute_shell_wish\` |
| **Interactive REPL** | \`aiwf shell\` (or \`aiwf\`) | *(terminal REPL)* |
| **Setup & MCP Wiring** | \`aiwf setup\` / \`aiwf init\` | *(setup engine)* |

---

## 🔒 Safety & Concurrency Rules for Agents

- **Zero Hallucinated Parameters**: All tool calls must strictly conform to their Zod parameter schemas.
- **Claim Before Edit**: No agent may edit code for a ticket without an active lease recorded via \`claim_ticket\`.
- **Extreme KISS**: Implement the simplest solution first. Avoid monolithic components or complicated wrappers.
- **Verification Gate**: Every code modification must be verified by running the corresponding unit test suite via \`resolve_test_target\` and \`triage_test_failures\`.
- **Bidirectional Ledger Integrity**: Run \`aiwf sync\` after task completion to guarantee that Markdown files and the SQLite graph stay 100% in sync.
`;

export const CODEX_AGENT_RULES = `<!-- ai-workflow-rules -->
# AI-Workflow 2.0 — Causal Context & Engineering OS

When working in an \`ai-workflow\` repository (containing \`.ai-workflow/\` or \`kanban.md\`):
- **Select Task**: Call \`recommend_next_task\` or run \`aiwf next\` to find active priority.
- **Lease Mandatory**: Call \`claim_ticket\` or run \`aiwf claim <id>\` BEFORE editing any files.
- **Surgical Inspection**: Use \`find_symbol\`, \`get_symbol_source\`, \`get_file_outline\`, and \`analyze_blast_radius\` instead of dumping large files.
- **Deterministic Patches**: Use \`apply_block_patch\` or \`aiwf patch\` for AST block replacement.
- **Verification**: Run \`resolve_test_target\` and \`triage_test_failures\` to verify code changes against test suites.
- **Complete**: Call \`update_ticket_state(id, "Done")\`, \`release_ticket(id)\`, and sync with \`aiwf sync\`.
<!-- /ai-workflow-rules -->
`;

/**
 * Initializes a repository with .ai-workflow state, AST indexing, and Kanban projections.
 */
export async function initProject(projectRoot: string): Promise<InitResult> {
  const aiwfDir = path.join(projectRoot, '.ai-workflow');
  const stateDir = path.join(aiwfDir, 'state');
  const codeletsDir = path.join(aiwfDir, 'codelets');

  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(codeletsDir, { recursive: true });

  // 1. Initialize config if missing
  saveConfig(projectRoot, {});

  // 2. Open store & index codebase
  const store = new WorkflowStore(projectRoot);
  const indexRes = await indexCodebase(store, projectRoot);

  // 3. Create starter entities if Kanban is empty
  const existingTickets = await store.listEntities<Ticket>(Ticket.dcr);
  if (existingTickets.length === 0) {
    const epic = await store.upsertEntity<Epic>(Epic.dcr, {
      id: 'EPIC-ONBOARDING',
      title: 'Project Architecture & Onboarding',
      body: 'Initial architecture grounding and capability mapping.'
    });

    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-001',
      title: 'Explore codebase and run diagnostics',
      lane: 'Todo',
      priority: 'P2',
      body: 'Review initial AST+ graph index and verify project health with `aiwf doctor`.'
    });

    await store.relate(ticket, 'implements', epic);
  }

  // 4. Export initial Markdown projections
  const exportRes = await exportProjections(store, projectRoot);
  store.close();

  return {
    projectRoot,
    filesIndexed: indexRes.filesCount,
    symbolsIndexed: indexRes.symbolsCount,
    notesIndexed: indexRes.notesCount,
    projectionsExported: exportRes.exportedFiles
  };
}

/**
 * Symlinks the aiwf CLI into ~/.local/bin/aiwf for global CLI access.
 */
export function installGlobalBinary(sourceCliPath?: string, homeDir?: string): GlobalInstallResult {
  const home = homeDir || process.env.HOME || os.homedir();
  const binDir = path.join(home, '.local', 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const resolvedSource = sourceCliPath
    ? path.resolve(sourceCliPath)
    : path.resolve(__dirname, 'cli.ts');

  const symlinkTarget = path.join(binDir, 'aiwf');

  try {
    if (fs.existsSync(symlinkTarget) || fs.lstatSync(symlinkTarget).isSymbolicLink()) {
      fs.unlinkSync(symlinkTarget);
    }
  } catch {}

  fs.symlinkSync(resolvedSource, symlinkTarget);

  try {
    fs.chmodSync(resolvedSource, 0o755);
    fs.chmodSync(symlinkTarget, 0o755);
  } catch {}

  const currentPath = process.env.PATH || '';
  const pathIncluded = currentPath.split(':').includes(binDir);

  return {
    binaryPath: resolvedSource,
    symlinkTarget,
    pathIncluded
  };
}

/**
 * Robust, non-destructive TOML section replacer for MCP server configurations.
 */
export function replaceTomlServerSection(
  rawContent: string,
  serverName: string,
  newBlock: string
): string {
  const lines = rawContent.split('\n');
  let startIdx = -1;
  let endIdx = -1;
  const header = `[mcp_servers.${serverName}]`;
  const prefix = `[mcp_servers.${serverName}.`;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === header) {
      startIdx = i;
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (nextLine.startsWith('[') && !nextLine.startsWith(prefix) && nextLine !== header) {
          break;
        }
        j++;
      }
      endIdx = j;
      break;
    }
  }

  if (startIdx === -1) {
    return (rawContent.trimEnd() ? rawContent.trimEnd() + '\n\n' : '') + newBlock.trim() + '\n';
  }

  const before = lines.slice(0, startIdx).join('\n');
  const after = lines.slice(endIdx).join('\n');
  return (before.trimEnd() ? before.trimEnd() + '\n\n' : '') +
    newBlock.trim() +
    (after.trimStart() ? '\n\n' + after.trimStart() : '\n');
}

/**
 * Distributes the canonical AI-Workflow 2.0 SKILL.md across all supported AI environments.
 */
export function syncSkills(home: string): string[] {
  const synced: string[] = [];
  const targets = [
    {
      name: 'Antigravity',
      dir: path.join(home, '.gemini', 'config', 'skills', 'ai-workflow'),
      condition: () => fs.existsSync(path.join(home, '.gemini'))
    },
    {
      name: 'OpenAI Codex',
      dir: path.join(home, '.codex', 'skills', 'ai-workflow'),
      condition: () => fs.existsSync(path.join(home, '.codex'))
    },
    {
      name: 'Claude Code',
      dir: path.join(home, '.claude', 'skills', 'ai-workflow'),
      condition: () =>
        fs.existsSync(path.join(home, '.claude')) ||
        fs.existsSync(path.join(home, '.claude.json'))
    },
    {
      name: 'Cursor',
      dir: path.join(home, '.cursor', 'skills', 'ai-workflow'),
      condition: () => fs.existsSync(path.join(home, '.cursor'))
    },
    {
      name: 'Windsurf',
      dir: path.join(home, '.codeium', 'windsurf', 'skills', 'ai-workflow'),
      condition: () =>
        fs.existsSync(path.join(home, '.codeium', 'windsurf')) ||
        fs.existsSync(path.join(home, '.config', 'Windsurf'))
    }
  ];

  for (const t of targets) {
    if (t.condition()) {
      try {
        fs.mkdirSync(t.dir, { recursive: true });
        fs.writeFileSync(path.join(t.dir, 'SKILL.md'), CANONICAL_SKILL_MD, 'utf8');
        synced.push(t.name);
      } catch {}
    }
  }

  return synced;
}

/**
 * Automatically wires AI-Workflow 2.0 into all AI developer environments:
 * Codex, Claude Code, Cursor, Windsurf, Antigravity IDE, and Antigravity CLI.
 */
export function configureMcp(optionsOrCliPath?: string | ConfigureMcpOptions): McpSetupResult {
  const options: ConfigureMcpOptions =
    typeof optionsOrCliPath === 'string'
      ? { cliPath: optionsOrCliPath }
      : optionsOrCliPath || {};

  const home = options.homeDir || process.env.HOME || os.homedir();
  const pkgRoot = path.resolve(__dirname, '..');
  const resolvedMcp = options.mcpPath
    ? path.resolve(options.mcpPath)
    : path.resolve(__dirname, 'mcp.ts');

  initializeTools();
  const allToolNames = ['execute_shell_wish', ...registry.getAll().map(t => t.name)];

  const hostsUpdated: string[] = [];

  const mcpJsonEntry = {
    command: 'bun',
    args: ['run', resolvedMcp],
    instructions: MCP_INSTRUCTIONS_2_0
  };

  // 1. Antigravity IDE
  const ideConfigPath = path.join(home, '.config', 'Antigravity IDE', 'User', 'mcp_config.json');
  if (fs.existsSync(path.join(home, '.config', 'Antigravity IDE')) || fs.existsSync(ideConfigPath)) {
    try {
      let ideConfig: any = { mcpServers: {} };
      if (fs.existsSync(ideConfigPath)) {
        ideConfig = JSON.parse(fs.readFileSync(ideConfigPath, 'utf8'));
      } else {
        fs.mkdirSync(path.dirname(ideConfigPath), { recursive: true });
      }
      ideConfig.mcpServers = ideConfig.mcpServers || {};
      ideConfig.mcpServers['ai-workflow'] = mcpJsonEntry;
      fs.writeFileSync(ideConfigPath, JSON.stringify(ideConfig, null, 2), 'utf8');
      hostsUpdated.push('Antigravity IDE');
    } catch {}
  }

  // 2. Antigravity CLI / Gemini
  const cliConfigPath = path.join(home, '.gemini', 'config', 'mcp_config.json');
  if (fs.existsSync(path.join(home, '.gemini')) || fs.existsSync(cliConfigPath)) {
    try {
      let cliConfig: any = { mcpServers: {} };
      if (fs.existsSync(cliConfigPath)) {
        cliConfig = JSON.parse(fs.readFileSync(cliConfigPath, 'utf8'));
      } else {
        fs.mkdirSync(path.dirname(cliConfigPath), { recursive: true });
      }
      cliConfig.mcpServers = cliConfig.mcpServers || {};
      cliConfig.mcpServers['ai-workflow'] = mcpJsonEntry;
      fs.writeFileSync(cliConfigPath, JSON.stringify(cliConfig, null, 2), 'utf8');
      hostsUpdated.push('Antigravity CLI');
    } catch {}
  }

  // 3. OpenAI Codex (config.toml, default.rules, AGENTS.md, instructions.md)
  const codexDir = path.join(home, '.codex');
  if (fs.existsSync(codexDir)) {
    try {
      const configTomlPath = path.join(codexDir, 'config.toml');
      let rawToml = fs.existsSync(configTomlPath) ? fs.readFileSync(configTomlPath, 'utf8') : '';

      // Backup config.toml
      if (fs.existsSync(configTomlPath)) {
        try {
          fs.writeFileSync(`${configTomlPath}.bak`, rawToml, 'utf8');
        } catch {}
      }

      // Generate clean 2.0 tool approvals block
      let codexServerBlock = `[mcp_servers.aiwf-mcp]\ncommand = "bun"\nargs = ["run", "${resolvedMcp}"]\nenv = { AI_WORKFLOW_TOOLKIT_ROOT = "${pkgRoot}" }`;
      for (const tool of allToolNames) {
        codexServerBlock += `\n\n[mcp_servers.aiwf-mcp.tools.${tool}]\napproval_mode = "approve"`;
      }

      const updatedToml = replaceTomlServerSection(rawToml, 'aiwf-mcp', codexServerBlock);
      fs.writeFileSync(configTomlPath, updatedToml, 'utf8');

      // Update default.rules with execution permissions for aiwf
      const rulesDir = path.join(codexDir, 'rules');
      const rulesPath = path.join(rulesDir, 'default.rules');
      fs.mkdirSync(rulesDir, { recursive: true });
      let rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
      let rulesChanged = false;
      if (!rules.includes('pattern=["aiwf"]')) {
        rules = rules.trimEnd() + (rules.trim() ? '\n' : '') + 'prefix_rule(pattern=["aiwf"], decision="allow")\n';
        rulesChanged = true;
      }
      if (!rules.includes('pattern=["ai-workflow"]')) {
        rules = rules.trimEnd() + (rules.trim() ? '\n' : '') + 'prefix_rule(pattern=["ai-workflow"], decision="allow")\n';
        rulesChanged = true;
      }
      if (rulesChanged) {
        fs.writeFileSync(rulesPath, rules, 'utf8');
      }

      // Update AI-WORKFLOW.md & AGENTS.md
      const aiwfMdPath = path.join(codexDir, 'AI-WORKFLOW.md');
      fs.writeFileSync(aiwfMdPath, CODEX_AGENT_RULES, 'utf8');

      const agentsMdPath = path.join(codexDir, 'AGENTS.md');
      let agentsMd = fs.existsSync(agentsMdPath) ? fs.readFileSync(agentsMdPath, 'utf8') : '';
      if (!agentsMd.includes('@AI-WORKFLOW.md')) {
        agentsMd = agentsMd.trimEnd() + (agentsMd.trim() ? '\n' : '') + '@AI-WORKFLOW.md\n';
        fs.writeFileSync(agentsMdPath, agentsMd, 'utf8');
      }

      // Update instructions.md if present
      const instructionsMdPath = path.join(codexDir, 'instructions.md');
      if (fs.existsSync(instructionsMdPath)) {
        let inst = fs.readFileSync(instructionsMdPath, 'utf8');
        if (!inst.includes('ai-workflow-rules')) {
          inst = inst.trimEnd() + '\n\n' + CODEX_AGENT_RULES;
          fs.writeFileSync(instructionsMdPath, inst, 'utf8');
        }
      }

      hostsUpdated.push('OpenAI Codex');
    } catch {}
  }

  // 4. Claude Code (~/.claude.json)
  const claudeConfigPath = path.join(home, '.claude.json');
  if (fs.existsSync(claudeConfigPath) || fs.existsSync(path.join(home, '.claude'))) {
    try {
      let claudeConfig: any = { mcpServers: {} };
      if (fs.existsSync(claudeConfigPath)) {
        claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      }
      claudeConfig.mcpServers = claudeConfig.mcpServers || {};
      claudeConfig.mcpServers['ai-workflow'] = {
        command: 'bun',
        args: ['run', resolvedMcp]
      };
      fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2), 'utf8');
      hostsUpdated.push('Claude Code');
    } catch {}
  }

  // 5. Cursor (~/.cursor/mcp.json)
  const cursorDir = path.join(home, '.cursor');
  const cursorMcpPath = path.join(cursorDir, 'mcp.json');
  if (fs.existsSync(cursorDir) || fs.existsSync(cursorMcpPath)) {
    try {
      let cursorConfig: any = { mcpServers: {} };
      if (fs.existsSync(cursorMcpPath)) {
        cursorConfig = JSON.parse(fs.readFileSync(cursorMcpPath, 'utf8'));
      } else {
        fs.mkdirSync(cursorDir, { recursive: true });
      }
      cursorConfig.mcpServers = cursorConfig.mcpServers || {};
      cursorConfig.mcpServers['ai-workflow'] = mcpJsonEntry;
      fs.writeFileSync(cursorMcpPath, JSON.stringify(cursorConfig, null, 2), 'utf8');
      hostsUpdated.push('Cursor');
    } catch {}
  }

  // 6. Windsurf (~/.codeium/windsurf/mcp_config.json)
  const windsurfDir = path.join(home, '.codeium', 'windsurf');
  const windsurfMcpPath = path.join(windsurfDir, 'mcp_config.json');
  if (fs.existsSync(windsurfDir) || fs.existsSync(path.join(home, '.config', 'Windsurf'))) {
    try {
      let windsurfConfig: any = { mcpServers: {} };
      if (fs.existsSync(windsurfMcpPath)) {
        windsurfConfig = JSON.parse(fs.readFileSync(windsurfMcpPath, 'utf8'));
      } else {
        fs.mkdirSync(windsurfDir, { recursive: true });
      }
      windsurfConfig.mcpServers = windsurfConfig.mcpServers || {};
      windsurfConfig.mcpServers['ai-workflow'] = mcpJsonEntry;
      fs.writeFileSync(windsurfMcpPath, JSON.stringify(windsurfConfig, null, 2), 'utf8');
      hostsUpdated.push('Windsurf');
    } catch {}
  }

  // 7. Sync Skills across all environments
  const skillsSynced = syncSkills(home);

  // 8. Export MCP Tool Schemas for Lazy Loading (Antigravity)
  const schemasDir = path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'ai-workflow');
  const exported = exportMcpSchemas(schemasDir);

  return {
    hostsUpdated,
    schemasCount: exported.length,
    schemasDir,
    skillsSynced
  };
}
