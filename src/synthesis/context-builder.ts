/**
 * Responsibility: Build bounded, provenance-bearing SynthesisContext from Ticket intent,
 * authoritative investigated TicketDossier evidence, Aspects, and Decisions.
 * Scope: Host-owned context construction for J3.4.
 */

import type { TicketDossier } from '../ticket-operation-types.ts';
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

/**
 * Builds a small, bounded SynthesisContext from existing Ticket investigation dossier
 * and exact code evidence.
 */
export function buildSynthesisContext(options: BuildSynthesisContextOptions): SynthesisContext {
  const { dossier, target: explicitTarget } = options;
  const ticket = dossier.ticket;

  // 1. Identify Target
  let target: SynthesisTarget;
  if (explicitTarget) {
    target = explicitTarget;
  } else {
    // Locate exact target from dossier evidence
    const exactTargets = dossier.evidence.filter(
      e => e.exact && e.mandatory && e.filePath && e.symbolName && e.source
    );
    const exactEvidence = exactTargets.length === 1 ? exactTargets[0] : undefined;

    if (exactEvidence) {
      target = {
        kind: 'existing_symbol',
        filePath: exactEvidence.filePath!,
        symbolName: exactEvidence.symbolName!,
        containerName: exactEvidence.containerName,
        existingSource: exactEvidence.source!
      };
    } else {
      throw new Error('Source synthesis blocked: no exact synthesis target in the Ticket dossier.');
    }
  }

  // 2. Synthesize Evidence with Provenance
  const evidence: SynthesisEvidence[] = [];

  // Project intent / Decisions / Aspects
  for (const aspect of dossier.aspects?.aspects ?? []) {
    evidence.push({
      id: `aspect:${aspect.id}`,
      role: 'aspect',
      fact: `${aspect.id}: ${aspect.title}`,
      provenance: `Governing Aspect ${aspect.id}`,
      mandatory: aspect.status === 'material'
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
