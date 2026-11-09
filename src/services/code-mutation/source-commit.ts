/**
 * Responsibility: Materialize validated source effects and commit them with bounded rollback.
 * Scope: Disk-only source changes; the caller owns Ticket leases, admission and graph reconciliation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {computeFileSha256} from '../../change/fingerprint.ts';
import {workspacePath} from '../../helpers/workspace-path.ts';
import type {TsLspClient} from '../typescript/ts-lsp.ts';
import type {ChangePreview} from '../../change/types.ts';
import {applyTextEdits, normalizeWorkspaceEdits, type WorkspaceEditPlan} from './edits.ts';

export interface PreparedSourceCommit {
  editPlan: WorkspaceEditPlan;
  materializedFiles: Map<string, string>;
  originalBackups: Map<string, string | null>;
  expectedAfter: Record<string, string>;
}

/** No writes. Check the fresh preview, aggregate effects and construct backups/effect hashes. */
export function prepareSourceCommit(
  projectRoot: string,
  lspClient: TsLspClient,
  preview: Pick<ChangePreview, 'originalHashes' | 'affectedFiles' | 'mutations'>
): PreparedSourceCommit {
  for (const [file, expected] of Object.entries(preview.originalHashes)) {
    const absolute = path.resolve(projectRoot, file);
    if (expected === 'missing') {
      if (fs.existsSync(absolute)) throw Error(`File '${file}' appeared after preview. Aborting apply.`);
      continue;
    }
    if (!fs.existsSync(absolute))
      throw Error(`File '${file}' was removed after preview was computed.`);
    const current = computeFileSha256(fs.readFileSync(absolute, 'utf8'));
    if (current !== expected)
      throw Error(`File '${file}' has been modified since preview. Aborting apply.`);
  }

  const editPlan = normalizeWorkspaceEdits(
    preview.mutations.filter(m => m.kind === 'workspace_edit').map(m => m.edit),
    lspClient, projectRoot
  );
  if (JSON.stringify(editPlan.affectedFiles) !== JSON.stringify(preview.affectedFiles))
    throw Error('Source preview effects differ from the validated edit plan.');

  const {fileEdits, fileRenames, fileDeletes} = editPlan;
  const materializedFiles = new Map<string, string>();
  const originalBackups = new Map<string, string | null>();
  for (const [file, edits] of fileEdits) {
    const absolute = path.resolve(projectRoot, file);
    const exists = fs.existsSync(absolute);
    const original = exists ? fs.readFileSync(absolute, 'utf8') : '';
    originalBackups.set(absolute, exists ? original : null);
    materializedFiles.set(absolute, applyTextEdits(original, edits));
  }

  for (const file of fileDeletes) {
    if (fileEdits.has(file) || fileRenames.some(rename => rename.from === file || rename.to === file))
      throw Error('Conflicting deletion; refusing partial effects.');
    const absolute = path.resolve(projectRoot, file);
    originalBackups.set(absolute, fs.readFileSync(absolute, 'utf8'));
  }
  const expectedAfter = {...preview.originalHashes};
  for (const file of fileDeletes) expectedAfter[file] = 'missing';
  for (const [absolute, content] of materializedFiles)
    expectedAfter[path.relative(projectRoot, absolute)] = computeFileSha256(content);
  for (const rename of fileRenames) {
    expectedAfter[rename.to] = expectedAfter[rename.from];
    expectedAfter[rename.from] = 'missing';
  }

  return {editPlan, materializedFiles, originalBackups, expectedAfter};
}

/**
 * Synchronous fenced write boundary: caller invokes under Ticket lease when present.
 * Guard hashes immediately before writing, then retain the original best-effort rollback.
 * Do not call after an await inside the leased callback.
 */
export function commitSourceFiles(
  projectRoot: string,
  prepared: PreparedSourceCommit,
  originalHashes: Record<string, string>
): Array<{from: string; to: string}> {
  for (const [file, expected] of Object.entries(originalHashes)) {
    workspacePath(projectRoot, file);
    const absolute = path.resolve(projectRoot, file);
    const actual = fs.existsSync(absolute) ? computeFileSha256(fs.readFileSync(absolute, 'utf8')) : 'missing';
    if (actual !== expected) throw Error(`File '${file}' changed before guarded commit.`);
  }

  const writtenFiles: string[] = [];
  const executedRenames: Array<{from: string; to: string}> = [];
  const {materializedFiles, originalBackups} = prepared;
  const {fileRenames, fileDeletes} = prepared.editPlan;
  try {
    for (const [absolute, content] of materializedFiles) {
      fs.mkdirSync(path.dirname(absolute), {recursive: true});
      writtenFiles.push(absolute);
      fs.writeFileSync(absolute, content, 'utf8');
    }
    for (const rename of fileRenames) {
      const from = path.resolve(projectRoot, rename.from), to = path.resolve(projectRoot, rename.to);
      fs.mkdirSync(path.dirname(to), {recursive: true});
      fs.renameSync(from, to);
      executedRenames.push(rename);
    }
    for (const file of fileDeletes) {
      const absolute = path.resolve(projectRoot, file);
      writtenFiles.push(absolute);
      fs.unlinkSync(absolute);
    }
  } catch (error: any) {
    for (const rename of executedRenames.reverse()) {
      try {fs.renameSync(path.resolve(projectRoot, rename.to), path.resolve(projectRoot, rename.from));}
      catch {}
    }
    for (const absolute of writtenFiles) {
      try {
        const original = originalBackups.get(absolute);
        if (original !== null && original !== undefined) fs.writeFileSync(absolute, original, 'utf8');
        else if (original === null) fs.unlinkSync(absolute);
      } catch {}
    }
    throw new Error(`Failed to commit change to disk; rolled back touches: ${error.message}`);
  }
  return executedRenames;
}
