import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  initProject,
  installGlobalBinary,
  configureMcp,
  replaceTomlServerSection,
  syncSkills,
  CANONICAL_SKILL_MD,
  MCP_INSTRUCTIONS_2_0
} from '../src/setup.ts';
import { runDiagnostics, formatDiagnosticReport } from '../src/doctor.ts';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../src/config.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, Epic } from '../src/graph/ontology.ts';

describe('Project Initialization, Global Setup & Diagnostics Engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-setup-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize a fresh project with AST indexing and markdown projections', async () => {
    // 1. Create a dummy codebase in tempDir
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'auth.ts'),
      `// TODO: Add OAuth2 provider support
export function authenticate(token: string): boolean {
  return token.length > 10;
}
`,
      'utf8'
    );

    // 2. Run initProject
    const res = await initProject(tempDir);

    expect(res.projectRoot).toBe(tempDir);
    expect(res.filesIndexed).toBe(1);
    expect(res.symbolsIndexed).toBeGreaterThanOrEqual(1);
    expect(res.notesIndexed).toBe(1);
    expect(res.projectionsExported).toContain('kanban.md');
    expect(res.projectionsExported).toContain('epics.md');

    // 3. Verify disk projections exist
    expect(fs.existsSync(path.join(tempDir, 'kanban.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'epics.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.ai-workflow', 'config.json'))).toBe(true);

    const kanbanContent = fs.readFileSync(path.join(tempDir, 'kanban.md'), 'utf8');
    expect(kanbanContent).toContain('TKT-001');
    expect(kanbanContent).toContain('Explore codebase');

    // 4. Verify SQLite store contains starter entities
    const store = new WorkflowStore(tempDir);
    const tickets = await store.listEntities<Ticket>(Ticket.dcr);
    expect(tickets.length).toBe(1);
    expect(store.localId(tickets[0].id)).toBe('TKT-001');

    const epics = await store.listEntities<Epic>(Epic.dcr);
    expect(epics.length).toBe(1);
    expect(store.localId(epics[0].id)).toBe('EPIC-ONBOARDING');
    store.close();
  });

  it('should run doctor diagnostics and produce a healthy report on initialized repo', async () => {
    await initProject(tempDir);
    const store = new WorkflowStore(tempDir);

    const report = await runDiagnostics(store, tempDir);
    expect(report.projectRoot).toBe(tempDir);
    expect(report.healthy).toBe(true);

    const checkNames = report.checks.map(c => c.name);
    expect(checkNames).toContain('Bun Engine');
    expect(checkNames).toContain('AST+ Semantic Graph');
    expect(checkNames).toContain('Markdown Sync');
    expect(checkNames).toContain('Lease & Flow Health');

    const formatted = formatDiagnosticReport(report);
    expect(formatted).toContain('Doctor Report');
    expect(formatted).toContain('HEALTHY');

    store.close();
  });

  it('should read, update, and persist configuration', () => {
    // Default config
    const initialCfg = loadConfig(tempDir);
    expect(initialCfg.defaultAgentId).toBe(DEFAULT_CONFIG.defaultAgentId);
    expect(initialCfg.defaultLeaseMinutes).toBe(30);

    // Update config
    const updated = saveConfig(tempDir, {
      defaultAgentId: 'autonomous-sentinel',
      defaultLeaseMinutes: 45,
      model: 'qwen2.5-coder:14b'
    });

    expect(updated.defaultAgentId).toBe('autonomous-sentinel');
    expect(updated.defaultLeaseMinutes).toBe(45);
    expect(updated.model).toBe('qwen2.5-coder:14b');

    // Read back fresh from disk
    const reloaded = loadConfig(tempDir);
    expect(reloaded.defaultAgentId).toBe('autonomous-sentinel');
    expect(reloaded.defaultLeaseMinutes).toBe(45);
  });

  it('should execute CLI binary commands end-to-end with zero exit codes', async () => {
    await initProject(tempDir);

    // 1. aiwf help
    const helpProc = Bun.spawn(['bun', path.resolve('src/cli.ts'), 'help'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const helpOut = await new Response(helpProc.stdout).text();
    expect(await helpProc.exited).toBe(0);
    expect(helpOut).toContain('AI-Workflow 2.0');
    expect(helpOut).toContain('Usage: aiwf <command>');

    // 2. aiwf doctor
    const docProc = Bun.spawn(['bun', path.resolve('src/cli.ts'), 'doctor'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const docOut = await new Response(docProc.stdout).text();
    expect(await docProc.exited).toBe(0);
    expect(docOut).toContain('Doctor Report');
    expect(docOut).toContain('HEALTHY');

    // 3. aiwf eval
    const evalProc = Bun.spawn(['bun', path.resolve('src/cli.ts'), 'eval', 'return 7 * 6;'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const evalOut = await new Response(evalProc.stdout).text();
    expect(await evalProc.exited).toBe(0);
    expect(evalOut.trim()).toBe('42');
  });

  it('should replace TOML server sections accurately without corrupting adjacent config', () => {
    const originalToml = `model = "gpt-5"

[mcp_servers.leanctx]
command = "lean-ctx"

[mcp_servers.aiwf-mcp]
command = "old-cmd"
args = ["old.ts"]
[mcp_servers.aiwf-mcp.tools.sync_project]
approval_mode = "approve"

[mcp_servers.node_repl]
args = []
`;

    const newBlock = `[mcp_servers.aiwf-mcp]
command = "bun"
args = ["run", "/new/path/mcp.ts"]
[mcp_servers.aiwf-mcp.tools.claim_ticket]
approval_mode = "approve"`;

    const result = replaceTomlServerSection(originalToml, 'aiwf-mcp', newBlock);

    expect(result).toContain('[mcp_servers.leanctx]');
    expect(result).toContain('[mcp_servers.node_repl]');
    expect(result).toContain('/new/path/mcp.ts');
    expect(result).toContain('[mcp_servers.aiwf-mcp.tools.claim_ticket]');
    expect(result).not.toContain('sync_project');
    expect(result).not.toContain('old-cmd');

    // Also test append when section does not exist
    const appended = replaceTomlServerSection('key = 123', 'aiwf-mcp', newBlock);
    expect(appended).toContain('key = 123');
    expect(appended).toContain('[mcp_servers.aiwf-mcp]');
  });

  it('should distribute canonical 2.0 skills to all detected environments', () => {
    const mockHome = path.join(tempDir, 'userhome');
    fs.mkdirSync(path.join(mockHome, '.gemini'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.codex'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.codeium', 'windsurf'), { recursive: true });

    const synced = syncSkills(mockHome);
    expect(synced).toContain('Antigravity');
    expect(synced).toContain('OpenAI Codex');
    expect(synced).toContain('Claude Code');
    expect(synced).toContain('Cursor');
    expect(synced).toContain('Windsurf');

    const codexSkill = fs.readFileSync(path.join(mockHome, '.codex', 'skills', 'ai-workflow', 'SKILL.md'), 'utf8');
    expect(codexSkill).toBe(CANONICAL_SKILL_MD);
    expect(codexSkill).toContain('AI-Workflow 2.0 Skill: Causal Context & Engineering OS');
    expect(codexSkill).toContain('recommend_next_task');
    expect(codexSkill).toContain('claim_ticket');

    const claudeSkill = fs.readFileSync(path.join(mockHome, '.claude', 'skills', 'ai-workflow', 'SKILL.md'), 'utf8');
    expect(claudeSkill).toBe(CANONICAL_SKILL_MD);
  });

  it('should wire MCP configuration, tool approvals, and rules across all hosts', () => {
    const mockHome = path.join(tempDir, 'userhome_mcp');
    // Setup directory structure for all hosts
    fs.mkdirSync(path.join(mockHome, '.config', 'Antigravity IDE', 'User'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.gemini', 'config'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.codex', 'rules'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(mockHome, '.codeium', 'windsurf'), { recursive: true });

    // Seed initial Codex config & rules
    fs.writeFileSync(path.join(mockHome, '.codex', 'config.toml'), `model = "gpt-5"\n[mcp_servers.old]\ncmd = "test"\n`);
    fs.writeFileSync(path.join(mockHome, '.codex', 'rules', 'default.rules'), `prefix_rule(pattern=["npm", "test"], decision="allow")\n`);
    fs.writeFileSync(path.join(mockHome, '.codex', 'AGENTS.md'), `# Instructions\n@LEAN-CTX.md\n`);
    fs.writeFileSync(path.join(mockHome, '.claude.json'), JSON.stringify({ mcpServers: {} }));

    const fakeMcpPath = path.join(tempDir, 'fake-mcp.ts');
    fs.writeFileSync(fakeMcpPath, '// fake mcp');

    const res = configureMcp({
      mcpPath: fakeMcpPath,
      homeDir: mockHome
    });

    expect(res.hostsUpdated).toContain('Antigravity IDE');
    expect(res.hostsUpdated).toContain('Antigravity CLI');
    expect(res.hostsUpdated).toContain('OpenAI Codex');
    expect(res.hostsUpdated).toContain('Claude Code');
    expect(res.hostsUpdated).toContain('Cursor');
    expect(res.hostsUpdated).toContain('Windsurf');

    // 1. Verify Codex config.toml has all 2.0 tool approvals
    const codexToml = fs.readFileSync(path.join(mockHome, '.codex', 'config.toml'), 'utf8');
    expect(codexToml).toContain('[mcp_servers.aiwf-mcp]');
    expect(codexToml).toContain('[mcp_servers.aiwf-mcp.tools.claim_ticket]');
    expect(codexToml).toContain('[mcp_servers.aiwf-mcp.tools.recommend_next_task]');
    expect(codexToml).toContain('[mcp_servers.aiwf-mcp.tools.apply_block_patch]');
    expect(codexToml).toContain('approval_mode = "approve"');

    // 2. Verify Codex rules has prefix_rule for aiwf and ai-workflow
    const codexRules = fs.readFileSync(path.join(mockHome, '.codex', 'rules', 'default.rules'), 'utf8');
    expect(codexRules).toContain('prefix_rule(pattern=["aiwf"], decision="allow")');
    expect(codexRules).toContain('prefix_rule(pattern=["ai-workflow"], decision="allow")');

    // 3. Verify Codex AGENTS.md and AI-WORKFLOW.md
    const agentsMd = fs.readFileSync(path.join(mockHome, '.codex', 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('@AI-WORKFLOW.md');
    expect(fs.existsSync(path.join(mockHome, '.codex', 'AI-WORKFLOW.md'))).toBe(true);

    // 4. Verify Claude JSON
    const claudeJson = JSON.parse(fs.readFileSync(path.join(mockHome, '.claude.json'), 'utf8'));
    expect(claudeJson.mcpServers['ai-workflow'].command).toBe('bun');
    expect(claudeJson.mcpServers['ai-workflow'].args).toEqual(['run', fakeMcpPath]);

    // 5. Verify Cursor JSON
    const cursorJson = JSON.parse(fs.readFileSync(path.join(mockHome, '.cursor', 'mcp.json'), 'utf8'));
    expect(cursorJson.mcpServers['ai-workflow'].instructions).toBe(MCP_INSTRUCTIONS_2_0);

    // 6. Verify Windsurf JSON
    const windsurfJson = JSON.parse(fs.readFileSync(path.join(mockHome, '.codeium', 'windsurf', 'mcp_config.json'), 'utf8'));
    expect(windsurfJson.mcpServers['ai-workflow'].instructions).toBe(MCP_INSTRUCTIONS_2_0);
  });

  it('should install and verify global binary symlink in custom directory', () => {
    const mockHome = path.join(tempDir, 'userhome_bin');
    const fakeCli = path.join(tempDir, 'fake-cli.ts');
    fs.writeFileSync(fakeCli, '#!/usr/bin/env bun\nconsole.log("cli");\n');

    const res = installGlobalBinary(fakeCli, mockHome);
    expect(res.binaryPath).toBe(fakeCli);
    expect(res.symlinkTarget).toBe(path.join(mockHome, '.local', 'bin', 'aiwf'));
    expect(fs.existsSync(res.symlinkTarget)).toBe(true);
    expect(fs.lstatSync(res.symlinkTarget).isSymbolicLink()).toBe(true);
  });
});

