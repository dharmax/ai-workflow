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
import { ensureHostTypeScript7, ensureTs6RefactorRuntime, type TsProvisionResult, type TsResolverSeams } from './typescript-runtime.ts';

export interface SetupTypeScriptResult extends TsProvisionResult {}

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
  link?: boolean;
  binaryPath?: string;
}

export const MCP_INSTRUCTIONS_2_0 =
  'AIWF: Delegate Ticket work first with resolve_ticket; investigate_ticket and prepare_ticket are grounded alternatives. Process accepted intent with process_epic/process_feature/process_story. Use completeness/depth/maxArtifacts/critic consistently, persist completeness only explicitly. Inspect needs_input/blocked; preserve user work and require acceptance proof. Use primitives only for drill-down or actual blockers. Use recommend_next_task & list_tickets to select work; use claim_ticket before mutating code; use propose_epic_structure, apply_epic_structure, get_product_coverage & get_product_impact for product intent navigation; use find_symbol, search_graph, get_symbol_source, get_file_outline & analyze_blast_radius for surgical context and call/dep graph traversal; use resolve_test_target & triage_test_failures for verification; use apply_block_patch, compile_codelet & promote_codelet for code mutations; update_ticket_state & release_ticket upon completion.';

export const CANONICAL_SKILL_MD = `---
name: ai-workflow
description: Delegate Ticket and Product Intent work to AIWF; investigate, prepare, resolve and process artifacts before drilling into engineering primitives.
---

# AIWF artifact delegation

Use AIWF as the primary engineering and work-management system.

## Preferred workflow

1. If given a Ticket, call \`resolve_ticket\` / \`aiwf resolve <ticketId>\` first. AIWF owns investigation, leasing, preparation, safe edits, tests, repair, acceptance and material Aspect verification, release and sync.
2. For evidence without implementation, use \`investigate_ticket\` / \`aiwf investigate <ticketId>\`. For executable enrichment or useful decomposition, use \`prepare_ticket\` / \`aiwf prepare <ticketId>\`.
3. For accepted intent, use \`process_epic\`, \`process_feature\` or \`process_story\` / \`aiwf process epic|feature|story <id>\`. Reuse meaningful existing work; technical work needs no ceremonial Story.
4. Inspect \`needs_input\` and \`blocked\`. Resolve the exact question or capability gap and retry against durable graph state. Do not mark Done or weaken acceptance to bypass verification.
5. Use primitives for explicit drill-down/debugging or an actual delegation blocker. First inspect AIWF's dossier; then use graph/symbol/exact source/references/blast/test evidence surgically. Claim the relevant Ticket before manual edits, preserve unrelated work, verify real acceptance, and sync.

## Policy

All artifact operations accept \`completeness\`, \`depth\`, \`maxArtifacts\`, \`critic\` consistently. CLI flags: \`--completeness production --depth 1 --max-artifacts 24 --critic auto\`.

Completeness controls thoroughness, never artifact counts. Depth bounds expansion; breadth is separately bounded. Applicable Aspects are mandatory. \`critic=auto\` uses independent review; \`none\` bypasses semantic critique only.

An operation override never remembers completeness. Use \`set_completeness_target\` / \`aiwf completeness set <id> <level>\` explicitly; \`clear\` removes it. Read provenance with \`get_completeness_target\` / \`aiwf completeness get <id>\`.

Resolution accepts explicit \`testCommands\`, \`maxRepairs\`, and \`allowDirtyTargets\` through MCP. CLI exposes \`--max-repairs\` and repeated \`--allow-dirty-target\`. Dirty targets require explicit authorization; never reset, stash or commit user work automatically.

## Drill-down tools

- Orientation: \`aiwf status\`, \`next\`, \`doctor\`, \`coverage <id>\`, \`impact <id>\`.
- Evidence: \`symbol\`, \`graph\`, \`slice\`, \`outline\`, \`callers\`, \`deps\`, \`blast\`; TS/JS exact references and symbol source are preferred for correctness.
- Safe edits: \`preview_change\` → \`apply_change\` with fingerprint; semantic rename/refactor and symbol replacement through the existing Causal Change Engine.
- Tests: \`resolve_test_target\`, \`triage_test_failures\`. Successful execution and explicit acceptance proof are both required.
- Graph state: canonical Product Intent tools, ordinary Ticket children and real prerequisites. No parallel plan/session/shadow graph.
- Measurement: \`aiwf metrics --operation resolve_ticket --ticket <id> --since 7d\`; persisted aggregate telemetry contains no prompts/source/tool arguments. Never claim paid-token savings without measurement.

Use \`aiwf help\` for verified command syntax. Low-level primitives remain available.
`;

export const CODEX_AGENT_RULES = `<!-- ai-workflow-rules -->
# AI-Workflow 2.0 — Causal Context & Engineering OS

When working in an \`ai-workflow\` repository (containing \`.ai-workflow/\` or \`kanban.md\`):
- **Delegate First**: Given a Ticket, call \`resolve_ticket\`; use \`investigate_ticket\` or \`prepare_ticket\` for evidence/preparation, and \`process_epic/feature/story\` for intent. Inspect precise blockers before manual work.
- **Select Task**: Call \`recommend_next_task\` or run \`aiwf next\` to find active priority.
- **Lease Mandatory**: Call \`claim_ticket\` or run \`aiwf claim <id>\` BEFORE editing any files.
- **Product Intent & Coverage**: Use \`get_product_coverage\`, \`get_product_impact\`, \`list_epics\`, \`list_features\`, \`list_user_stories\` to verify intent and impact before changing features.
- **Graph & Symbol Navigation**: Use \`find_symbol\`, \`search_graph\`, \`get_symbol_source\`, \`get_file_outline\`, and \`analyze_blast_radius\` instead of dumping large files into context.
- **Deterministic Patches**: Use \`apply_block_patch\` or \`aiwf patch\` for AST block replacement.
- **Verification**: Run \`resolve_test_target\` and \`triage_test_failures\` to verify code changes against test suites.
- **Complete**: Call \`update_ticket_state(id, "Done")\`, \`release_ticket(id)\`, and sync with \`aiwf sync\`.
<!-- /ai-workflow-rules -->
`;

function ensureLocalAiWorkflowExcludes(projectRoot: string): void {
  const gitPath = Bun.spawnSync(['git', '-C', projectRoot, 'rev-parse', '--git-path', 'info/exclude'], {stderr: 'ignore'});
  if (!gitPath.success) return;
  const rawPath = gitPath.stdout.toString().trim();
  if (!rawPath) return;
  const excludePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(projectRoot, rawPath);
  const entries = [
    '.ai-workflow/state/',
    '.ai-workflow/generated/',
    '.ai-workflow/cache/',
    '.ai-workflow/metrics.jsonl',
    '.ai-workflow/config.json'
  ];
  let existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  const lines = new Set(existing.split('\n').map(line => line.trim()));
  const missing = entries.filter(entry => !lines.has(entry));
  if (!missing.length) return;
  fs.mkdirSync(path.dirname(excludePath), {recursive: true});
  existing = existing.trimEnd();
  fs.writeFileSync(excludePath, (existing ? existing + '\n' : '') + missing.join('\n') + '\n', 'utf8');
}

/**
 * Initializes a repository with .ai-workflow state, AST indexing, and Kanban projections.
 */
export async function initProject(projectRoot: string): Promise<InitResult> {
  ensureLocalAiWorkflowExcludes(projectRoot);
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

  let resolvedSource: string;
  const isCompiled = !process.execPath.endsWith('bun') && !process.execPath.endsWith('bun.exe');

  if (sourceCliPath) {
    resolvedSource = path.resolve(sourceCliPath);
  } else if (isCompiled) {
    resolvedSource = process.execPath;
  } else {
    resolvedSource = path.resolve(__dirname, 'cli.ts');
  }

  const symlinkTarget = path.join(binDir, 'aiwf');

  try {
    if (fs.existsSync(symlinkTarget) || fs.lstatSync(symlinkTarget).isSymbolicLink()) {
      fs.unlinkSync(symlinkTarget);
    }
  } catch {}

  // If source is the target itself (e.g. executed in place in ~/.local/bin/aiwf), nothing to link
  if (resolvedSource !== symlinkTarget) {
    try {
      if (fs.existsSync(symlinkTarget) || fs.lstatSync(symlinkTarget).isSymbolicLink()) {
        fs.unlinkSync(symlinkTarget);
      }
    } catch {}

    if (isCompiled) {
      fs.copyFileSync(resolvedSource, symlinkTarget);
    } else {
      fs.symlinkSync(resolvedSource, symlinkTarget);
    }
  }

  try {
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

  const isLink = !!options.link;
  const installedAiWf = options.binaryPath || options.cliPath || path.join(home, '.local', 'bin', 'aiwf');
  const execBasename = path.basename(process.execPath, '.exe');
  const isBunRuntime = execBasename === 'bun';
  const useBinary = !isLink && (options.binaryPath || options.cliPath || fs.existsSync(installedAiWf) || !isBunRuntime);
  const binaryTarget = options.binaryPath || options.cliPath || (fs.existsSync(installedAiWf) ? installedAiWf : (!isBunRuntime ? process.execPath : 'aiwf'));

  const mcpCommand = useBinary ? binaryTarget : 'bun';
  const mcpArgs = useBinary ? ['mcp'] : ['run', resolvedMcp];

  const mcpJsonEntry = {
    command: mcpCommand,
    args: mcpArgs,
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
      const codexArgsToml = JSON.stringify(mcpArgs);
      let codexServerBlock = `[mcp_servers.aiwf-mcp]\ncommand = "${mcpCommand}"\nargs = ${codexArgsToml}\nenv = { AI_WORKFLOW_TOOLKIT_ROOT = "${pkgRoot}" }`;
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
        command: mcpCommand,
        args: mcpArgs
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

/**
 * Ensures compatible host-level TypeScript 7 is available for runtime semantic operations,
 * and provisions the TS6 refactor compatibility sidecar as needed.
 */
export async function setupTypeScript(
  projectRoot: string = process.cwd(),
  seams?: TsResolverSeams
): Promise<{ ts7: SetupTypeScriptResult; ts6: TsProvisionResult }> {
  const ts7 = await ensureHostTypeScript7(seams);
  const ts6 = await ensureTs6RefactorRuntime(projectRoot, seams);
  return { ts7, ts6 };
}
