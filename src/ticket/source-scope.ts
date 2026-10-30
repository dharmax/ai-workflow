/** The resolver and external source tools share one investigated, governed Ticket scope. */
import path from 'node:path';
import {Ticket, SymbolNode, Artifact} from '../model/ontology.ts';
import type {WorkflowStore} from '../graph/store.ts';
import {workspacePath} from '../change/workspace-path.ts';
import type {ChangeRequest, ChangePreview} from '../change/types.ts';
import {hashFiles} from '../graph/test-artifacts.ts';
import {canonical, computeHash} from '../kb/canonical.ts';
import {resolveTicketGovernance, VerificationReceiptSchema, readVerificationReceipt, type TicketDossier, type GovernedChangeScope} from '../ticket-operation-types.ts';
import type {z} from 'zod';

type StoredScope = z.infer<typeof VerificationReceiptSchema.shape.scope>;

/** Authorize only mandatory investigated evidence and explicitly reviewed additional files. */
export async function buildSourceScope(store: WorkflowStore, ticket: Ticket, dossier: TicketDossier, options: {
  pending?: StoredScope; previous?: StoredScope; authorizedFiles?: readonly string[];
} = {}): Promise<GovernedChangeScope> {
  const {pending, previous, authorizedFiles = []} = options;
  const id = store.localId(ticket.id);
  const scopeFiles = dossier.evidence.filter(item => item.mandatory && item.filePath).map(item => item.filePath!);
  const intent = {title: dossier.ticket.title, body: dossier.ticket.body, acceptanceCriteria: dossier.ticket.acceptanceCriteria};
  const sameIntent = previous && canonical(previous.intent) === canonical(intent);
  const authorized = [...new Set([
    ...dossier.evidence.filter(item => item.mandatory && item.kind === 'FileNode' && item.filePath).map(item => item.filePath!),
    ...authorizedFiles, ...(sameIntent ? previous.authorizedFiles : [])
  ].map(file => workspacePath(store.root, file)))].sort();
  const files = [...new Set([...scopeFiles, ...authorized, ...(previous?.files ?? [])])].sort();
  const governance = await resolveTicketGovernance(store, ticket, files, previous?.governance);
  return {
    ticketId: id, intent,
    authoredTargets: dossier.evidence.filter(item => item.mandatory && ['FileNode', 'SymbolNode'].includes(item.kind))
      .map(({id, kind, filePath, symbolName}) => ({id, kind, filePath, symbolName})),
    revision: (pending?.revision ?? -1) + 1,
    authoredFiles: [...new Set(scopeFiles)].sort(), authorizedFiles: authorized, files,
    baselines: hashFiles(store.root, files), effects: sameIntent && pending ? pending.effects : [], governance
  };
}

/** External edits use the current Ticket investigation; graph edges alone do not mint file authority. */
export async function sourceChangeScope(store: WorkflowStore, ticketId: string, agentId: string) {
  const ticket = await store.getEntity<Ticket>(ticketId, Ticket.dcr);
  if (!ticket) throw Error(`Ticket '${ticketId}' does not exist.`);
  const claim = ticket.claim;
  if (!claim || claim.agentId !== agentId || Date.parse(claim.expiresAt) <= Date.now())
    throw Error('Source changes require the active owning Ticket lease.');
  const cached = VerificationReceiptSchema.shape.scope.safeParse((ticket as Ticket & {metadata?: Record<string, unknown>}).metadata?.governedScope);
  const pending = cached.success && cached.data.ticketId === store.localId(ticket.id) ? cached.data : undefined;
  const intent = {title: ticket.title ?? store.localId(ticket.id), body: ticket.body, acceptanceCriteria: ticket.acceptanceCriteria ?? []};
  if (pending && canonical(pending.intent) === canonical(intent)) {
    // A committed deletion can leave a legitimate missing authored FileNode. Retain that
    // reviewed scope and its effects; refresh effective governance rather than re-inventing it.
    const governance = await resolveTicketGovernance(store, ticket, pending.files, pending.governance);
    return {ticket, scope: {...pending, governance}};
  }
  // An incomplete Ticket must not enter optional model reasoning during an external preview.
  if (!ticket.acceptanceCriteria?.length)
    throw Error('Ticket source work requires reviewed acceptance criteria; prepare the Ticket first.');
  const investigated = await ticket.investigate(store, {mandatoryEvidenceOnly: true});
  if (investigated.status !== 'complete') throw Error('Investigate/prepare the Ticket before source work: ' + investigated.status);
  const receipt = await store.getEntity<Artifact>('VERIFY-' + store.localId(ticket.id), Artifact.dcr);
  const previous = receipt ? readVerificationReceipt(receipt.body)?.scope : undefined;
  return {ticket, scope: await buildSourceScope(store, ticket, investigated.value, {previous})};
}

/** Bind each public preview to its exact source, Ticket, governed scope and revision. */
export function sourceChangeFingerprint(preview: ChangePreview, scope: GovernedChangeScope, dirtyTargets: readonly string[] = [], claim?: Ticket['claim']): string {
  return computeHash({source: preview.fingerprint, ticketId: scope.ticketId, revision: scope.revision,
    intent: scope.intent, targets: scope.authoredTargets, authorizedFiles: scope.authorizedFiles,
    files: scope.files, baselines: scope.baselines, effects: scope.effects, governance: scope.governance.fingerprint,
    dirtyTargets: [...dirtyTargets].sort().map(file => ({file, hash: preview.originalHashes[file]})), claim});
}

/** A proposed exception is bounded to this preview; only the host can approve its fingerprint. */
export function normalizeDirtyTargets(root: string, preview: ChangePreview, targets: readonly string[] = []): string[] {
  const normalized = targets.map(file => workspacePath(root, file));
  if (new Set(normalized).size !== normalized.length) throw Error('Duplicate dirty target.');
  for (const file of normalized) if (!preview.affectedFiles.includes(file)) throw Error(`Dirty target is outside preview effects: ${file}`);
  return normalized.sort();
}

export async function assertChangeScope(store: WorkflowStore, ticket: Ticket, scope: GovernedChangeScope, preview: ChangePreview,
  request: ChangeRequest, ownedFiles: ReadonlySet<string>, allowDirtyTargets: readonly string[] = [], effectEpoch = 0,
  migrations: readonly {oldId: string; newId: string}[] = []): Promise<void> {
  const operationFile = request.action === 'rename_file' ? workspacePath(store.root, request.oldPath)
    : request.action === 'rename_symbol' || request.action === 'refactor' ? workspacePath(store.root, preview.resolvedTarget!.filePath) : undefined;
  const statePath = '.ai-workflow';
  for (const file of new Set([...preview.affectedFiles, ...(operationFile ? [operationFile] : [])])) {
    const relative = workspacePath(store.root, file);
    if (relative === '.git' || relative.startsWith('.git/') || relative === statePath || relative.startsWith(statePath + path.sep))
      throw Error('Source changes cannot mutate canonical workflow, Git or governance state.');
    // Authorize the requested refactoring target; LSP owns its generated effects.
    if ((!operationFile || relative === operationFile) && !scope.authorizedFiles.includes(relative)) {
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
    const expected = [...scope.effects.slice(effectEpoch)].reverse().find(effect => relative in effect.after)?.after[relative] ?? scope.baselines[relative] ?? (operationFile ? preview.originalHashes[relative] : undefined);
    if (expected !== hashFiles(store.root, [relative])[relative]) throw Error(`Unexpected concurrent source modification: ${relative}`);
    if (dirty.has(relative) && !ownedFiles.has(relative) && !allowDirtyTargets.includes(relative)) throw Error(`Dirty target requires input: ${relative}`);
  }
}
