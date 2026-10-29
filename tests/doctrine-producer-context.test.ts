import {createAspect,acceptProduct} from './product-review.ts';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, Feature, UserStory, Aspect, Decision, FileNode, SymbolNode, ModuleNode } from '../src/model/ontology.ts';
import { RuleStore } from '../src/rules/store.ts';
import { buildSynthesisContext } from '../src/helpers/synthesis/context-builder.ts';
import { buildIntentContext } from '../src/product/context.ts';
import { initializeTools } from '../src/tools/index.ts';
import type { TicketDossier } from '../src/ticket-operation-types.ts';
import type { Asker } from '@dharmax/llm-utils';
import type { SynthesisEvidence, VerificationExpectation } from '../src/helpers/synthesis/types.ts';
import { renderImplementationGoal } from '../src/ticket/prompts.ts';

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

    const d = await store.sp.createEntity<Decision>(Decision.dcr, {
      id:store.formatId(Decision.dcr,"DEC-1"),_id:store.formatId(Decision.dcr,"DEC-1"),
      title: 'Use Stateless JWT',
      decision: 'We will use asymmetric RSA-256 signed JWT tokens.',
      context: 'Microservices need to verify identity without a central session DB.',
      consequences: 'Token revocation requires short lifespans or a public blocklist.'
    },true,false);

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

    const d = await store.sp.createEntity<Decision>(Decision.dcr, {
      id:store.formatId(Decision.dcr,"DEC-PROD-1"),_id:store.formatId(Decision.dcr,"DEC-PROD-1"),
      title: 'OAuth2 Authorization Code Flow',
      decision: 'Adopt PKCE for all authorization code grants.',
      context: 'Native and SPA clients cannot securely store client secrets.',
      consequences: 'All clients must calculate code_verifier and code_challenge.'
    },true,false);

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

    // Check that aspect is delivered as mandatory because status is 'accepted' and includes criteria
    const aspectEvidence = synthesisCtx.evidence.find(e => e.id === 'aspect:ASP-FINANCIAL-ACCURACY');
    expect(aspectEvidence).toBeDefined();
    expect(aspectEvidence!.mandatory).toBe(true);
    expect(aspectEvidence!.role).toBe('aspect');
    expect(aspectEvidence!.fact).toContain('Criteria:\n- All monetary math is tested against precision edge cases');

    // Check that accepted Aspect criteria are delivered to verification expectations
    const aspectVerification = synthesisCtx.verification.find(v => v.id === 'aspect-ASP-FINANCIAL-ACCURACY-cr-1');
    expect(aspectVerification).toBeDefined();
    expect(aspectVerification!.mandatory).toBe(true);
    expect(aspectVerification!.criterion).toBe('All monetary math is tested against precision edge cases');
    expect(aspectVerification!.provenance).toBe('Governing Aspect ASP-FINANCIAL-ACCURACY criterion 1');

    // Check that Rule is delivered with role 'constraint' and carries inline examples
    const ruleEvidence = synthesisCtx.evidence.find(e => e.id === 'rule.tax-precision');
    expect(ruleEvidence).toBeDefined();
    expect(ruleEvidence!.role).toBe('constraint');
    expect(ruleEvidence!.fact).toContain('All currency calculations must round to 2 decimal places.');
    expect(ruleEvidence!.fact).toContain('Examples:');
    expect(ruleEvidence!.fact).toContain('[positive] round(amount * 0.20, 2) -> Lesson: No floating point drift');
    expect(ruleEvidence!.mandatory).toBe(true);
  });

  it('delivers real Ticket governance to implementation and synthesis payloads without promoting candidates', async () => {
    const { HostSourceSynthesizer } = await import('../src/helpers/synthesis/synthesizer.ts');

    // 1. Author source file with exact target
    const targetFile = 'calc.ts';
    const initialSource = 'export function addTax(subtotal: number): number {\n  return subtotal * 1.2;\n}\n';
    fs.writeFileSync(path.join(tmpDir, targetFile), initialSource);
    const fileNode = await store.upsertEntity<FileNode>(FileNode.dcr, {
      id: targetFile,
      title: targetFile
    });

    // 2. Author mandatory Rule with positive & negative inline examples
    await ruleStore.saveRule({
      id: 'rule-test-rounding',
      ruleId: 'fin.rounding',
      title: 'Financial Rounding Precision',
      type: 'architecture',
      scope: { kind: 'universal' },
      importance: 9,
      rule: 'All tax operations must use round-half-even arithmetic to two decimal places.',
      status: 'active',
      examples: [
        {
          kind: 'positive',
          description: 'Use roundHalfEven(subtotal * 1.2, 2)',
          lesson: 'Avoids cumulative upward rounding bias.'
        },
        {
          kind: 'negative',
          description: 'Math.round(subtotal * 1.2)',
          lesson: 'Biases final ledger totals.'
        }
      ],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'doctrine'
    });

    // 3. Author an accepted Aspect with criteria, and a draft Aspect with criteria
    const acceptedAspect = await store.upsertEntity<Aspect>(Aspect.dcr, {
      id: 'ASP-GOV-1',
      title: 'Monetary Integrity',
      body: 'Guarantees strict auditability and rounding compliance.',
      status: 'accepted',
      acceptanceCriteria: [
        'All calculations round to 2 decimal places',
        'Negative subtotals throw an InvalidTaxInputError'
      ]
    });

    const draftAspect = await store.upsertEntity<Aspect>(Aspect.dcr, {
      id: 'ASP-DRAFT-2',
      title: 'Telemetry & Latency Tracking',
      body: 'Experimental telemetry aspect.',
      status: 'draft',
      acceptanceCriteria: [
        'Log calculation duration in microseconds'
      ]
    });

    const proposedAspect = await createAspect(store,{
      id: 'ASP-PROPOSED', title: 'Proposed caching', status: 'proposed',
      acceptanceCriteria: ['Cache every tax calculation']
    });
    const feature = await store.upsertEntity<Feature>(Feature.dcr, {
      id: 'FEAT-TAX', title: 'Tax calculation'
    });
    await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(acceptedAspect.id),predicate:"applies_to",targetId:store.localId(feature.id)}]);
    await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(draftAspect.id),predicate:"applies_to",targetId:store.localId(feature.id)}]);
    await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(proposedAspect.id),predicate:"applies_to",targetId:store.localId(feature.id)}]);
    const decision = await store.sp.createEntity<Decision>(Decision.dcr, {
      id:store.formatId(Decision.dcr,"DEC-TAX"),_id:store.formatId(Decision.dcr,"DEC-TAX"), title: 'Tax arithmetic',
      decision: 'Use decimal arithmetic for tax calculations.',
      context: 'Ledger totals must be auditable.',
      consequences: 'Binary floating point arithmetic is unsuitable.'
    },true,false);
    await store.relate(decision, 'governs', acceptedAspect);

    // 4. Author Ticket with relations
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
      id: 'TKT-CALC-TAX',
      title: 'Apply precision tax calculation',
      body: 'Update addTax to strictly enforce rounding and error bounds.',
      lane: 'In Progress',
      acceptanceCriteria: ['addTax returns rounded sum with exactly two decimals']
    });

    await store.relate(ticket, 'modifies', fileNode);
    await store.relate(ticket, 'addresses', acceptedAspect);
    await store.relate(ticket, 'addresses', draftAspect);
    await store.relate(ticket, 'addresses', proposedAspect);
    await store.relate(ticket, 'implements', feature);
    await store.relate(decision, 'governs', ticket);

    // 5. Investigate Ticket via native AIWF investigation
    const invResult = await ticket.investigate(store);
    expect(invResult.status).toBe('complete');
    if (invResult.status !== 'complete') throw new Error(JSON.stringify(invResult));
    const dossier = invResult.value;
    expect((await ticket.applicableAspects(store)).map(a => store.localId(a.id))).toEqual(['ASP-GOV-1']);
    expect(dossier.aspects.aspects.map(a => a.id)).toEqual(['ASP-GOV-1']);
    expect(dossier.evidence.find(e => e.id === 'ASP-PROPOSED')).toMatchObject({ mandatory: false });
    const operativeDecision = [
      decision.decision!, `Context: ${decision.context}`, `Consequences: ${decision.consequences}`
    ];
    const actorGoal = renderImplementationGoal(tmpDir, [targetFile], dossier, []);
    const actorDossier: TicketDossier = JSON.parse(
      actorGoal.split('Ticket dossier: ')[1].split(' Verification feedback: ')[0]
    );
    expect(actorDossier.evidence.find(e => e.id === 'ASP-GOV-1')).toMatchObject({
      mandatory: true, provenance: 'Governing Aspect'
    });
    for (const criterion of acceptedAspect.acceptanceCriteria!) expect(actorGoal).toContain(criterion);
    expect(actorDossier.aspects.aspects.map(a => a.id)).toEqual(['ASP-GOV-1']);
    for (const candidateId of ['ASP-DRAFT-2', 'ASP-PROPOSED']) {
      expect(actorDossier.evidence.find(e => e.id === candidateId)).toMatchObject({
        mandatory: false, provenance: 'Applicable Aspect (candidate)'
      });
    }
    for (const field of operativeDecision) expect(actorGoal).toContain(field);
    expect(actorDossier.evidence.find(e => e.id === 'DEC-TAX')?.mandatory).toBe(true);
    expect(actorDossier.evidence.find(e => e.id === 'fin.rounding')).toMatchObject({ mandatory: true });
    expect(actorGoal).toContain('[positive] Use roundHalfEven(subtotal * 1.2, 2)');
    expect(actorGoal).toContain('[negative] Math.round(subtotal * 1.2)');

    // Verify dossier aspects & rules
    const acceptedAspectEvidence = dossier.evidence.find(e => e.id === 'ASP-GOV-1');
    expect(acceptedAspectEvidence).toBeDefined();
    expect(acceptedAspectEvidence!.mandatory).toBe(true);
    expect(acceptedAspectEvidence!.provenance).toBe('Governing Aspect');
    expect(acceptedAspectEvidence!.body).toContain('Acceptance Criteria:');
    expect(acceptedAspectEvidence!.body).toContain('- All calculations round to 2 decimal places');

    const draftAspectEvidence = dossier.evidence.find(e => e.id === 'ASP-DRAFT-2');
    expect(draftAspectEvidence).toBeDefined();
    expect(draftAspectEvidence!.mandatory).toBe(false);
    expect(draftAspectEvidence!.provenance).toBe('Applicable Aspect (candidate)');

    const ruleEvidence = dossier.evidence.find(e => e.id === 'fin.rounding');
    expect(ruleEvidence).toBeDefined();
    expect(ruleEvidence!.mandatory).toBe(true);
    expect(ruleEvidence!.body).toContain('round-half-even arithmetic');
    expect(ruleEvidence!.body).toContain('[positive] Use roundHalfEven(subtotal * 1.2, 2)');

    // 6. Build synthesis context from the real dossier (with explicit target)
    const synthCtx = buildSynthesisContext({
      dossier,
      target: {
        kind: 'existing_symbol',
        filePath: targetFile,
        symbolName: 'addTax',
        existingSource: initialSource
      }
    });

    // Verify verification expectations in synthesis context:
    // Ticket AC + accepted Aspect criteria (draft Aspect criteria must NOT be mandatory verification expectations)
    const verifExpectations = synthCtx.verification;
    expect(verifExpectations.some(v => v.id === 'ac-1' && v.mandatory)).toBe(true);
    expect(verifExpectations.some(v => v.id === 'aspect-ASP-GOV-1-cr-1' && v.mandatory)).toBe(true);
    expect(verifExpectations.some(v => v.id === 'aspect-ASP-GOV-1-cr-2' && v.mandatory)).toBe(true);
    expect(verifExpectations.some(v => v.id.includes('ASP-DRAFT-2'))).toBe(false);

    // 7. Execute HostSourceSynthesizer with a mock asker and inspect the captured user prompt payload
    let capturedUserPrompt = '';
    let capturedSystemPrompt = '';
    const mockAsker = {
      json: async (prompt: string, _schema: unknown, options?: { system?: string }) => {
        capturedUserPrompt = prompt;
        capturedSystemPrompt = options?.system ?? '';
        return {
          ok: true,
          data: {
            source: 'export function addTax(subtotal: number): number {\n  return Number((subtotal * 1.2).toFixed(2));\n}',
            assumptions: ['Rounding uses standard banking precision']
          }
        };
      }
    };

    const synthesizer = new HostSourceSynthesizer(mockAsker as unknown as Asker);
    const candidate = await synthesizer.synthesize(synthCtx);
    expect(candidate.source).toContain('addTax');

    // Parse the captured payload JSON
    expect(capturedSystemPrompt).toContain('Respect all mandatory evidence');
    const payload: {
      target: { filePath: string; symbolName: string };
      evidence: Array<Pick<SynthesisEvidence, 'id' | 'role' | 'mandatory' | 'fact'>>;
      verification: Array<Pick<VerificationExpectation, 'id' | 'criterion'>>;
    } = JSON.parse(capturedUserPrompt);
    const decisionPayload = payload.evidence.find(e => e.id === 'DEC-TAX')!;
    expect(decisionPayload).toMatchObject({ role: 'decision', mandatory: true });
    for (const field of operativeDecision) expect(decisionPayload.fact).toContain(field);
    expect(payload.target.filePath).toBe(targetFile);
    expect(payload.target.symbolName).toBe('addTax');

    // Assert governing evidence payload includes accepted Aspect and mandatory Rule with examples
    const govAspectInPayload = payload.evidence.find(e => e.id === 'aspect:ASP-GOV-1')!;
    expect(govAspectInPayload).toBeDefined();
    expect(govAspectInPayload.mandatory).toBe(true);
    expect(govAspectInPayload.fact).toContain('Criteria:');
    expect(govAspectInPayload.fact).toContain('All calculations round to 2 decimal places');

    // Draft Aspect in payload is advisory only
    expect(payload.evidence.some(e => e.id === 'aspect:ASP-DRAFT-2')).toBe(false);
    expect(payload.evidence.find(e => e.id === 'ASP-PROPOSED')?.mandatory).toBe(false);
    const draftAspectInPayload = payload.evidence.find(e => e.id === 'ASP-DRAFT-2')!;
    expect(draftAspectInPayload).toBeDefined();
    expect(draftAspectInPayload.mandatory).toBe(false);

    // Mandatory Rule in payload carries text and examples
    const ruleInPayload = payload.evidence.find(e => e.id === 'fin.rounding')!;
    expect(ruleInPayload).toBeDefined();
    expect(ruleInPayload.mandatory).toBe(true);
    expect(ruleInPayload.fact).toContain('round-half-even arithmetic');
    expect(ruleInPayload.fact).toContain('[positive] Use roundHalfEven(subtotal * 1.2, 2)');
    expect(ruleInPayload.fact).toContain('[negative] Math.round(subtotal * 1.2)');

    // Assert verification criteria in payload includes ticket AC and accepted Aspect criteria
    const verifCriteria = payload.verification.map(v => v.criterion);
    expect(verifCriteria).toContain('addTax returns rounded sum with exactly two decimals');
    expect(verifCriteria).toContain('All calculations round to 2 decimal places');
    expect(verifCriteria).toContain('Negative subtotals throw an InvalidTaxInputError');
    expect(verifCriteria).not.toContain('Log calculation duration in microseconds');
  });
});
