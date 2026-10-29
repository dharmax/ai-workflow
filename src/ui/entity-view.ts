import {ParameterFacilitator, type ViewRequest} from '@dharmax/shell-ui'
import {Aspect, Epic, Feature, Ticket, UserStory, Rule} from '../model/ontology.ts'
import type {ToolContext} from '../tools/index.ts'
import {registry} from '../tools/index.ts'

export type EntityViewKind = 'ticket' | 'epic' | 'feature' | 'story' | 'aspect' | 'rule'

const choiceOptions = (values: readonly string[]) =>
  values.map(value => ({id: value, label: value}))

const lines = (value: unknown): string[] =>
  String(value ?? '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)

const text = (
  value: unknown,
  mode: 'readonly' | 'edit',
  options: {label?: string; multiline?: boolean; grow?: boolean} = {},
) => ({
  type: 'text' as const,
  value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
  mode,
  ...options,
})

const choice = (
  value: unknown,
  values: readonly string[],
  options: {label?: string} = {},
) => ({
  type: 'choice' as const,
  value: String(value ?? values[0] ?? ''),
  mode: 'edit' as const,
  options: choiceOptions(values),
  ...options,
})

export async function resolveEntityViewKind(ctx: ToolContext, id: string): Promise<EntityViewKind> {
  const entity = await ctx.store.getEntity(id)
  if (entity instanceof Ticket) return 'ticket'
  if (entity instanceof Epic) return 'epic'
  if (entity instanceof Feature) return 'feature'
  if (entity instanceof UserStory) return 'story'
  if (entity instanceof Aspect) return 'aspect'
  if (entity instanceof Rule) return 'rule'
  throw new Error(`Unsupported editable entity '${id}'.`)
}

export async function facilitateEntityId(ctx: ToolContext, kind: EntityViewKind, facilitator: ParameterFacilitator): Promise<string | null> {
  const tool = {ticket: 'list_tickets', epic: 'list_epics', feature: 'list_features', story: 'list_user_stories', aspect: 'list_aspects', rule: 'list_rules'}[kind];
  const entities: Array<{id: string}> = await registry.execute(tool, {}, ctx);
  const choices = entities.map(entity => entity.id);
  if (!choices.length) throw new Error(`No ${kind} entities available.`);
  const values = await facilitator.facilitate({entityId: {type: 'select', description: `${kind} ID`, choices}}, {}, {interactive: true});
  if (typeof values.entityId !== 'string') return null;
  if (!choices.includes(values.entityId)) throw new Error(`Invalid ${kind} selection.`);
  return values.entityId;
}
export function formatEntityView(view: ViewRequest): string {
  return [view.title || view.id, ...Object.entries(view.fields).map(([key, field]) => `${field.label || key}: ${Array.isArray(field.value) ? field.value.join(', ') : field.value}`.trimEnd())].join('\n');
}

export async function buildEntityView(
  ctx: ToolContext,
  kind: EntityViewKind,
  id: string,
  mode: 'readonly' | 'edit' = 'readonly',
): Promise<ViewRequest> {
  if (kind === 'rule') {
    const result = await registry.execute('get_rule', {ruleId: id}, ctx)
    if (!result.rule) throw Error("Rule layer not found.")
    return {id: 'rule:' + id, title: 'Rule · ' + result.rule.ruleId, mode, fields: {
      id: text(id, 'readonly', {label: 'Layer ID'}),
      revision: text(result.rule.revision, 'readonly', {label: 'Revision'}),
      effective: text(JSON.stringify(result.effective, null, 2), 'readonly', {label: 'Effective rule / inheritance'}),
      payload: text(JSON.stringify(result.rule, null, 2), 'edit', {label: 'Rule JSON (examples, references, checker)', multiline: true, grow: true}),
      reason: text('', 'edit', {label: 'Reason'}),
      allowWeakening: choice('no', ['no', 'yes'], {label: 'Authorize mandatory Rule change'}),
      approveReferences: choice('no', ['no', 'yes'], {label: 'Approve supplied reference evidence'})
    }}
  }
  if (kind === 'ticket') {
    const t = await registry.execute('get_ticket',{ticketId:id},ctx)
    return {
      id: `ticket:${id}`,
      title: `Ticket · ${id}`,
      mode,
      fields: {
        id: text(id, 'readonly', {label: 'ID'}),
        relations: text(JSON.stringify({incoming:t.incoming,outgoing:t.outgoing},null,2),'readonly',{label:'Relations and dependencies'}),
        verification: text(JSON.stringify({state:t.verificationState,receipt:t.verification},null,2),'readonly',{label:'Recorded verification; current freshness requires resolver checks'}),
        history: text(JSON.stringify(t.history,null,2),'readonly',{label:'Execution history; use ticket history for original entries'}),
        kind: text(t.kind ?? 'task', 'readonly', {label:'Type'}),
        defect: text(t.defect ? JSON.stringify(t.defect,null,2) : '', 'readonly', {label:'Defect report; use bug edit to complete'}),
        title: text(t.title, 'edit', {label: 'Title'}),
        lane: choice(t.lane ?? 'Todo', ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked', 'Cancelled'], {label: 'Lane'}),
        priority: choice(String(t.priority ?? 2), ['0', '1', '2', '3', '4', '5'], {label: 'Priority'}),
        body: text(t.body, 'edit', {label: 'Body', multiline: true, grow: true}),
        acceptanceCriteria: text((t.acceptanceCriteria ?? []).join('\n'), 'edit', {
          label: 'Acceptance criteria',
          multiline: true,
        }),
        claim: text(
          t.claim ? `${t.claim.agentId ?? ''}${t.claim.expiresAt ? ` until ${t.claim.expiresAt}` : ''}` : '',
          'readonly',
          {label: 'Lease'},
        ),
      },
    }
  }

  if (kind === 'epic') {
    const e = await registry.execute('get_epic', {epicId: id}, ctx)
    return {
      id: `epic:${id}`,
      title: `Epic · ${id}`,
      mode,
      fields: {
        id: text(e.id, 'readonly', {label: 'ID'}),
        title: text(e.title, 'edit', {label: 'Title'}),
        status: choice(e.status, ['draft', 'planned', 'active', 'completed', 'cancelled'], {label: 'Status'}),
        priority: choice(String(e.priority ?? 2), ['0', '1', '2', '3', '4', '5'], {label: 'Priority'}),
        body: text(e.body, 'edit', {label: 'Body', multiline: true, grow: true}),
        features: text(e.targetedFeatures, 'readonly', {label: 'Features'}),
        stories: text(e.targetedStories, 'readonly', {label: 'Stories'}),
        tickets: text(e.containedTickets, 'readonly', {label: 'Tickets'}),
      },
    }
  }

  if (kind === 'feature') {
    const f = await registry.execute('get_feature', {featureId: id}, ctx)
    return {
      id: `feature:${id}`,
      title: `Feature · ${id}`,
      mode,
      fields: {
        id: text(f.id, 'readonly', {label: 'ID'}),
        title: text(f.title, 'edit', {label: 'Title'}),
        priority: choice(String(f.priority ?? 2), ['0', '1', '2', '3', '4', '5'], {label: 'Priority'}),
        status: choice(f.status, ['draft', 'proposed', 'accepted', 'deprecated'], {label: 'Status'}),
        body: text(f.body, 'edit', {label: 'Body', multiline: true, grow: true}),
        acceptanceCriteria: text((f.acceptanceCriteria ?? []).join('\n'), 'edit', {
          label: 'Acceptance criteria',
          multiline: true,
        }),
        epics: text(f.targetingEpics, 'readonly', {label: 'Epics'}),
        stories: text(f.containedStories, 'readonly', {label: 'Stories'}),
        tickets: text(f.implementingTickets, 'readonly', {label: 'Tickets'}),
        tests: text(f.verifyingTests, 'readonly', {label: 'Tests'}),
      },
    }
  }

  if (kind === 'story') {
    const s = await registry.execute('get_user_story', {storyId: id}, ctx)
    return {
      id: `story:${id}`,
      title: `Story · ${id}`,
      mode,
      fields: {
        id: text(s.id, 'readonly', {label: 'ID'}),
        title: text(s.title, 'edit', {label: 'Title'}),
        status: choice(s.status, ['draft', 'proposed', 'accepted', 'deprecated'], {label: 'Status'}),
        actor: text(s.actor, 'edit', {label: 'Actor'}),
        intent: text(s.intent, 'readonly', {label: 'Intent', multiline: true}),
        initialState: text(s.initialState, 'readonly', {label: 'Initial State', multiline: true}),
        action: text(s.action, 'readonly', {label: 'Action', multiline: true}),
        expectedResult: text(s.expectedResult, 'readonly', {label: 'Expected Result', multiline: true}),
        exceptions: text(s.exceptions, 'readonly', {label: 'Exceptions', multiline: true}),
        bounds: text(s.bounds, 'readonly', {label: 'Bounds', multiline: true}),
        definitionReview: text(s.definitionReview, 'readonly', {label: 'Definition review'}),
        effectiveState: text([s.effectiveState.state, ...s.effectiveState.reasons, ...s.effectiveState.references].join('\n'),
          'readonly', {label: 'Effective state', multiline: true}),
        story: text(s.story, 'edit', {label: 'Story', multiline: true, grow: true}),
        context: text(s.context, 'edit', {label: 'Context', multiline: true}),
        acceptanceCriteria: text((s.acceptanceCriteria ?? []).join('\n'), 'edit', {
          label: 'Acceptance criteria',
          multiline: true,
        }),
        sla: text(s.sla, 'edit', {label: 'SLA'}),
        features: text(s.containingFeatures, 'readonly', {label: 'Features'}),
        epics: text(s.targetingEpics, 'readonly', {label: 'Epics'}),
        tickets: text(s.addressingTickets, 'readonly', {label: 'Tickets'}),
        tests: text(s.verifyingTests, 'readonly', {label: 'Tests'}),
      },
    }
  }

  const a = await registry.execute('get_aspect', {id}, ctx)
  return {
    id: `aspect:${id}`,
    title: `Aspect · ${id}`,
    mode,
    fields: {
      id: text(a.id ?? id, 'readonly', {label: 'ID'}),
      title: text(a.title, 'edit', {label: 'Title'}),
      status: choice(a.status ?? 'draft', ['draft', 'proposed', 'accepted', 'deprecated'], {label: 'Status'}),
      body: text(a.body, 'edit', {label: 'Body', multiline: true, grow: true}),
      acceptanceCriteria: text((a.acceptanceCriteria ?? []).join('\n'), 'edit', {
        label: 'Acceptance criteria',
        multiline: true,
      }),
      appliesTo: text(a.appliesTo ?? a.scopes ?? [], 'readonly', {label: 'Applies to'}),
    },
  }
}

export async function saveEntityView(
  ctx: ToolContext,
  kind: EntityViewKind,
  id: string,
  values: Record<string, unknown>,
  confirmRuleChange?: (preview: unknown) => Promise<boolean>,
): Promise<void> {
  if (kind === 'rule') {
    const current = await registry.execute('get_rule', {ruleId: id}, ctx)
    const rule = JSON.parse(String(values.payload))
    if (!current.rule || rule.ruleId !== current.rule.ruleId || JSON.stringify(rule.scope) !== JSON.stringify(current.rule.scope))
      throw Error('Rule editor cannot change layer identity.')
    if (rule.revision !== current.rule.revision) throw Error('Stale Rule editor revision; reload before editing.')
    const request = {pack: {version: 1, packName: 'Entity editor', projectOrigin: ctx.store.root, rules: [rule]},
      reason: values.reason, allowWeakening: values.allowWeakening === 'yes', approveReferences: values.approveReferences === 'yes'}
    const preview = await registry.execute('preview_rule_change', request, ctx)
    if (!confirmRuleChange || !await confirmRuleChange(preview)) throw Error('Rule change not approved; graph unchanged.')
    await registry.execute('apply_rule_change', {...request, fingerprint: preview.fingerprint}, ctx)
    return
  }
  if (kind === 'ticket') {
    await registry.execute('update_ticket', {
      ticketId: id,
      title: values.title,
      lane: values.lane,
      priority: Number(values.priority),
      body: values.body,
      acceptanceCriteria: lines(values.acceptanceCriteria),
    }, ctx)
    return
  }

  if (kind === 'epic') {
    const priority = Number(values.priority)
    if (!Number.isFinite(priority)) throw new Error('Epic priority must be a number.')
    await registry.execute('update_epic', {
      epicId: id,
      title: values.title,
      status: values.status,
      priority,
      body: values.body,
    }, ctx)
    return
  }

  if (kind === 'feature') {
    await registry.execute('update_feature', {
      featureId: id,
      priority: values.priority === undefined ? undefined : Number(values.priority),
      title: values.title,
      status: values.status,
      body: values.body,
      acceptanceCriteria: lines(values.acceptanceCriteria),
    }, ctx)
    return
  }

  if (kind === 'story') {
    await registry.execute('update_user_story', {
      storyId: id,
      title: values.title,
      status: values.status,
      actor: values.actor,
      story: values.story,
      context: values.context,
      acceptanceCriteria: lines(values.acceptanceCriteria),
      sla: values.sla,
    }, ctx)
    return
  }

  await registry.execute('update_aspect', {
    id,
    title: values.title,
    status: values.status,
    body: values.body,
    acceptanceCriteria: lines(values.acceptanceCriteria),
  }, ctx)
}
