/**
 * Responsibility: Define types and Zod schemas for the Unified Engineering Doctrine Rule model.
 * Scope: Rule definition, scoping, examples, test specifications, and resolution types.
 */

import { z } from 'zod';

export const RuleTypeSchema = z.enum([
  'universal',
  'design',
  'architecture',
  'coding',
  'refactoring',
  'testing',
  'documentation'
]);
export type RuleType = z.infer<typeof RuleTypeSchema>;

export const RuleScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('universal') }),
  z.object({ kind: z.literal('project') }),
  z.object({ kind: z.literal('module'), moduleId: z.string().min(1) })
]);
export type RuleScope = z.infer<typeof RuleScopeSchema>;

export const RuleExampleSchema = z.object({
  kind: z.enum(['positive', 'negative', 'contrast']),
  description: z.string().min(1),
  lesson: z.string().min(1),
  filePath: z.string().optional(),
  symbolName: z.string().optional()
});
export type RuleExample = z.infer<typeof RuleExampleSchema>;

export const RuleReferenceSelectorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('declarationKinds'),
    kinds: z.array(z.string().min(1)).min(1),
    coverage: z.enum(['all', 'bounded']).default('bounded')
  }),
  z.object({
    kind: z.literal('exactSymbol'),
    symbol: z.string().min(1),
    filePath: z.string().optional()
  }),
  z.object({
    kind: z.literal('module'),
    modulePath: z.string().min(1)
  })
]);
export type RuleReferenceSelector = z.infer<typeof RuleReferenceSelectorSchema>;

export const RuleReferenceSnapshotSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{40}([a-f0-9]{24})?$/),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  coverage: z.enum(['all', 'bounded']),
  inventory: z.array(z.object({
    path: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/),
    declarations: z.array(z.object({name: z.string(), kind: z.string(), startLine: z.number().int(), endLine: z.number().int()}))
  })),
  excluded: z.array(z.string()),
  exemplars: z.array(z.object({
    path: z.string(), symbol: z.string(), source: z.string().max(8000),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/)
  })).max(8),
  limitations: z.array(z.string()),
  approved: z.boolean().default(false),
  exportable: z.boolean().default(false)
});
export type RuleReferenceSnapshot = z.infer<typeof RuleReferenceSnapshotSchema>;

export const RuleReferenceSchema = z.object({
  sourceType: z.literal('gitRepo'),
  locator: z.string().min(1),
  revision: z.string().min(1),
  selector: RuleReferenceSelectorSchema,
  purpose: z.string().min(1),
  required: z.boolean().optional(),
  snapshot: RuleReferenceSnapshotSchema.optional()
});
export type RuleReference = z.infer<typeof RuleReferenceSchema>;

export const RuleTestSchema = z.object({
  kind: z.enum(['llm', 'system1', 'codelet']),
  instruction: z.string().optional(),
  codeletName: z.string().optional()
});
export type RuleTest = z.infer<typeof RuleTestSchema>;

export const RuleSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().min(1),
  title: z.string().min(1).optional(),
  type: RuleTypeSchema.default('universal'),
  scope: RuleScopeSchema.default({ kind: 'universal' }),
  importance: z.number().int().min(1).max(10).default(5),
  rule: z.string().min(1),
  status: z.enum(['active', 'draft', 'disabled']).default('active'),
  disableReason: z.string().optional(),
  languages: z.array(z.string().min(1)).optional(),
  examples: z.array(RuleExampleSchema).default([]),
  references: z.array(RuleReferenceSchema).default([]),
  test: RuleTestSchema.default({ kind: 'llm' }),
  revision: z.number().int().positive().default(1),
  provenance: z.string().default('bundled-default')
});
export type RuleModel = z.infer<typeof RuleSchema>;

export const RulePackSchema = z.object({
  version: z.number().int().positive(),
  packName: z.string().min(1),
  rules: z.array(RuleSchema)
});
export type RulePack = z.infer<typeof RulePackSchema>;

export interface ResolvedRule {
  ruleId: string;
  effective: RuleModel;
  layers: RuleModel[];
  inheritedFrom?: 'universal' | 'project';
  isOverridden: boolean;
  isDisabled: boolean;
}
