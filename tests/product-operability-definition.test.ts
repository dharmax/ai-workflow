import {productReviewFixture} from './product-review-fixture.ts';
import {reviewedApply} from './product-review.ts';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Product, Feature, Goal, Concept, UserStory, ModuleNode, FileNode, SymbolNode } from '../src/graph/ontology.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { exportProductManifest, generateProductManifest, exportAuthoredState, restoreAuthoredState } from '../src/product/manifest.ts';
import { buildIntentContext, collectProductMeaning } from '../src/product/context.ts';
import { exportProjections, importProjections } from '../src/services/projection-service.ts';
import { indexSingleFile, ensureAstFresh } from '../src/graph/indexer.ts';
import type { ChangeRequest } from '../src/change/types.ts';
import { PUBLIC_MCP_TOOL_NAMES } from '../src/tools/surface.ts';

const binary = process.env.AIWF_PUBLIC_BINARY;
const cli = path.resolve(import.meta.dir, '../src/cli.ts');

describe('PC2: Product Definition & Manifest public acceptance journeys', () => {
  let stopReviewer: (()=>void) | undefined;
  let root: string;
  let store: WorkflowStore;
  let engine: CausalChangeEngine;

  const run = (...args: string[]) =>
    Bun.spawnSync(binary ? [binary, ...args] : ['bun', cli, ...args], { cwd: root, stderr: 'pipe' });

  const call = (name: string, params: Record<string, unknown>, authority: 'project-write' | 'read-only' = 'project-write') =>
    registry.execute(name, params, { store, projectRoot: root, executionAuthority: authority });

  const reopen = () => {
    store.close();
    store = new WorkflowStore(root);
    engine = new CausalChangeEngine({ store, projectRoot: root });
  };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-pc2-definition-'));
    store = new WorkflowStore(root);
    engine = new CausalChangeEngine({ store, projectRoot: root });
    initializeTools();
    stopReviewer=await productReviewFixture(store, false);
  });

  afterEach(() => {
    stopReviewer?.();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('Journey 1: Define, review, revise, reopen Product and Feature with identical canonical identity/revision', () => {
    it('defines Product and Feature through governed causal change, verifies manifest and detailed definition share identity, and handles revisions & negatives', async () => {
      // 1. Initial State: Product absence returns defined: false
      const initialProduct = await call('get_product', {});
      expect(initialProduct.defined).toBe(false);
      expect(initialProduct.product).toBeNull();

      // Manifest without Product reports no charter
      const initialManifest = await generateProductManifest(store);
      expect(initialManifest).toContain('No top-level Product charter defined yet');

      // 2. Define Product and Feature via preview -> accept
      const createReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_create',
            entityType: 'Product',
            id: 'PRODUCT',
            fields: {
              title: 'AI Workflow System',
              purpose: 'Governed AI engineering workflow and intent lifecycle',
              scope: 'Autonomous agent software engineering lifecycle',
              actors: ['Developer', 'Autonomous Agent'],
              nonGoals: ['Generic chat bot'],
              bounds: 'Single repository workspace',
              status: 'accepted'
            }
          },
          {
            kind: 'product_create',
            entityType: 'Feature',
            id: 'feat:charter',
            fields: {
              title: 'Product Definition & Manifest',
              body: 'Maintain canonical product intention and export verifiable product manifest',
              outcomes: ['Transparent product boundaries', 'Deterministic manifest projection'],
              scope: 'Product charter and top-level features',
              boundaries: 'Does not implement code without tasks',
              behavioralRules: ['All accepted features must have defined responsibility'],
              status: 'accepted'
            }
          },
          {
            kind: 'product_link',
            sourceId: 'PRODUCT',
            predicate: 'contains',
            targetId: 'feat:charter'
          }
        ]
      };

      const preview = await call('preview_change', createReq);
      expect(preview.blocked).toBe(false);
      expect(preview.fingerprint).toBeDefined();

      // Ensure preview was zero-mutation
      expect(await store.getEntity('PRODUCT', Product.dcr)).toBeNull();
      expect(await store.getEntity('feat:charter', Feature.dcr)).toBeNull();

      // Apply change
      const applyRes = await reviewedApply(store, {
        request: createReq,
        fingerprint: preview.fingerprint,
        decision: 'accept'
      });
      expect(applyRes.ok).toBe(true);

      // Reopen store to prove durability
      reopen();

      // 3. Inspect Product and Feature
      const prodView = await call('get_product', {});
      expect(prodView.defined).toBe(true);
      expect(prodView.product.id).toBe('PRODUCT');
      expect(prodView.product.title).toBe('AI Workflow System');
      expect(prodView.product.status).toBe('accepted');
      expect(prodView.product.actors).toEqual(['Developer', 'Autonomous Agent']);
      expect(prodView.features).toHaveLength(1);
      expect(prodView.features[0].id).toBe('feat:charter');

      const featView = await call('get_feature', { featureId: 'feat:charter' });
      expect(featView.id).toBe('feat:charter');
      expect(featView.title).toBe('Product Definition & Manifest');
      expect(featView.body).toBe('Maintain canonical product intention and export verifiable product manifest');
      expect(featView.outcomes).toEqual(['Transparent product boundaries', 'Deterministic manifest projection']);
      expect(featView.behavioralRules).toEqual(['All accepted features must have defined responsibility']);
      expect(featView.parentProduct).toBe('PRODUCT');

      // Export manifest and verify contents
      const manifestFile = await exportProductManifest(store, root);
      expect(fs.existsSync(manifestFile)).toBe(true);
      const manifestContent = fs.readFileSync(manifestFile, 'utf8');
      expect(manifestContent).toContain('## Product Charter: AI Workflow System');
      expect(manifestContent).toContain('Governed AI engineering workflow');
      expect(manifestContent).toContain('### feat:charter: Product Definition & Manifest');
      expect(manifestContent).toContain('Maintain canonical product intention');

      // 4. Revise Feature and Product in-place under the same identity
      const prodEntity = await store.getEntity<Product>('PRODUCT', Product.dcr);
      const featEntity = await store.getEntity<Feature>('feat:charter', Feature.dcr);
      expect(prodEntity).not.toBeNull();
      expect(featEntity).not.toBeNull();

      const updateReq: ChangeRequest = {
        action: 'product_change',
        basis: [
          { id: 'PRODUCT', entityType: 'Product', version: prodEntity!.version },
          { id: 'feat:charter', entityType: 'Feature', version: featEntity!.version }
        ],
        mutations: [
          {
            kind: 'product_update',
            entityType: 'Product',
            id: 'PRODUCT',
            fields: {
              title: 'AI Workflow System 2.0',
              scope: 'Autonomous agent software engineering lifecycle with Semantika'
            }
          },
          {
            kind: 'product_update',
            entityType: 'Feature',
            id: 'feat:charter',
            fields: {
              title: 'Product Definition & Manifest (revised)',
              body: 'Maintain canonical product intention, recoverable snapshot, and manifest'
            }
          }
        ]
      };

      const updatePreview = await call('preview_change', updateReq);
      expect(updatePreview.blocked).toBe(false);
      const updateApply = await reviewedApply(store, {
        request: updateReq,
        fingerprint: updatePreview.fingerprint,
        decision: 'accept'
      });
      expect(updateApply.ok).toBe(true);

      reopen();

      const updatedProd = await call('get_product', {});
      expect(updatedProd.product.title).toBe('AI Workflow System 2.0');
      expect(updatedProd.product.version).toBe(prodEntity!.version + 1);

      const updatedFeat = await call('get_feature', { featureId: 'feat:charter' });
      expect(updatedFeat.title).toBe('Product Definition & Manifest (revised)');
      expect(updatedFeat.body).toBe('Maintain canonical product intention, recoverable snapshot, and manifest');
      expect(updatedFeat.version).toBe(featEntity!.version + 1);

      // Verify manifest reflects revision
      const updatedManifest = await generateProductManifest(store);
      expect(updatedManifest).toContain('AI Workflow System 2.0');
      expect(updatedManifest).toContain('Product Definition & Manifest (revised)');

      // 5. Negative tests:
      // a) Product entity ID must be 'PRODUCT'
      const invalidProductReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_create',
            entityType: 'Product',
            id: 'CUSTOM_PRODUCT',
            fields: { title: 'Invalid Product' }
          }
        ]
      };
      const invalidProdPreview = await call('preview_change', invalidProductReq);
      expect(invalidProdPreview.blocked).toBe(true);
      expect(invalidProdPreview.blockReason).toContain("Product entity ID must be 'PRODUCT'");

      // b) Accepted Product requires purpose, scope, and at least one actor
      const incompleteProdReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_update',
            entityType: 'Product',
            id: 'PRODUCT',
            fields: { status: 'accepted', purpose: '', scope: '', actors: [] }
          }
        ]
      };
      const incompletePreview = await call('preview_change', incompleteProdReq);
      expect(incompletePreview.blocked).toBe(true);
      expect(incompletePreview.blockReason).toContain('requires purpose, scope, and at least one actor');

      // c) Accepted Feature requires nonblank responsibility (body)
      const incompleteFeatReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_create',
            entityType: 'Feature',
            id: 'feat:incomplete',
            fields: { title: 'Incomplete Feature', status: 'accepted', body: '' }
          }
        ]
      };
      const incompleteFeatPreview = await call('preview_change', incompleteFeatReq);
      expect(incompleteFeatPreview.blocked).toBe(true);
      expect(incompleteFeatPreview.blockReason).toContain('Accepted Feature requires nonblank responsibility (body)');

      // d) Physical deletion of Product is refused
      const deleteProductReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_delete',
            entityType: 'Product',
            id: 'PRODUCT'
          }
        ]
      };
      const deletePreview = await call('preview_change', deleteProductReq);
      expect(deletePreview.blocked).toBe(true);
      expect(deletePreview.blockReason).toContain('Physical deletion of Product singleton is not allowed');

      // e) Stale revision basis refusal
      const staleReq: ChangeRequest = {
        action: 'product_change',
        basis: [
          { id: 'PRODUCT', entityType: 'Product', version: 1 } // actual version is higher
        ],
        mutations: [
          {
            kind: 'product_update',
            entityType: 'Product',
            id: 'PRODUCT',
            fields: { title: 'Stale attempt' }
          }
        ]
      };
      const stalePreview = await call('preview_change', staleReq);
      expect(stalePreview.blocked).toBe(true);
      expect(stalePreview.blockReason).toContain('Stale product source revision');

      // f) Explicit rejection of a proposed Feature leaves canonical store unchanged
      const rejectReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_create',
            entityType: 'Feature',
            id: 'feat:rejected',
            fields: { title: 'Rejected Feature', body: 'Proposed then rejected', status: 'draft' }
          }
        ]
      };
      const rejectPreview = await call('preview_change', rejectReq);
      expect(rejectPreview.blocked).toBe(false);
      const rejectRes = await reviewedApply(store, {
        request: rejectReq,
        fingerprint: rejectPreview.fingerprint,
        decision: 'reject'
      });
      expect(rejectRes.ok).toBe(false);
      expect(rejectRes.error).toContain('rejected');
      expect(await store.getEntity('feat:rejected', Feature.dcr)).toBeNull();

      // g) An unreferenced Feature appears under Other Features in manifest rather than silent promotion
      const unlinkedReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_create',
            entityType: 'Feature',
            id: 'feat:standalone',
            fields: { title: 'Standalone Feature', body: 'Not part of top-level charter', status: 'draft' }
          }
        ]
      };
      const unlinkedPreview = await call('preview_change', unlinkedReq);
      await reviewedApply(store, { request: unlinkedReq, fingerprint: unlinkedPreview.fingerprint, decision: 'accept' });
      const manifestWithStandalone = await generateProductManifest(store);
      expect(manifestWithStandalone).toContain('## Other Features (Unlinked)');
      expect(manifestWithStandalone).toContain('**feat:standalone**: Standalone Feature');

      // h) TKT-EXT-SURFACE-10: Public MCP surface does not expose direct bypass mutators (define_product, update_product)
      expect(PUBLIC_MCP_TOOL_NAMES.has('define_product')).toBe(false);
      expect(PUBLIC_MCP_TOOL_NAMES.has('update_product')).toBe(false);
      expect(PUBLIC_MCP_TOOL_NAMES.has('link')).toBe(true);
      expect(PUBLIC_MCP_TOOL_NAMES.has('get_product')).toBe(true);

      // i) TKT-EXT-SURFACE-10: Read-only / external agent without project-write authority cannot apply changes even with decision: accept
      const unauthorizedReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_create',
            entityType: 'Feature',
            id: 'feat:unauthorized',
            fields: { title: 'Unauthorized Feature', body: 'Should not write', status: 'draft' }
          }
        ]
      };
      const unauthPreview = await call('preview_change', unauthorizedReq);
      expect(unauthPreview.blocked).toBe(false);
      await expect(call('apply_change', {
        request: unauthorizedReq,
        fingerprint: unauthPreview.fingerprint,
        decision: 'accept'
      }, 'read-only')).rejects.toThrow(/project-write/);
      expect(await store.getEntity('feat:unauthorized', Feature.dcr)).toBeNull();
    });
  });

  describe('Journey 2: Real downstream consumer uses accepted Product/Feature meaning', () => {
    it('delivers approved Product and Feature charter context into buildIntentContext and collectProductMeaning without duplicate work or auto-acceptance', async () => {
      // Create Product and Feature
      const req: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_create',
            entityType: 'Product',
            id: 'PRODUCT',
            fields: {
              title: 'Governed Workflow',
              purpose: 'Provide rigorous governed AI coding workflows',
              scope: 'Developer tooling and deterministic state graphs',
              actors: ['Engineer'],
              status: 'accepted'
            }
          },
          {
            kind: 'product_create',
            entityType: 'Feature',
            id: 'feat:synthesis',
            fields: {
              title: 'Code Synthesis',
              body: 'Synthesize code aligned with product intent and architecture rules',
              outcomes: ['High quality code generation'],
              status: 'accepted'
            }
          },
          {
            kind: 'product_create',
            entityType: 'UserStory',
            id: 'story:synth-prompt',
            fields: {
              title: 'Prompt synthesis context',
              actor: 'Engineer',
              intent: 'Supply intent context to synthesizer',
              initialState: 'Product charter exists',
              action: 'Build intent context',
              expectedResult: 'Product purpose and feature responsibility are delivered',
              exceptions: 'Missing intent returns empty context',
              bounds: 'Single workspace',
              status: 'accepted'
            }
          },
          {
            kind: 'product_link',
            sourceId: 'PRODUCT',
            predicate: 'contains',
            targetId: 'feat:synthesis'
          },
          {
            kind: 'product_link',
            sourceId: 'feat:synthesis',
            predicate: 'enables',
            targetId: 'story:synth-prompt'
          }
        ]
      };

      const preview = await call('preview_change', req);
      expect(preview.blocked).toBe(false);
      await reviewedApply(store, { request: req, fingerprint: preview.fingerprint, decision: 'accept' });
      reopen();

      // 1. collectProductMeaning consumes Feature and Product charter provenance
      const story = await store.getEntity<UserStory>('story:synth-prompt', UserStory.dcr);
      expect(story).not.toBeNull();
      const meanings = await collectProductMeaning([story!], store, true);
      const featureMeanings = meanings.filter(m => m.entity instanceof Feature);
      expect(featureMeanings).toHaveLength(1);
      expect(store.localId(featureMeanings[0].entity.id)).toBe('feat:synthesis');
      expect((featureMeanings[0].entity as Feature).title).toBe('Code Synthesis');
      expect((featureMeanings[0].entity as Feature).body).toBe('Synthesize code aligned with product intent and architecture rules');

      // 2. buildIntentContext delivers Product charter and Feature meanings to downstream consumer
      const { context } = await buildIntentContext(story!, store, {}, 'concept' as any, 0, 10);
      const charterItem = context.existing.find(item => item.id === 'PRODUCT');
      expect(charterItem).toBeDefined();
      expect(charterItem!.title).toBe('Governed Workflow');
      expect(charterItem!.body).toContain('Purpose: Provide rigorous governed AI coding workflows');
      expect(charterItem!.body).toContain('Scope: Developer tooling and deterministic state graphs');
      expect(charterItem!.body).toContain('Actors: Engineer');

      const featureItem = context.existing.find(item => item.id === 'feat:synthesis');
      expect(featureItem).toBeDefined();
      expect(featureItem!.title).toBe('Code Synthesis');
      expect(featureItem!.body).toBe('Synthesize code aligned with product intent and architecture rules');
    });
  });

  describe('Journey 3: Module intention survives incremental source refresh/reopen, export generates manifest & snapshot, fresh project recovery', () => {
    it('preserves module intent across file re-indexing and reopen, exports manifest/snapshot via sync, and recovers authored state in a clean workspace', async () => {
      // 1. Set up an indexed file and module
      const srcDir = path.join(root, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const sampleFile = path.join(srcDir, 'sample.ts');
      fs.writeFileSync(sampleFile, 'export function computeTotal(a: number, b: number): number { return a + b; }\n');

      // Index file to create module and symbol
      await indexSingleFile(store, sampleFile, 'src/sample.ts', root);
      const modId = 'mod:src/sample';
      const mod = await store.getEntity<ModuleNode>(modId, ModuleNode.dcr);
      expect(mod).not.toBeNull();

      // 2. Author Module Intent via product_update
      const modReq: ChangeRequest = {
        action: 'product_change',
        mutations: [
          {
            kind: 'product_update',
            entityType: 'Module',
            id: modId,
            fields: {
              body: 'Core calculation utilities and mathematical operations',
              responsibilities: ['Accurate arithmetic calculation', 'Integer and float summing'],
              boundaries: 'No IO or network operations',
              intentStatus: 'accepted'
            }
          },
          {
            kind: 'product_create',
            entityType: 'Product',
            id: 'PRODUCT',
            fields: {
              title: 'Calculation Platform',
              purpose: 'Deterministic mathematical calculation engine',
              scope: 'High precision math',
              actors: ['Analyst'],
              status: 'accepted'
            }
          },
          {
            kind: 'product_create',
            entityType: 'Feature',
            id: 'feat:math',
            fields: {
              title: 'Math Utilities',
              body: 'Deliver fast math routines',
              status: 'accepted'
            }
          },
          {
            kind: 'product_link',
            sourceId: 'PRODUCT',
            predicate: 'contains',
            targetId: 'feat:math'
          }
        ]
      };

      const modPreview = await call('preview_change', modReq);
      expect(modPreview.blocked).toBe(false);
      await reviewedApply(store, { request: modReq, fingerprint: modPreview.fingerprint, decision: 'accept' });
      reopen();

      // Verify module intent is recorded
      const modBefore = await store.getEntity<ModuleNode>(modId, ModuleNode.dcr);
      expect(modBefore!.body).toBe('Core calculation utilities and mathematical operations');
      expect(modBefore!.responsibilities).toEqual(['Accurate arithmetic calculation', 'Integer and float summing']);
      expect(modBefore!.boundaries).toBe('No IO or network operations');
      expect(modBefore!.intentStatus).toBe('accepted');

      // 3. Update the source file on disk and re-index
      fs.writeFileSync(
        sampleFile,
        'export function computeTotal(a: number, b: number): number { return a + b; }\nexport function subtract(a: number, b: number): number { return a - b; }\n'
      );

      // Incremental freshness / re-index
      const freshRes = await ensureAstFresh(store, root);
      expect(freshRes.updatedFiles).toContain('src/sample.ts');

      // Reopen and assert Module Intent survived re-indexing intact
      reopen();
      const modAfter = await store.getEntity<ModuleNode>(modId, ModuleNode.dcr);
      expect(modAfter!.body).toBe('Core calculation utilities and mathematical operations');
      expect(modAfter!.responsibilities).toEqual(['Accurate arithmetic calculation', 'Integer and float summing']);
      expect(modAfter!.boundaries).toBe('No IO or network operations');
      expect(modAfter!.intentStatus).toBe('accepted');

      // 4. Test exportProjections: exports modules.md (with Module Intent), product-manifest.md, and authored-snapshot.json
      const expRes = await exportProjections(store, root);
      expect(expRes.exportedFiles).toContain('product-manifest.md');
      expect(expRes.exportedFiles).toContain('.ai-workflow/authored-snapshot.json');
      expect(expRes.exportedFiles).toContain('modules.md');

      // Check modules.md content
      const modulesMd = fs.readFileSync(path.join(root, 'modules.md'), 'utf8');
      expect(modulesMd).toContain('## Module Intent');
      expect(modulesMd).toContain('### `mod:src/sample`');
      expect(modulesMd).toContain('Core calculation utilities and mathematical operations');
      expect(modulesMd).toContain('Accurate arithmetic calculation');

      // Check product-manifest.md content
      const manifestMd = fs.readFileSync(path.join(root, 'product-manifest.md'), 'utf8');
      expect(manifestMd).toContain('## Product Charter: Calculation Platform');
      expect(manifestMd).toContain('### feat:math: Math Utilities');

      // Check authored-snapshot.json content
      const snapshotFile = path.join(root, '.ai-workflow', 'authored-snapshot.json');
      expect(fs.existsSync(snapshotFile)).toBe(true);
      const snapshotData = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
      expect(snapshotData.version).toBe(1);
      expect(snapshotData.entities.some((e: any) => e.kind === 'Product' && e.id === 'PRODUCT')).toBe(true);
      expect(snapshotData.entities.some((e: any) => e.kind === 'Feature' && e.id === 'feat:math')).toBe(true);
      expect(snapshotData.entities.some((e: any) => e.kind === 'Module' && e.id === modId)).toBe(true);
      expect(snapshotData.relations.some((r: any) => r.sourceId === 'PRODUCT' && r.predicate === 'contains' && r.targetId === 'feat:math')).toBe(true);

      // 5. Demonstrate fresh project recovery from authored-snapshot.json
      const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-pc2-restore-'));
      const freshStore = new WorkflowStore(freshRoot);
      try {
        const restoreRes = await restoreAuthoredState(freshStore, snapshotData);
        expect(restoreRes.restoredEntities).toBeGreaterThanOrEqual(3);
        expect(restoreRes.restoredRelations).toBeGreaterThanOrEqual(1);

        // Verify recovered state in fresh project
        const recoveredProduct = await freshStore.getEntity<Product>('PRODUCT', Product.dcr);
        expect(recoveredProduct).not.toBeNull();
        expect(recoveredProduct!.title).toBe('Calculation Platform');
        expect(recoveredProduct!.purpose).toBe('Deterministic mathematical calculation engine');

        const recoveredFeature = await freshStore.getEntity<Feature>('feat:math', Feature.dcr);
        expect(recoveredFeature).not.toBeNull();
        expect(recoveredFeature!.title).toBe('Math Utilities');

        const recoveredModule = await freshStore.getEntity<ModuleNode>(modId, ModuleNode.dcr);
        expect(recoveredModule).not.toBeNull();
        expect(recoveredModule!.body).toBe('Core calculation utilities and mathematical operations');
        expect(recoveredModule!.responsibilities).toEqual(['Accurate arithmetic calculation', 'Integer and float summing']);

        // Verify recovered mode 'H' relations
        const recoveredEdges = await freshStore.getOutgoing(recoveredProduct!.id, 'contains');
        expect(recoveredEdges).toHaveLength(1);
        expect(freshStore.localId(recoveredEdges[0].targetId)).toBe('feat:math');
      } finally {
        freshStore.close();
        fs.rmSync(freshRoot, { recursive: true, force: true });
      }
    });
  });
});
