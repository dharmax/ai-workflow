/**
 * Standalone grounded-answer probe for Qwen2.5/Ollama.
 * Zero AIWF/MCP dependencies; no real project data.
 * bun scripts/grounding/qwen2.5-grounding.ts --selftest
 * OLLAMA_URL=http://lotus:11434 bun scripts/grounding/qwen2.5-grounding.ts
 */
import { writeFileSync } from 'node:fs';

type Fact = { id: string; [field: string]: unknown };
type Case = {
  id: string;
  axis: 'claimant' | 'opaque-mode';
  question: string;
  facts: Fact[];
  expected: { answer: string; evidence_ids: string[] };
};

const cases: Case[] = [
  { id: 'history-only', axis: 'claimant', question: 'Who is the CURRENT claimant of T-A?',
    facts: [{ id: 'history', claimant: 'OMAR', status: 'historical', ended: '2025-11-01' }],
    expected: { answer: 'UNKNOWN', evidence_ids: [] } },
  { id: 'current-over-history', axis: 'claimant', question: 'Who is the CURRENT claimant of T-B?',
    facts: [{ id: 'old', claimant: 'OMAR', status: 'historical' },
      { id: 'current', claimant: 'LINA', status: 'current' }],
    expected: { answer: 'LINA', evidence_ids: ['current'] } },
  { id: 'unassigned', axis: 'claimant', question: 'Who is the CURRENT claimant of T-C?',
    facts: [{ id: 'old', claimant: 'OMAR', status: 'historical' },
      { id: 'current', claimant_status: 'unassigned', status: 'current' }],
    expected: { answer: 'NONE', evidence_ids: ['current'] } },
  { id: 'dated-snapshots', axis: 'claimant', question: 'Who claims T-D as of 2026-10-31?',
    facts: [{ id: 'old', claimant: 'OMAR', as_of: '2026-09-01' },
      { id: 'latest', claimant: 'MIRA', as_of: '2026-10-31' }],
    expected: { answer: 'MIRA', evidence_ids: ['latest'] } },
  { id: 'not-recorded', axis: 'claimant', question: 'Who is the CURRENT claimant of T-E?',
    facts: [{ id: 'history', claimant: 'OMAR', status: 'historical' },
      { id: 'current', claimant_status: 'not_recorded', status: 'current' }],
    expected: { answer: 'UNKNOWN', evidence_ids: ['current'] } },
  { id: 'undefined-H', axis: 'opaque-mode', question: 'Define predicate mode H exactly.',
    facts: [{ id: 'predicate', mode: 'H' },
      { id: 'glossary', complete: true, definitions: { A: 'ACTIVE', M: 'MANUAL' } }],
    expected: { answer: 'UNKNOWN', evidence_ids: ['glossary'] } },
  { id: 'defined-H', axis: 'opaque-mode', question: 'Define predicate mode H exactly.',
    facts: [{ id: 'predicate', mode: 'H' },
      { id: 'glossary', complete: true, definitions: { H: 'HANDOFF' } }],
    expected: { answer: 'HANDOFF', evidence_ids: ['glossary'] } },
  { id: 'counterfactual-H', axis: 'opaque-mode', question: 'Define predicate mode H exactly.',
    facts: [{ id: 'predicate', mode: 'H' },
      { id: 'glossary', complete: true, definitions: { H: 'HUMAN_REVIEW' } }],
    expected: { answer: 'HUMAN_REVIEW', evidence_ids: ['glossary'] } },
  { id: 'neighbor-code', axis: 'opaque-mode', question: 'Does H mean the same thing as A? Expand H exactly.',
    facts: [{ id: 'predicate', mode: 'H' },
      { id: 'glossary', complete: true, definitions: { A: 'ACTIVE', F: 'FORWARD' } }],
    expected: { answer: 'UNKNOWN', evidence_ids: ['glossary'] } },
  { id: 'no-glossary', axis: 'opaque-mode', question: 'Expand predicate mode H exactly.',
    facts: [{ id: 'predicate', mode: 'H' }, { id: 'metadata', glossary_status: 'unavailable' }],
    expected: { answer: 'UNKNOWN', evidence_ids: ['metadata'] } },
];

const endpoint = (process.env.OLLAMA_URL ?? 'http://lotus:11434').replace(/\/$/, '');
const models = (process.env.MODELS ?? 'qwen2.5:14b-instruct-q3_K_M').split(',').map(s => s.trim()).filter(Boolean);
const modes = (process.env.MODES ?? 'baseline,explicit').split(',').map(s => s.trim());
const repeats = Number(process.env.REPEATS ?? 1);
const timeoutMs = Number(process.env.TIMEOUT_MS ?? 60000);
const output = process.env.OUT ?? '/tmp/qwen-grounding-results.json';
if (!models.length || modes.some(m => !['baseline', 'explicit'].includes(m)) ||
    !Number.isInteger(repeats) || repeats < 1 || repeats > 20 ||
    !Number.isFinite(timeoutMs) || timeoutMs < 1000) throw Error('Invalid test configuration');

function score(c: Case, raw: string) {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { format_ok: false, answer_ok: false, evidence_ok: false, unsupported_positive: false }; }
  const o = value as { answer?: unknown; evidence_ids?: unknown };
  const format_ok = !!o && typeof o === 'object' && !Array.isArray(o) &&
    typeof o.answer === 'string' && Array.isArray(o.evidence_ids) &&
    o.evidence_ids.every((id: unknown) => typeof id === 'string');
  const answer_ok = format_ok && o.answer === c.expected.answer;
  const evidence_ok = format_ok && JSON.stringify([...(o.evidence_ids as string[])].sort()) ===
    JSON.stringify([...c.expected.evidence_ids].sort());
  return { format_ok, answer_ok, evidence_ok,
    unsupported_positive: format_ok && c.expected.answer === 'UNKNOWN' && o.answer !== 'UNKNOWN' };
}

if (process.argv.includes('--selftest')) {
  for (const c of cases) {
    const good = score(c, JSON.stringify(c.expected));
    if (!good.format_ok || !good.answer_ok || !good.evidence_ok ||
        score(c, '{bad-json').format_ok ||
        score(c, '{"answer":"INVENTED","evidence_ids":[]}').answer_ok)
      throw Error('Scorer selftest failed: ' + c.id);
  }
  console.log('Offline scorer selftest: ' + cases.length + ' passed');
  process.exit(0);
}

async function ask(model: string, mode: string, c: Case) {
  const rules = 'Answer using ONLY FACTS. Return JSON with answer (a single exact token) and evidence_ids (array of supporting record IDs). ' +
    'Use UNKNOWN for insufficient evidence, NONE for explicitly unassigned. Cite only evidence directly supporting the answer.';
  const system = mode === 'explicit' ? rules +
    ' Historical claimants are NOT current. Do NOT expand a code such as H unless a record defines it. Never guess.' : rules;
  const start = performance.now();
  const response = await fetch(endpoint + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, format: 'json',
      options: { temperature: 0, num_ctx: 4096, num_predict: 128 },
      messages: [{ role: 'system', content: system },
        { role: 'user', content: c.question + '\nFACTS:\n' + JSON.stringify(c.facts) }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw Error('Ollama HTTP ' + response.status + ': ' + (await response.text()).slice(0, 150));
  const data = await response.json() as {
    message?: { content?: string; tool_calls?: unknown[] };
    prompt_eval_count?: number; eval_count?: number;
  };
  return { raw: data.message?.content ?? '', elapsed_ms: Math.round(performance.now() - start),
    prompt_tokens: data.prompt_eval_count ?? null, output_tokens: data.eval_count ?? null,
    unexpected_tool_calls: data.message?.tool_calls?.length ?? 0 };
}

const results: Record<string, unknown>[] = [];
for (const model of models) for (const mode of modes) for (let trial = 1; trial <= repeats; trial++) {
  for (const c of cases) {
    try {
      const response = await ask(model, mode, c);
      const metrics = score(c, response.raw);
      results.push({ model, mode, trial, case_id: c.id, axis: c.axis,
        expected: c.expected, ...response, ...metrics });
      console.log(model + ' / ' + mode + ' / ' + c.id + ': ' +
        (metrics.answer_ok && metrics.evidence_ok ? 'PASS' : 'FAIL'));
    } catch (error) {
      results.push({ model, mode, trial, case_id: c.id, axis: c.axis, expected: c.expected,
        transport_error: String(error) });
      console.log(model + ' / ' + mode + ' / ' + c.id + ': TRANSPORT ERROR');
    }
  }
}
const summary = models.flatMap(model => modes.map(mode => {
  const rows = results.filter(r => r.model === model && r.mode === mode);
  const received = rows.filter(r => !r.transport_error);
  const count = (key: string) => received.filter(r => r[key] === true).length;
  return { model, mode, attempts: rows.length, received: received.length,
    answer_correct: count('answer_ok'), evidence_correct: count('evidence_ok'),
    fully_grounded: received.filter(r => r.answer_ok && r.evidence_ok).length,
    unsupported_positive: count('unsupported_positive'), format_valid: count('format_ok') };
}));
writeFileSync(output, JSON.stringify({ endpoint, models, modes, repeats, cases, summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log('Raw results: ' + output);
// This is an optional diagnostic; its failures never gate the normal AIWF suite.
process.exitCode = summary.some(r => r.received !== r.attempts) ? 2 :
  summary.some(r => r.fully_grounded !== r.received) ? 1 : 0;