import {JevSystemOne, LayaSystemOne, type SystemOne, type SystemOneQuestion, type SystemOneValue} from '@dharmax/llm-utils';

function jev(apiKey = process.env.TYPESAFE_API_KEY): JevSystemOne {
  if (!apiKey) return new JevSystemOne();
  return new JevSystemOne({load: async () => ({systemOne: async request => {
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method:'POST', headers:{Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json'},
      body:JSON.stringify({model:'jev-latest', ...request}), signal:AbortSignal.timeout(5000)
    });
    if (!response.ok) throw Error(`Jev HTTP ${response.status}`);
    return response.json();
  }})});
}

const levels = ['Clearly incompatible', 'Probably incompatible', 'Uncertain', 'Probably compatible', 'Clearly compatible'] as const;

async function assess(model: SystemOne, state: Record<string, SystemOneValue>, questions: Record<string, SystemOneQuestion>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([model.assess(state, questions), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 5000); })]); }
  finally { if (timer) clearTimeout(timer); }
}

/** System-1 advises on the actual charter text; it never grants approval. */
export async function screenCharter(
  charter: Readonly<Record<string, unknown>>,
  targets: readonly {id: string; kind: string; fields: Readonly<Record<string, unknown>>; context?: readonly Readonly<Record<string, unknown>>[]}[],
  systemOne: SystemOne = new LayaSystemOne(),
  preferJev = false,
  apiKey?: string,
): Promise<string[]> {
  const warnings: string[] = [];
  for (const target of targets) {
    const questions: Record<string, SystemOneQuestion> = {};
    const clauses: Record<string, string> = {};
    const add = (key: string, clause: string, instruction: string) => {
      clauses[key] = clause;
      questions[key] = {type: 'score', instructions: `${instruction}\n${clause}`, criteria: levels};
    };
    for (const [field, instruction] of Object.entries({
      purpose: 'Is the proposal relevant to this Product purpose?',
      actors: 'Is the proposal compatible with these intended actors?',
      scope: 'Does the proposal fit this Product scope?',
      nonGoals: 'Does the proposal respect this Product non-goal?',
      bounds: 'Does the proposal respect this Product boundary?',
    })) {
      const value = charter[field];
      const entries = field === 'actors' && Array.isArray(value) ? [value.join('\n')] : Array.isArray(value) ? value : [value];
      for (const [i, clause] of entries.entries())
        if (typeof clause === 'string' && clause.trim()) add(`${field}_${i}`, clause, instruction);
    }
    add('coherence', `Proposed ${target.kind} definition`, 'Is the proposed definition coherent?');
    const definition = Object.fromEntries(Object.entries(target.fields).filter(([key, value]) =>
      !['kind', 'status', 'priority', 'completenessTarget', 'version', 'updatedAt'].includes(key) && value != null && value !== ''));
    const proposed = JSON.parse(JSON.stringify({kind: target.kind, ...definition})) as Record<string, SystemOneValue>;
    const state = JSON.parse(JSON.stringify({proposed, context: target.context ?? []})) as Record<string, SystemOneValue>;
    let result: Awaited<ReturnType<SystemOne['assess']>> = null;
    try {
      result = await assess(preferJev ? jev(apiKey) : systemOne, state, questions);
      // Laya can truncate its context. Never treat an oversized assessment as complete.
      if (preferJev && !result) result = await assess(systemOne, state, questions);
      if ((!preferJev && !result) || (result?.backendId === 'laya' && (typeof result.usage?.input_tokens !== 'number' || result.usage.input_tokens >= 512)))
        result = preferJev ? null : await assess(jev(apiKey), state, questions);
    } catch { result = null; }
    if (!result) {
      warnings.push(`${target.id}: System-1 alignment assessment unavailable; Product alignment is unknown.`);
      continue;
    }
    for (const [key, clause] of Object.entries(clauses)) {
      const answer = result?.answers[key];
      if (answer?.type !== 'score' || typeof answer.score !== 'number' || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > 4) {
        warnings.push(`${target.id}: System-1 assessment unavailable or uncertain for ${key}: ${clause}`);
      } else if (answer.confidence !== undefined && (!Number.isFinite(answer.confidence) || answer.confidence < 0.5 || answer.confidence > 1)) {
        warnings.push(`${target.id}: System-1 assessment uncertain for ${key}: ${clause}`);
      } else if (answer.score < 3) {
        warnings.push(`${target.id}: ${key} scored ${Math.round(answer.score * 25)}/100; review against: ${clause}`);
      }
    }
  }
  return warnings;
}
