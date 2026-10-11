import type {TokenBudgetExtensionRequest} from '@dharmax/llm-utils'

/**
 * AIWF policy for optional Actor budget growth.
 * Mechanism lives in llm-utils; this host policy stays explicit, bounded and replaceable.
 */
export function createActorTokenBudgetPolicy(
  baselineTokens: number,
  hardCap = false,
): (request: TokenBudgetExtensionRequest) => number {
  if (!Number.isSafeInteger(baselineTokens) || baselineTokens <= 0)
    throw new Error('Actor token budget baseline must be a positive safe integer.')

  let grantedTokens = 0
  return request => {
    if (hardCap || !request.local) return 0
    const available = Math.max(0, baselineTokens - grantedTokens)
    const deficit = Math.max(0, request.requiredTokens - request.remainingTokens)
    const grant = Math.min(available, deficit)
    grantedTokens += grant
    return grant
  }
}
