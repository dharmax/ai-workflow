/**
 * Responsibility: Rule persistence, scoped override resolution, bundled defaults installation, and startup checks.
 * Scope: Manages Rule entities within Semantika WorkflowStore; resolves effective rules across universal, project, and module scopes.
 */

import { WorkflowStore } from '../graph/store.ts';
import { Rule } from '../graph/ontology.ts';
import {
  RuleSchema,
  RulePackSchema,
  type RuleModel,
  type RulePack,
  type ResolvedRule,
  type RuleScope
} from './types.ts';
import defaultsData from './defaults.json' with { type: 'json' };

export class RuleStore {
  constructor(public readonly store: WorkflowStore) {}

  /**
   * Generates a stable graph entity ID for a Rule layer: <ruleId>__<scopeKind>__<scopeId>
   * This guarantees that default, project, and module overrides never share the same database key.
   */
  static entityIdForScope(ruleId: string, scope: RuleScope): string {
    const scopeId = scope.kind === 'universal' ? 'universal' : scope.kind === 'project' ? scope.projectId : scope.moduleId;
    const sanitizedRuleId = ruleId.replace(/[^a-zA-Z0-9.-]/g, '-');
    const sanitizedScopeId = scopeId.replace(/[^a-zA-Z0-9.-]/g, '-');
    return `${sanitizedRuleId}__${scope.kind}__${sanitizedScopeId}`;
  }

  /**
   * Parse and validate a raw rule record according to RuleSchema.
   */
  static validateRule(raw: unknown): RuleModel {
    return RuleSchema.parse(raw);
  }

  /**
   * Save or update an individual Rule in the graph.
   */
  async saveRule(model: RuleModel): Promise<Rule> {
    const validated = RuleStore.validateRule(model);
    const entityId = RuleStore.entityIdForScope(validated.ruleId, validated.scope);
    
    const payload = {
      ...validated,
      id: entityId,
      _id: entityId,
      title: validated.title ?? validated.ruleId
    };

    return this.store.upsertEntity<Rule>(Rule.dcr, payload);
  }

  /**
   * Retrieve a specific Rule entity by ruleId and scope.
   */
  async getRule(ruleId: string, scope: RuleScope): Promise<RuleModel | null> {
    const entityId = RuleStore.entityIdForScope(ruleId, scope);
    const entity = await this.store.getEntity<Rule>(entityId, Rule.dcr);
    if (!entity) return null;
    return this.entityToModel(entity);
  }

  /**
   * List all stored Rule entities across all scopes.
   */
  async listAllRules(): Promise<RuleModel[]> {
    const entities = await this.store.listEntities<Rule>(Rule.dcr);
    return entities.map(e => this.entityToModel(e));
  }

  /**
   * Converts a Semantika Rule entity to a validated RuleModel.
   */
  private entityToModel(entity: Rule): RuleModel {
    return RuleSchema.parse({
      id: this.store.localId(entity.id),
      ruleId: entity.ruleId || this.store.localId(entity.id).split('__')[0],
      title: entity.title,
      type: entity.type,
      scope: entity.scope,
      importance: entity.importance,
      rule: entity.rule,
      status: entity.status,
      disableReason: entity.disableReason,
      languages: entity.languages,
      examples: entity.examples ?? [],
      references: entity.references ?? [],
      test: entity.test,
      revision: entity.revision ?? 1,
      provenance: entity.provenance ?? 'unknown'
    });
  }

  /**
   * Resolves the effective rule definition for a given ruleId and target scope context.
   * Precedence order: module scope > project scope > universal default.
   */
  async resolveRule(ruleId: string, context: { projectId?: string; moduleId?: string } = {}): Promise<ResolvedRule | null> {
    const all = await this.listAllRules();
    const candidates = all.filter(r => r.ruleId === ruleId);
    if (candidates.length === 0) return null;

    let universal = candidates.find(r => r.scope.kind === 'universal');
    let project = context.projectId
      ? candidates.find(r => r.scope.kind === 'project' && r.scope.projectId === context.projectId)
      : candidates.find(r => r.scope.kind === 'project');
    let moduleCandidate = context.moduleId
      ? candidates.find(r => r.scope.kind === 'module' && r.scope.moduleId === context.moduleId)
      : undefined;

    const layers: RuleModel[] = [];
    if (universal) layers.push(universal);
    if (project) layers.push(project);
    if (moduleCandidate) layers.push(moduleCandidate);

    const effective = moduleCandidate ?? project ?? universal;
    if (!effective) return null;

    const inheritedFrom = moduleCandidate
      ? (project ? 'project' : universal ? 'universal' : undefined)
      : (project && universal ? 'universal' : undefined);

    const isOverridden = layers.length > 1;
    const isDisabled = effective.status === 'disabled';

    return {
      ruleId,
      effective,
      layers,
      inheritedFrom,
      isOverridden,
      isDisabled
    };
  }

  /**
   * Resolves all active effective rules applicable to a given target context.
   */
  async resolveAllRules(context: { projectId?: string; moduleId?: string; language?: string } = {}): Promise<ResolvedRule[]> {
    const all = await this.listAllRules();
    const ruleIds = [...new Set(all.map(r => r.ruleId))].sort();

    const resolved: ResolvedRule[] = [];
    for (const ruleId of ruleIds) {
      const res = await this.resolveRule(ruleId, context);
      if (!res) continue;

      // Filter by language if specified on the rule
      if (context.language && res.effective.languages && res.effective.languages.length > 0) {
        if (!res.effective.languages.includes(context.language)) {
          continue;
        }
      }

      resolved.push(res);
    }

    return resolved;
  }

  /**
   * Verify whether bundled defaults are installed.
   */
  async checkDefaultsInstalled(): Promise<{ complete: boolean; missingRuleIds: string[]; installedCount: number; expectedCount: number }> {
    const pack = RulePackSchema.parse(defaultsData);
    const existing = await this.listAllRules();
    const existingUniversalIds = new Set(
      existing.filter(r => r.scope.kind === 'universal').map(r => r.ruleId)
    );

    const missingRuleIds = pack.rules
      .map(r => r.ruleId)
      .filter(id => !existingUniversalIds.has(id));

    return {
      complete: missingRuleIds.length === 0,
      missingRuleIds,
      installedCount: pack.rules.length - missingRuleIds.length,
      expectedCount: pack.rules.length
    };
  }

  /**
   * Ensure bundled defaults are installed in the graph.
   * Preserves any existing project or module overrides.
   */
  async installDefaults(): Promise<{ installed: number; skipped: number }> {
    const pack = RulePackSchema.parse(defaultsData);
    let installed = 0;
    let skipped = 0;

    for (const rule of pack.rules) {
      const existing = await this.getRule(rule.ruleId, { kind: 'universal' });
      if (!existing) {
        await this.saveRule({ ...rule, scope: { kind: 'universal' }, provenance: 'bundled-default' });
        installed++;
      } else {
        skipped++;
      }
    }

    return { installed, skipped };
  }
}
