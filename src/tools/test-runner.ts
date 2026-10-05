/**
 * Responsibility: Test Target Resolution and Compact Failure Triage Facility.
 * Scope: Resolve tests through the semantic graph, execute suites, persist TestNode
 * evidence, and return graph-local failure neighborhoods.
 */

import path from 'node:path'
import fs from 'node:fs'
import {z} from 'zod'
import {registry, type ToolContext} from './registry.ts'
import {Ticket, TestNode} from '../graph/ontology.ts'
import {ensureAstFresh} from '../graph/indexer.ts'
import {
  findTestsVerifying,
  normalizeTestPath,
  recordTestExecution,
  testPathsFromCommand,
} from '../graph/test-artifacts.ts'

export function registerTestTools() {
  registry.register({
    name: 'resolve_test_target',
    description: 'Resolve tests verifying a source file from the graph first, with filename pairing only as a fallback.',
    category: 'test',
    parameters: z.object({
      filePath: z.string().describe('Relative path to the source file')
    }),
    execute: async ({filePath}, ctx: ToolContext) => {
      const root = ctx.projectRoot
      const norm = normalizeTestPath(filePath.startsWith('/') ? path.relative(root, filePath) : filePath)
      await ensureAstFresh(ctx.store, root)

      const source = await ctx.store.getEntity(norm)
      if (source) {
        const graphTests = await findTestsVerifying(ctx.store, source.id)
        const testFiles = graphTests
          .map(test => normalizeTestPath(test.filePath || test.targetPath || ''))
          .filter(Boolean)
        if (testFiles.length > 0) {
          return {
            sourceFile: norm,
            testFile: testFiles[0],
            testFiles,
            found: true,
            source: 'graph',
            testCommand: `bun test ${testFiles[0]}`
          }
        }
      }

      const parsed = path.parse(norm)
      const baseName = parsed.name
      const candidates = [
        path.join('tests', `${baseName}.test.ts`),
        path.join('tests', `${baseName}.test.js`),
        path.join('test', `${baseName}.test.ts`),
        path.join(parsed.dir, `${baseName}.test.ts`),
        path.join(parsed.dir, '__tests__', `${baseName}.test.ts`),
        path.join(parsed.dir, `${baseName}.spec.ts`)
      ].map(normalizeTestPath)

      for (const candidate of candidates) {
        if (fs.existsSync(path.join(root, candidate))) {
          return {
            sourceFile: norm,
            testFile: candidate,
            testFiles: [candidate],
            found: true,
            source: 'filename-fallback',
            testCommand: `bun test ${candidate}`
          }
        }
      }

      return {
        sourceFile: norm,
        testFile: candidates[0],
        testFiles: [],
        found: false,
        source: 'none',
        testCommand: 'bun test'
      }
    }
  })

  registry.register({
    name: 'triage_test_failures',
    description: 'Run tests, persist pass/fail evidence on TestNodes, and return concise failures plus graph-local likely causes.',
    category: 'test',
    parameters: z.object({
      testCommand: z.string().default('bun test').describe('Test runner command to execute')
    }),
    execute: async ({testCommand}, ctx: ToolContext) => {
      const started = Date.now()
      await ensureAstFresh(ctx.store, ctx.projectRoot)
      const targetedPaths = testPathsFromCommand(testCommand, ctx.projectRoot)

      try {
        const proc = Bun.spawn(testCommand.split(/\s+/), {
          cwd: ctx.projectRoot,
          stdout: 'pipe',
          stderr: 'pipe'
        })

        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()
        const exitCode = await proc.exited
        const durationMs = Date.now() - started
        const combined = stdout + '\n' + stderr
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          testCommand,
          {passed: exitCode === 0, output: combined, exitCode, durationMs},
        )

        if (exitCode === 0) {
          return {
            passed: true,
            failingCount: 0,
            failures: [],
            testArtifactsUpdated: graphRun.testFiles.length,
            summary: 'All tests passed cleanly'
          }
        }

        const failureLines: Array<{testName: string; error: string}> = []
        const lines = combined.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!
          if (line.includes('✗') || line.includes('FAIL') || line.includes('error: expect')) {
            const testName = line.replace(/^[✗\s]+/, '').trim()
            const error = lines.slice(i, i + 4).join('\n').trim()
            failureLines.push({testName, error})
            i += 3
          }
        }

        return {
          passed: false,
          failingCount: failureLines.length || 1,
          failures: failureLines.slice(0, 5),
          failedTestFiles: graphRun.testFiles.length > 0 ? graphRun.testFiles : targetedPaths,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses,
          rawSnippet: combined.slice(0, 1500)
        }
      } catch (err: any) {
        const durationMs = Date.now() - started
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          testCommand,
          {passed: false, output: err.message, durationMs},
        )
        return {
          passed: false,
          failingCount: 1,
          failures: [{testName: 'Runner error', error: err.message}],
          failedTestFiles: graphRun.testFiles.length > 0 ? graphRun.testFiles : targetedPaths,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses
        }
      }
    }
  })

  registry.register({
    name: 'run_playwright',
    description: 'Run headless Playwright tests, persist TestNode evidence, and optionally record a bug ticket.',
    category: 'test',
    parameters: z.object({
      specPath: z.string().optional().describe('Optional specific spec file or folder to run'),
      createBugOnFailure: z.boolean().default(false).describe('Automatically create a P1 Bug ticket on failure')
    }),
    execute: async ({specPath, createBugOnFailure}, ctx: ToolContext) => {
      await ensureAstFresh(ctx.store, ctx.projectRoot)
      const cmd = ['bunx', 'playwright', 'test']
      if (specPath) cmd.push(specPath)
      const started = Date.now()

      try {
        const proc = Bun.spawn(cmd, {
          cwd: ctx.projectRoot,
          stdout: 'pipe',
          stderr: 'pipe'
        })

        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()
        const exitCode = await proc.exited
        const durationMs = Date.now() - started
        const combined = stdout + '\n' + stderr
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          cmd,
          {passed: exitCode === 0, output: combined, exitCode, durationMs},
        )

        if (exitCode === 0) {
          return {
            passed: true,
            testArtifactsUpdated: graphRun.testFiles.length,
            summary: 'Playwright test run succeeded cleanly.'
          }
        }

        const failureOutput = combined.slice(0, 3000)
        let createdTicketId: string | null = null
        if (createBugOnFailure) {
          const ticket = await ctx.store.upsertEntity<Ticket>(Ticket.dcr, {
            id: `BUG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            title: `Playwright regression in ${specPath || 'test suite'}`,
            lane: 'Todo',
            priority: 'P1',
            status: 'planned',
            body: `Automated Playwright regression detected:\n\`\`\`\n${failureOutput.slice(0, 1000)}\n\`\`\``
          })
          createdTicketId = ctx.store.localId(ticket.id)
        }

        return {
          passed: false,
          exitCode,
          failedTestFiles: graphRun.testFiles,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses,
          failureSnippet: failureOutput,
          createdTicketId
        }
      } catch (err: any) {
        const durationMs = Date.now() - started
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          cmd,
          {passed: false, output: err.message, durationMs},
        )
        return {
          passed: false,
          failedTestFiles: graphRun.testFiles,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses,
          error: err.message
        }
      }
    }
  })
}
