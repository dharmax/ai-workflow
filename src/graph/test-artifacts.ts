import path from 'node:path'
import type {WorkflowStore} from './store.ts'
import {FileNode, SymbolNode, TestNode} from './ontology.ts'

export function normalizeTestPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function isTestFilePath(value: string): boolean {
  const p = normalizeTestPath(value)
  const base = path.posix.basename(p)
  return (
    /(?:^|\/)(?:tests?|__tests__)(?:\/|$)/i.test(p)
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(base)
    || /^test_.+\.py$/i.test(base)
    || /_test\.py$/i.test(base)
  )
}

/**
 * Test-path matching is intentionally broad for runner output/CLI parsing.
 * Graph indexing is stricter so helpers/fixtures under tests/ do not become TestNodes.
 */
export function isTestSource(filePath: string, content: string): boolean {
  const p = normalizeTestPath(filePath)
  const base = path.posix.basename(p)

  if (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(base)
    || /^test_.+\.py$/i.test(base)
    || /_test\.py$/i.test(base)
  ) return true

  if (!/(?:^|\/)(?:tests?|__tests__)(?:\/|$)/i.test(p)) return false

  return (
    /(?:from\s+['"]bun:test['"]|from\s+['"]@playwright\/test['"]|from\s+['"]vitest['"]|\bjest\b)/.test(content)
    || /\b(?:test|it|describe)\s*\(/.test(content)
    || /\bdef\s+test_[A-Za-z0-9_]*\s*\(/.test(content)
    || /\bpytest\b/.test(content)
  )
}

export function testArtifactId(filePath: string): string {
  return `test:${normalizeTestPath(filePath)}`
}

export function inferTestFramework(filePath: string, content: string): string {
  const p = normalizeTestPath(filePath).toLowerCase()
  if (content.includes('@playwright/test') || p.includes('playwright')) return 'playwright'
  if (content.includes('bun:test')) return 'bun'
  if (content.includes('vitest')) return 'vitest'
  if (content.includes('@jest/') || /\bjest\b/.test(content)) return 'jest'
  if (p.endsWith('.py') && /\bpytest\b/.test(content)) return 'pytest'
  return 'unknown'
}


function canonicalTestPath(root: string, value: string): string | undefined {
  const cleaned = value
    .replace(/^[("'\[]+/, '')
    .replace(/[):,"'\]]+$/, '')
    .trim()
  if (!cleaned || !isTestFilePath(cleaned)) return undefined
  return normalizeTestPath(path.isAbsolute(cleaned) ? path.relative(root, cleaned) : cleaned)
}

export function testPathsFromCommand(
  command: string | readonly string[],
  root: string,
): string[] {
  const tokens = typeof command === 'string' ? command.split(/\s+/) : [...command]
  const result = new Set<string>()
  for (const token of tokens) {
    const testPath = canonicalTestPath(root, token)
    if (testPath) result.add(testPath)
  }
  return [...result]
}

export function testPathsFromOutput(output: string, root: string): string[] {
  const result = new Set<string>()
  const candidates = output.match(
    /[A-Za-z0-9_@.+~\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?|(?:tests?|__tests__)\/[A-Za-z0-9_@.+~\/-]+\.[cm]?[jt]sx?/g,
  ) ?? []
  for (const candidate of candidates) {
    const testPath = canonicalTestPath(root, candidate)
    if (testPath) result.add(testPath)
  }
  return [...result]
}

export async function upsertTestArtifact(
  store: WorkflowStore,
  file: FileNode,
  filePath: string,
  content: string,
): Promise<TestNode> {
  const normalized = normalizeTestPath(filePath)
  const existing = await store.getEntity<TestNode>(testArtifactId(normalized), TestNode.dcr)
  const test = await store.upsertEntity<TestNode>(TestNode.dcr, {
    id: testArtifactId(normalized),
    title: path.posix.basename(normalized),
    filePath: normalized,
    targetPath: normalized,
    framework: inferTestFramework(normalized, content),
    ...(existing ? {} : {status: 'implemented'}),
  })

  await store.relate(file, 'contains', test)

  for (const edge of await store.getOutgoing(test.id, 'verifies')) {
    const target = await store.getEntity(edge.targetId)
    if (!(target instanceof FileNode || target instanceof SymbolNode)) continue
    try { await store.unrelate(test.id, 'verifies', edge.targetId) } catch {}
  }

  return test
}

export async function findTestsVerifying(
  store: WorkflowStore,
  targetId: string,
): Promise<TestNode[]> {
  const result: TestNode[] = []
  for (const edge of await store.getIncoming(targetId, 'verifies')) {
    const test = await store.getEntity<TestNode>(edge.sourceId, TestNode.dcr)
    if (test) result.push(test)
  }
  return result
}

export async function recordTestOutcome(
  store: WorkflowStore,
  filePaths: readonly string[],
  outcome: {
    passed: boolean
    failure?: string
    exitCode?: number
    durationMs?: number
  },
): Promise<void> {
  const lastRun = new Date().toISOString()

  for (const filePath of new Set(filePaths.map(normalizeTestPath))) {
    const test = await store.getEntity<TestNode>(testArtifactId(filePath), TestNode.dcr)
    if (!test) continue
    await test.update({
      lastRun,
      passed: outcome.passed,
      failure: outcome.passed ? '' : outcome.failure ?? '',
      exitCode: outcome.exitCode,
      durationMs: outcome.durationMs,
      status: outcome.passed ? 'verified' : 'failing',
    }, true, false)
  }
}

export async function failureGraphEvidence(
  store: WorkflowStore,
  filePaths: readonly string[],
): Promise<{
  tests: Array<{
    id: string
    filePath: string
    framework?: string
    verifies: string[]
  }>
  likelyCauses: string[]
}> {
  const tests: Array<{id: string; filePath: string; framework?: string; verifies: string[]}> = []
  const likelySymbols = new Set<string>()
  const likelyFiles = new Set<string>()

  for (const filePath of new Set(filePaths.map(normalizeTestPath))) {
    const test = await store.getEntity<TestNode>(testArtifactId(filePath), TestNode.dcr)
    if (!test) continue

    const verificationEdges = await store.getOutgoing(test.id, 'verifies')
    const verifies: string[] = []

    for (const edge of verificationEdges) {
      verifies.push(store.localId(edge.targetId))
      const target = await store.getEntity(edge.targetId)
      if (target instanceof SymbolNode) {
        likelySymbols.add(store.localId(target.id))
      } else if (target instanceof FileNode) {
        likelyFiles.add(store.localId(target.id))
      }
    }

    tests.push({
      id: store.localId(test.id),
      filePath,
      framework: (test as any).framework,
      verifies,
    })
  }

  return {tests, likelyCauses: [...likelySymbols, ...likelyFiles]}
}

export async function recordTestExecution(
  store: WorkflowStore,
  root: string,
  command: string | readonly string[],
  outcome: {
    passed: boolean
    output?: string
    exitCode?: number
    durationMs?: number
  },
): Promise<{
  testFiles: string[]
  graphEvidence: Awaited<ReturnType<typeof failureGraphEvidence>>
}> {
  const tokens = typeof command === 'string' ? command.trim().split(/\s+/) : [...command]
  const targeted = testPathsFromCommand(tokens, root)
  const reported = outcome.output ? testPathsFromOutput(outcome.output, root) : []

  let testFiles = reported.length > 0 ? reported : targeted
  if (outcome.passed && testFiles.length === 0) {
    const all = await store.listEntities<TestNode>(TestNode.dcr)
    const isFullBunSuite = tokens.length === 2 && tokens[0] === 'bun' && tokens[1] === 'test'
    const isFullPlaywrightSuite =
      tokens.length === 3 && tokens[0] === 'bunx' && tokens[1] === 'playwright' && tokens[2] === 'test'

    if (isFullBunSuite) {
      testFiles = all
        .map(test => normalizeTestPath(test.filePath || test.targetPath || ''))
        .filter(Boolean)
    } else if (isFullPlaywrightSuite) {
      testFiles = all
        .filter(test => test.framework === 'playwright')
        .map(test => normalizeTestPath(test.filePath || test.targetPath || ''))
        .filter(Boolean)
    }
  }

  await recordTestOutcome(store, testFiles, {
    passed: outcome.passed,
    failure: outcome.passed ? undefined : outcome.output,
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs,
  })

  return {
    testFiles,
    graphEvidence: await failureGraphEvidence(store, testFiles),
  }
}

