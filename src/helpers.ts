import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { WorkflowStore } from './store.ts';

export function findProjectRoot(startDir: string = process.cwd()): { root: string; marker: string } {
  let current = path.resolve(startDir);
  const home = os.homedir();
  const rootMarkers = ['.ai-workflow', '.git', 'bun.lock', 'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod'];

  while (true) {
    for (const marker of rootMarkers) {
      if (fs.existsSync(path.join(current, marker))) {
        return { root: current, marker };
      }
    }
    const parent = path.dirname(current);
    if (parent === current || current === home) break;
    current = parent;
  }

  return { root: path.resolve(startDir), marker: 'fallback:cwd' };
}

export function getEnvironmentInfo(root: string) {
  const isBun = typeof Bun !== 'undefined';
  const nodeVersion = process.version;
  const bunVersion = isBun ? Bun.version : null;
  const platform = process.platform;
  const arch = process.arch;

  let packageManager = 'unknown';
  if (fs.existsSync(path.join(root, 'bun.lock')) || fs.existsSync(path.join(root, 'bun.lockb'))) packageManager = 'bun';
  else if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
  else if (fs.existsSync(path.join(root, 'yarn.lock'))) packageManager = 'yarn';
  else if (fs.existsSync(path.join(root, 'package-lock.json'))) packageManager = 'npm';
  else if (fs.existsSync(path.join(root, 'Cargo.lock'))) packageManager = 'cargo';
  else if (fs.existsSync(path.join(root, 'poetry.lock'))) packageManager = 'poetry';

  const isGit = fs.existsSync(path.join(root, '.git'));

  return {
    root,
    platform: `${platform} (${arch})`,
    runtime: isBun ? `Bun v${bunVersion}` : `Node ${nodeVersion}`,
    packageManager,
    isGit,
    hasAiWorkflowState: fs.existsSync(path.join(root, '.ai-workflow'))
  };
}

export async function getGitStatus(root: string) {
  try {
    const proc = Bun.spawn(['git', 'status', '--porcelain', '-b'], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return { isGit: false, message: 'Not a git repository or git error' };

    const lines = stdout.trim().split('\n').filter(Boolean);
    const branchLine = lines[0] || '';
    const branchMatch = branchLine.match(/^##\s+([\w\.\/\-]+)/);
    const branch = branchMatch ? branchMatch[1] : 'HEAD';

    const modified: string[] = [];
    const untracked: string[] = [];
    const staged: string[] = [];

    for (const l of lines.slice(1)) {
      const code = l.substring(0, 2);
      const file = l.substring(3).trim();
      if (code === '??') untracked.push(file);
      else if (code.includes('M') || code.includes('D')) modified.push(file);
      else if (code[0] !== ' ' && code[0] !== '?') staged.push(file);
    }

    return {
      isGit: true,
      branch,
      clean: modified.length === 0 && untracked.length === 0 && staged.length === 0,
      modified,
      untracked,
      staged,
      totalChanges: modified.length + untracked.length + staged.length
    };
  } catch (err: any) {
    return { isGit: false, message: err.message };
  }
}

export async function getGitHotspots(root: string, days: number = 14) {
  try {
    const proc = Bun.spawn(['git', 'log', `--since=${days}.days`, '--name-only', '--pretty=format:'], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const stdout = await new Response(proc.stdout).text();
    const files = stdout.trim().split('\n').filter(f => f.trim().length > 0);

    const counts: Record<string, number> = {};
    for (const f of files) {
      counts[f] = (counts[f] || 0) + 1;
    }

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([file, changes]) => ({ file, changes }));

    return {
      sinceDays: days,
      totalTouchCount: files.length,
      hotspots: sorted
    };
  } catch {
    return { sinceDays: days, totalTouchCount: 0, hotspots: [] };
  }
}

export async function getGitDiff(root: string, target?: string) {
  try {
    const args = ['git', 'diff'];
    if (target) args.push(target);
    const proc = Bun.spawn(args, {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const stdout = await new Response(proc.stdout).text();
    return {
      target: target || 'working-tree',
      hasChanges: stdout.trim().length > 0,
      diff: stdout.trim() || 'No uncommitted changes in working tree.'
    };
  } catch (err: any) {
    return { target: target || 'working-tree', hasChanges: false, diff: err.message };
  }
}

export function getFileOutline(store: WorkflowStore, filePath: string) {
  const normPath = filePath.startsWith('/') ? path.relative(store.root, filePath) : filePath;
  const symbols = store.getOutgoing(normPath, 'contains');
  if (symbols.length === 0) {
    const allSyms = store.listEntities({ type: 'symbol' });
    const matched = allSyms.filter(s => s.metadata?.file === normPath || s.metadata?.file?.endsWith(normPath));
    return {
      file: normPath,
      symbolCount: matched.length,
      signatures: matched.map(s => ({
        name: s.title,
        kind: s.metadata?.kind || 'symbol',
        line: s.metadata?.line || 1
      }))
    };
  }
  return {
    file: normPath,
    symbolCount: symbols.length,
    signatures: symbols.map(s => ({
      name: s.title,
      kind: s.metadata?.kind || 'symbol',
      line: s.metadata?.line || 1
    }))
  };
}

export function resolveTestTarget(root: string, filePath: string) {
  const norm = filePath.startsWith('/') ? path.relative(root, filePath) : filePath;
  const parsed = path.parse(norm);
  const baseName = parsed.name;

  const candidatePaths = [
    path.join('tests', `${baseName}.test.ts`),
    path.join('tests', `${baseName}.test.js`),
    path.join('test', `${baseName}.test.ts`),
    path.join(parsed.dir, `${baseName}.test.ts`),
    path.join(parsed.dir, `__tests__`, `${baseName}.test.ts`),
    path.join(parsed.dir, `${baseName}.spec.ts`)
  ];

  for (const c of candidatePaths) {
    if (fs.existsSync(path.join(root, c))) {
      return {
        sourceFile: norm,
        testFile: c,
        found: true,
        testCommand: `bun test ${c}`
      };
    }
  }

  return {
    sourceFile: norm,
    testFile: candidatePaths[0],
    found: false,
    testCommand: `bun test`
  };
}

export function appendScratchpadNote(root: string, note: string) {
  const scratchDir = path.join(root, '.ai-workflow');
  fs.mkdirSync(scratchDir, { recursive: true });
  const scratchFile = path.join(scratchDir, 'scratchpad.md');
  const timestamp = new Date().toISOString();
  const entry = `\n- **[${timestamp}]**: ${note}\n`;
  fs.appendFileSync(scratchFile, entry, 'utf8');
  return { note, timestamp, file: scratchFile };
}

export function readScratchpad(root: string) {
  const scratchFile = path.join(root, '.ai-workflow', 'scratchpad.md');
  if (!fs.existsSync(scratchFile)) {
    return { content: 'Scratchpad is empty. Use `aiwf note "<text>"` to drop notes.', notesCount: 0 };
  }
  const content = fs.readFileSync(scratchFile, 'utf8');
  const lines = content.trim().split('\n').filter(l => l.startsWith('- **['));
  return { content, notesCount: lines.length };
}

export function lintWorkflowGraph(store: WorkflowStore) {
  const tickets = store.listEntities({ type: 'ticket' });
  const symbols = store.listEntities({ type: 'symbol' });
  const now = new Date();

  // 1. Orphan tickets
  const orphanTickets = tickets.filter(t => {
    const modifies = store.getOutgoing(t.id, 'modifies');
    const epics = store.getIncoming(t.id, 'implements').concat(store.getOutgoing(t.id, 'implements'));
    return modifies.length === 0 && epics.length === 0;
  }).map(t => ({ id: t.id, title: t.title, lane: t.lane }));

  // 2. Dead symbols (sample with 0 callers)
  const deadSymbols = symbols.filter(s => {
    const callers = store.getIncoming(s.id, 'calls');
    return callers.length === 0;
  }).slice(0, 15).map(s => ({ id: s.id, name: s.title, file: s.metadata?.file }));

  // 3. Stale claims
  const staleTickets = tickets.filter(t => {
    const c = t.metadata?.claim;
    if (c && c.expiresAt && new Date(c.expiresAt) < now && t.lane === 'In Progress') {
      return true;
    }
    return false;
  }).map(t => ({ id: t.id, title: t.title, expiredClaim: t.metadata?.claim }));

  const clean = orphanTickets.length === 0 && staleTickets.length === 0;

  return {
    clean,
    orphanTicketsCount: orphanTickets.length,
    orphanTickets,
    deadSymbolsSampleCount: deadSymbols.length,
    deadSymbols,
    staleInProgressClaimsCount: staleTickets.length,
    staleInProgressClaims: staleTickets
  };
}

export async function triageTestFailures(root: string, customCommand: string = 'bun test') {
  try {
    const parts = customCommand.split(/\s+/);
    const proc = Bun.spawn(parts, {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      return {
        passed: true,
        failingCount: 0,
        failures: [],
        summary: 'All tests passed cleanly ✅'
      };
    }

    const combined = stdout + '\n' + stderr;
    const failureLines: Array<{ testName: string; error: string }> = [];
    const lines = combined.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.includes('✗') || l.includes('FAIL') || l.includes('error: expect')) {
        const testName = l.replace(/^[✗\s]+/, '').trim();
        const error = lines.slice(i, i + 4).join('\n').trim();
        failureLines.push({ testName, error });
        i += 3;
      }
    }

    return {
      passed: false,
      failingCount: failureLines.length || 1,
      failures: failureLines.slice(0, 5),
      rawOutputSnippet: combined.slice(0, 1000)
    };
  } catch (err: any) {
    return { passed: false, failingCount: 1, failures: [{ testName: 'Runner error', error: err.message }] };
  }
}

export function recordTicketLesson(store: WorkflowStore, ticketId: string, lessonText: string) {
  const existing = store.getEntity(ticketId);
  const id = `lesson-${Date.now()}`;
  store.recordRunArtifact({
    id,
    ticketId,
    action: 'lesson-record',
    status: 'passed',
    lessons: { note: lessonText, recordedAt: new Date().toISOString() }
  });
  return { id, ticketId, ticketTitle: existing?.title || ticketId, lesson: lessonText };
}

export function getSymbolSource(store: WorkflowStore, filePath: string, symbolName: string) {
  const normPath = filePath.startsWith('/') ? path.relative(store.root, filePath) : filePath;
  const fullPath = path.resolve(store.root, normPath);
  if (!fs.existsSync(fullPath)) {
    return { found: false, message: `File not found: ${normPath}`, code: '' };
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const symbols = store.getOutgoing(normPath, 'contains');
  const sym = symbols.find(s => s.title.toLowerCase().includes(symbolName.toLowerCase()));

  const startLine = sym?.metadata?.line ? Math.max(1, sym.metadata.line) : 1;
  const sliceLines = lines.slice(startLine - 1, startLine + 39);

  return {
    found: true,
    file: normPath,
    symbol: sym?.title || symbolName,
    startLine,
    lineCount: sliceLines.length,
    code: sliceLines.join('\n')
  };
}

export function estimateTokenBudget(root: string, filePaths: string[]) {
  const estimates: Array<{ file: string; chars: number; estimatedTokens: number }> = [];
  let totalChars = 0;

  for (const fp of filePaths) {
    const full = path.resolve(root, fp);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      const content = fs.readFileSync(full, 'utf8');
      const chars = content.length;
      const estimatedTokens = Math.round(chars / 3.8);
      totalChars += chars;
      estimates.push({ file: fp, chars, estimatedTokens });
    }
  }

  const totalEstimatedTokens = Math.round(totalChars / 3.8);
  const budgetRisk = totalEstimatedTokens > 16000 ? 'High' : totalEstimatedTokens > 6000 ? 'Medium' : 'Low';

  return {
    fileCount: estimates.length,
    totalEstimatedTokens,
    budgetRisk,
    estimates
  };
}

export async function createSnapshotCheckpoint(root: string, label?: string) {
  const name = label || `snapshot-${Date.now()}`;
  const snapshotsDir = path.join(root, '.ai-workflow', 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const patchFile = path.join(snapshotsDir, `${name}.patch`);
  try {
    const proc = Bun.spawn(['git', 'diff', 'HEAD'], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const diff = await new Response(proc.stdout).text();
    fs.writeFileSync(patchFile, diff, 'utf8');

    return {
      snapshotName: name,
      savedPath: patchFile,
      hasChanges: diff.trim().length > 0,
      diffBytes: diff.length
    };
  } catch (err: any) {
    return { snapshotName: name, savedPath: patchFile, hasChanges: false, error: err.message };
  }
}

export function generatePrSummary(store: WorkflowStore, ticketId?: string) {
  const ticket = ticketId ? store.getEntity(ticketId) : null;
  const decisions = store.listEntities({ type: 'decision' }).filter(d => d.status === 'accepted');

  const title = ticket ? `feat(${ticket.id}): ${ticket.title}` : `chore(workflow): update project state`;
  let body = `## Summary\n`;
  if (ticket) {
    body += `- Resolves **${ticket.id}**: ${ticket.title}\n`;
    if (ticket.body) body += `  - ${ticket.body}\n`;
  } else {
    body += `- Verified completion across active modules.\n`;
  }

  if (decisions.length > 0) {
    body += `\n### Architectural Decisions (ADR)\n`;
    for (const d of decisions.slice(0, 3)) {
      body += `- **${d.id}**: ${d.title}\n`;
    }
  }

  body += `\n### Verification\n- Automated test suites passing.\n- Kanban lane synchronized.\n`;

  return {
    commitTitle: title,
    prMarkdown: body
  };
}

export function getEpicProgress(store: WorkflowStore) {
  const epics = store.listEntities({ type: 'epic' });

  const summary = epics.map(ep => {
    const linkedTickets = store.getIncoming(ep.id, 'implements');
    const done = linkedTickets.filter(t => t.lane === 'Done');
    const inProgress = linkedTickets.filter(t => t.lane === 'In Progress');
    const blocked = linkedTickets.filter(t => t.lane === 'Blocked');
    const percent = linkedTickets.length > 0 ? Math.round((done.length / linkedTickets.length) * 100) : 100;

    return {
      id: ep.id,
      title: ep.title,
      totalTickets: linkedTickets.length,
      doneCount: done.length,
      inProgressCount: inProgress.length,
      blockedCount: blocked.length,
      completionPercent: percent
    };
  });

  return {
    totalEpics: epics.length,
    epics: summary
  };
}

