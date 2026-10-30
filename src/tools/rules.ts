/** Shared Rule management tools; the managed Ticket producer does not receive these mutations. */
import {z} from 'zod';
import {commandRegistry} from './registry.ts';
import {RuleStore} from '../rules/store.ts';
import {RuleScopeSchema} from '../model/rule.ts';
import {resolveRuleReference} from '../rules/references.ts';
import {exportProjections} from '../services/projection-service.ts';
export const RuleChangeSchema = z.object({
  pack: z.unknown(), reason: z.string().trim().min(1),
  allowWeakening: z.boolean().default(false), approveReferences: z.boolean().default(false),
  authorizedRepositories: z.record(z.string(), z.string()).optional(),
  remove: z.array(z.object({ruleId: z.string().min(1), scope: RuleScopeSchema})).default([])
});
export function registerRuleTools(): void {
  commandRegistry.register({name: 'list_rules', description: 'List canonical Rule layers with source, state and applicability filters.', category: 'planning',
    parameters: z.object({type: z.string().optional(), status: z.string().optional(), scope: z.string().optional(), language: z.string().optional(), provenance: z.string().optional()}),
    execute: async (filter, ctx) => (await new RuleStore(ctx.store).listAllRules()).filter(rule =>
      (!filter.type || rule.type === filter.type) && (!filter.status || rule.status === filter.status) &&
      (!filter.scope || rule.scope.kind === filter.scope) && (!filter.language || !rule.languages?.length || rule.languages.includes(filter.language)) &&
      (!filter.provenance || rule.provenance === filter.provenance))});
  commandRegistry.register({name: 'get_rule', description: 'Inspect a Rule layer and its effective inheritance.', category: 'planning',
    parameters: z.object({ruleId: z.string(), scope: RuleScopeSchema.default({kind: 'universal'}), language: z.string().optional()}),
    execute: async ({ruleId, scope, language}, ctx) => {
      const store = new RuleStore(ctx.store), decoded = RuleStore.decodeEntityId(ruleId);
      const selected = decoded ?? {ruleId, scope};
      return {rule: await store.getRule(selected.ruleId, selected.scope),
        effective: await store.resolveRule(selected.ruleId, {moduleId: selected.scope.kind === 'module' ? selected.scope.moduleId : undefined, language})};
    }});
  commandRegistry.register({name: 'export_rules', description: 'Export versioned Rules and explicitly portable approved reference snapshots.', category: 'planning',
    parameters: z.object({}), execute: (_, ctx) => new RuleStore(ctx.store).exportPack()});
  commandRegistry.register({name: 'preview_rule_change', description: 'Preview the full Rule import/edit/delete diff and approval fingerprint without mutation.', category: 'planning',
    parameters: RuleChangeSchema, execute: ({pack, ...options}, ctx) => new RuleStore(ctx.store).previewPack(pack, options)});
  commandRegistry.register({name: 'apply_rule_change', description: 'Apply an explicitly approved Rule preview atomically with optimistic versions and durable audit.', category: 'planning',
    parameters: RuleChangeSchema.extend({fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
    execute: async ({pack, fingerprint, ...options}, ctx) => {
      if (ctx.executionAuthority === 'read-only') throw Error('Read-only execution cannot change governing Rules.');
      const result = await new RuleStore(ctx.store).applyPack(pack, options, fingerprint);
      await exportProjections(ctx.store, ctx.projectRoot); return result.map(rule => ({id: ctx.store.localId(rule.id), revision: rule.revision}));
    }});
  commandRegistry.register({name: 'resolve_rule_reference', description: 'Investigate an explicitly authorized clean local Git checkout; no clone, fetch, approval or mutation.', category: 'planning',
    parameters: z.object({reference: z.unknown(), authorizedRepository: z.string().min(1)}),
    execute: ({reference, authorizedRepository}) => resolveRuleReference(reference as Parameters<typeof resolveRuleReference>[0], authorizedRepository)});
}

/** Existing host confirmation is bound to the current Rule fingerprint, outside tool execution. */
export async function reviewRuleChange(input:Record<string,unknown>,ctx:import('./registry.ts').ToolContext,confirm?: (preview:unknown)=>Promise<boolean>){
 const parsed=(commandRegistry.get('apply_rule_change')!.parameters).parse(input);
 const {fingerprint,...request}=parsed;
 const preview=await commandRegistry.execute('preview_rule_change',request,ctx);
 if(preview.fingerprint!==fingerprint)throw Error('Stale Rule preview; reload and review.');
 if(!confirm)return {status:'needs_input',error:'Trusted host Rule review is required.',preview};
 if(!await confirm(preview))return {status:'cancelled'};
 return ctx.store.withExecutionContext(ctx.executionAuthority??'read-only',ctx.signal,()=>commandRegistry.execute('apply_rule_change',parsed,ctx),fingerprint);
}
