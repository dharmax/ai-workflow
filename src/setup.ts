/**
 * Responsibility: Frictionless Project and Global Setup Engine.
 * Scope: Zero-config project initialization, global binary symlinking, and IDE/CLI MCP wiring.
 */

import path from 'node:path';
import fs from 'node:fs';
import { WorkflowStore } from './graph/store.ts';
import { indexCodebase } from './graph/indexer.ts';
import { exportProjections, importProjections } from './graph/projections.ts';
import { Ticket, Epic } from './graph/ontology.ts';
import { saveConfig, loadConfig } from './config.ts';
import { exportMcpSchemas } from './mcp.ts';

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
}

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
export function installGlobalBinary(sourceCliPath?: string): GlobalInstallResult {
  const home = process.env.HOME || '~';
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
 * Automatically wires AI-Workflow into Antigravity IDE and CLI MCP configurations.
 */
export function configureMcp(cliPath?: string): McpSetupResult {
  const home = process.env.HOME || '~';
  const resolvedCli = cliPath ? path.resolve(cliPath) : path.resolve(__dirname, 'cli.ts');
  const hostsUpdated: string[] = [];

  const mcpEntry = {
    command: 'bun',
    args: [resolvedCli, 'mcp'],
    instructions: 'ai-workflow Causal Engineering OS: Use get_ticket_context before working on tickets; use get_project_overview for module health & bug counts; use audit_guidelines before claiming task completion; use propose_decision / revert_decision for architectural records; use compile_codelet / run_codelet for synthesized routines.'
  };

  // 1. Antigravity IDE
  const ideConfigPath = path.join(home, '.config', 'Antigravity IDE', 'User', 'mcp_config.json');
  try {
    let ideConfig: any = { mcpServers: {} };
    if (fs.existsSync(ideConfigPath)) {
      ideConfig = JSON.parse(fs.readFileSync(ideConfigPath, 'utf8'));
    } else {
      fs.mkdirSync(path.dirname(ideConfigPath), { recursive: true });
    }
    ideConfig.mcpServers = ideConfig.mcpServers || {};
    ideConfig.mcpServers['ai-workflow'] = mcpEntry;
    fs.writeFileSync(ideConfigPath, JSON.stringify(ideConfig, null, 2), 'utf8');
    hostsUpdated.push('Antigravity IDE');
  } catch {}

  // 2. Global Gemini / Antigravity CLI
  const cliConfigPath = path.join(home, '.gemini', 'config', 'mcp_config.json');
  try {
    let cliConfig: any = { mcpServers: {} };
    if (fs.existsSync(cliConfigPath)) {
      cliConfig = JSON.parse(fs.readFileSync(cliConfigPath, 'utf8'));
    } else {
      fs.mkdirSync(path.dirname(cliConfigPath), { recursive: true });
    }
    cliConfig.mcpServers = cliConfig.mcpServers || {};
    cliConfig.mcpServers['ai-workflow'] = mcpEntry;
    fs.writeFileSync(cliConfigPath, JSON.stringify(cliConfig, null, 2), 'utf8');
    hostsUpdated.push('Antigravity CLI');
  } catch {}

  // 3. Export MCP Tool Schemas for Lazy Loading
  const schemasDir = path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'ai-workflow');
  const exported = exportMcpSchemas(schemasDir);

  return {
    hostsUpdated,
    schemasCount: exported.length,
    schemasDir
  };
}
