import {JevSystemOne, type SystemOne, type SystemOneAnswer, type SystemOneQuestion} from '@dharmax/llm-utils';

const levels = [
  'Clearly violates or falls outside this constraint',
  'Probably violates or falls outside this constraint',
  'Uncertain',
  'Probably compatible',
  'Clearly compatible',
] as const;
const layaLimit = 512;
const confident = 0.95;

export interface AdherenceJudgment {
  score: number;
  probabilities: Readonly<Record<string, number>>;
  backend: string;
}
export interface CharterScreen {
  judgments: Record<string, Record<string, AdherenceJudgment>>;
  complete: boolean;
}

/** These fields have different logical meanings: alternatives vs. veto constraints. */
const fields = ['purpose', 'actors', 'scope', 'nonGoals', 'bounds'] as const;
const alternatives = new Set(['actors', 'scope']);

function parts(value: unknown, splitLines: boolean): string[] {
  const sources = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const result: string[] = [];
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    if (!splitLines) {
      if (source.trim()) result.push(source.trim());
      continue;
    }
    let heading = '';
    let clause = '';
    const flush = () => { if (clause) result.push(clause); clause = ''; };
    for (const raw of source.split(/\n/)) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (/^\*\*[^*]+\*\*:?$/.test(line) || /^[^.!?]{5,100}:$/.test(line)) {
        flush();
        heading = line;
      } else if (/^(?:[-*] |\d+[.)] )/.test(line)) {
        flush();
        clause = heading ? `${heading} ${line}` : line;
      } else {
        // Wrapped paragraphs and multi-line list items remain one obligation.
        clause = clause ? `${clause} ${line}` : heading ? `${heading} ${line}` : line;
      }
    }
    flush();
    if (heading && !result.some(item => item.startsWith(heading))) result.push(heading);
  }
  return result;
}

function judgment(answer: SystemOneAnswer | undefined, backend: string): AdherenceJudgment | null {
  if (answer?.type !== 'score' || typeof answer.score !== 'number' ||
      !Number.isFinite(answer.score) || !answer.probabilities) return null;
  const p = levels.map((_, i) => answer.probabilities?.[String(i)]);
  if (Object.keys(answer.probabilities).length !== levels.length ||
      !p.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return null;
  const total = p.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const weighted = p.reduce<number>((sum, v, i) => sum + (v ?? 0) * i, 0);
  return Math.abs(total - 1) < 0.01 && Math.abs(weighted - answer.score) < 0.05
    ? {score: answer.score, probabilities: answer.probabilities, backend} : null;
}

async function assess(
  local: SystemOne,
  remote: SystemOne,
  key: string,
  state: Record<string, unknown>,
  instructions: string,
): Promise<AdherenceJudgment | null> {
  const questions: Record<string, SystemOneQuestion> = {
    [key]: {type: 'score', instructions, criteria: levels},
  };
  const valid = (result: Awaited<ReturnType<SystemOne['assess']>>, backend: string) =>
    result && Object.keys(result.answers).length === 1
      ? judgment(result.answers[key], backend) : null;

  try {
    const result = await local.assess(state, questions);
    const tokens = result?.usage?.input_tokens;
    if (result && typeof tokens === 'number' && Number.isInteger(tokens) &&
        tokens > 0 && tokens < layaLimit) {
      const checked = valid(result, result.backendId);
      if (checked) return checked;
    }
  } catch { /* Local unavailable or oversized: try the configured Jev adapter. */ }
  try {
    return valid(await remote.assess(state, questions), 'jev');
  } catch {
    return null;
  }
}

/**
 * Each result is tied to an exact Product clause. No prose is removed or
 * summarized; oversized clauses go to Jev instead of silent Laya truncation.
 * This is diagnostic screening, not authority to approve a Product definition.
 */
export async function screenCharter(
  charter: Readonly<Record<string, unknown>>,
  targets: readonly {id: string; kind: string; fields: Readonly<Record<string, unknown>>}[],
  laya?: SystemOne,
  jev: SystemOne = new JevSystemOne(),
): Promise<CharterScreen> {
  const judgments: CharterScreen['judgments'] = Object.create(null);
  if (!laya || !targets.length) return {judgments, complete: false};
  try {
    for (const target of targets) {
      if (!['Feature', 'UserStory'].includes(target.kind) || Object.hasOwn(judgments, target.id))
        return {judgments, complete: false};
      const definition = Object.fromEntries(Object.entries(target.fields).filter(([key, value]) =>
        !['kind', 'status', 'priority', 'completenessTarget', 'version', 'updatedAt'].includes(key) &&
        value != null && value !== '' && (!Array.isArray(value) || value.length > 0)));
      const proposed = {kind: target.kind, ...definition};
      const perTarget: Record<string, AdherenceJudgment> = Object.create(null);
      judgments[target.id] = perTarget;
      for (const key of fields) {
        const clauses = parts(charter[key], key === 'scope' || key === 'bounds' || key === 'purpose');
        if (!clauses.length) {
          if (key === 'purpose' || key === 'actors' || key === 'scope') return {judgments, complete: false};
          continue;
        }
        for (const [i, clause] of clauses.entries()) {
          const id = `${key}.${i}`;
          const instructions = {
            purpose: 'Is the proposal consistent with this Product purpose? It need not achieve every ambition alone.',
            actors: 'Does the proposed actor fit this permitted role? Other roles are checked separately.',
            scope: 'Does the proposal fit this permitted area? Other areas are checked separately.',
            nonGoals: 'Does the proposal respect this exclusion by NOT offering the excluded capability?',
            bounds: 'Does the proposal respect this mandatory boundary without material contradiction?',
          }[key];
          const found = await assess(laya, jev, id,
            {product: {[key]: clause}, proposed}, instructions);
          if (!found) return {judgments, complete: false};
          perTarget[id] = found;
        }
      }
      const id = 'definition';
      const found = await assess(laya, jev, id, {proposed},
        target.kind === 'UserStory'
          ? 'Is this Story coherent and testable from Actor, Intent, Initial State, Action and Expected Result?'
          : 'Is this Feature a coherent, sufficiently precise responsibility?');
      if (!found) return {judgments, complete: false};
      perTarget[id] = found;
    }
    return {judgments, complete: true};
  } catch {
    return {judgments, complete: false};
  }
}

/** High-confidence screening can establish alignment; uncertain results retain governed reviewer and developer authority. */
export async function clearlyAlignedToCharter(
  charter: Readonly<Record<string, unknown>>,
  targets: readonly {id: string; kind: string; fields: Readonly<Record<string, unknown>>}[],
  laya?: SystemOne,
  jev?: SystemOne,
): Promise<boolean> {
  const result = await screenCharter(charter, targets, laya, jev);
  if (!result.complete) return false;
  return Object.values(result.judgments).every(perTarget =>
    fields.every(key => {
      const scores = Object.entries(perTarget)
        .filter(([id]) => id.startsWith(key + '.'))
        .map(([, value]) => value.probabilities['4'] ?? 0);
      if (!scores.length) return key === 'nonGoals' || key === 'bounds';
      return alternatives.has(key) ? scores.some(p => p >= confident) : scores.every(p => p >= confident);
    }) && (perTarget.definition?.probabilities['4'] ?? 0) >= confident);
}
