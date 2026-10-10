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
import { buildMcpSchemas } from './mcp.ts';
import { initializeTools, registry } from './tools/index.ts';
import { getPublicMcpTools } from './tools/surface.ts';
import { checkHostTypeScriptCompatibility, resolveTs6RefactorRuntime, ensureHostTypeScript7, ensureTs6RefactorRuntime, type TsProvisionResult, type TsResolverSeams } from './typescript-runtime.ts';
import {PRIME_DIRECTIVE, MCP_INSTRUCTIONS_2_0, REPOSITORY_INVESTIGATION} from './client-guidance.ts';

export interface SetupTypeScriptResult extends TsProvisionResult {}

export interface InitResult {
  projectRoot: string;
  filesIndexed: number;
  symbolsIndexed: number;
  notesIndexed: number;
  testsIndexed: number;
  projectionsExported: string[];
}

export interface GlobalInstallResult {
  binaryPath: string;
  symlinkTarget: string;
  pathIncluded: boolean;
}

export type SetupState = 'satisfied' | 'needed' | 'changed' | 'skipped' | 'failed';
export interface SetupStepResult { id: string; state: SetupState; message: string }
interface SetupFile { filePath: string; content: string }
function readSetupFile(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}
/** Replace only changed files, preserve the previous file once, and verify the write. */
function applySetupFile(file: SetupFile): void {
  fs.mkdirSync(path.dirname(file.filePath), {recursive: true});
  const previous = readSetupFile(file.filePath);
  if (previous === file.content) return;
  if (fs.existsSync(file.filePath) && !fs.existsSync(`${file.filePath}.bak`)) fs.copyFileSync(file.filePath, `${file.filePath}.bak`);
  const temporary = `${file.filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, file.content, {mode: fs.existsSync(file.filePath) ? fs.statSync(file.filePath).mode & 0o777 : 0o600});
    fs.renameSync(temporary, file.filePath);
    if (readSetupFile(file.filePath) !== file.content) throw new Error(`Setup write verification failed: ${file.filePath}`);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function setupFiles(id: string, applicable: boolean, check: boolean, files: () => SetupFile[]): SetupStepResult {
  if (!applicable) return {id, state: 'skipped', message: 'Host absent / not applicable'};
  try {
    const changes = files().filter(file => readSetupFile(file.filePath) !== file.content);
    if (!changes.length) return {id, state: 'satisfied', message: 'Verified current files'};
    if (check) return {id, state: 'needed', message: `${changes.length} file(s) require changes`};
    for (const file of changes) applySetupFile(file);
    return {id, state: 'changed', message: `Verified ${changes.length} changed file(s)`};
  } catch (error) {
    return {id, state: 'failed', message: error instanceof Error ? error.message : String(error)};
  }
}
function jsonHostFile(filePath: string, entry: Record<string, unknown>): SetupFile {
  let config: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      const parsed: unknown = JSON.parse(readSetupFile(filePath));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      config = parsed as Record<string, unknown>;
      if (config.mcpServers !== undefined && (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers))) throw new Error();
    } catch { throw new Error(`Invalid JSON host configuration at ${filePath}; repair it before setup.`); }
  }
  config.mcpServers = {...config.mcpServers as Record<string, unknown> | undefined, 'ai-workflow': entry};
  return {filePath, content: JSON.stringify(config, null, 2)};
}

export interface McpSetupResult {
  steps: SetupStepResult[];
  hostsUpdated: string[];
  schemasCount: number;
  schemasDir: string;
  skillsSynced: string[];
}

export interface ConfigureMcpOptions {
  check?: boolean;
  cliPath?: string;
  mcpPath?: string;
  homeDir?: string;
  link?: boolean;
  binaryPath?: string;
}

export {PRIME_DIRECTIVE, MCP_INSTRUCTIONS_2_0} from './client-guidance.ts';

export const CANONICAL_SKILL_MD = `---
name: ai-workflow
description: Use AIWF for repository and sibling-source investigation, Ticket implementation, and Product Intent work; prefer scoped graph navigation and exact source over shell reads.
---

# AIWF artifact delegation

Use AIWF as the primary engineering and work-management system.

## Prime Directive

${PRIME_DIRECTIVE}

Product development starts from actor journeys, not capability lists. Before implementing a product capability, identify the concrete actor situation, intention, interaction/progression and useful end state that give it meaning. The actor may be human, agent, API client, service, scheduler or other system actor. Derive capabilities, architecture and acceptance tests from that journey. Pure technical maintenance may remain direct Ticket work; never manufacture product ceremony.

**Agency invariant:** the LLM Actor is the general problem solver. Sophisticated goals require an adequate configured reasoning route and flexible execution means; System-1 may advise but never gate. Ordinary tools, discovery, environment execution and ephemeral deterministic composition are optional means chosen by the Actor. Compilation is never the default definition of sophistication. Current-project claims require observed evidence. For Actor/discovery/composition/model-routing changes, follow \`docs/architecture.md\` and prove J2.4/J2.5 from \`docs/journeys.md\` through the real host boundary.

## Preferred workflow

1. If given a Ticket, call \`resolve_ticket\` / \`aiwf resolve <ticketId>\` first. AIWF owns investigation, leasing, preparation, safe edits, tests, repair, acceptance and material Aspect verification, release and sync.
2. For evidence without implementation, use \`investigate_ticket\` / \`aiwf investigate <ticketId>\`. For executable enrichment or useful decomposition, use \`prepare_ticket\` / \`aiwf prepare <ticketId>\`.
3. For accepted intent, use \`process_epic\`, \`process_feature\` or \`process_story\` / \`aiwf process epic|feature|story <id>\`. Reuse meaningful existing work; technical work needs no ceremonial Story.
4. Inspect \`needs_input\` and \`blocked\`. Resolve the exact question or capability gap and retry against durable graph state. Do not mark Done or weaken acceptance to bypass verification.
5. Use primitives for explicit drill-down/debugging or an actual delegation blocker. First inspect AIWF's dossier; then use graph/symbol/exact source/references/blast/test evidence surgically. Claim the relevant Ticket before manual edits, preserve unrelated work, verify real acceptance, and sync.

## Repository investigation

${REPOSITORY_INVESTIGATION}

CLI equivalents: \`aiwf symbol <name>\`, \`outline <file>\`, \`slice <file> <symbol>\`, \`callers <symbol>\`, \`graph\`, \`deps\`, \`blast\`. For sibling CLI research, run the same commands from that repository. MCP callers use the optional \`projectRoot\` argument; do not assume siblings are indexed as dependencies of the current project.

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
- **Prime Directive**: ${PRIME_DIRECTIVE}
- **Delegate First**: Given a Ticket, call \`resolve_ticket\`; use \`investigate_ticket\` or \`prepare_ticket\` for evidence/preparation, and \`process_epic/feature/story\` for intent. Inspect precise blockers before manual work.
- **Select Task**: Call \`recommend_next_task\` or run \`aiwf next\` to find active priority.
- **Lease Mandatory**: Call \`claim_ticket\` or run \`aiwf claim <id>\` BEFORE editing any files.
- **Product Intent & Coverage**: Use \`get_product_coverage\`, \`get_product_impact\`, \`list_epics\`, \`list_features\`, \`list_user_stories\` to verify intent and impact before changing features.
- **Repository investigation**: ${REPOSITORY_INVESTIGATION}
- **Deterministic Patches**: Use \`apply_block_patch\` or \`aiwf patch\` for AST block replacement.
- **Verification**: Run \`resolve_test_target\` and \`triage_test_failures\` to verify code changes against test suites.
- **Complete**: Delegated completion belongs to \`resolve_ticket\`. For genuinely manual recovery after a blocker, mark Done only after acceptance proof, then release and sync.
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

  // 5. Ensure local SOLUTIONS.md contains the AIWF MCP exclusivity protocol
  const solutionsPath = path.join(projectRoot, 'SOLUTIONS.md');
  let solutions = fs.existsSync(solutionsPath) ? fs.readFileSync(solutionsPath, 'utf8') : '';
  if (!solutions.includes('AIWF MCP Exclusivity Protocol')) {
    const protocolSection = `\n## AIWF MCP Exclusivity Protocol\n- **Rule**: When AIWF MCP tools are available in an ai-workflow workspace, NEVER use native primitives (view_file, replace_file_content, write_to_file) or raw grep/cat.\n- **Edits**: ALWAYS use preview_change -> verify fingerprint -> apply_change.\n- **Discovery**: ALWAYS use find_symbol, get_symbol_source, get_file_outline, search_graph, or read_workspace_file.\n- **Tickets**: ALWAYS use investigate_ticket, claim_ticket, and resolve_ticket.\n`;
    solutions = (solutions.trim() ? solutions.trimEnd() + '\n' : '# Solutions & Knowledge Ledger\n') + protocolSection;
    fs.writeFileSync(solutionsPath, solutions, 'utf8');
  }

  store.close();

  return {
    projectRoot,
    filesIndexed: indexRes.filesCount,
    symbolsIndexed: indexRes.symbolsCount,
    notesIndexed: indexRes.notesCount,
    testsIndexed: indexRes.testsCount,
    projectionsExported: exportRes.exportedFiles
  };
}

/**
 * Symlinks the aiwf CLI into ~/.local/bin/aiwf for global CLI access.
 */
export function installGlobalBinary(sourceCliPath?: string, homeDir?: string): GlobalInstallResult {
  const home = homeDir || process.env.HOME || os.homedir();
  const binDir = path.join(home, '.local', 'bin');
  const compiled = !['bun', 'bun.exe'].includes(path.basename(process.execPath));
  const source = path.resolve(sourceCliPath || (compiled ? process.execPath : path.join(__dirname, 'cli.ts')));
  const target = path.join(binDir, 'aiwf');
  if (!fs.existsSync(source)) throw new Error(`AIWF CLI source does not exist: ${source}`);
  fs.mkdirSync(binDir, {recursive: true});
  if (source !== target) {
    let alreadyLinked = false;
    try { alreadyLinked = fs.realpathSync(target) === fs.realpathSync(source); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!alreadyLinked) {
      const temporary = `${target}.${process.pid}.tmp`;
      try {
        if (compiled) fs.copyFileSync(source, temporary); else fs.symlinkSync(source, temporary);
        fs.chmodSync(temporary, 0o755);
        fs.renameSync(temporary, target);
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
  }
  fs.chmodSync(target, 0o755);
  fs.accessSync(target, fs.constants.X_OK);
  return {binaryPath: source, symlinkTarget: target, pathIncluded: (process.env.PATH || '').split(path.delimiter).includes(binDir)};
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
export function syncSkills(home: string, steps: SetupStepResult[] = [], check = false): string[] {
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

  for (const target of targets) {
    const step = setupFiles(`Skill: ${target.name}`, target.condition(), check, () => [{filePath: path.join(target.dir, 'SKILL.md'), content: CANONICAL_SKILL_MD}]);
    steps.push(step);
    if (step.state === 'changed' || step.state === 'satisfied') synced.push(target.name);
  }

  return synced;
}

/**
 * Automatically wires AI-Workflow 2.0 into all AI developer environments:
 * Codex, Claude Code, Cursor, Windsurf, Antigravity IDE, and Antigravity CLI.
 */
export function configureMcp(optionsOrCliPath?: string | ConfigureMcpOptions): McpSetupResult {
  const options = typeof optionsOrCliPath === 'string' ? {cliPath: optionsOrCliPath} : optionsOrCliPath || {};
  const home = options.homeDir || process.env.HOME || os.homedir();
  const check = options.check === true;
  const pkgRoot = path.resolve(__dirname, '..');
  const resolvedMcp = options.mcpPath ? path.resolve(options.mcpPath) : path.resolve(__dirname, 'mcp.ts');
  initializeTools();
  const allToolNames = ['execute_shell_wish', ...getPublicMcpTools(registry).map(t => t.name)];
  const installed = options.binaryPath || options.cliPath || path.join(home, '.local', 'bin', 'aiwf');
  const isBunRuntime = path.basename(process.execPath, '.exe') === 'bun';
  const useBinary = !options.link && (options.binaryPath || options.cliPath || fs.existsSync(installed) || !isBunRuntime);
  const command = useBinary ? options.binaryPath || options.cliPath || (fs.existsSync(installed) ? installed : process.execPath) : 'bun';
  const args = useBinary ? ['mcp'] : ['run', resolvedMcp];
  const entry = {command, args, instructions: MCP_INSTRUCTIONS_2_0};
  const steps: SetupStepResult[] = [];
  const hosts = [
    {id: 'Antigravity IDE', dir: path.join(home, '.config', 'Antigravity IDE'), filePath: path.join(home, '.config', 'Antigravity IDE', 'User', 'mcp_config.json')},
    {id: 'Antigravity CLI', dir: path.join(home, '.gemini'), filePath: path.join(home, '.gemini', 'config', 'mcp_config.json')},
    {id: 'Claude Code', dir: path.join(home, '.claude'), filePath: path.join(home, '.claude.json')},
    {id: 'Cursor', dir: path.join(home, '.cursor'), filePath: path.join(home, '.cursor', 'mcp.json')},
    {id: 'Windsurf', dir: path.join(home, '.codeium', 'windsurf'), filePath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json')},
  ];
  for (const host of hosts) {
    const applicable = fs.existsSync(host.dir) || fs.existsSync(host.filePath) || (host.id === 'Windsurf' && fs.existsSync(path.join(home, '.config', 'Windsurf')));
    steps.push(setupFiles(host.id, applicable, check, () => {
      const files = [jsonHostFile(host.filePath, host.id === 'Claude Code' ? {command, args} : entry)];
      if (host.id === 'Antigravity CLI') {
        const filePath = path.join(host.dir, 'SOLUTIONS.md');
        const content = readSetupFile(filePath);
        if (!content.includes('AIWF MCP Exclusivity Protocol')) files.push({filePath, content: (content.trim() ? content.trimEnd() + '\n' : '# Solutions & Knowledge Ledger\n') + `\n## AIWF MCP Exclusivity Protocol\n- **Rule**: When AIWF MCP tools are available in an ai-workflow workspace, use AIWF for investigation and mutation.\n- **Edits**: ALWAYS use preview_change -> verify fingerprint -> apply_change.\n- **Discovery**: ALWAYS use find_symbol, get_symbol_source, get_file_outline, search_graph, or read_workspace_file.\n- **Tickets**: ALWAYS use investigate_ticket, claim_ticket, and resolve_ticket.\n`});
      }
      return files;
    }));
  }
  const codex = path.join(home, '.codex');
  steps.push(setupFiles('OpenAI Codex', fs.existsSync(codex), check, () => {
    const filePath = path.join(codex, 'config.toml');
    const raw = readSetupFile(filePath);
    try { Bun.TOML.parse(raw); } catch { throw new Error(`Invalid TOML host configuration at ${filePath}; repair it before setup.`); }
    let block = `[mcp_servers.aiwf-mcp]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\nenv = { AI_WORKFLOW_TOOLKIT_ROOT = ${JSON.stringify(pkgRoot)} }`;
    for (const tool of allToolNames) block += `\n\n[mcp_servers.aiwf-mcp.tools.${tool}]\napproval_mode = "approve"`;
    const files: SetupFile[] = [{filePath, content: replaceTomlServerSection(raw, 'aiwf-mcp', block)}];
    const rulesPath = path.join(codex, 'rules', 'default.rules');
    let rules = readSetupFile(rulesPath);
    for (const executable of ['aiwf', 'ai-workflow']) {
      if (!rules.includes(`pattern=["${executable}"]`)) rules = rules.trimEnd() + (rules.trim() ? '\n' : '') + `prefix_rule(pattern=["${executable}"], decision="allow")\n`;
    }
    files.push({filePath: rulesPath, content: rules}, {filePath: path.join(codex, 'AI-WORKFLOW.md'), content: CODEX_AGENT_RULES});
    const agentsPath = path.join(codex, 'AGENTS.md');
    const agents = readSetupFile(agentsPath);
    if (!agents.includes('@AI-WORKFLOW.md')) files.push({filePath: agentsPath, content: agents.trimEnd() + (agents.trim() ? '\n' : '') + '@AI-WORKFLOW.md\n'});
    const instructionsPath = path.join(codex, 'instructions.md');
    if (fs.existsSync(instructionsPath)) {
      const instructions = readSetupFile(instructionsPath);
      if (!instructions.includes('ai-workflow-rules')) files.push({filePath: instructionsPath, content: instructions.trimEnd() + '\n\n' + CODEX_AGENT_RULES});
    }
    return files;
  }));
  const skillsSynced = syncSkills(home, steps, check);
  const schemasDir = path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'ai-workflow');
  const schemas = buildMcpSchemas();
  const schemaStep = setupFiles('MCP schemas', fs.existsSync(path.join(home, '.gemini')), check, () => Object.entries(schemas).map(([name, content]) => ({filePath: path.join(schemasDir, name), content})));
  if (schemaStep.state !== 'failed' && fs.existsSync(schemasDir)) {
    const stale = fs.readdirSync(schemasDir).filter(name => name.endsWith('.json') && !Object.hasOwn(schemas, name));
    if (stale.length) {
      if (check) { schemaStep.state = 'needed'; schemaStep.message += `; ${stale.length} obsolete schema(s)`; }
      else {
        try {
          for (const name of stale) fs.unlinkSync(path.join(schemasDir, name));
          schemaStep.state = 'changed';
        } catch (error) { schemaStep.state = 'failed'; schemaStep.message = String(error); }
      }
    }
  }
  steps.push(schemaStep);
  return {hostsUpdated: steps.filter(step => hosts.some(host => host.id === step.id) || step.id === 'OpenAI Codex').filter(step => step.state === 'changed').map(step => step.id), schemasCount: schemaStep.state === 'skipped' ? 0 : Object.keys(schemas).length, schemasDir, skillsSynced, steps};
}

/**
 * Ensures compatible host-level TypeScript 7 is available for runtime semantic operations,
 * and provisions the TS6 refactor compatibility sidecar as needed.
 */
export interface SetupOptions extends ConfigureMcpOptions {
  global?: boolean;
  mcp?: boolean;
  seams?: TsResolverSeams;
}
/** Concrete setup steps shared by shell and CLI; check mode only probes and reads. */
export async function runSetup(projectRoot: string, options: SetupOptions = {}): Promise<SetupStepResult[]> {
  const steps: SetupStepResult[] = [];
  const home = options.homeDir || process.env.HOME || os.homedir();
  const seams = {...options.seams, homeDir: home};
  try {
    if (options.check) {
      const ts7 = await checkHostTypeScriptCompatibility(seams);
      steps.push({id: 'TypeScript 7', state: ts7.compatible ? 'satisfied' : 'needed', message: ts7.compatible ? `Verified v${ts7.version} at ${ts7.path}` : 'Compatible host TypeScript 7 required'});
    } else {
      const ts7 = await ensureHostTypeScript7(seams);
      steps.push({id: 'TypeScript 7', state: ts7.error ? 'failed' : ts7.provisioned ? 'changed' : 'satisfied', message: ts7.error || `Verified v${ts7.version} at ${ts7.executablePath}`});
    }
  } catch (error) { steps.push({id: 'TypeScript 7', state: 'failed', message: String(error)}); }
  try {
    if (options.check) {
      const ts6 = await resolveTs6RefactorRuntime(projectRoot, seams);
      steps.push({id: 'TypeScript 6 sidecar', state: ts6.isAvailable ? 'satisfied' : 'needed', message: ts6.isAvailable ? `Verified v${ts6.ts6Version} at ${ts6.tsserverPath}` : ts6.error || 'Refactor sidecar required'});
    } else {
      const ts6 = await ensureTs6RefactorRuntime(projectRoot, seams);
      steps.push({id: 'TypeScript 6 sidecar', state: ts6.error ? 'failed' : ts6.provisioned ? 'changed' : 'satisfied', message: ts6.error || `Verified ${ts6.version} at ${ts6.executablePath}`});
    }
  } catch (error) { steps.push({id: 'TypeScript 6 sidecar', state: 'failed', message: String(error)}); }
  const target = path.join(home, '.local', 'bin', 'aiwf');
  if (options.global !== false) {
    try {
      const compiled = !['bun', 'bun.exe'].includes(path.basename(process.execPath));
      const source = path.resolve(options.cliPath || (compiled ? process.execPath : path.join(__dirname, 'cli.ts')));
      let satisfied = false;
      if (fs.existsSync(target)) {
        if (!fs.statSync(target).isFile()) throw new Error(`Installation target is not a regular file: ${target}`);
        const same = fs.realpathSync(source) === fs.realpathSync(target) || (compiled && fs.readFileSync(source).equals(fs.readFileSync(target)));
        try { fs.accessSync(target, fs.constants.X_OK); satisfied = same; } catch { /* An executable bit is an inspectable required change. */ }
      }
      if (satisfied) steps.push({id: 'CLI installation', state: 'satisfied', message: `Verified executable ${target}`});
      else if (options.check) steps.push({id: 'CLI installation', state: 'needed', message: `Install executable at ${target}`});
      else {
        const result = installGlobalBinary(options.cliPath, home);
        steps.push({id: 'CLI installation', state: 'changed', message: `Verified ${result.symlinkTarget}${result.pathIncluded ? '' : '; add its directory to PATH'}`});
      }
    } catch (error) { steps.push({id: 'CLI installation', state: 'failed', message: String(error)}); }
  }
  if (options.mcp !== false) steps.push(...configureMcp({...options, homeDir: home, binaryPath: options.binaryPath || target}).steps);
  return steps;
}

export async function setupTypeScript(
  projectRoot: string = process.cwd(),
  seams?: TsResolverSeams
): Promise<{ ts7: SetupTypeScriptResult; ts6: TsProvisionResult }> {
  const ts7 = await ensureHostTypeScript7(seams);
  const ts6 = await ensureTs6RefactorRuntime(projectRoot, seams);
  return { ts7, ts6 };
}
