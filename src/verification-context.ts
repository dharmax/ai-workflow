import fs from 'node:fs'
import path from 'node:path'
import type {WorkflowStore} from './graph/store.ts'
import {SymbolNode, type TestNode} from './graph/ontology.ts'
import type {TicketDossier} from './ticket-operation-types.ts'
import {getExactSymbolSource} from './change/symbol-source.ts'
import {normalizeTestPath} from './graph/test-artifacts.ts'

export const DEFAULT_VERIFICATION_CONTEXT_CHARS = 64_000
const SMALL_FILE_CHARS = 8_000
const TEST_CONTEXT_LINES = 8

export interface VerificationFileContext {
  file: string
  outline: Array<{
    name: string
    containerName?: string
    kind?: string
    exported?: boolean
    line?: number
    signature?: string
  }>
  snippets: Array<{
    label: string
    startLine?: number
    endLine?: number
    source: string
  }>
}

function relativeFile(root: string, file: string): string {
  return normalizeTestPath(path.isAbsolute(file) ? path.relative(root, file) : file)
}

function excerptAroundNeedles(source: string, needles: readonly string[]): {startLine: number; endLine: number; source: string}[] {
  const lines = source.split('\n')
  const ranges: Array<[number, number]> = []

  for (const needle of new Set(needles.filter(Boolean))) {
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index]!.includes(needle)) continue
      ranges.push([Math.max(0, index - TEST_CONTEXT_LINES), Math.min(lines.length, index + TEST_CONTEXT_LINES + 1)])
    }
  }

  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const previous = merged.at(-1)
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1])
    else merged.push([...range])
  }

  return merged.slice(0, 6).map(([start, end]) => ({
    startLine: start + 1,
    endLine: end,
    source: lines.slice(start, end).join('\n'),
  }))
}

export async function buildVerificationContext(
  store: WorkflowStore,
  root: string,
  input: {
    dossier: TicketDossier
    files: readonly string[]
    testNodes: readonly TestNode[] | readonly Array<{id: string; filePath: string; verifies?: string[]}>
  },
  maxChars = DEFAULT_VERIFICATION_CONTEXT_CHARS,
): Promise<{files: VerificationFileContext[]; characters: number}> {
  const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr)
  const symbolsByFile = new Map<string, SymbolNode[]>()
  for (const symbol of symbols) {
    if (!symbol.filePath || symbol.status === 'deprecated') continue
    const file = relativeFile(root, symbol.filePath)
    const list = symbolsByFile.get(file) ?? []
    list.push(symbol)
    symbolsByFile.set(file, list)
  }

  const contexts = new Map<string, VerificationFileContext>()
  const ensureFile = (file: string) => {
    const normalized = relativeFile(root, file)
    let context = contexts.get(normalized)
    if (!context) {
      const outline = (symbolsByFile.get(normalized) ?? [])
        .sort((a, b) => (a.line ?? 1) - (b.line ?? 1))
        .map(symbol => ({
          name: symbol.title ?? store.localId(symbol.id),
          containerName: symbol.containerName,
          kind: symbol.kind,
          exported: symbol.exported,
          line: symbol.line,
          signature: symbol.signature,
        }))
      context = {file: normalized, outline, snippets: []}
      contexts.set(normalized, context)
    }
    return context
  }

  const wantedSourceSymbols = new Map<string, Set<string>>()
  for (const evidence of input.dossier.evidence) {
    if (!evidence.mandatory || !evidence.filePath || !evidence.symbolName) continue
    const file = relativeFile(root, evidence.filePath)
    const names = wantedSourceSymbols.get(file) ?? new Set<string>()
    names.add(evidence.containerName ? `${evidence.containerName}.${evidence.symbolName}` : evidence.symbolName)
    wantedSourceSymbols.set(file, names)
  }

  const testNeedles = new Map<string, Set<string>>()
  for (const test of input.testNodes) {
    if (!test.filePath) continue
    const testFile = relativeFile(root, test.filePath)
    ensureFile(testFile)
    const verifies = 'verifies' in test && Array.isArray(test.verifies)
      ? test.verifies
      : (await store.getOutgoing(test.id, 'verifies')).map(edge => store.localId(edge.targetId))

    const needles = testNeedles.get(testFile) ?? new Set<string>()
    for (const targetId of verifies) {
      const target = await store.getEntity<SymbolNode>(targetId, SymbolNode.dcr)
      if (!target?.filePath) continue
      const sourceFile = relativeFile(root, target.filePath)
      const names = wantedSourceSymbols.get(sourceFile) ?? new Set<string>()
      names.add(target.containerName ? `${target.containerName}.${target.title}` : target.title ?? store.localId(target.id))
      wantedSourceSymbols.set(sourceFile, names)
      if (target.title) needles.add(target.title)
    }
    testNeedles.set(testFile, needles)
  }

  for (const file of new Set([...input.files.map(file => relativeFile(root, file)), ...wantedSourceSymbols.keys()])) ensureFile(file)

  for (const [file, names] of wantedSourceSymbols) {
    const context = ensureFile(file)
    for (const name of names) {
      try {
        const exact = await getExactSymbolSource(root, path.resolve(root, file), name)
        context.snippets.push({
          label: name,
          startLine: exact.range.start.line + 1,
          endLine: exact.range.end.line + 1,
          source: exact.code,
        })
      } catch {}
    }
  }

  for (const [file, needles] of testNeedles) {
    const fullPath = path.resolve(root, file)
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue
    const source = fs.readFileSync(fullPath, 'utf8')
    const context = ensureFile(file)
    for (const excerpt of excerptAroundNeedles(source, [...needles])) {
      context.snippets.push({label: 'test usage/assertion context', ...excerpt})
    }
  }

  for (const context of contexts.values()) {
    if (context.snippets.length) continue
    const fullPath = path.resolve(root, context.file)
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue
    const source = fs.readFileSync(fullPath, 'utf8')
    if (source.length <= SMALL_FILE_CHARS) context.snippets.push({label: 'small-file fallback', startLine: 1, endLine: source.split('\n').length, source})
  }

  const files = [...contexts.values()].sort((a, b) => a.file.localeCompare(b.file))
  const serialized = JSON.stringify(files)
  if (serialized.length > maxChars) {
    throw new Error(`Verification context exceeds ${maxChars} characters after graph narrowing (${serialized.length}). Narrow or author verification edges instead of sending incomplete evidence.`)
  }
  return {files, characters: serialized.length}
}
