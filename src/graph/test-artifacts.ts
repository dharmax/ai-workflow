import path from 'node:path'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {canonical} from '../kb/canonical.ts'
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
  const args = tokens.slice(tokens[0] === 'bun' && tokens[1] === 'test' ? 2 : tokens[0] === 'bunx' && tokens[1] === 'playwright' && tokens[2] === 'test' ? 3 : 0)
  for (const token of args) {
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

/** Backfill unchanged indexed tests from projects indexed before TestNode existed. */
export async function ensureTestArtifacts(store: WorkflowStore): Promise<void> {
  const paths = new Set((await store.listEntities<TestNode>(TestNode.dcr)).map(test => normalizeTestPath(test.filePath || test.targetPath || '')))
  const created: TestNode[] = []
  for (const file of await store.listEntities<FileNode>(FileNode.dcr)) {
    const relative = store.localId(file.id)
    if (paths.has(relative) || !isTestFilePath(relative) || relative.startsWith('@')) continue
    const fullPath = path.resolve(store.root, relative)
    if (!fs.existsSync(fullPath) || !fs.lstatSync(fullPath).isFile()) continue
    const content = fs.readFileSync(fullPath, 'utf8')
    if (!isTestSource(relative, content)) continue
    created.push(await upsertTestArtifact(store, file, relative, content))
    paths.add(relative)
  }
  if (created.length) await reconcileTestVerificationEdges(store, created)
}

/** Select authored and derived verifying tests, including symbol-only edges. */
export async function verifyingTestsForTargets(
  store: WorkflowStore,
  targetIds: readonly string[],
  files: readonly string[],
): Promise<{tests: TestNode[]; uncoveredFiles: string[]}> {
  await ensureTestArtifacts(store)
  const tests = new Map<string, TestNode>()
  const add = async (id: string) => {
    const entity = await store.getEntity(id)
    if (entity instanceof TestNode) tests.set(entity.id, entity)
    for (const test of await findTestsVerifying(store, id)) tests.set(test.id, test)
  }
  for (const id of targetIds) await add(id)
  const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr)
  const exactTargets = symbols.filter(symbol => targetIds.some(id => store.localId(id) === store.localId(symbol.id)))
  const uncoveredFiles: string[] = []
  for (const file of new Set(files.map(normalizeTestPath))) {
    const anchored = exactTargets.filter(symbol => symbol.filePath === file)
    const fileIsAuthored = targetIds.some(id => store.localId(id) === file)
    const fileSymbols = anchored.length && !fileIsAuthored ? anchored : symbols.filter(symbol => symbol.filePath === file && symbol.status !== 'deprecated')
    const ids = anchored.length && !fileIsAuthored ? anchored.map(symbol => symbol.id) : [file, ...fileSymbols.map(symbol => symbol.id)]
    let covered = false
    for (const id of ids) {
      const entity = await store.getEntity(id)
      if (!entity) continue
      const verifying = await findTestsVerifying(store, entity.id)
      for (const test of verifying) tests.set(test.id, test)
      covered ||= verifying.some(test => Boolean(test.filePath || test.targetPath))
    }
    if (!covered && ![...tests.values()].some(test => normalizeTestPath(test.filePath || test.targetPath || '') === file)) uncoveredFiles.push(file)
  }
  return {tests: [...tests.values()].filter(test => Boolean(test.filePath || test.targetPath)), uncoveredFiles}
}

/** Hash the test and its local verification/import scope; missing files invalidate proof. */
export async function testEvidenceHashes(store: WorkflowStore, test: TestNode): Promise<Record<string, string>> {
  const files = new Set<string>([normalizeTestPath(test.filePath || test.targetPath || '')].filter(Boolean))
  for (const edge of await store.getOutgoing(test.id, 'verifies')) {
    const target = await store.getEntity(edge.targetId)
    if (target instanceof FileNode) files.add(store.localId(target.id))
    if (target instanceof SymbolNode && target.filePath) files.add(normalizeTestPath(target.filePath))
  }
  for (const file of files) {
    const entity = await store.getEntity<FileNode>(file, FileNode.dcr)
    if (!entity) continue
    for (const edge of await store.getOutgoing(entity.id, 'imports')) {
      const target = await store.getEntity<FileNode>(edge.targetId, FileNode.dcr)
      const relative = target && store.localId(target.id)
      if (relative && !relative.startsWith('@') && !relative.startsWith('node_modules/') && !relative.startsWith('../')) files.add(relative)
    }
  }
  return hashFiles(store.root, [...files])
}

export function hashFiles(root: string, files: readonly string[]): Record<string, string> {
  return Object.fromEntries([...new Set(files)].map(file => {
    const fullPath = path.resolve(root, file)
    const relative = path.relative(root, fullPath)
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Evidence outside workspace: ${file}`)
    return [normalizeTestPath(relative), fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()
      ? createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex') : 'missing']
  }))
}

export async function currentTestEvidence(store: WorkflowStore, ids: readonly string[]) {
  const evidence = []
  for (const id of new Set(ids)) {
    const test = await store.getEntity<TestNode>(id, TestNode.dcr)
    if (!test) continue
    const hashes = {...hashFiles(store.root, Object.keys(test.executionHashes || {})), ...await testEvidenceHashes(store, test)}
    evidence.push({id: store.localId(test.id), filePath: test.filePath || test.targetPath || '',
      passed: test.passed === true && Boolean(test.lastRun) && canonical(hashes) === canonical(test.executionHashes),
      lastRun: test.lastRun, command: test.command, hashes, output: test.output || '',
      verifies: (await store.getOutgoing(test.id, 'verifies')).map(edge => store.localId(edge.targetId))})
  }
  return evidence
}

export async function reconcileTestVerificationEdges(
  store: WorkflowStore,
  selected?: TestNode | TestNode[],
): Promise<void> {
  const tests = selected
    ? Array.isArray(selected) ? [...selected] : [selected]
    : await store.listEntities<TestNode>(TestNode.dcr)
  const symbolsByTitle = new Map<string, SymbolNode[]>()

  for (const test of tests) {
    const authored = new Set<string>()
    for (const edge of await store.getOutgoing(test.id, 'verifies')) {
      if ((edge as {payload?: {state?: string}}).payload?.state !== 'derived') { authored.add(edge.targetId); continue }
      try { await store.unrelate(test.id, 'verifies', edge.targetId) } catch {}
    }

    const testPath = normalizeTestPath(test.filePath || test.targetPath || '')
    if (!testPath) continue
    const file = await store.getEntity<FileNode>(testPath, FileNode.dcr)
    if (!file) continue

    const verifiedFiles = new Set<string>()
    for (const edge of await store.getOutgoing(file.id, 'imports')) {
      const target = await store.getEntity<FileNode>(edge.targetId, FileNode.dcr)
      if (!target) continue
      const targetPath = normalizeTestPath((target as any).path || store.localId(target.id))
      verifiedFiles.add(targetPath)
      try {
        if (!authored.has(target.id)) await store.relate(test, 'verifies', target, {
          state: 'derived',
          note: 'Static test import',
        })
      } catch {}
    }

    if (verifiedFiles.size === 0) continue

    for (const edge of await store.getOutgoing(file.id, 'calls')) {
      const target = await store.getEntity<SymbolNode>(edge.targetId, SymbolNode.dcr)
      if (!target) continue

      let resolved = target
      const targetPath = target.filePath ? normalizeTestPath(target.filePath) : ''
      if (!targetPath || !verifiedFiles.has(targetPath)) {
        const title = target.title || store.localId(target.id)
        let candidates = symbolsByTitle.get(title)
        if (!candidates) {
          candidates = (await store.listEntities<SymbolNode>(SymbolNode.dcr, { title }))
            .filter(symbol => symbol.status !== 'deprecated')
          symbolsByTitle.set(title, candidates)
        }
        const imported = candidates.filter(symbol =>
          Boolean(symbol.filePath)
          && verifiedFiles.has(normalizeTestPath(symbol.filePath!)),
        )
        if (imported.length !== 1) continue
        resolved = imported[0]!
      }

      if (!resolved.filePath || !verifiedFiles.has(normalizeTestPath(resolved.filePath))) continue
      try {
        if (!authored.has(resolved.id)) await store.relate(test, 'verifies', resolved, {
          state: 'derived',
          note: 'Static test call into imported source',
        })
      } catch {}
    }
  }
}

/** Bun headers name canonical paths; assertion markers distinguish execution from scanning/skips. */
function testOutputSections(output: string, root: string, filePaths: readonly string[]): Map<string, string> {
  const labels = new Map(filePaths.flatMap(file => [file, `./${file}`, path.resolve(root, file)].map(label => [label, file] as const)))
  const sections = new Map<string, string[]>()
  let current: string | undefined
  for (const line of output.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    const file = line.endsWith(':') ? labels.get(line.slice(0, -1)) : undefined
    if (file) { current = file; sections.set(file, []) }
    else if (/\.[cm]?[jt]sx?:$/.test(line)) current = undefined
    if (current) sections.get(current)!.push(line)
  }
  return new Map([...sections].map(([file, lines]) => [file, lines.join('\n')]))
}

export async function recordTestOutcome(
  store: WorkflowStore,
  filePaths: readonly string[],
  outcome: {
    passed: boolean
    failure?: string
    exitCode?: number
    durationMs?: number
    command?: string[]
    output?: string
    hashesBefore?: Record<string, Record<string, string>>
  },
): Promise<void> {
  const lastRun = new Date().toISOString()

  const paths = new Set(filePaths.map(normalizeTestPath))
  const tests = await store.listEntities<TestNode>(TestNode.dcr)
  const sections = testOutputSections(outcome.output || '', store.root, tests.map(test => normalizeTestPath(test.filePath || test.targetPath || '')))
  for (const test of tests) {
    const filePath = normalizeTestPath(test.filePath || test.targetPath || '')
    if (!paths.has(filePath)) continue
    const output = outcome.output || ''
    const testOutput = sections.get(filePath) ?? output.slice(-4000)
    await test.update({
      lastRun,
      passed: outcome.passed,
      failure: outcome.passed ? '' : outcome.failure ?? '',
      exitCode: outcome.exitCode,
      durationMs: outcome.durationMs,
      command: outcome.command,
      output: testOutput.slice(-16000),
      executionHashes: outcome.hashesBefore?.[test.id] ?? await testEvidenceHashes(store, test),
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

  const paths = new Set(filePaths.map(normalizeTestPath))
  for (const test of await store.listEntities<TestNode>(TestNode.dcr)) {
    const filePath = normalizeTestPath(test.filePath || test.targetPath || '')
    if (!paths.has(filePath)) continue

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
    hashesBefore?: Record<string, Record<string, string>>
  },
): Promise<{
  testFiles: string[]
  graphEvidence: Awaited<ReturnType<typeof failureGraphEvidence>>
}> {
  const tokens = typeof command === 'string' ? command.trim().split(/\s+/) : [...command]
  const targeted = testPathsFromCommand(tokens, root)
  const reported = outcome.output ? testPathsFromOutput(outcome.output, root) : []

  await ensureTestArtifacts(store)
  const all = await store.listEntities<TestNode>(TestNode.dcr)
  const knownPaths = all.map(test => normalizeTestPath(test.filePath || test.targetPath || '')).filter(Boolean)
  const selected = knownPaths.filter(file => [...targeted, ...tokens.slice(tokens[0] === 'bun' ? 2 : 3).filter(token => !token.startsWith('-')).map(normalizeTestPath)].some(target => file === target || file.startsWith(target.replace(/\/$/, '') + '/')))
  const isFullBunSuite = tokens.length === 2 && tokens[0] === 'bun' && tokens[1] === 'test'
  const isFullPlaywrightSuite = tokens.length === 3 && tokens[0] === 'bunx' && tokens[1] === 'playwright' && tokens[2] === 'test'
  const output = outcome.output || ''
  const bunSections = tokens[0] === 'bun' && tokens[1] === 'test' ? testOutputSections(output, root, knownPaths) : new Map<string, string>()
  const executed = [...bunSections].filter(([, section]) => /^\((?:pass|fail)\)|^\s*error:/m.test(section)).map(([file]) => file)
  const noTests = /^\s*No tests found/im.test(output) || /^\s*0 pass\s*$/m.test(output) && /^\s*0 fail\s*$/m.test(output)
  const testFiles = [...new Set(noTests ? [] : bunSections.size ? executed : reported.length ? reported.filter(file => knownPaths.includes(file)) : selected.length ? selected
    : isFullBunSuite ? all.filter(test => test.framework === 'bun').map(test => test.filePath || test.targetPath!).filter(Boolean)
    : isFullPlaywrightSuite ? all.filter(test => test.framework === 'playwright').map(test => test.filePath || test.targetPath!).filter(Boolean) : [])]

  await recordTestOutcome(store, testFiles, {
    passed: outcome.passed,
    failure: outcome.passed ? undefined : outcome.output,
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs,
    command: tokens,
    output: outcome.output,
    hashesBefore: outcome.hashesBefore,
  })

  return {
    testFiles,
    graphEvidence: await failureGraphEvidence(store, testFiles),
  }
}
