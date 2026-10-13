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
   * Generates a collision-free graph entity ID for a Rule layer:
   * <ruleId>__<scopeKind>[__<base64urlEncodedScopeId>]
   * Preserves exact ruleId and moduleId characters without lossy regex sanitization.
   */
  static entityIdForScope(ruleId: string, scope: RuleScope): string {
    if (scope.kind === 'universal') {
      return `${ruleId}__universal`;
    }
    if (scope.kind === 'project') {
      return `${ruleId}__project`;
    }
    const encodedModule = Buffer.from(scope.moduleId, 'utf8')
      .toString('base64url');
    return `${ruleId}__module__${encodedModule}`;
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
    const localId = this.store.localId(entity.id);
    const defaultRuleId = entity.ruleId || localId.split('__')[0];
    return RuleSchema.parse({
      id: localId,
      ruleId: defaultRuleId,
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
   * Folds candidates for a single logical ruleId into an effective ResolvedRule.
   * Rules:
   * 1. Precedence: module > project > universal.
   * 2. Draft rules cannot shadow active inherited rules (drafts are ignored if an active lower layer exists).
   * 3. Disabled rules represent explicit suppression and shadow lower layers with isDisabled = true.
   */
  static foldRuleLayers(
    ruleId: string,
    candidates: RuleModel[],
    context: { moduleId?: string } = {}
  ): ResolvedRule | null {
    if (candidates.length === 0) return null;

    const universal = candidates.find(r => r.scope.kind === 'universal');
    const project = candidates.find(r => r.scope.kind === 'project');
    const moduleCandidate = context.moduleId
      ? candidates.find(r => r.scope.kind === 'module' && r.scope.moduleId === context.moduleId)
      : undefined;

    const layers: RuleModel[] = [];
    if (universal) layers.push(universal);
    if (project) layers.push(project);
    if (moduleCandidate) layers.push(moduleCandidate);

    if (layers.length === 0) return null;

    // Evaluate candidates from most specific to least specific:
    // [moduleCandidate, project, universal]
    const candidatesDesc = [moduleCandidate, project, universal].filter((r): r is RuleModel => Boolean(r));

    // Draft rules cannot shadow active inherited rules.
    // If the top layer is 'draft', find if there is an active/disabled inherited layer.
    let effective = candidatesDesc[0];
    if (effective.status === 'draft') {
      const activeOrDisabled = candidatesDesc.find(r => r.status === 'active' || r.status === 'disabled');
      if (activeOrDisabled) {
        effective = activeOrDisabled;
      }
    }

    const inheritedFrom = effective === moduleCandidate
      ? (project ? 'project' : universal ? 'universal' : undefined)
      : (effective === project && universal ? 'universal' : undefined);

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
   * Resolves the effective rule definition for a given ruleId and target scope context.
   */
  async resolveRule(ruleId: string, context: { moduleId?: string } = {}): Promise<ResolvedRule | null> {
    const all = await this.listAllRules();
    const candidates = all.filter(r => r.ruleId === ruleId);
    return RuleStore.foldRuleLayers(ruleId, candidates, context);
  }

  /**
   * Resolves all effective rules applicable to a given target context.
   * Performs ONE single collection read across all stored rules.
   */
  async resolveAllRules(context: { moduleId?: string; language?: string } = {}): Promise<ResolvedRule[]> {
    const all = await this.listAllRules();
    
    // Group all rules by ruleId in memory
    const grouped = new Map<string, RuleModel[]>();
    for (const rule of all) {
      const list = grouped.get(rule.ruleId) ?? [];
      list.push(rule);
      grouped.set(rule.ruleId, list);
    }

    const resolved: ResolvedRule[] = [];
    const sortedRuleIds = [...grouped.keys()].sort();

    for (const ruleId of sortedRuleIds) {
      const candidates = grouped.get(ruleId) ?? [];
      const res = RuleStore.foldRuleLayers(ruleId, candidates, context);
      if (!res) continue;

      // Filter by language if specified on the effective rule
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
   * Verify whether bundled defaults are installed and up-to-date.
   * Detects missing or outdated universal defaults without touching local overrides.
   */
  async checkDefaultsInstalled(): Promise<{
    complete: boolean;
    upToDate: boolean;
    missingRuleIds: string[];
    outdatedRuleIds: string[];
    installedCount: number;
    expectedCount: number;
  }> {
    const pack = RulePackSchema.parse(defaultsData);
    const existing = await this.listAllRules();
    const existingUniversal = new Map(
      existing.filter(r => r.scope.kind === 'universal').map(r => [r.ruleId, r])
    );

    const missingRuleIds: string[] = [];
    const outdatedRuleIds: string[] = [];

    for (const rule of pack.rules) {
      const current = existingUniversal.get(rule.ruleId);
      if (!current) {
        missingRuleIds.push(rule.ruleId);
      } else if (current.revision < rule.revision) {
        outdatedRuleIds.push(rule.ruleId);
      }
    }

    return {
      complete: missingRuleIds.length === 0,
      upToDate: missingRuleIds.length === 0 && outdatedRuleIds.length === 0,
      missingRuleIds,
      outdatedRuleIds,
      installedCount: pack.rules.length - missingRuleIds.length,
      expectedCount: pack.rules.length
    };
  }

  /**
   * Ensure bundled defaults are installed or upgraded in the graph.
   * Strictly preserves any existing project or module overrides.
   */
  async installDefaults(): Promise<{ installed: number; upgraded: number; skipped: number }> {
    const pack = RulePackSchema.parse(defaultsData);
    let installed = 0;
    let upgraded = 0;
    let skipped = 0;

    for (const rule of pack.rules) {
      const existing = await this.getRule(rule.ruleId, { kind: 'universal' });
      if (!existing) {
        await this.saveRule({ ...rule, scope: { kind: 'universal' }, provenance: 'bundled-default' });
        installed++;
      } else if (existing.revision < rule.revision && existing.provenance === 'bundled-default') {
        // Upgrade universal default if bundled revision is newer and it has not been detached
        await this.saveRule({ ...rule, scope: { kind: 'universal' }, provenance: 'bundled-default' });
        upgraded++;
      } else {
        skipped++;
      }
    }

    return { installed, upgraded, skipped };
  }
}
