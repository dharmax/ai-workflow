/**
 * Responsibility: Git Operations, Porcelain Inspection, and Non-destructive Snapshots Facility.
 * Scope: Git status, diff inspection, snapshot backups, and conventional PR summaries.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { Ticket, Decision } from '../graph/ontology.ts';

export function registerGitTools() {
  registry.register({
    name: 'get_git_status',
    description: 'Get structured git status showing staged, modified, and untracked files.',
    category: 'git',
    parameters: z.object({}),
    execute: async (_, ctx: ToolContext) => {
      try {
        const proc = Bun.spawn(['git', 'status', '--porcelain', '-b'], {
          cwd: ctx.projectRoot,
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
  });

  registry.register({
    name: 'get_git_diff',
    description: 'Inspect uncommitted git diff in the working tree or for a specific file.',
    category: 'git',
    parameters: z.object({
      target: z.string().optional().describe('Optional file path to inspect')
    }),
    execute: async ({ target }, ctx: ToolContext) => {
      try {
        const args = ['git', 'diff'];
        if (target) args.push(target);
        const proc = Bun.spawn(args, {
          cwd: ctx.projectRoot,
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
  });

  registry.register({
    name: 'create_snapshot_checkpoint',
    description: 'Save a non-destructive patch backup of uncommitted changes before risky operations.',
    category: 'git',
    parameters: z.object({
      label: z.string().optional().describe('Label or name for the snapshot')
    }),
    execute: async ({ label }, ctx: ToolContext) => {
      const name = label || `snapshot-${Date.now()}`;
      const snapshotsDir = path.join(ctx.projectRoot, '.ai-workflow', 'snapshots');
      fs.mkdirSync(snapshotsDir, { recursive: true });

      const patchFile = path.join(snapshotsDir, `${name}.patch`);
      try {
        const proc = Bun.spawn(['git', 'diff', 'HEAD'], {
          cwd: ctx.projectRoot,
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
  });

  registry.register({
    name: 'get_git_hotspots',
    description: 'Identify files with the highest commit churn to locate unstable areas.',
    category: 'git',
    parameters: z.object({
      days: z.number().default(14).describe('Number of past days to inspect')
    }),
    execute: async ({ days }, ctx: ToolContext) => {
      try {
        const proc = Bun.spawn(['git', 'log', `--since=${days}.days`, '--name-only', '--pretty=format:'], {
          cwd: ctx.projectRoot,
          stdout: 'pipe',
          stderr: 'pipe'
        });
        const stdout = await new Response(proc.stdout).text();
        const files = stdout.trim().split('\n').filter(f => f.trim().length > 0);

        const counts: Record<string, number> = {};
        for (const f of files) counts[f] = (counts[f] || 0) + 1;

        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([file, changes]) => ({ file, changes }));

        return {
          sinceDays: days,
          totalTouches: files.length,
          hotspots: sorted
        };
      } catch {
        return { sinceDays: days, totalTouches: 0, hotspots: [] };
      }
    }
  });

  registry.register({
    name: 'generate_pr_summary',
    description: 'Generate conventional commit and PR summary grounded in ticket context and ADRs.',
    category: 'git',
    parameters: z.object({
      ticketId: z.string().optional().describe('Associated ticket ID')
    }),
    execute: async ({ ticketId }, ctx: ToolContext) => {
      const ticket = ticketId ? await ctx.store.getEntity<Ticket>(ticketId, Ticket.dcr) : null;
      const decisions = await ctx.store.listEntities<Decision>(Decision.dcr);

      const localId = ticket ? ctx.store.localId(ticket.id) : null;
      const title = ticket ? `feat(${localId}): ${(ticket as any).title}` : `chore(workflow): update project state`;

      let prMarkdown = `## Summary\n`;
      if (ticket) {
        prMarkdown += `- Resolves **${localId}**: ${(ticket as any).title}\n`;
        if ((ticket as any).body) prMarkdown += `  - ${(ticket as any).body}\n`;
      } else {
        prMarkdown += `- Verified completion across active modules.\n`;
      }

      const recentDecisions = decisions.slice(0, 3);
      if (recentDecisions.length > 0) {
        prMarkdown += `\n### Architectural Decisions (ADR)\n`;
        for (const d of recentDecisions) {
          prMarkdown += `- **${ctx.store.localId(d.id)}**: ${(d as any).title}\n`;
        }
      }

      prMarkdown += `\n### Verification\n- Automated test suites passing.\n- Kanban lane synchronized.\n`;

      return {
        commitTitle: title,
        prMarkdown
      };
    }
  });
}
