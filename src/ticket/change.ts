/** Ticket source scope checks shared by the resolver and external engineering tools. */
import path from 'node:path';
import {Ticket, FileNode, SymbolNode} from '../graph/ontology.ts';
import type {WorkflowStore} from '../graph/store.ts';
import {workspacePath} from '../change/workspace-path.ts';
import type {ChangeRequest, ChangePreview} from '../change/types.ts';
import {hashFiles} from '../graph/test-artifacts.ts';
import {canonical} from '../kb/canonical.ts';
import {resolveTicketGovernance, VerificationReceiptSchema, type GovernedChangeScope} from '../ticket-operation-types.ts';

export async function sourceChangeScope(store: WorkflowStore, ticketId: string, agentId: string): Promise<{ticket: Ticket; scope: GovernedChangeScope}> {
  const ticket = await store.getEntity<Ticket>(ticketId, Ticket.dcr);
  if (!ticket) throw Error(`Ticket '${ticketId}' does not exist.`);
  const claim = (await store.getActiveClaims()).find(entry => entry.ticketId === store.localId(ticket.id))?.claim;
  if (!claim || claim.agentId !== agentId) throw Error('Source changes require the active owning Ticket lease.');
  const intent = {title: ticket.title ?? store.localId(ticket.id), body: ticket.body, acceptanceCriteria: ticket.acceptanceCriteria ?? []};
  const cached = VerificationReceiptSchema.shape.scope.safeParse((ticket as Ticket & {metadata?: Record<string, unknown>}).metadata?.governedScope);
  const prior = cached.success && canonical(cached.data.intent) === canonical(intent) ? cached.data : undefined;
  const authoredTargets: GovernedChangeScope['authoredTargets'][number][] = [];
  for (const edge of [...await store.getOutgoing(ticket.id), ...await store.getIncoming(ticket.id)]) {
    if (!['modifies', 'targets'].includes(edge.predicateName)) continue;
    const entity = await store.getEntity(edge.sourceId === ticket.id ? edge.targetId : edge.sourceId);
    if (entity instanceof FileNode || entity instanceof SymbolNode) authoredTargets.push({id: store.localId(entity.id), kind: entity.typeName(),
      filePath: entity instanceof FileNode ? store.localId(entity.id) : entity.filePath, symbolName: entity instanceof SymbolNode ? entity.title : undefined});
  }
  const authoredFiles = [...new Set(authoredTargets.map(target => target.filePath!))].sort();
  const authorizedFiles = [...new Set([...authoredTargets.filter(target => target.kind === 'FileNode').map(target => target.filePath!), ...(prior?.authorizedFiles ?? [])])].sort();
  const files = [...new Set([...authoredFiles, ...authorizedFiles])].sort();
  const governance = await resolveTicketGovernance(store, ticket, files, prior?.governance);
  return {ticket, scope: {ticketId: store.localId(ticket.id), intent, authoredTargets, revision: (prior?.revision ?? -1) + 1,
    authoredFiles, authorizedFiles, files, baselines: prior?.baselines ?? hashFiles(store.root, files), effects: prior?.effects ?? [], governance}};
}

export async function assertChangeScope(store: WorkflowStore, ticket: Ticket, scope: GovernedChangeScope, preview: ChangePreview,
  request: ChangeRequest, ownedFiles: ReadonlySet<string>, allowDirtyTargets: readonly string[] = [], effectEpoch = 0,
  migrations: readonly {oldId: string; newId: string}[] = []): Promise<void> {
  const statePath = '.ai-workflow';
  for (const file of preview.affectedFiles) {
    const relative = workspacePath(store.root, file);
    if (relative === '.git' || relative.startsWith('.git/') || relative === statePath || relative.startsWith(statePath + path.sep))
      throw Error('Source changes cannot mutate canonical workflow, Git or governance state.');
    if (!scope.authorizedFiles.includes(relative)) {
      if (!scope.authoredFiles.includes(relative)) throw Error(`Scope expansion requires input: ${relative}`);
      let authorized = false;
      for (const target of scope.authoredTargets.filter(target => target.kind === 'SymbolNode' && target.filePath === relative)) {
        let id = target.id;
        for (const migration of migrations) if (store.localId(migration.oldId) === store.localId(id)) id = migration.newId;
        const symbol = await store.getEntity<SymbolNode>(id, SymbolNode.dcr);
        if (!symbol || symbol.status === 'deprecated') continue;
        if (preview.resolvedTarget?.graphEntityId === symbol.id) {authorized = true; break;}
        const changes = request.action === 'source_change' ? request.changes : [request];
        for (const change of changes) if (change.action === 'replace_text' && change.filePath === relative) {
          const {getExactSymbolSource} = await import('../change/symbol-source.ts');
          const source = await getExactSymbolSource(store.root, path.resolve(store.root, relative), symbol.containerName ? `${symbol.containerName}.${symbol.title}` : symbol.title!);
          if (source.code.includes(change.oldText)) authorized = true;
        }
      }
      if (!authorized) throw Error(`Scope expansion requires input: ${relative}; effect is outside its authored exact symbol.`);
    }
  }
  if ((await resolveTicketGovernance(store, ticket, scope.files, scope.governance)).fingerprint !== scope.governance.fingerprint)
    throw Error('Applicable obligations changed; obtain a fresh governed scope.');
  const status = Bun.spawnSync(['git', 'status', '--porcelain=v1', '-z'], {cwd: store.root, stderr: 'pipe'});
  if (!status.success) throw Error('Workspace Git status unavailable; edits require an inspectable repository.');
  const dirty = new Set<string>(), entries = status.stdout.toString().split('\0');
  for (let i = 0; i < entries.length; i++) if (entries[i]) {
    dirty.add(entries[i].slice(3));
    if (/[RC]/.test(entries[i].slice(0, 2))) dirty.add(entries[++i]);
  }
  for (const file of preview.affectedFiles) {
    const relative = workspacePath(store.root, file);
    const expected = [...scope.effects.slice(effectEpoch)].reverse().find(effect => relative in effect.after)?.after[relative] ?? scope.baselines[relative];
    if (expected !== hashFiles(store.root, [relative])[relative]) throw Error(`Unexpected concurrent source modification: ${relative}`);
    if (dirty.has(relative) && !ownedFiles.has(relative) && !allowDirtyTargets.includes(relative)) throw Error(`Dirty target requires input: ${relative}`);
  }
}
