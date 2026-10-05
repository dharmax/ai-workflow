import path from 'node:path'
import type {WorkflowStore} from './store.ts'
import {FileNode, TestNode} from './ontology.ts'

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

export async function upsertTestArtifact(
  store: WorkflowStore,
  file: FileNode,
  filePath: string,
  content: string,
): Promise<TestNode> {
  const normalized = normalizeTestPath(filePath)
  const test = await store.upsertEntity<TestNode>(TestNode.dcr, {
    id: testArtifactId(normalized),
    title: path.posix.basename(normalized),
    filePath: normalized,
    targetPath: normalized,
    framework: inferTestFramework(normalized, content),
    status: 'implemented',
  })

  await store.relate(file, 'contains', test)

  for (const edge of await store.getOutgoing(test.id, 'verifies')) {
    const target = await store.getEntity(edge.targetId)
    if (!(target instanceof FileNode)) continue
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
  const likelyCauses = new Set<string>()

  for (const filePath of new Set(filePaths.map(normalizeTestPath))) {
    const test = await store.getEntity<TestNode>(testArtifactId(filePath), TestNode.dcr)
    if (!test) continue

    const verifies = (await store.getOutgoing(test.id, 'verifies'))
      .map(edge => store.localId(edge.targetId))

    verifies.forEach(id => likelyCauses.add(id))
    tests.push({
      id: store.localId(test.id),
      filePath,
      framework: (test as any).framework,
      verifies,
    })
  }

  return {tests, likelyCauses: [...likelyCauses]}
}
