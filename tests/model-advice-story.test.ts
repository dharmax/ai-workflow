import {afterEach, expect, it, spyOn} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {modelAdvicePath, readModelAdvice} from '@dharmax/llm-utils'
import {refreshDefaultModelAdvice} from '../src/model-runtime.ts'
import {saveConfig, loadConfig} from '../src/config.ts'
import {WorkflowStore} from '../src/graph/store.ts'
import {WorkflowActor} from '../src/actor/engine.ts'
import {initializeTools} from '../src/tools/index.ts'
import {processShellInput} from '../src/shell.ts'
import {runDiagnostics} from '../src/doctor.ts'

let store: WorkflowStore | undefined
let root: string
let fetchSpy: ReturnType<typeof spyOn> | undefined
const previous = {...process.env}
afterEach(() => {
  fetchSpy?.mockRestore()
  store?.close()
  for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
  Object.assign(process.env, previous)
  if (root) fs.rmSync(root, {recursive: true, force: true})
})

it('Actor refreshes and uses native model advice while preserving developer choices and failed-refresh routes', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-advice-story-'))
  process.env.HOME = root
  process.env.XDG_CONFIG_HOME = path.join(root, 'config')
  delete process.env.AIWF_MODEL
  process.env.OPENROUTER_API_KEY = 'fixture-key'
  delete process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.GEMINI_API_KEY
  saveConfig(root, {gateway: 'openrouter', ollamaUrl: 'http://local-evidence:11434',
    escalation: {policy: 'sota', blastRadiusThreshold: 3, testRetryThreshold: 2},
    modelRoutes: {radar: 'ollama/research-specialist:14b', reasoning: 'openrouter/vendor/developer-choice'}})
  store = new WorkflowStore(root, true)
  await store.sp.ready()
  const adviceFile = modelAdvicePath()
  fs.mkdirSync(path.dirname(adviceFile), {recursive: true})
  const old = {updatedAt: '2026-01-01T00:00:00.000Z', advisor: 'previous-authority',
    environment: {hardware: {platform: 'linux', architecture: 'x64', ramBytes: 1, cpu: 'fixture', logicalCpus: 1, gpus: []}, providers: []},
    workloads: {}, recommendedPulls: [], notes: ['previous valid advice']}
  fs.writeFileSync(adviceFile, JSON.stringify(old))
  const calls: string[] = []
  const inferenceModels: string[] = []
  let failResearch = false
  let unobservedModel = false
  const workloads = ['fast', 'code', 'reasoning', 'creative', 'summarization', 'verification']
  const research = {workloads: Object.fromEntries(workloads.map(task => [task, {
    primary: {target: {providerId: 'openrouter', modelId: 'vendor/current-coder'}, availability: 'accessible',
      contextWindow: 128000, capabilities: ['tools', 'structured_outputs'],
      economics: {inputPer1M: 0.2, outputPer1M: 0.8, expectedRetryRisk: 'low', reasoningOverhead: 'low'},
      reason: 'Current catalogue economics; reliability and latency require workload measurement.',
      evidence: ['https://openrouter.ai/api/v1/models']},
    fallbacks: [{target: {providerId: 'ollama', modelId: 'qwen2.5-coder:7b'}, availability: 'installed',
      reason: 'Installed local fallback; no pull or paid call.'}]
  }])), recommendedPulls: [], notes: ['No invented benchmarks; latency and reliability estimates are uncertain.']}
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/api/tags')) return Response.json({models: [{name: 'qwen2.5-coder:7b'}, {name: 'research-specialist:14b'}]})
    if (url.endsWith('/api/show')) return Response.json({details: {parameter_size: '7B', quantization_level: 'Q4_K_M'},
      model_info: {'general.architecture': 'qwen2', 'qwen2.context_length': 32768}})
    if (url === 'https://openrouter.ai/api/v1/models') return Response.json({data: [
      {id: 'vendor/current-coder', context_length: 128000, pricing: {prompt: '0.0000002', completion: '0.0000008'},
        supported_parameters: ['tools', 'structured_outputs']},
      {id: 'vendor/developer-choice', context_length: 64000, pricing: {prompt: '0.000001', completion: '0.000003'}, supported_parameters: ['tools']}
    ]})
    if (url.endsWith('/api/chat')) {
      const body = JSON.parse(String(init?.body))
      inferenceModels.push(body.model)
      const prompt = JSON.stringify(body.messages)
      if (prompt.includes('Research the current model landscape')) {
        expect(prompt).toContain('vendor/current-coder')
        expect(prompt).toContain('0.8')
        expect(prompt).toContain('supported')
        expect(prompt).toContain('Independent TypeScript/Bun architecture critic')
        expect(prompt).toContain('research-specialist:14b')
        expect(prompt).toContain('provider catalogue')
        const candidate = structuredClone(research)
        if (unobservedModel) candidate.workloads.verification!.primary.target.modelId = 'vendor/not-observed'
        return Response.json({message: {role: 'assistant', content: failResearch ? 'invalid advice' : JSON.stringify(candidate)}, done: true})
      }
      return Response.json({message: {role: 'assistant', content: 'local completed'}, done: true})
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(String(init?.body))
      inferenceModels.push(body.model)
      return Response.json({choices: [{message: {role: 'assistant', content: JSON.stringify({thought: 'Bounded task completed', action: 'final_answer', finalAnswer: 'engineering completed'})}, finish_reason: 'stop'}]})
    }
    throw new Error('Unexpected external request: ' + url)
  }) as typeof fetch)
  const configFile = path.join(root, '.ai-workflow/config.json')
  const configBefore = fs.readFileSync(configFile, 'utf8')
  const actor = new WorkflowActor({store, projectRoot: root, toolDiscovery: null})
  const previousRoute = actor.resolveRoute('dev')
  expect(calls).toEqual([])
  const registry = initializeTools()
  await registry.execute('refresh_model_advice', {criticFocus: 'TypeScript/Bun architecture'}, {store, projectRoot: root, executionAuthority: 'project-write'})
  const snapshot = readModelAdvice()!
  expect(snapshot.updatedAt).not.toBe(old.updatedAt)
  expect(snapshot.advisor).toContain('ollama/research-specialist:14b')
  expect(inferenceModels).toContain('research-specialist:14b')
  expect(snapshot.environment.providers.find(p => p.id === 'openrouter')?.models).toContainEqual(expect.objectContaining({
    id: 'vendor/current-coder', contextWindow: 128000, inputPer1M: 0.2, outputPer1M: 0.8,
    supportedParameters: ['tools', 'structured_outputs']}))
  expect(snapshot.workloads.code?.primary.evidence).toContain('https://openrouter.ai/api/v1/models')
  expect(actor.resolveRoute('dev')).toEqual(previousRoute) // Refresh cannot switch an existing runtime.
  const fresh = new WorkflowActor({store, projectRoot: root, toolDiscovery: null})
  expect(fresh.resolveRoute('dev')?.target).toBe('openrouter/vendor/current-coder')
  expect(fresh.resolveRoute('design')?.target).toBe('openrouter/vendor/developer-choice')
  const result = await fresh.execute('Complete this bounded engineering task and report completion.')
  expect(result).toMatchObject({answer: 'engineering completed'})
  expect(inferenceModels).toContain('vendor/current-coder')
  const listed = await processShellInput('model list', {store, projectRoot: root, actor: fresh})
  expect(listed.output).toContain('vendor/current-coder')
  expect(listed.output).toContain('Override: openrouter/vendor/developer-choice')
  expect(listed.output).toContain(snapshot.advisor)
  const cli = Bun.spawn(['bun', path.resolve(import.meta.dir, '../src/cli.ts'), 'model', 'list'], {
    cwd: root, env: {...process.env}, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([new Response(cli.stdout).text(), new Response(cli.stderr).text(), cli.exited])
  expect({code, stderr}).toEqual({code: 0, stderr: ''})
  expect(stdout).toContain('Effective: openrouter/vendor/current-coder')
  expect(stdout).toContain('Override: openrouter/vendor/developer-choice')
  const retained = fs.readFileSync(adviceFile, 'utf8')
  failResearch = true
  const failed = await processShellInput('model radar refresh --critic TypeScript/Bun architecture', {store, projectRoot: root, actor: fresh})
  expect(failed.output).toContain('JSON')
  expect(fs.readFileSync(adviceFile, 'utf8')).toBe(retained)
  failResearch = false
  unobservedModel = true
  const ineligible = await processShellInput('model radar refresh --critic TypeScript/Bun architecture', {store, projectRoot: root, actor: fresh})
  expect(ineligible.output).toContain('unavailable or unobserved model: openrouter/vendor/not-observed')
  expect(fs.readFileSync(adviceFile, 'utf8')).toBe(retained)
  expect(new WorkflowActor({store, projectRoot: root, toolDiscovery: null}).resolveRoute('dev')?.target).toBe('openrouter/vendor/current-coder')
  expect(fs.readFileSync(configFile, 'utf8')).toBe(configBefore)
  expect(calls.some(url => url.includes('/pull'))).toBe(false)
  expect(calls.filter(url => url.endsWith('/chat/completions'))).toHaveLength(1)
  expect(fs.readdirSync(path.dirname(adviceFile))).toEqual(['model-advice.json'])
  expect(fs.existsSync(path.join(root, '.cache/aiwf/model-radar.json'))).toBe(false)
}, 30000)

it('public inspection and explicit model choices preserve routing without refresh or configuration side effects', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-advice-choices-'))
  process.env.HOME = root
  process.env.XDG_CONFIG_HOME = path.join(root, 'config')
  delete process.env.AIWF_MODEL
  process.env.OPENROUTER_API_KEY = 'fixture-key'
  const workloads = ['fast', 'code', 'reasoning', 'creative', 'summarization', 'verification']
  const adviceFile = modelAdvicePath()
  fs.mkdirSync(path.dirname(adviceFile), {recursive: true})
  const advice = {updatedAt: '2026-01-01T00:00:00.000Z', advisor: 'existing-reviewed-authority',
    environment: {hardware: {platform: 'linux', architecture: 'x64', ramBytes: 1, cpu: 'fixture', logicalCpus: 1, gpus: []}, providers: []},
    workloads: Object.fromEntries(workloads.map(task => [task, {
      primary: {target: {providerId: 'openrouter', modelId: 'vendor/advised'}, availability: 'accessible', reason: 'Existing valid recommendation'},
      fallbacks: []} ])), recommendedPulls: [], notes: []}
  fs.writeFileSync(adviceFile, JSON.stringify(advice))
  saveConfig(root, {model: 'ollama/developer-default', gateway: 'openrouter',
    escalation: {policy: 'sota', blastRadiusThreshold: 3, testRetryThreshold: 2},
    modelRoutes: {creative: 'openrouter/developer-product'}})
  store = new WorkflowStore(root, true)
  await store.sp.ready()
  const calls: string[] = []
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input): Promise<Response> => {
    calls.push(String(input))
    throw new Error('Inspection must not make provider requests')
  }) as typeof fetch)
  const actor = new WorkflowActor({store, projectRoot: root, toolDiscovery: null})
  expect(actor.resolveRoute('dev')?.target).toBe('ollama/developer-default')
  expect(actor.resolveRoute('product')?.target).toBe('openrouter/developer-product')
  expect(actor.resolveRoute('verification')?.target).toBe('ollama/developer-default')
  const configFile = path.join(root, '.ai-workflow/config.json')
  const before = fs.readFileSync(configFile, 'utf8')
  const retained = fs.readFileSync(adviceFile, 'utf8')
  for (const command of ['model list', 'model radar']) {
    const result = await processShellInput(command, {store, projectRoot: root, actor})
    expect(result.output).toContain('existing-reviewed-authority')
  }
  expect(calls).toEqual([])
  expect(fs.readFileSync(configFile, 'utf8')).toBe(before)
  const registry = initializeTools()
  await expect(registry.execute('refresh_model_advice', {}, {store, projectRoot: root, executionAuthority: 'read-only'})).rejects.toThrow('project-write')
  expect(calls).toEqual([])
  const set = await processShellInput('model set dev openrouter/developer-code', {store, projectRoot: root, actor})
  expect(set.output).toContain('developer-code')
  expect(actor.resolveRoute('dev')?.target).toBe('openrouter/developer-code')
  expect(actor.resolveRoute('design')?.target).toBe('ollama/developer-default')
  expect(calls).toEqual([])
  expect(fs.readFileSync(adviceFile, 'utf8')).toBe(retained)
  fetchSpy.mockImplementation((async input => {
    calls.push(String(input))
    if (String(input).endsWith('/api/version')) return Response.json({version: 'fixture'})
    throw new Error('Unexpected diagnostic network request: ' + String(input))
  }) as typeof fetch)
  const diagnostic = await runDiagnostics(store, root)
  expect(diagnostic.checks.find(check => check.name === 'Native model advice')?.message).toContain('existing-reviewed-authority')
  expect(calls).toEqual([loadConfig(root).ollamaUrl + '/api/version'])
  expect(fs.readFileSync(adviceFile, 'utf8')).toBe(retained)
  const afterExplicitSet = fs.readFileSync(configFile, 'utf8')
  const inspection = await processShellInput('model list', {store, projectRoot: root, actor})
  expect(inspection.output).toContain('Effective: openrouter/developer-code')
  expect(fs.readFileSync(configFile, 'utf8')).toBe(afterExplicitSet)
  calls.length = 0
  // A broken snapshot is ignored; an explicit choice stays usable.
  fs.writeFileSync(adviceFile, '{invalid JSON')
  expect(new WorkflowActor({store, projectRoot: root, toolDiscovery: null}).resolveRoute('dev')?.target).toBe('openrouter/developer-code')
  expect(calls).toEqual([])
})

it('Radar requires an explicit authority and refuses unapproved paid research before inference', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-radar-authority-'))
  process.env.XDG_CONFIG_HOME = path.join(root, 'config')
  process.env.OPENROUTER_API_KEY = 'fixture-key'
  saveConfig(root, {gateway: 'openrouter'})
  await expect(refreshDefaultModelAdvice(root)).rejects.toThrow('Configure a Radar research authority')
  saveConfig(root, {gateway: 'openrouter', modelRoutes: {radar: 'openrouter/vendor/research'}})
  await expect(refreshDefaultModelAdvice(root)).rejects.toThrow('Paid Radar research requires explicit paidInference')
})
