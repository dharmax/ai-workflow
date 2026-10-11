/**
 * AIWF policy for optional Actor budget growth.
 * llm-utils owns accounting; AIWF decides whether an execution may continue.
 *
 * Local inference has deterministic outer bounds (Actor steps/tranches), so the
 * configured token budget is a soft baseline: grant only the deficit needed for
 * the next call. Explicit per-operation caps and remote inference remain hard.
 */
export function createActorTokenBudgetPolicy(
  baselineTokens: number,
  hardCap = false,
): (request: {
  requiredTokens: number
  remainingTokens: number
  estimatedInputTokens: number
  maxOutputTokens: number
  providerId: string
  modelId: string
  local: boolean
}) => number {
  if (!Number.isSafeInteger(baselineTokens) || baselineTokens <= 0)
    throw new Error('Actor token budget baseline must be a positive safe integer.')

  return request => {
    if (hardCap || !request.local) return 0
    return Math.max(0, request.requiredTokens - request.remainingTokens)
  }
}
