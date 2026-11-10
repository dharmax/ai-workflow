/** Ticket proof contract: current signature and pinned Rule/assessment validity. */
import {createHash} from 'node:crypto';
import {canonical} from '../kb/canonical.ts';
import type {WorkflowStore} from '../graph/store.ts';
import type {Ticket} from '../model/ontology.ts';
import type {CompletenessLevel} from '../artifact-policy.ts';
import type {TicketGovernance, AcceptanceVerification} from '../ticket-operation-types.ts';

/** A required Rule assessment failed; the existing resolver may perform its bounded repair. */
export class RuleAcceptanceError extends Error {
  constructor(readonly failures: string[]) { super(failures.join('\n')); }
}

/** Assessments must name the pinned Rule and cite current source or executed tests. */
/** Structural review errors can be corrected; substantive negative verdicts cannot. */
export function ruleAssessmentContractFailures(
  governance: TicketGovernance, acceptance: AcceptanceVerification, evidenceIds: readonly string[]
): string[] {
  const failures = acceptance.rules.filter(check => !governance.rules.some(rule => rule.ruleId === check.ruleId && rule.fingerprint === check.fingerprint))
    .map(check => `Unknown Rule assessment '${check.ruleId}'.`);
  for (const rule of governance.rules.filter(rule => rule.importance >= 8)) {
    const check = acceptance.rules.find(item => item.ruleId === rule.ruleId && item.fingerprint === rule.fingerprint);
    if (!check) {
      failures.push(`Mandatory Rule '${rule.ruleId}' lacks an independent assessment.`);
      continue;
    }
    if (check.revision !== rule.revision || check.fingerprint !== rule.fingerprint)
      failures.push(`Mandatory Rule '${rule.ruleId}' assessment does not match the pinned effective Rule.`);
    const unknownEvidence = check.evidenceIds.filter(id => !evidenceIds.includes(id));
    if (unknownEvidence.length)
      failures.push(`Mandatory Rule '${rule.ruleId}' cites unknown or unsupplied evidence: ${unknownEvidence.join(', ')}.`);
  }
  return failures;
}

export function ruleAcceptanceFailures(
  governance: TicketGovernance, acceptance: AcceptanceVerification, evidenceIds: readonly string[]
): string[] {
  const failures = ruleAssessmentContractFailures(governance, acceptance, evidenceIds);
  for (const rule of governance.rules.filter(rule => rule.importance >= 8)) {
    const check = acceptance.rules.find(item => item.ruleId === rule.ruleId && item.fingerprint === rule.fingerprint);
    if (check && !['pass', 'not_applicable'].includes(check.verdict))
      failures.push(`Mandatory Rule '${rule.ruleId}': ${check.verdict}: ${check.evidence}`);
  }
  return failures;
}

/** Fingerprint the authored contract and applicable governance, not unrelated advisory records. */
export async function ticketVerificationSignature(store: WorkflowStore, ticket: Ticket, completeness?: CompletenessLevel, migrations: readonly {oldId: string; newId: string}[] = [], governance?: TicketGovernance) {
  const {FileNode, SymbolNode, UserStory} = await import('../model/ontology.ts');
  const targets = new Set<string>();
  const addressedStories = new Map<string, number | null>();
  for (const edge of [...await store.getOutgoing(ticket.id), ...await store.getIncoming(ticket.id)]) {
    if (!['contains', 'implements', 'addresses', 'targets', 'modifies', 'governs', 'blocks', 'depends_on', 'verifies'].includes(edge.predicateName)) continue;
    const entity = await store.getEntity(edge.sourceId === ticket.id ? edge.targetId : edge.sourceId);
    // Acceptance of an addressed Story is valid only for that Story's reviewed revision.
    if (edge.predicateName === 'addresses' && edge.sourceId === ticket.id)
      addressedStories.set(store.localId(edge.targetId), entity instanceof UserStory ? entity.version : null);
    if (entity instanceof FileNode || entity instanceof SymbolNode) {
      let id = entity.id;
      // Native changes may migrate durable anchors without changing authored scope.
      for (const migration of [...migrations].reverse()) if (id === migration.newId) id = migration.oldId;
      targets.add(id);
    }
  }
  return createHash('sha256').update(canonical({
    ticket: {title: ticket.title, body: await (await import('../services/journal-service.ts')).ticketVerificationBody(store,ticket), criteria: ticket.acceptanceCriteria, kind:ticket.kind??'task', defect:ticket.defect},
    targets: [...targets].sort(), completeness: await ticket.getCompletenessContext(store, completeness),
    ...(addressedStories.size ? {addressedStories: [...addressedStories].sort(([a], [b]) => a.localeCompare(b))} : {}),
    governance: (governance ?? await (await import('./governance.ts')).resolveTicketGovernance(store, ticket)).fingerprint
  })).digest('hex');
}
