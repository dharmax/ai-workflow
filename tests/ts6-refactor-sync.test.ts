import {afterEach, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Ts6RefactorClient} from '../src/change/ts6-refactor.ts'
import {fileURLToPath} from 'node:url'
import {normalizeWorkspaceEdit, applyTextEdits} from '../src/services/code-mutation/edits.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true})
})

test('persistent TS6 client synchronizes modified and removed open documents', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-ts6-sync-'))
  roots.push(root)
  const file = path.join(root, 'sample.ts')
  fs.writeFileSync(file, 'export const count = 1\n')
  const events: Array<{method: string; params: any}> = []
  const client = new Ts6RefactorClient({projectRoot: root})

  // Stub the transport; exercise the real document synchronization without starting a sidecar.
  Object.assign(client, {
    connection: {
      sendNotification: async (method: string, params: unknown) => { events.push({method, params}) }
    }
  })

  await client.ensureDocumentOpen(file)
  expect(events.map(event => event.method)).toEqual(['textDocument/didOpen'])
  expect(events[0].params.textDocument).toMatchObject({version: 1, text: 'export const count = 1\n'})

  fs.writeFileSync(file, 'export const count = 123\n')
  await client.ensureDocumentOpen(file)
  expect(events.map(event => event.method)).toEqual(['textDocument/didOpen', 'textDocument/didChange'])
  expect(events[1].params.textDocument.version).toBe(2)
  expect(events[1].params.contentChanges).toEqual([{
    range: {start: {line: 0, character: 0}, end: {line: 1, character: 0}},
    text: 'export const count = 123\n'
  }])

  await client.ensureDocumentOpen(file)
  expect(events).toHaveLength(2)

  fs.unlinkSync(file)
  await client.ensureDocumentOpen(file)
  expect(events.at(-1)?.method).toBe('textDocument/didClose')

  fs.writeFileSync(file, 'export const replacement = true\n')
  await client.ensureDocumentOpen(file)
  expect(events.at(-1)?.params.textDocument).toMatchObject({version: 1, text: 'export const replacement = true\n'})
})

test('TS6 tsserver positions at one past a newline-terminated line are adapted without weakening LSP validation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-ts6-position-'))
  roots.push(root)
  const file = path.join(root, 'sample.ts')
  const source = 'export function f() {\n  return 1;\n}\n'
  fs.writeFileSync(file, source)
  const client = new Ts6RefactorClient({projectRoot: root})
  const toLsp = {fromUri: fileURLToPath} as Parameters<typeof normalizeWorkspaceEdit>[1]
  const range = {start: {line: 0, character: 0}, end: {line: 0, character: 0}}
  const cases = [
    {textChanges: [{start: {line: 3, offset: 3}, end: {line: 3, offset: 3},
      newText: '\nexport function helper() {}'}],
      expected: 'export function f() {\n  return 1;\n}\nexport function helper() {}\n'},
    {textChanges: [{start: {line: 1, offset: 1}, end: {line: 3, offset: 3},
      newText: 'replaced'}],
      expected: 'replaced\n'}
  ]
  for (const example of cases) {
    Object.assign(client, {
      ensureDocumentOpen: async () => {},
      connection: {sendRequest: async () => ({body: {edits: [{fileName: file, textChanges: example.textChanges}]}})}
    })
    const edit = await client.getEditsForRefactor(file, range, 'extract', 'extract')
    expect(edit).not.toBeNull()
    const plan = normalizeWorkspaceEdit(edit!, toLsp, root)
    const edits = plan.fileEdits.get('sample.ts')!
    expect(edits[0]!.range.end).toEqual({line: 2, character: 1})
    expect(applyTextEdits(source, edits)).toBe(example.expected)
  }
  // Genuine positions more than one column beyond EOL remain invalid.
  Object.assign(client, {
    connection: {sendRequest: async () => ({body: {edits: [{fileName: file, textChanges: [
      {start: {line: 3, offset: 4}, end: {line: 3, offset: 4}, newText: 'unsafe'}
    ]}]}})}
  })
  const invalid = await client.getEditsForRefactor(file, range, 'extract', 'extract')
  expect(() => normalizeWorkspaceEdit(invalid!, toLsp, root)).toThrow(/out-of-bounds/)
  expect(fs.readFileSync(file, 'utf8')).toBe(source)
})
