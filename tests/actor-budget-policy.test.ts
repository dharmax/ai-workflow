import {describe, expect, it} from 'bun:test'
import {createActorTokenBudgetPolicy} from '../src/actor-budget-policy.ts'

const request = (overrides: Partial<Parameters<ReturnType<typeof createActorTokenBudgetPolicy>>[0]> = {}) => ({
  requiredTokens: 900,
  remainingTokens: 400,
  estimatedInputTokens: 700,
  maxOutputTokens: 200,
  providerId: 'ollama',
  modelId: 'qwen',
  local: true,
  ...overrides,
})

describe('Actor token budget policy', () => {
  it('grants only the current deficit for local inference, repeatedly when bounded execution still progresses', () => {
    const policy = createActorTokenBudgetPolicy(1000)
    expect(policy(request())).toBe(500)
    expect(policy(request({requiredTokens: 1100, remainingTokens: 400}))).toBe(700)
    expect(policy(request({requiredTokens: 650, remainingTokens: 600}))).toBe(50)
  })

  it('does not auto-expand remote inference', () => {
    const policy = createActorTokenBudgetPolicy(1000)
    expect(policy(request({local: false, providerId: 'openai'}))).toBe(0)
  })

  it('treats an explicit operation override as a hard cap', () => {
    const policy = createActorTokenBudgetPolicy(1000, true)
    expect(policy(request())).toBe(0)
  })
})
