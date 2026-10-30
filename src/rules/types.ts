/**
 * Responsibility: Define Rule pack exchange and effective resolution contracts.
 * Scope: Pack structure, resolved layers and existing exports of Rule-owned field contracts.
 */
import { z } from 'zod';
import { RuleSchema, type RuleModel } from '../model/rule.ts';
export { RuleTypeSchema, RuleScopeSchema, RuleExampleSchema, RuleReferenceSelectorSchema, RuleReferenceSnapshotSchema, RuleReferenceSchema, RuleTestSchema, RuleSchema } from '../model/rule.ts';
export type { RuleType, RuleScope, RuleExample, RuleReferenceSelector, RuleReferenceSnapshot, RuleReference, RuleTest, RuleModel } from '../model/rule.ts';

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
