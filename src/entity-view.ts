import type {ViewRequest} from '@dharmax/shell-ui'
import {Aspect, Epic, Feature, Ticket, UserStory} from './graph/ontology.ts'
import type {ToolContext} from './tools/index.ts'
import {registry} from './tools/index.ts'

export type EntityViewKind = 'ticket' | 'epic' | 'feature' | 'story' | 'aspect'

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
  throw new Error(`Unsupported editable entity '${id}'.`)
}

export async function buildEntityView(
  ctx: ToolContext,
  kind: EntityViewKind,
  id: string,
  mode: 'readonly' | 'edit' = 'readonly',
): Promise<ViewRequest> {
  if (kind === 'ticket') {
    const ticket = await ctx.store.getEntity<Ticket>(id, Ticket.dcr)
    if (!ticket) throw new Error(`Ticket '${id}' not found.`)
    const t = ticket as any
    return {
      id: `ticket:${id}`,
      title: `Ticket · ${id}`,
      mode,
      fields: {
        id: text(id, 'readonly', {label: 'ID'}),
        title: text(t.title, 'edit', {label: 'Title'}),
        lane: choice(t.lane ?? 'Todo', ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'], {label: 'Lane'}),
        priority: choice(t.priority ?? 'P2', ['P0', 'P1', 'P2', 'P3'], {label: 'Priority'}),
        status: text(t.status, 'readonly', {label: 'Status'}),
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
        priority: text(e.priority, 'edit', {label: 'Priority'}),
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
): Promise<void> {
  if (kind === 'ticket') {
    await registry.execute('update_ticket', {
      ticketId: id,
      title: values.title,
      lane: values.lane,
      priority: values.priority,
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
