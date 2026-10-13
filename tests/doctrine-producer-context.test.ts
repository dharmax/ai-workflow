import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, Feature, UserStory, Aspect, Decision, FileNode, SymbolNode, ModuleNode } from '../src/graph/ontology.ts';
import { RuleStore } from '../src/rules/store.ts';
import { buildSynthesisContext } from '../src/synthesis/context-builder.ts';
import { buildIntentContext } from '../src/product/context.ts';
import { initializeTools } from '../src/tools/index.ts';
import type { TicketDossier } from '../src/ticket-operation-types.ts';

describe('Doctrine Gate 2: Producer Context & Decision/Aspect Authority Delivery', () => {
  let tmpDir: string;
  let store: WorkflowStore;
  let ruleStore: RuleStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-doctrine-g2-'));
    store = new WorkflowStore(tmpDir);
    await store.sp.ready();
    ruleStore = new RuleStore(store);
    initializeTools();
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('delivers Decision operative fields (decision, context, consequences) into Ticket dossier evidence', async () => {
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-1',
      title: 'Implement Authentication',
      body: 'Add auth token verification',
      lane: 'Todo',
      acceptanceCriteria: ['Tokens are signed with RSA-256']
    });

    const d = await store.upsertEntity<Decision>(Decision.dcr, {
      id: 'DEC-1',
      title: 'Use Stateless JWT',
      decision: 'We will use asymmetric RSA-256 signed JWT tokens.',
      context: 'Microservices need to verify identity without a central session DB.',
      consequences: 'Token revocation requires short lifespans or a public blocklist.'
    });

    await store.relate(t, 'governs', d);

    const result = await t.investigate(store);
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(JSON.stringify(result));

    const decisionEvidence = result.value.evidence.find(e => e.id === 'DEC-1');
    expect(decisionEvidence).toBeDefined();
    expect(decisionEvidence!.kind).toBe('Decision');
    expect(decisionEvidence!.body).toContain('We will use asymmetric RSA-256 signed JWT tokens.');
    expect(decisionEvidence!.body).toContain('Context: Microservices need to verify identity without a central session DB.');
    expect(decisionEvidence!.body).toContain('Consequences: Token revocation requires short lifespans or a public blocklist.');
  });

  it('resolves applicable Doctrine rules and inline examples into Ticket investigation evidence', async () => {
    // Create a target code file in typescript
    fs.writeFileSync(path.join(tmpDir, 'service.ts'), 'export function auth() {}');
    const file = await store.upsertEntity<FileNode>(FileNode.dcr, { id: 'service.ts', title: 'service.ts' });

    // Save a universal rule with importance 9 (mandatory) and inline examples
    await ruleStore.saveRule({
      id: 'rule-test-immutability',
      ruleId: 'arch.immutability',
      title: 'Enforce Immutability',
      type: 'architecture',
      scope: { kind: 'universal' },
      importance: 9,
      rule: 'State mutations must produce a new record rather than mutating in place.',
      status: 'active',
      examples: [
        {
          kind: 'positive',
          description: 'Use spread operator to return new object',
          lesson: 'Prevents unintended cache corruption.'
        }
      ],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'test'
    });

    // Save a draft rule (which should NOT be delivered for governance)
    await ruleStore.saveRule({
      id: 'rule-test-draft',
      ruleId: 'arch.draft-rule',
      title: 'Draft Rule',
      type: 'architecture',
      scope: { kind: 'universal' },
      importance: 5,
      rule: 'This is a draft experiment.',
      status: 'draft',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'test'
    });

    const t = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-2',
      title: 'Implement immutable service state',
      body: 'Maintain immutable state in service.',
      lane: 'Todo',
      acceptanceCriteria: ['Service state is immutable']
    });

    await store.relate(t, 'modifies', file);

    const result = await t.investigate(store);
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(JSON.stringify(result));

    const ruleEvidence = result.value.evidence.find(e => e.id === 'arch.immutability');
    expect(ruleEvidence).toBeDefined();
    expect(ruleEvidence!.kind).toBe('Rule');
    expect(ruleEvidence!.title).toBe('Enforce Immutability');
    expect(ruleEvidence!.body).toContain('State mutations must produce a new record');
    expect(ruleEvidence!.body).toContain('Examples:');
    expect(ruleEvidence!.body).toContain('[positive] Use spread operator to return new object -> Lesson: Prevents unintended cache corruption.');
    expect(ruleEvidence!.mandatory).toBe(true); // importance 9 >= 8
    expect(ruleEvidence!.provenance).toBe('Engineering Doctrine (universal)');

    // Ensure draft rule was NOT delivered
    const draftEvidence = result.value.evidence.find(e => e.id === 'arch.draft-rule');
    expect(draftEvidence).toBeUndefined();
  });

  it('delivers Decision operative fields and active rules to Product Intent context', async () => {
    const f = await store.upsertEntity<Feature>(Feature.dcr, {
      id: 'FEAT-AUTH',
      title: 'User Authentication Feature',
      body: 'Durable user authentication subsystem'
    });

    const d = await store.upsertEntity<Decision>(Decision.dcr, {
      id: 'DEC-PROD-1',
      title: 'OAuth2 Authorization Code Flow',
      decision: 'Adopt PKCE for all authorization code grants.',
      context: 'Native and SPA clients cannot securely store client secrets.',
      consequences: 'All clients must calculate code_verifier and code_challenge.'
    });

    await store.relate(d, 'governs', f);

    // Save a rule
    await ruleStore.saveRule({
      id: 'rule-prod-security',
      ruleId: 'sec.pkce',
      title: 'Mandatory PKCE',
      type: 'design',
      scope: { kind: 'universal' },
      importance: 10,
      rule: 'Always use PKCE for public clients.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'test'
    });

    const { context } = await buildIntentContext(f, store, {}, 'production', 1, 10);
    expect(context).toBeDefined();

    // Check Decision delivery
    const decisionItem = context.existing.find(e => e.id === 'DEC-PROD-1');
    expect(decisionItem).toBeDefined();
    expect(decisionItem!.kind).toBe('Decision');
    expect(typeof decisionItem!.body).toBe('string');
    expect(decisionItem!.body as string).toContain('Adopt PKCE for all authorization code grants.');
    expect(decisionItem!.body as string).toContain('Context: Native and SPA clients cannot securely store client secrets.');
    expect(decisionItem!.body as string).toContain('Consequences: All clients must calculate code_verifier and code_challenge.');

    // Check Rule delivery
    const ruleItem = context.existing.find(e => e.id === 'sec.pkce');
    expect(ruleItem).toBeDefined();
    expect(ruleItem!.kind).toBe('Rule');
    expect(ruleItem!.body as string).toContain('Always use PKCE for public clients.');
    expect(ruleItem!.mandatory).toBe(true);
  });

  it('builds SynthesisContext delivering accepted Aspects and Rule constraints with examples', async () => {
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-SYNTH',
      title: 'Update calculateTax',
      body: 'Calculate tax based on gross amount',
      lane: 'Todo',
      acceptanceCriteria: ['calculateTax applies 20% VAT to positive amounts']
    });

    const dossier: TicketDossier = {
      ticket: {
        id: 'TKT-SYNTH',
        title: ticket.title ?? 'TKT-SYNTH',
        body: ticket.body,
        status: ticket.status,
        lane: ticket.lane,
        acceptanceCriteria: ticket.acceptanceCriteria!
      },
      disposition: 'ready',
      rationale: 'Executable work',
      evidence: [
        {
          id: 'calculateTax',
          kind: 'SymbolNode',
          title: 'calculateTax',
          body: 'function calculateTax(amount: number): number',
          mandatory: true,
          exact: true,
          filePath: 'src/tax.ts',
          symbolName: 'calculateTax',
          source: 'export function calculateTax(amount: number): number { return amount * 0.15; }',
          provenance: 'Exact symbol target'
        },
        {
          id: 'rule.tax-precision',
          kind: 'Rule',
          title: 'Tax Precision Rule',
          body: 'All currency calculations must round to 2 decimal places.\nExamples:\n[positive] round(amount * 0.20, 2) -> Lesson: No floating point drift',
          mandatory: true,
          provenance: 'Engineering Doctrine (universal)'
        }
      ],
      completeness: { story: 'tax', criteria: [] } as any,
      aspects: {
        scopeId: 'TKT-SYNTH',
        aspects: [
          {
            id: 'ASP-FINANCIAL-ACCURACY',
            title: 'Financial Accuracy',
            status: 'accepted',
            criteria: ['All monetary math is tested against precision edge cases'],
            tickets: [],
            tests: [],
            artifacts: [],
            decisions: [],
            code: [],
            gaps: []
          }
        ],
        knownGaps: []
      },
      proposedEnrichments: { relations: [] },
      provenance: {
        systemOne: null,
        reasoningUsed: false,
        optionalCandidates: 0,
        optionalSelected: 0,
        freshnessReconciliations: 1
      }
    };

    const synthesisCtx = buildSynthesisContext({ dossier });
    expect(synthesisCtx).toBeDefined();

    // Check that aspect is delivered as mandatory because status is 'accepted'
    const aspectEvidence = synthesisCtx.evidence.find(e => e.id === 'aspect:ASP-FINANCIAL-ACCURACY');
    expect(aspectEvidence).toBeDefined();
    expect(aspectEvidence!.mandatory).toBe(true);
    expect(aspectEvidence!.role).toBe('aspect');

    // Check that Rule is delivered with role 'constraint' and carries inline examples
    const ruleEvidence = synthesisCtx.evidence.find(e => e.id === 'rule.tax-precision');
    expect(ruleEvidence).toBeDefined();
    expect(ruleEvidence!.role).toBe('constraint');
    expect(ruleEvidence!.fact).toContain('All currency calculations must round to 2 decimal places.');
    expect(ruleEvidence!.fact).toContain('Examples:');
    expect(ruleEvidence!.fact).toContain('[positive] round(amount * 0.20, 2) -> Lesson: No floating point drift');
    expect(ruleEvidence!.mandatory).toBe(true);
  });
});
