/**
 * Responsibility: Test Target Resolution and Compact Failure Triage Facility.
 * Scope: Resolve tests through the semantic graph, execute suites, persist TestNode
 * evidence, and return graph-local failure neighborhoods.
 */

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import {z} from 'zod'
import {commandRegistry, type ToolContext} from './registry.ts'
import {Ticket} from '../model/ontology.ts'
import {ensureAstFresh} from '../graph/indexer.ts'
import {
  findTestsVerifying,
  normalizeTestPath,
  recordTestExecution,
  testPathsFromCommand,
} from '../graph/test-artifacts.ts'

/** Diagnostic callers retain all attempt output; run_command owns execution and recovery. */
async function runDiagnosticCommand(command: string[], purpose: string, options: {timeoutMs: number; retrySafe: boolean; totalBudgetMs?: number}, ctx: ToolContext) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-diagnostic-'))
  const stdoutPath = path.join(scratch, 'stdout'), stderrPath = path.join(scratch, 'stderr')
  const started = Date.now()
  try {
    const result = await commandRegistry.execute('run_command', {
      command: command.map(arg => "'" + arg.replaceAll("'", "'\\''") + "'").join(' '),
      taskDescription: `${purpose}. Command: ${command.join(' ')}. Project: ${ctx.projectRoot}; repeatability explicitly supplied by caller.`.slice(0, 4000),
      ...options,
    }, {...ctx, onCommandAttempt: attempt => {
      fs.appendFileSync(stdoutPath, attempt.stdout)
      fs.appendFileSync(stderrPath, attempt.stderr)
      ctx.onCommandAttempt?.(attempt)
    }}) as {success: boolean; exitCode: number | null; timedOut: boolean; cancelled: boolean; error?: string}
    const read = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    return {...result, durationMs: Date.now() - started,
      combined: read(stdoutPath) + '\n' + read(stderrPath) + (result.error ? '\n' + result.error : '')}
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true})
  }
}

const diagnosticTimeoutParameters = {
  timeoutMs: z.number().int().positive().max(2_147_483_647).default(60000),
  retrySafe: z.boolean().default(false).describe('Declare the test command safe to repeat after termination'),
  totalBudgetMs: z.number().int().positive().max(2_147_483_647).optional(),
}

export function registerTestTools() {
  commandRegistry.register({
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

  commandRegistry.register({
    name: 'triage_test_failures',
    description: 'Run tests, persist pass/fail evidence on TestNodes, and return concise failures plus graph-local likely causes.',
    category: 'test',
    parameters: z.object({
      testCommand: z.string().default('bun test').describe('Test runner command to execute'),
      ...diagnosticTimeoutParameters
    }),
    execute: async ({testCommand, ...timeoutOptions}, ctx: ToolContext) => {
      ctx.store.assertCanWrite()
      const started = Date.now()
      await ensureAstFresh(ctx.store, ctx.projectRoot)
      const targetedPaths = testPathsFromCommand(testCommand, ctx.projectRoot)

      try {
        const execution = await runDiagnosticCommand(testCommand.split(/\s+/), 'Diagnose test failures and persist complete TestNode evidence', timeoutOptions, ctx)
        const {exitCode, durationMs, combined, timedOut, cancelled} = execution
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          testCommand,
          {passed: execution.success, output: combined, exitCode: exitCode ?? undefined, durationMs},
        )

        if (execution.success) {
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
          passed: false, timedOut, cancelled, error: execution.error,
          failingCount: failureLines.length || 1,
          failures: failureLines.slice(0, 5),
          failedTestFiles: graphRun.testFiles.length > 0 ? graphRun.testFiles : targetedPaths,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses,
          rawSnippet: combined.slice(0, 1500)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const durationMs = Date.now() - started
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          testCommand,
          {passed: false, output: message, durationMs},
        )
        return {
          passed: false,
          failingCount: 1,
          failures: [{testName: 'Runner error', error: message}],
          failedTestFiles: graphRun.testFiles.length > 0 ? graphRun.testFiles : targetedPaths,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses
        }
      }
    }
  })

  commandRegistry.register({
    name: 'run_playwright',
    description: 'Run headless Playwright tests, persist TestNode evidence, and optionally record a bug ticket.',
    category: 'test',
    parameters: z.object({
      specPath: z.string().optional().describe('Optional specific spec file or folder to run'),
      createBugOnFailure: z.boolean().default(false).describe('Report a partial priority-1 Bug on failure; expected behavior requires triage'),
      ...diagnosticTimeoutParameters
    }),
    execute: async ({specPath, createBugOnFailure, ...timeoutOptions}, ctx: ToolContext) => {
      ctx.store.assertCanWrite()
      await ensureAstFresh(ctx.store, ctx.projectRoot)
      const cmd = ['bunx', 'playwright', 'test']
      if (specPath) cmd.push(specPath)
      const started = Date.now()

      try {
        const execution = await runDiagnosticCommand(cmd, `Verify Playwright target ${specPath ?? 'test suite'} and persist TestNode evidence`, timeoutOptions, ctx)
        const {exitCode, durationMs, combined, timedOut, cancelled} = execution
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          cmd,
          {passed: execution.success, output: combined, exitCode: exitCode ?? undefined, durationMs},
        )

        if (execution.success) {
          return {
            passed: true,
            testArtifactsUpdated: graphRun.testFiles.length,
            summary: 'Playwright test run succeeded cleanly.'
          }
        }

        const failureOutput = combined.slice(0, 3000)
        let createdTicketId: string | null = null
        if (createBugOnFailure && !timedOut && !cancelled && exitCode !== null) {
          const ticket = await ctx.store.upsertEntity<Ticket>(Ticket.dcr, {
            id: `BUG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            title: `Playwright regression in ${specPath || 'test suite'}`,
            kind:'bug',
            defect:{reproduction:cmd.join(' '),actual:failureOutput,environment:'Playwright runner',evidence:specPath?[specPath]:[]},
            lane: 'Todo',
            priority: 1,
            body: `Automated Playwright regression detected:\n\`\`\`\n${failureOutput.slice(0, 1000)}\n\`\`\``
          })
          createdTicketId = ctx.store.localId(ticket.id)
        }

        return {
          passed: false, timedOut, cancelled, error: execution.error,
          exitCode,
          failedTestFiles: graphRun.testFiles,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses,
          failureSnippet: failureOutput,
          createdTicketId
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const durationMs = Date.now() - started
        const graphRun = await recordTestExecution(
          ctx.store,
          ctx.projectRoot,
          cmd,
          {passed: false, output: message, durationMs},
        )
        return {
          passed: false,
          failedTestFiles: graphRun.testFiles,
          graphEvidence: graphRun.graphEvidence,
          likelyCauses: graphRun.graphEvidence.likelyCauses,
          error: message
        }
      }
    }
  })
}
