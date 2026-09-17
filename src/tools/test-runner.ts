/**
 * Responsibility: Test Target Resolution and Compact Failure Triage Facility.
 * Scope: Pairing source files to tests, executing test suites, and extracting concise failure snippets.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';

import { Ticket } from '../graph/ontology.ts';

export function registerTestTools() {
  registry.register({
    name: 'resolve_test_target',
    description: 'Find the paired unit or integration test file for a given source file.',
    category: 'test',
    parameters: z.object({
      filePath: z.string().describe('Relative path to the source file')
    }),
    execute: async ({ filePath }, ctx: ToolContext) => {
      const root = ctx.projectRoot;
      const norm = filePath.startsWith('/') ? path.relative(root, filePath) : filePath;
      const parsed = path.parse(norm);
      const baseName = parsed.name;

      const candidates = [
        path.join('tests', `${baseName}.test.ts`),
        path.join('tests', `${baseName}.test.js`),
        path.join('test', `${baseName}.test.ts`),
        path.join(parsed.dir, `${baseName}.test.ts`),
        path.join(parsed.dir, '__tests__', `${baseName}.test.ts`),
        path.join(parsed.dir, `${baseName}.spec.ts`)
      ];

      for (const c of candidates) {
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
        testFile: candidates[0],
        found: false,
        testCommand: `bun test`
      };
    }
  });

  registry.register({
    name: 'triage_test_failures',
    description: 'Run the test suite and extract a compact summary of only failing tests without massive log waste.',
    category: 'test',
    parameters: z.object({
      testCommand: z.string().default('bun test').describe('Test runner command to execute')
    }),
    execute: async ({ testCommand }, ctx: ToolContext) => {
      try {
        const parts = testCommand.split(/\s+/);
        const proc = Bun.spawn(parts, {
          cwd: ctx.projectRoot,
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
          rawSnippet: combined.slice(0, 1500)
        };
      } catch (err: any) {
        return {
          passed: false,
          failingCount: 1,
          failures: [{ testName: 'Runner error', error: err.message }]
        };
      }
    }
  });

  registry.register({
    name: 'run_playwright',
    description: 'Run headless Playwright browser tests, parse failures, and optionally record bug tickets.',
    category: 'test',
    parameters: z.object({
      specPath: z.string().optional().describe('Optional specific spec file or folder to run'),
      createBugOnFailure: z.boolean().default(false).describe('Automatically create a P1 Bug ticket on failure')
    }),
    execute: async ({ specPath, createBugOnFailure }, ctx: ToolContext) => {
      const cmd = ['bunx', 'playwright', 'test'];
      if (specPath) cmd.push(specPath);

      try {
        const proc = Bun.spawn(cmd, {
          cwd: ctx.projectRoot,
          stdout: 'pipe',
          stderr: 'pipe'
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode === 0) {
          return {
            passed: true,
            summary: 'Playwright test run succeeded cleanly.'
          };
        }

        const failureOutput = (stdout + '\n' + stderr).slice(0, 3000);
        let createdTicketId: string | null = null;

        if (createBugOnFailure) {
          const ticket = await ctx.store.upsertEntity<Ticket>(Ticket.dcr, {
            id: `BUG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            title: `Playwright regression in ${specPath || 'test suite'}`,
            lane: 'Todo',
            priority: 'P1',
            status: 'planned',
            body: `Automated Playwright regression detected:\n\`\`\`\n${failureOutput.slice(0, 1000)}\n\`\`\``
          });
          createdTicketId = ctx.store.localId(ticket.id);
        }

        return {
          passed: false,
          exitCode,
          failureSnippet: failureOutput,
          createdTicketId
        };
      } catch (err: any) {
        return {
          passed: false,
          error: err.message
        };
      }
    }
  });
}
