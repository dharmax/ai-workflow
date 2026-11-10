/** Effective Ticket governance: source ownership, applicable Rules, Decisions, Aspects and fingerprint. */
import {createHash} from 'node:crypto';
import {canonical} from '../kb/canonical.ts';
import {countEngineering} from '../performance-metrics.ts';
import type {WorkflowStore} from '../graph/store.ts';
import type {WorkflowEntity} from '../model/ontology.ts';
import {DOCTRINE_VERIFIER_VERSION, type TicketGovernance} from '../ticket-operation-types.ts';

/** One effective Ticket governance view for investigation, production, verification and proof reuse. */
export async function resolveTicketGovernance(store: WorkflowStore, ticket: WorkflowEntity, files: readonly string[] = [],
  prior?: Pick<TicketGovernance, 'targets' | 'decisions'>, options: {refreshIndex?: boolean} = {}): Promise<TicketGovernance> {
  countEngineering('governanceResolutions');
  const { FileNode, SymbolNode, ModuleNode, Decision, Aspect } = await import('../model/ontology.ts');
  const { RuleStore } = await import('../rules/store.ts');
  const { collectProductMeaning } = await import('../product/context.ts');
  const { loadConfig } = await import('../services/config-service.ts');
  const { ensureAstFresh, resolveModulePath } = await import('../graph/indexer.ts');
  const { assessAspects } = await import('../services/assessment-service.ts');
  const { renderAcceptancePrompt } = await import('../ticket/prompts.ts');
  const { renderRuleReferences } = await import('../rules/references.ts');
  // Receipt inspection uses the current canonical Graph without mutating it.
  if (options.refreshIndex !== false) await ensureAstFresh(store);
  const neighbors = [...await store.getOutgoing(ticket.id), ...await store.getIncoming(ticket.id)];
  const entities: WorkflowEntity[] = [];
  for (const edge of neighbors) {
    if (!['contains', 'implements', 'addresses', 'targets', 'modifies', 'governs', 'verifies'].includes(edge.predicateName)) continue;
    const entity = await store.getEntity(edge.sourceId === ticket.id ? edge.targetId : edge.sourceId);
    if (entity) entities.push(entity);
  }
  for (const filePath of files) {
    const file = await store.getEntity<import('../model/ontology.ts').FileNode>(filePath, FileNode.dcr);
    if (file && !entities.some(entity => entity.id === file.id)) entities.push(file);
  }
  const owners = new Map<string, import('../model/ontology.ts').ModuleNode>();
  const ownership = new Map<string, string[]>();
  const sourceFiles = new Map<string, import('../model/ontology.ts').FileNode | null>();
  for (const entity of entities) if (entity instanceof FileNode || entity instanceof SymbolNode) {
    const filePath = entity instanceof FileNode ? store.localId(entity.id) : entity.filePath!;
    sourceFiles.set(filePath, entity instanceof FileNode ? entity : await store.getEntity(filePath, FileNode.dcr));
  }
  for (const filePath of files) if (!sourceFiles.has(filePath)) sourceFiles.set(filePath, await store.getEntity(filePath, FileNode.dcr));
  for (const [filePath, file] of sourceFiles) {
    const modules: string[] = [];
    if (file) for (const edge of await store.getIncoming(file.id, 'contains')) {
      const owner = await store.getEntity<import('../model/ontology.ts').ModuleNode>(edge.sourceId, ModuleNode.dcr);
      if (owner) { owners.set(owner.id, owner); modules.push(store.localId(owner.id)); }
    }
    else {
      // Retain the original ownership of attributable deletion/rename endpoints; resolve Rules live.
      for (const moduleId of prior?.targets.find(target => target.filePath === filePath)?.moduleIds ?? [`mod:${resolveModulePath(filePath)}`]) {
        const owner = await store.getEntity<import('../model/ontology.ts').ModuleNode>(moduleId, ModuleNode.dcr);
        if (!owner && prior?.targets.some(target => target.exists && target.filePath === filePath && target.moduleIds.includes(moduleId)))
          throw Error(`Governed endpoint owner '${moduleId}' disappeared.`);
        if (owner) owners.set(owner.id, owner);
        modules.push(moduleId);
      }
    }
    ownership.set(filePath, [...new Set(modules)].sort());
  }
  const subjects = [ticket, ...entities, ...owners.values()];
  const meaning = await collectProductMeaning(subjects, store);
  const selectedAspects = new Map<string, import('../model/ontology.ts').Aspect>();
  for (const subject of [...subjects, ...meaning.map(item => item.entity)])
    for (const aspect of (await Aspect.getAspectList(subject)).filter(a => a.status === 'accepted')) selectedAspects.set(aspect.id, aspect);
  const aspects = await assessAspects(ticket, store, [...selectedAspects.values()].sort((a, b) => a.id.localeCompare(b.id)));
  const codeSubjects = [...entities];
  for (const file of sourceFiles.values()) if (file) for (const edge of await store.getOutgoing(file.id, 'contains')) {
    const symbol = await store.getEntity<import('../model/ontology.ts').SymbolNode>(edge.targetId, SymbolNode.dcr);
    if (symbol) codeSubjects.push(symbol);
  }
  for (const retained of prior?.decisions ?? []) {
    const decision = await store.getEntity<import('../model/ontology.ts').Decision>(retained.id, Decision.dcr);
    if (!decision) throw Error(`Governing Decision '${retained.id}' disappeared.`);
    entities.push(decision);
  }
  for (const subject of [...codeSubjects, ...owners.values()]) for (const edge of await store.getIncoming(subject.id, 'governs')) {
    const decision = await store.getEntity<import('../model/ontology.ts').Decision>(edge.sourceId, Decision.dcr);
    if (decision) entities.push(decision);
  }
  // Aspect-governing Decisions remain authoritative even while adherence assessment is deferred.
  for (const aspect of selectedAspects.values())
    for (const edge of await store.getIncoming(aspect.id, 'governs')) {
      const decision = await store.getEntity(edge.sourceId);
      if (decision) entities.push(decision);
    }
  const decisions = new Map<string, TicketGovernance['decisions'][number]>();
  for (const entity of [...entities, ...meaning.map(item => item.entity)]) {
    if (!(entity instanceof Decision) || ['draft', 'proposed', 'deprecated', 'disabled'].includes(String((entity as {status?: string}).status))) continue;
    const data = entity as import('../model/ontology.ts').Decision & { body?: string; status?: string };
    decisions.set(store.localId(entity.id), { id: store.localId(entity.id), decision: data.decision,
      context: data.context, consequences: data.consequences, body: data.body, status: data.status });
  }
  const explicitModules = entities.filter(entity => entity instanceof ModuleNode).map(entity => store.localId(entity.id));
  const contexts = new Map<string, {moduleId?: string; language?: string}>();
  const targets: TicketGovernance['targets'] = [];
  const languages: Record<string, string> = {ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', rs: 'rust', go: 'go',
    md: 'markdown', txt: 'text', json: 'json'};
  for (const [filePath, file] of sourceFiles) {
    const language = languages[filePath.split('.').at(-1)!] ?? file?.language;
    const moduleIds = ownership.get(filePath)!;
    targets.push({filePath, moduleIds, language, exists: file !== null});
    for (const moduleId of moduleIds.length ? moduleIds : [undefined]) {
      const context = {moduleId, language};
      contexts.set(canonical(context), context);
    }
  }
  for (const moduleId of explicitModules) if (![...contexts.values()].some(context => context.moduleId === moduleId))
    contexts.set(canonical({moduleId}), {moduleId});
  if (!contexts.size) contexts.set('{}', {});
  const cfg = loadConfig(store.root);
  const checker = { version: DOCTRINE_VERIFIER_VERSION, model: cfg.modelRoutes?.critic ?? cfg.modelRoutes?.reasoning ?? cfg.model,
    promptFingerprint: createHash('sha256').update(renderAcceptancePrompt('')).digest('hex') };
  const ruleStore = new RuleStore(store);
  const rules = new Map<string, TicketGovernance['rules'][number]>();
  for (const context of contexts.values()) {
    for (const resolved of await ruleStore.resolveAllRules({ ...context, forGovernance: true })) {
      if (resolved.isDisabled) continue;
      const storedRule = resolved.effective;
      if (storedRule.importance >= 8 && storedRule.references.some(reference => reference.required && !reference.snapshot?.approved))
        throw new Error(`Mandatory Rule '${storedRule.ruleId}' requires approved reference evidence.`);
      const rule = {...storedRule, references: storedRule.references.map(reference =>
        reference.snapshot?.approved ? reference : {...reference, snapshot: undefined})};
      for (const reference of rule.references) if (reference.snapshot && reference.revision !== reference.snapshot.revision)
        throw new Error('Reference does not match its pinned revision.');
      const approvedReferences = rule.references.filter(reference => reference.snapshot?.approved);
      const referenceEvidence = renderRuleReferences(approvedReferences);
      if (rule.importance >= 8 && rule.languages?.length && !context.language)
        throw new Error(`Specify the target language for mandatory Rule '${rule.ruleId}'.`);
      const fingerprint = createHash('sha256').update(canonical({
        ruleId: rule.ruleId, scope: rule.scope, type: rule.type, languages: rule.languages,
        importance: rule.importance, status: rule.status, revision: rule.revision,
        rule: rule.rule, examples: rule.examples, test: rule.test, checker,
        ...(approvedReferences.length ? {referenceEvidence} : {})
      })).digest('hex');
      // Equal effective layers deduplicate; distinct scoped/language obligations coexist.
      rules.set(fingerprint, { ...rule, fingerprint });
    }
  }
  const selectedRules = [...rules.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.fingerprint.localeCompare(b.fingerprint));
  const selectedDecisions = [...decisions.values()].sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHash('sha256').update(canonical({
    checker, rules: selectedRules.filter(rule => rule.importance >= 5).map(rule => ({ ruleId: rule.ruleId, fingerprint: rule.fingerprint })),
    decisions: selectedDecisions, aspects: aspects.aspects.map(aspect => ({ id: aspect.id, title: aspect.title, body: aspect.body, status: aspect.status, criteria: aspect.criteria }))
  })).digest('hex');
  return { fingerprint, rules: selectedRules, decisions: selectedDecisions, aspects, targets: targets.sort((a, b) => a.filePath.localeCompare(b.filePath)) };
}


