/**
 * Responsibility: Build bounded, provenance-bearing SynthesisContext from Ticket intent,
 * authoritative investigated TicketDossier evidence, Aspects, and Decisions.
 * Scope: Host-owned context construction for J3.4.
 */

import type { TicketDossier } from '../../ticket-operation-types.ts';
import type {
  SynthesisContext,
  SynthesisEvidence,
  SynthesisTarget,
  VerificationExpectation
} from './types.ts';

export interface BuildSynthesisContextOptions {
  dossier: TicketDossier;
  target?: SynthesisTarget;
}

/** Optional discoveries are context; only one grounded mandatory symbol can be synthesized. */
export function findSynthesisTarget(dossier: TicketDossier): Extract<SynthesisTarget, { kind: 'existing_symbol' }> | undefined {
  const targets = dossier.evidence.filter(
    item => item.kind === 'SymbolNode' && item.mandatory && item.exact && item.filePath && item.symbolName && item.source
  );
  if (targets.length !== 1) return undefined;
  const target = targets[0]!;
  return {
    kind: 'existing_symbol',
    filePath: target.filePath!,
    symbolName: target.symbolName!,
    containerName: target.containerName,
    existingSource: target.source!
  };
}

/** Builds bounded synthesis context from Ticket intent and exact code evidence. */
export function buildSynthesisContext(options: BuildSynthesisContextOptions): SynthesisContext {
  const { dossier, target: explicitTarget } = options;
  const ticket = dossier.ticket;

  const target = explicitTarget ?? findSynthesisTarget(dossier);
  if (!target) {
    throw new Error('Source synthesis blocked: no exact synthesis target in the Ticket dossier; requires exactly one mandatory exact symbol with file path, symbol name and source.');
  }

  // 2. Synthesize Evidence with Provenance
  const evidence: SynthesisEvidence[] = [];

  // Project intent / Decisions / Aspects
  for (const aspect of dossier.aspects?.aspects ?? []) {
    const isAccepted = aspect.status === 'accepted';
    const criteriaLines = aspect.criteria?.length
      ? `\nCriteria:\n${aspect.criteria.map(c => `- ${c}`).join('\n')}`
      : '';
    evidence.push({
      id: `aspect:${aspect.id}`,
      role: 'aspect',
      fact: `${aspect.id}: ${aspect.title}${criteriaLines}`,
      provenance: isAccepted ? `Governing Aspect ${aspect.id}` : `Advisory Aspect Candidate ${aspect.id}`,
      mandatory: isAccepted
    });
  }

  // Dossier evidence items
  for (const item of dossier.evidence) {
    // Avoid re-adding the target itself as redundant evidence if it's the exact same symbol
    if (
      target.kind === 'existing_symbol' &&
      item.filePath === target.filePath &&
      item.symbolName === target.symbolName
    ) {
      continue;
    }

    let role: SynthesisEvidence['role'] = 'constraint';
    if (item.kind === 'UserStory' || item.kind === 'Feature' || item.kind === 'Epic') {
      role = 'product_intent';
    } else if (item.kind === 'Decision') {
      role = 'decision';
    } else if (item.kind === 'SymbolNode') {
      role = 'reuse_candidate';
    }

    evidence.push({
      id: item.id,
      role,
      fact: item.title ? `${item.title}: ${item.body ?? ''}`.trim() : (item.body ?? item.id),
      provenance: item.provenance ?? item.kind,
      source: item.source,
      filePath: item.filePath,
      mandatory: Boolean(item.mandatory)
    });
  }

  // 3. Verification Expectations
  const verification: VerificationExpectation[] = ticket.acceptanceCriteria.map((criterion: string, idx: number) => ({
    id: `ac-${idx + 1}`,
    criterion,
    mandatory: true,
    provenance: `Ticket acceptance criterion ${idx + 1}`
  }));

  for (const aspect of dossier.aspects?.aspects ?? []) {
    if (aspect.status === 'accepted' && aspect.criteria?.length) {
      for (let idx = 0; idx < aspect.criteria.length; idx++) {
        verification.push({
          id: `aspect-${aspect.id}-cr-${idx + 1}`,
          criterion: aspect.criteria[idx],
          mandatory: true,
          provenance: `Governing Aspect ${aspect.id} criterion ${idx + 1}`
        });
      }
    }
  }

  return {
    intent: {
      summary: ticket.title + (ticket.body ? `\n${ticket.body}` : ''),
      acceptanceCriteria: ticket.acceptanceCriteria
    },
    target,
    evidence,
    verification
  };
}
