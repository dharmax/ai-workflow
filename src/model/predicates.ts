/**
 * Responsibility: Own semantic relationship descriptors and their contracts.
 * Scope: Relationship names, payload contracts and unchanged Semantika descriptors.
 */
import { PredicateDcr } from '@dharmax/semantika'
import { passthroughValidator } from './entity-templates.ts'


export interface SemanticPredicatePayload {
  confidence?: 'speculative' | 'probable' | 'confirmed';
  state?: 'abstract' | 'designed' | 'implemented' | 'verified';
  weight?: number; // 0.0 - 1.0 for fuzzy/speculative ranking
  note?: string;
  sourceRange?: { startLine: number; endLine: number };
  timestamp?: number;
  [key: string]: any;
}
export type SemanticPredicateName =
  | 'applies_to'
  | 'contains'
  | 'calls'
  | 'inherits'
  | 'depends_on'
  | 'imports'
  | 'implements'
  | 'addresses'
  | 'modifies'
  | 'targets'
  | 'verifies'
  | 'fuzzy_relates'
  | 'potentially_affects'
  | 'governs'
  | 'blocks'
  | 'inspires'
  | 'generates'
  | 'trace_links';

export const predicatePayloadTemplate = {
    confidence: passthroughValidator,
    state: passthroughValidator,
    weight: passthroughValidator,
    note: passthroughValidator,
    sourceRange: passthroughValidator,
    timestamp: passthroughValidator
}

export const semanticPredicates = {
    applies_to: new PredicateDcr("applies_to", [], { target: ["title"] }, predicatePayloadTemplate),
    contains: new PredicateDcr("contains", [], { target: ["title"] }, predicatePayloadTemplate),
    calls: new PredicateDcr("calls", [], { target: ["title"] }, predicatePayloadTemplate),
    inherits: new PredicateDcr("inherits", [], { target: ["title"] }, predicatePayloadTemplate),
    depends_on: new PredicateDcr("depends_on", [], { target: ["title"] }, predicatePayloadTemplate),
    imports: new PredicateDcr("imports", [], { target: ["title"] }, predicatePayloadTemplate),
    implements: new PredicateDcr("implements", [], { target: ["title"] }, predicatePayloadTemplate),
    enables: new PredicateDcr("enables", [], { target: ["title"] }, predicatePayloadTemplate),
    serves: new PredicateDcr("serves", [], { target: ["title"] }, predicatePayloadTemplate),
    addresses: new PredicateDcr("addresses", [], { target: ["title"] }, predicatePayloadTemplate),
    modifies: new PredicateDcr("modifies", [], { target: ["title"] }, predicatePayloadTemplate),
    targets: new PredicateDcr("targets", [], { target: ["title"] }, predicatePayloadTemplate),
    verifies: new PredicateDcr("verifies", [], { target: ["title"] }, predicatePayloadTemplate),
    fuzzy_relates: new PredicateDcr("fuzzy_relates", [], { target: ["title"] }, predicatePayloadTemplate),
    potentially_affects: new PredicateDcr("potentially_affects", [], { target: ["title"] }, predicatePayloadTemplate),
    governs: new PredicateDcr("governs", [], { target: ["title"] }, predicatePayloadTemplate),
    blocks: new PredicateDcr("blocks", [], { target: ["title"] }, predicatePayloadTemplate),
    inspires: new PredicateDcr("inspires", [], { target: ["title"] }, predicatePayloadTemplate),
    generates: new PredicateDcr("generates", [], { target: ["title"] }, predicatePayloadTemplate),
    trace_links: new PredicateDcr("trace_links", [], { target: ["title"] }, predicatePayloadTemplate)
}

export const predicateDescriptors = Object.values(semanticPredicates)
