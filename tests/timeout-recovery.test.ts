import {afterEach, beforeEach, describe, expect, it, spyOn} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {LayaSystemOne, type SystemOne} from '@dharmax/llm-utils'
import {WorkflowStore} from '../src/graph/store.ts'
import {initializeTools, commandRegistry} from '../src/tools/index.ts'

const assessment = (choice: string) => ({answers: {timeout: {choice}}, backendId: 'fixture', quality: 'high' as const, latencyMs: 0})
const request = () => ({
  task: {purpose: 'Verify Ticket T-1 arithmetic', operation: 'bun test tests/add.test.ts', details: 'isolated fixture', retrySafe: true},
  previousTimeoutMs: 100, defaultTimeoutMs: 100, maxRetries: 2,
  timeoutContext: {retriesUsed: 0, remainingBudgetMs: 1000, observations: [{durationMs: 103, stdout: 'started', stderr: '', terminated: true}]},
})
const service = async (systemOne: SystemOne) => {
  const {TimeoutHandlerService} = await import('../src/services/timeout-handler-service.ts')
  return new TimeoutHandlerService(systemOne)
}

describe('bounded timeout selection', () => {
  it.each([['throw', undefined], ['retry-small', 150], ['retry-medium', 200], ['retry-large', 400]] as const)('maps %s deterministically', async (choice, timeoutMs) => {
    let state: unknown, questions: unknown
    const handler = await service({assess: async (s, q) => {state = s; questions = q; return assessment(choice)}})
    const result = await handler.timeoutHandlingSelector(request())
    expect(result.action).toBe(timeoutMs ? 'retry' : 'throw')
    if (result.action === 'retry') {
      expect(result.timeoutMs).toBe(timeoutMs!)
      expect(result.timeoutContext.retriesUsed).toBe(1)
    }
    expect(JSON.stringify(state)).toContain('T-1')
    expect(JSON.stringify(state)).toContain('started')
    expect(JSON.stringify(questions)).toContain('Silence is not necessarily lack of progress')
    expect(Object.keys(questions as object)).toEqual(['timeout'])
  })
  it.each(['unavailable', 'malformed', 'error'])('uses bounded fallback for %s', async kind => {
    const handler = await service({assess: async () => {
      if (kind === 'error') throw Error('offline')
      return kind === 'unavailable' ? null : assessment('retry-forever')
    }})
    expect(await handler.timeoutHandlingSelector(request())).toMatchObject({action: 'retry', timeoutMs: 150})
  })
  it('bounds all choices to budget and does not mutate input', async () => {
    const r = request(); r.timeoutContext.remainingBudgetMs = 170
    const handler = await service({assess: async (_s, q) => {
      expect(JSON.stringify(q)).not.toContain('400ms')
      return assessment('retry-large')
    }})
    const result = await handler.timeoutHandlingSelector(r)
    expect(result.action).toBe('retry')
    if (result.action === 'retry') {expect(result.timeoutMs).toBeLessThanOrEqual(170); expect(result.timeoutMs).toBeGreaterThan(100)}
    expect(r.timeoutContext.retriesUsed).toBe(0)
  })
  it.each(['unsafe', 'exhausted', 'ceiling', 'unterminated', 'cancelled'])('stops before intelligence when %s', async kind => {
    const r = request()
    if (kind === 'unsafe') r.task.retrySafe = false
    if (kind === 'exhausted') r.timeoutContext.remainingBudgetMs = 0
    if (kind === 'ceiling') r.timeoutContext.retriesUsed = 2
    if (kind === 'unterminated') r.timeoutContext.observations[0]!.terminated = false
    const controller = new AbortController()
    if (kind === 'cancelled') controller.abort()
    let calls = 0
    const handler = await service({assess: async () => {calls++; return assessment('retry-large')}})
    expect(await handler.timeoutHandlingSelector({...r, signal: controller.signal})).toMatchObject({action: 'throw'})
    expect(calls).toBe(0)
  })
  it('cancels promptly while intelligence is pending', async () => {
    const controller = new AbortController()
    const handler = await service({assess: async () => {controller.abort(); return assessment('retry-large')}})
    expect(await handler.timeoutHandlingSelector({...request(), signal: controller.signal})).toMatchObject({action: 'throw'})
  })
  it('charges decision latency against the same budget', async () => {
    const r = request(); r.timeoutContext.remainingBudgetMs = 110
    const handler = await service({assess: async () => {await Bun.sleep(30); return assessment('retry-small')}})
    expect(await handler.timeoutHandlingSelector(r)).toMatchObject({action: 'throw'})
  })
  it('bounds an unavailable System-1 that never responds', async () => {
    const r = request(); r.previousTimeoutMs = 10; r.defaultTimeoutMs = 10; r.timeoutContext.remainingBudgetMs = 40
    const handler = await service({assess: () => new Promise(() => {})})
    const started = performance.now()
    expect(await handler.timeoutHandlingSelector(r)).toMatchObject({action: 'throw'})
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('parses exact repeatable check declarations through the shared command grammar', async () => {
    const {artifactCommand} = await import('../src/artifact-command.ts')
    const result = await artifactCommand(['resolve', 'T', '--repeatable-check', '["bun","test","tests/a.test.ts"]', '--repeatable-check', '["bun","run","typecheck"]'])
    expect(result?.args.repeatableChecks).toEqual([['bun', 'test', 'tests/a.test.ts'], ['bun', 'run', 'typecheck']])
    await expect(artifactCommand(['resolve', 'T', '--repeatable-check', '[]'])).rejects.toThrow()
  })

})

describe('timeout recovery through execution callers', () => {
  let root: string, store: WorkflowStore
  let advice: ReturnType<typeof spyOn>
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-timeout-'))
    store = new WorkflowStore(root, true); initializeTools()
    advice = spyOn(LayaSystemOne.prototype, 'assess').mockResolvedValue(assessment('retry-large'))
  })
  afterEach(() => {advice.mockRestore(); store.close(); fs.rmSync(root, {recursive: true, force: true})})
  const run = (command: string, extra: Record<string, unknown> = {}, signal?: AbortSignal) =>
    commandRegistry.execute('run_command', {command, timeoutMs: 80, ...extra}, {projectRoot: root, store, signal, executionAuthority: 'project-write'})
  it('finishes a healthy repeatable command and retains both attempts', async () => {
    const result = await run("printf started; sleep 0.16; printf finished", {retrySafe: true, taskDescription: 'Compute a disposable diagnostic for Ticket T-1', totalBudgetMs: 1500})
    expect(result).toMatchObject({success: true, timedOut: false, cancelled: false})
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0]).toMatchObject({timedOut: true, terminated: true, stdout: 'started'})
    expect(result.stdout).toContain('finished')
    expect(advice.mock.calls.length).toBe(1)
    expect(JSON.stringify(advice.mock.calls[0])).toContain('disposable diagnostic')
  })
  it('does not repeat arbitrary commands or assertion failures', async () => {
    await run('echo attempt >> count; sleep 1')
    expect(fs.readFileSync(path.join(root, 'count'), 'utf8')).toBe('attempt\n')
    expect(await run('exit 7', {retrySafe: true})).toMatchObject({exitCode: 7, timedOut: false})
    expect(advice.mock.calls.length).toBe(0)
  })
  it('cancellation prevents another attempt', async () => {
    const controller = new AbortController()
    advice.mockImplementation(async () => {controller.abort(); return assessment('retry-large')})
    expect(await run('sleep 1', {retrySafe: true}, controller.signal)).toMatchObject({success: false, cancelled: true})
  })
  it('diagnostic tests have a bounded executor and preserve complete output', async () => {
    fs.mkdirSync(path.join(root, 'tests'))
    fs.writeFileSync(path.join(root, 'tests/slow.test.ts'), "import {test} from 'bun:test'; test('healthy', async()=>{console.log('x'.repeat(18000)); console.error('attempt-evidence'); await Bun.sleep(140)})")
    const artifacts = await import('../src/graph/test-artifacts.ts')
    const originalRecord = artifacts.recordTestExecution
    let ownerInput = ''
    const record = spyOn(artifacts, 'recordTestExecution').mockImplementation((...args) => {
      ownerInput = args[3].output ?? ''
      return originalRecord(...args)
    })
    const result = await commandRegistry.execute('triage_test_failures', {testCommand: 'bun test tests/slow.test.ts', timeoutMs: 80, retrySafe: true, totalBudgetMs: 2000}, {projectRoot: root, store, executionAuthority: 'project-write'}).finally(() => record.mockRestore())
    expect(ownerInput.length).toBeGreaterThan(36000)
    expect(ownerInput.match(/attempt-evidence/g)).toHaveLength(2)
    expect(result.passed).toBe(true)
    const {TestNode} = await import('../src/model/ontology.ts')
    const nodes = await store.listEntities<import('../src/model/ontology.ts').TestNode>(TestNode.dcr)
    expect(JSON.stringify(nodes)).toContain('healthy')
    expect(nodes[0]?.output?.match(/attempt-evidence/g)).toHaveLength(2)
    expect(nodes[0]?.output?.length).toBeLessThanOrEqual(16000)
    expect(JSON.stringify(advice.mock.calls)).toContain('Diagnose test failures')
  })
  it('Ticket engineering checks share recovery and retain all attempt evidence', async () => {
    const {Ticket} = await import('../src/model/ontology.ts')
    const {executeTicketChecks} = await import('../src/ticket/verification.ts')
    fs.mkdirSync(path.join(root, 'tests'))
    fs.writeFileSync(path.join(root, 'tests/slow.test.ts'), "import {test,expect} from 'bun:test'; test('healthy', async()=>{console.log('evidence-before-timeout'); await Bun.sleep(140); expect(2+2).toBe(4)})")
    const ticket = await store.upsertEntity<import('../src/model/ontology.ts').Ticket>(Ticket.dcr, {id: 'T-1', title: 'Verify arithmetic', body: 'Technical fixture', lane: 'Todo', acceptanceCriteria: ['Actual assertion passes']})
    const investigated = await ticket.investigate(store, {mandatoryEvidenceOnly: true})
    if (investigated.status !== 'complete') throw Error(investigated.status)
    const original = commandRegistry.execute.bind(commandRegistry)
    const execute = spyOn(commandRegistry, 'execute').mockImplementation((name, params, ctx) =>
      original(name, name === 'run_command' ? {...params, timeoutMs: 80, totalBudgetMs: 2000} : params, ctx))
    try {
      const result = await executeTicketChecks(store, investigated.value, [], [['bun', 'test', 'tests/slow.test.ts']], undefined, 'T-1', [['bun', 'test', 'tests/slow.test.ts']])
      expect(result.status).toBe('complete')
      if (result.status === 'complete') {
        expect(result.value.tests[0]?.passed).toBe(true)
        expect(result.value.tests[0]?.output.match(/evidence-before-timeout/g)?.length).toBe(2)
      }
      expect(JSON.stringify(advice.mock.calls)).toContain('Verify Ticket T-1')
      expect(JSON.stringify(advice.mock.calls)).toContain('evidence-before-timeout')
    } finally {execute.mockRestore()}
  })
  it('retains full output for the host while bounding public observations', async () => {
    let full = ''
    const result = await commandRegistry.execute('run_command', {command: "bun -e 'console.log(\"x\".repeat(18000))'"}, {
      store, projectRoot: root, executionAuthority: 'project-write', onCommandAttempt: attempt => {full += attempt.stdout},
    })
    expect(full.length).toBeGreaterThan(18000)
    expect(result.stdout.length).toBe(10000)
    expect(result.stdoutTruncated).toBe(true)
  })

  it('enforces the retry ceiling on real terminated processes', async () => {
    const result = await run('sleep 1', {retrySafe: true, maxRetries: 1, totalBudgetMs: 2000})
    expect(result).toMatchObject({success: false, timedOut: true, cancelled: false})
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts.every((attempt: {terminated: boolean}) => attempt.terminated)).toBe(true)
    expect(advice.mock.calls).toHaveLength(1)
  })
  it('stops a diagnostic timeout without reporting an assertion failure', async () => {
    fs.mkdirSync(path.join(root, 'tests'))
    fs.writeFileSync(path.join(root, 'tests/slow.test.ts'), "import {test} from 'bun:test'; test('slow', async()=>{await Bun.sleep(2000)})")
    const result = await commandRegistry.execute('triage_test_failures', {
      testCommand: 'bun test tests/slow.test.ts', timeoutMs: 80,
    }, {projectRoot: root, store, executionAuthority: 'project-write'})
    expect(result).toMatchObject({passed: false, timedOut: true, cancelled: false, failures: []})
    expect(advice.mock.calls).toHaveLength(0)
  })
  it('terminates descendants before returning from a timeout', async () => {
    const result = await run('(sleep 0.2; touch late) & wait', {timeoutMs: 30})
    expect(result).toMatchObject({timedOut: true})
    await Bun.sleep(250)
    expect(fs.existsSync(path.join(root, 'late'))).toBe(false)
  })

  it('keeps Playwright cancellation distinct even when the child exits zero', async () => {
    const original = commandRegistry.execute.bind(commandRegistry)
    const execute = spyOn(commandRegistry, 'execute').mockImplementation((name, params, ctx) =>
      name === 'run_command'
        ? Promise.resolve({success: false, exitCode: 0, timedOut: false, cancelled: true, error: 'Cancelled after exit'})
        : original(name, params, ctx))
    try {
      expect(await commandRegistry.execute('run_playwright', {createBugOnFailure: true}, {
        projectRoot: root, store, executionAuthority: 'project-write',
      })).toMatchObject({passed: false, cancelled: true, createdTicketId: null})
    } finally {execute.mockRestore()}
  })

  it.each(['undeclared', 'different-command'])('does not infer repeatability from the engineering sandbox: %s', async mode => {
    const {Ticket} = await import('../src/model/ontology.ts')
    const {executeTicketChecks} = await import('../src/ticket/verification.ts')
    let requests = 0
    const server = Bun.serve({port: 0, hostname: '127.0.0.1', fetch: () => {requests++; return new Response('observed')}})
    fs.mkdirSync(path.join(root, 'tests'))
    fs.writeFileSync(path.join(root, 'tests/external.test.ts'), `import {test} from 'bun:test';test('external effect',async()=>{await fetch('http://127.0.0.1:${server.port}');await Bun.sleep(140)})`)
    const ticket = await store.upsertEntity<import('../src/model/ontology.ts').Ticket>(Ticket.dcr, {id: 'T-EXTERNAL', title: 'Check external effects', body: 'Known fixture server receives calls', lane: 'Todo', acceptanceCriteria: ['Do not repeat undeclared effects']})
    const investigated = await ticket.investigate(store, {mandatoryEvidenceOnly: true})
    if (investigated.status !== 'complete') throw Error(investigated.status)
    const original = commandRegistry.execute.bind(commandRegistry)
    const execute = spyOn(commandRegistry, 'execute').mockImplementation((name, params, ctx) =>
      original(name, name === 'run_command' ? {...params, timeoutMs: 80, totalBudgetMs: 2000} : params, ctx))
    try {
      const declarations = mode === 'undeclared' ? undefined : [['bun', 'test', 'tests/different.test.ts']]
      const result = await executeTicketChecks(store, investigated.value, [], [['bun', 'test', 'tests/external.test.ts']], undefined, 'T-EXTERNAL', declarations)
      expect(result.status).toBe('complete')
      if (result.status === 'complete') expect(result.value.tests[0]?.passed).toBe(false)
      expect(requests).toBe(1)
      expect(advice.mock.calls).toHaveLength(0)
    } finally {execute.mockRestore(); server.stop(true)}
  })

})
