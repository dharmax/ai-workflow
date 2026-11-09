/** TS7-first, TS6-fallback source refactor preparation. No source writes. */
import {resolveCodeTarget} from '../../helpers/target-resolver.ts';
import {blockedChangePreview} from './fingerprint.ts';
import {normalizeWorkspaceEdit} from './edits.ts';
import type {ChangeRequest, ChangePreview, LspRange} from '../../change/types.ts';
import type {SourcePreviewContext, PreparedSourceOperation} from './preview-operations.ts';

type RefactorRequest = Extract<ChangeRequest, {action: 'refactor'}>;
type RefactorOption = Awaited<ReturnType<SourcePreviewContext['ts6Client']['getApplicableRefactors']>>[number];

function selectRefactor(options: RefactorOption[], kind: string): RefactorOption | undefined {
  const lower = kind.toLowerCase();
  const named = (r: RefactorOption) =>
    r.name.toLowerCase().includes(lower) ||
    r.description.toLowerCase().includes(lower) ||
    r.actions.some(a => a.kind?.toLowerCase() === lower || a.name.toLowerCase().includes(lower));
  const applicable = (r: RefactorOption) => r.actions.some(a => !a.notApplicableReason);
  const direct = options.find(r => named(r) && applicable(r)) || options.find(named);
  if (direct) return direct;
  for (const fallback of ['extract', 'move', 'inline']) {
    if (lower.includes(fallback)) {
      const byFamily = (r: RefactorOption) => r.name.toLowerCase().includes(fallback);
      const match = options.find(r => byFamily(r) && applicable(r)) || options.find(byFamily);
      if (match) return match;
    }
  }
  return undefined;
}

function selectAction(refactor: RefactorOption, request: RefactorRequest, moveToFile: boolean) {
  let refactorName = refactor.name;
  let actionName = request.actionName || '';
  if (moveToFile && request.arguments?.targetFile) {
    refactorName = 'Move to file';
    if (!actionName) actionName = 'Move to file';
  } else if (!actionName) {
    const valid = refactor.actions.find(a => !a.notApplicableReason);
    if (valid) actionName = valid.name;
    else if (refactor.actions.length > 0) actionName = refactor.actions[0].name;
  }
  return {refactorName, actionName};
}

export async function prepareRefactor(
  ctx: SourcePreviewContext,
  request: RefactorRequest,
  productImpact: import('../../product/impact.ts').ProductImpact | undefined,
  warnings: string[]
): Promise<PreparedSourceOperation | ChangePreview> {
  let target;
  try { target = await resolveCodeTarget(request.target, ctx.store, ctx.lspClient, ctx.projectRoot); }
  catch (error: any) { return blockedChangePreview(request, error.message, warnings, productImpact); }

  const range: LspRange = target.range || {start: target.position, end: target.position};
  const ts7Actions = await ctx.lspClient.getCodeActions(target.filePath, range, [request.refactorKind]);
  const native = ts7Actions.find(a =>
    a.edit && (a.kind === request.refactorKind || a.title.toLowerCase().includes(request.refactorKind.toLowerCase()))
  );
  if (native?.edit) {
    // Preserve the LSP validation that occurred before the aggregate plan was added.
    normalizeWorkspaceEdit(native.edit, ctx.lspClient, ctx.projectRoot);
    return {
      mutation: {kind: 'workspace_edit', source: 'typescript-lsp', edit: native.edit},
      resolvedTarget: target,
      summary: `Apply TS7 refactor '${request.refactorKind}' (${native.title}) in '${target.filePath}'.`
    };
  }

  // TS6 has mature refactors absent from TS7; preserve its interactive-argument behavior.
  const lower = request.refactorKind.toLowerCase();
  const moveToFile = lower.includes('move to file') || lower.includes('move_to_file') || lower === 'move';
  if (moveToFile && !request.arguments?.targetFile && !request.actionName?.toLowerCase().includes('new file')) {
    if (!(request.refactorKind.includes('newFile') || request.actionName?.includes('new file')))
      return blockedChangePreview(request, "Move to file requires destination argument 'targetFile'.", warnings, productImpact, ['targetFile']);
  }

  let applicable = await ctx.ts6Client.getApplicableRefactors(target.filePath, range);
  if (!applicable.length && target.range)
    applicable = await ctx.ts6Client.getApplicableRefactors(target.filePath, target.range);

  const selected = selectRefactor(applicable, request.refactorKind);
  if (!selected || !selected.actions.some(a => !a.notApplicableReason)) {
    const reason = selected?.actions[0]?.notApplicableReason;
    return blockedChangePreview(request, reason
      ? `Cannot execute refactor '${selected!.name}': ${reason}`
      : `Unsupported refactor: neither TS7 nor TS6 mature refactor supports '${request.refactorKind}' at this location. Available refactors: ${applicable.map(r => r.name).join(', ') || 'none'}.`,
      warnings, productImpact);
  }

  const {refactorName, actionName} = selectAction(selected, request, moveToFile);
  const edit = await ctx.ts6Client.getEditsForRefactor(target.filePath, range, refactorName, actionName, request.arguments);
  if (!edit)
    return blockedChangePreview(request,
      `TypeScript 6 sidecar was unable to generate edits for refactor '${selected.name}' (action: '${actionName}').`,
      warnings, productImpact);

  const normalized = normalizeWorkspaceEdit(edit, ctx.lspClient, ctx.projectRoot);
  const affected = new Set([...normalized.fileEdits.keys()]);
  for (const rename of normalized.fileRenames) {affected.add(rename.from); affected.add(rename.to);}
  return {
    mutation: {kind: 'workspace_edit', source: 'typescript6-refactor', edit},
    resolvedTarget: target,
    summary: `Apply TS6 mature refactor '${selected.name}' (${actionName}) across ${affected.size} file(s).`
  };
}
