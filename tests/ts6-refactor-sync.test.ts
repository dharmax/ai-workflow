import {afterEach, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Ts6RefactorClient} from '../src/change/ts6-refactor.ts'

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
