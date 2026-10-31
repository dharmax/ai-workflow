/** Human projection and rendering of canonical results. Machine output bypasses projection. */
import type { ViewRequest } from '@dharmax/shell-ui';
import { ZodError } from 'zod';
export interface OutputOptions {
  verbosity: 0 | 1 | 2 | 3;
  sections?: string[];
  fullJson?: boolean;
}
const defaults: OutputOptions = { verbosity: 1 };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
const id = (value: unknown, type?: unknown) =>
  String(value ?? '').replace(type ? 'aiwf_' + type + '_' : /^aiwf_[^_]+_/, '');
const limit = (options: OutputOptions) => (options.verbosity === 3 ? Infinity : options.verbosity === 2 ? 20 : 8);
const field = (value: string, title: string) => ({
  type: 'text' as const,
  value,
  label: title,
  mode: 'readonly' as const,
  multiline: true,
});
const internal = (key: string) => key.startsWith('_');

export function humanValue(value: unknown, options: OutputOptions = defaults): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    const selected = value.slice(0, limit(options));
    const items = selected.map((item) => humanValue(item, options)).filter(Boolean);
    if (value.length > selected.length) items.push(`… ${value.length - selected.length} more; use -vv for all.`);
    return items.map((item) => '- ' + item).join('\n');
  }
  if (!record(value)) return String(value);
  if ('sourceId' in value && 'targetId' in value)
    return (
      `${id(value.sourceId, value.sourceType)} → ${label(String(value.predicateName ?? value.predicate ?? 'related to')).toLowerCase()} → ${id(value.targetId, value.targetType)}` +
      (options.verbosity > 1 && record(value.payload) && Object.keys(value.payload).length
        ? '\n' + humanValue(value.payload, options)
        : '')
    );
  return Object.entries(value)
    .filter(
      ([key, item]) =>
        !internal(key) &&
        item !== undefined &&
        item !== null &&
        !(
          options.verbosity < 3 &&
          ['metadata', 'hashes', 'baselines', 'effects', 'scope', 'originalHashes'].includes(key)
        ),
    )
    .map(([key, item]) => {
      const text = humanValue(item, options);
      return text ? label(key) + ': ' + text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function relationFields(
  data: Record<string, unknown>,
  options: OutputOptions,
): Record<string, ReturnType<typeof field>> {
  const groups: Record<string, string[]> = { dependencies: [], files: [], stories: [], tests: [], relations: [] };
  for (const [direction, edges] of [
    ['outgoing', data.outgoing],
    ['incoming', data.incoming],
  ] as const) {
    if (!Array.isArray(edges)) continue;
    for (const edge of edges.filter(record)) {
      const incoming = direction === 'incoming',
        type = incoming ? edge.sourceType : edge.targetType;
      const predicate = String(edge.predicateName ?? edge.predicate ?? 'related');
      const group = ['depends_on', 'blocks'].includes(predicate)
        ? 'dependencies'
        : ['FileNode', 'SymbolNode', 'ModuleNode'].includes(String(type))
          ? 'files'
          : type === 'UserStory'
            ? 'stories'
            : type === 'TestNode'
              ? 'tests'
              : 'relations';
      const relationship =
        predicate === 'depends_on'
          ? incoming
            ? 'Required by'
            : 'Requires'
          : predicate === 'blocks'
            ? incoming
              ? 'Blocked by'
              : 'Blocks'
            : (incoming ? 'Incoming ' : '') + label(predicate);
      const note = options.verbosity > 1 && record(edge.payload) ? humanValue(edge.payload, options) : '';
      groups[group]!.push(
        relationship + ': ' + id(incoming ? edge.sourceId : edge.targetId, type) + (note ? '\n' + note : ''),
      );
    }
  }
  return Object.fromEntries(
    Object.entries(groups).map(([key, items]) => [
      key,
      field(items.length ? humanValue(items, options) : 'None.', label(key)),
    ]),
  );
}

function eventMessage(value: unknown, options: OutputOptions): string {
  if (typeof value !== 'string') return humanValue(value, options);
  if (value.startsWith('{') || value.startsWith('['))
    try {
      return humanValue(JSON.parse(value), options);
    } catch {}
  return value;
}
function historyText(value: unknown, options: OutputOptions): string {
  if (!record(value)) return 'No history recorded.';
  const recent = Array.isArray(value.recent) ? value.recent.filter(record) : [];
  const count = typeof value.count === 'number' ? value.count : recent.length;
  let text = `${count} history event${count === 1 ? '' : 's'}.`;
  if (options.verbosity < 2)
    return text + (recent.at(-1)?.message ? ' Latest: ' + eventMessage(recent.at(-1)!.message, options) : '');
  if (record(value.summary) && value.summary.text) text += '\n' + value.summary.text;
  for (const event of recent.slice(options.verbosity === 3 ? 0 : -3))
    text +=
      '\n' +
      label(String(event.kind ?? 'event')) +
      ': ' +
      eventMessage(event.message ?? '', options) +
      (options.verbosity === 3 && Array.isArray(event.references) && event.references.length
        ? '\nReferences:\n' + humanValue(event.references, options)
        : '');
  if (count > recent.length)
    text += '\nUse ticket history for the original entries; this command returns recent context.';
  return text;
}

function verificationText(data: Record<string, unknown>, options: OutputOptions): string {
  const evidence = Array.isArray(data.testEvidence) ? data.testEvidence.filter(record) : [];
  const passing = evidence.filter((test) => test.passed === true).length;
  let text = data.verification
    ? data.verificationCurrent === true
      ? 'Completed verification; evidence is current.'
      : data.verificationCurrent === false
        ? 'Recorded verification is stale or no longer sufficient for the current contract.'
        : 'Verification receipt recorded; freshness is not established.'
    : passing
      ? `${passing} current passing test${passing === 1 ? '' : 's'}; no completed verification.`
      : 'No completed verification recorded; no current passing test evidence.';
  if (evidence.length > passing)
    text += ` ${evidence.length - passing} linked test execution(s) are failing, missing or stale.`;
  if (options.verbosity > 1 && data.verificationIssue) text += '\n' + data.verificationIssue;
  if (options.verbosity > 1 && record(data.verification)) {
    const proof = data.verification;
    if (Array.isArray(proof.tests)) text += '\nRecorded checks:\n' + humanValue(proof.tests, options);
    if (options.verbosity === 3) text += '\n' + humanValue(proof, options);
  }
  return text;
}

function ticketView(data: Record<string, unknown>, options: OutputOptions): ViewRequest {
  const summary =
    `State: ${data.lane ?? 'Unknown'}` + (data.priority!==undefined?`   Priority: ${data.priority}`:'') + (data.kind?`   Kind: ${data.kind}`:'') +
    (options.verbosity > 0 && data.body ? '\n\n' + String(data.body) : '');
  const fields: ViewRequest['fields'] = {
    summary: field(summary, 'Summary'),
    criteria: field(
      Array.isArray(data.acceptanceCriteria)
        ? data.acceptanceCriteria.map((c) => '- ' + String(c)).join('\n')
        : 'No criteria recorded.',
      'Acceptance criteria',
    ),
    ...relationFields(data, options),
    verification: field(verificationText(data, options), 'Verification'),
    history: field(historyText(data.history, options), 'Execution history'),
  };
  if (data.kind === 'bug' && data.defect) fields.defect = field(humanValue(data.defect, options), 'Bug report');
  if (record(data.claim) && Date.parse(String(data.claim.expiresAt)) > Date.now())
    fields.lease = field(String(data.claim.agentId) + ' until ' + String(data.claim.expiresAt), 'Active lease');
  for(const key of ['missing','reasons','blockers','required'])if(data[key])fields[key]=field(humanValue(data[key],options),label(key));
  if (data.version !== undefined) fields.revision = field(String(data.version), 'Revision');
  return {
    id: 'ticket:' + id(data.id),
    title: `Ticket ${id(data.id)} · ${data.title ?? ''}`,
    mode: 'readonly',
    fields,
  };
}

function listText(items: unknown[], options: OutputOptions): string {
  if (!items.length) return 'No records.';
  const rows = items.slice(0, limit(options));
  if (rows.every(record) && rows.every((row) => row.id !== undefined && row.title !== undefined)) {
    const values = rows.map((row) => [
      id(row.id),
      String(row.lane ?? row.status ?? ''),
      row.priority === undefined ? '' : String(row.priority),
      String(row.title),
    ]);
    const widths = [0, 1, 2].map((column) => Math.max(...values.map((row) => row[column]!.length), 0));
    return (
      values
        .map((row, index) => {
          const text = row
            .map((value, i) => (i < 3 ? value.padEnd(widths[i]!) : value))
            .join('  ')
            .trimEnd();
          if (options.verbosity < 2) return text;
          const details = Object.fromEntries(
            Object.entries(rows[index] as Record<string, unknown>).filter(
              ([key, value]) =>
                !['id', 'title', 'lane', 'status', 'priority'].includes(key) &&
                (key !== 'claim' || (record(value) && Date.parse(String(value.expiresAt)) > Date.now())),
            ),
          );
          const extra = humanValue(details, options);
          return text + (extra ? '\n' + extra : '');
        })
        .join('\n') + (items.length > rows.length ? `\n… ${items.length - rows.length} more; use -vv for all.` : '')
    );
  }
  return humanValue(items, options) || 'No records.';
}

function sectionName(key:string):string {
 switch(key){
  case 'acceptanceCriteria':return 'criteria';
  case 'verification':case 'acceptance':return 'verification';
  case 'containedStories':case 'verifyingTests':case 'implementingTickets':case 'targetingEpics':case 'outgoing':case 'incoming':return 'relations';
  case 'content':case 'code':return 'source';
  case 'filesTouched':case 'filesRenamed':case 'uncoveredFiles':return 'files';
  default:return key;
 }
}

/** Build a read-only ViewRequest. Original domain values are never modified. */
export function resultView(result: unknown, options: OutputOptions = defaults, title = 'Result'): ViewRequest {
  const data = record(result) ? result : undefined;
  if (data && 'lane' in data && 'id' in data && ['body','acceptanceCriteria','verification','claim'].some(key=>key in data)) return ticketView(data, options);
  const collection = Array.isArray(result)
    ? result
    : data
      ? ['tickets', 'results', 'rows'].map((key) => data[key]).find(Array.isArray)
      : undefined;
  if (Array.isArray(collection))
    return {
      id: title,
      title,
      mode: 'readonly',
      fields: {
        summary: field(listText(collection, options), 'Records'),
        ...Object.fromEntries(
          Object.entries(data ?? {})
            .filter(([key, value]) => value !== collection && value !== null && value !== undefined && key !== 'status')
            .map(([key, value]) => [
              key,
              field(humanValue(value, options), key === 'cursor' ? 'Continue with --cursor' : label(key)),
            ]),
        ),
      },
    };
  if (!data)
    return { id: title, title, mode: 'readonly', fields: { summary: field(humanValue(result, options), 'Result') } };
  const fields: ViewRequest['fields'] = {};
  const entity = record(data.product) ? data.product : record(data.rule) ? data.rule : data;
  const summary = ['id', 'title', 'lane', 'status', 'priority', 'kind', 'ok', 'success']
    .filter((key) => entity[key] !== undefined)
    .map((key) => label(key) + ': ' + humanValue(entity[key], options));
  if (options.verbosity > 0 && entity.body) summary.push(String(entity.body));
  fields.summary = field(summary.join('\n') || title, 'Summary');
  for (const [key, value] of Object.entries(entity)) {
    if (
      internal(key) ||
      ['id', 'title', 'lane', 'status', 'priority', 'kind', 'body', 'ok', 'success'].includes(key) ||
      value === undefined ||
      value === null
    )
      continue;
    const section = sectionName(key);
    const text = key === 'history' ? historyText(value, options) : humanValue(value, options);
    if (!text) continue;
    fields[section] = field(
      (fields[section]?.value ? fields[section]!.value + '\n' : '') + text,
      key === 'acceptanceCriteria' ? 'Acceptance criteria' : label(section),
    );
  }
  if (entity !== data)
    for (const [key, value] of Object.entries(data))
      if (value !== entity && value !== undefined && value !== null && !internal(key))
        fields[key] = field(humanValue(value, options), label(key));
  return {
    id: String(entity.id ?? title),
    title: entity.title ? `${title} · ${entity.title}` : title,
    mode: 'readonly',
    fields,
  };
}

export function formatView(view: ViewRequest, options: OutputOptions = defaults): string {
  const available = Object.keys(view.fields);
  const unknown = options.sections?.filter((section) => !available.includes(section));
  if (unknown?.length)
    throw Error(`Unknown section(s): ${unknown.join(', ')}. Available sections: ${available.join(', ')}.`);
  const selected =
    options.sections ??
    available.filter(
      (key) =>
        (options.verbosity > 0 || ['summary', 'blockers', 'required'].includes(key)) &&
        (options.verbosity > 1 || !['revision', 'version'].includes(key)) &&
        (options.verbosity === 3 ||
          !['metadata', 'hashes', 'baselines', 'effects', 'scope', 'originalHashes'].includes(key)),
    );
  const parts = [view.title || view.id];
  for (const key of selected) {
    const item = view.fields[key]!;
    const value = Array.isArray(item.value) ? item.value.join('\n') : String(item.value);
    if (!value.trim() || (!options.sections && value === 'None.')) continue;
    parts.push(`${item.label || label(key)}:${value.includes('\n') ? '\n' : ' '}${value}`);
  }
  return parts.join('\n\n');
}

export function formatOutput(
  result: unknown,
  options: OutputOptions = defaults,
  title = 'Result',
  legacy?: (value: unknown) => string,
): string {
  if (options.fullJson) {
    const text = JSON.stringify(result, null, 2);
    if (text === undefined) throw Error('Command returned no structured result.');
    return text;
  }
  if ((result === null || typeof result !== 'object') && !options.sections) return humanValue(result, options);
  if (legacy && options.verbosity === 1 && !options.sections) return legacy(result);
  return formatView(resultView(result, options, title), options);
}
export function formatOutputError(error: unknown, options: OutputOptions = defaults): string {
  const message =
    error instanceof ZodError
      ? error.issues.map((issue) => (issue.path.join('.') || 'Input') + ': ' + issue.message).join('\n')
      : error instanceof Error
        ? error.message
        : String(error);
  if (options.fullJson)
    return JSON.stringify({
      status: 'failed',
      error: message,
      ...(error instanceof ZodError ? { details: error.issues } : {}),
    });
  return (
    'Error: ' + message + (options.verbosity === 3 && error instanceof Error && error.stack ? '\n' + error.stack : '')
  );
}
