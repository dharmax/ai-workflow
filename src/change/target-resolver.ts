/** Resolve exact source identity; explicit positions do not depend on Graph admission. */
import path from 'node:path';
import fs from 'node:fs';
import {workspacePath} from './workspace-path.ts';
import type {WorkflowStore} from '../graph/store.ts';
import {SymbolNode, FileNode} from '../graph/ontology.ts';
import {ensureAstFresh} from '../graph/indexer.ts';
import type {TsLspClient} from './ts-lsp.ts';
import type {ChangeTarget, ResolvedCodeTarget} from './types.ts';

function resolvePosition(target: Extract<ChangeTarget, {type:'position'}>, client: TsLspClient, root: string): ResolvedCodeTarget {
  const filePath = workspacePath(root, target.filePath);
  const full = path.resolve(root, filePath);
  if (!fs.statSync(full).isFile() || !/\.[cm]?[jt]sx?$/.test(filePath))
    throw Error('Reference target must be a JS/TS source file in the project.');
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  if (!Number.isInteger(target.line) || !Number.isInteger(target.character) || target.line < 0 || target.character < 0 ||
      target.line >= lines.length || target.character > lines[target.line]!.length)
    throw Error('Reference position falls outside the source file.');
  return {filePath, symbolName:'', position:{line:target.line, character:target.character}, uri:client.toUri(filePath)};
}

async function findGraphSymbol(target: Extract<ChangeTarget, {type:'entity'|'symbol'}>, store: WorkflowStore, root: string): Promise<SymbolNode> {
  if (target.type === 'entity') {
    const entity = await store.getEntity<SymbolNode>(target.entityId, SymbolNode.dcr);
    if (!entity || !entity.filePath || entity.status === 'deprecated' || entity.metadata?.missing)
      throw Error(`Target entity '${target.entityId}' has no current source declaration in the AST graph.`);
    return entity;
  }
  const query: Record<string, string> = {title:target.symbolName};
  if (target.filePath) query.filePath = workspacePath(root, target.filePath);
  if (target.containerName) query.containerName = target.containerName;
  const matches = (await store.listEntities<SymbolNode>(SymbolNode.dcr, query))
    .filter(symbol => symbol.status !== 'deprecated' && symbol.filePath);
  if (!matches.length) throw Error(`Symbol '${target.symbolName}' not found in ${target.filePath}.`);
  if (matches.length > 1) {
    const locations = matches.map(symbol => `${symbol.filePath}#${symbol.title} (line ${symbol.line}, column ${symbol.column})`).join(', ');
    throw Error(`Ambiguous symbol '${target.symbolName}': ${locations}. Specify an exact entity ID or source position.`);
  }
  return matches[0]!;
}

export async function resolveCodeTarget(target: ChangeTarget, store: WorkflowStore, client: TsLspClient, root: string): Promise<ResolvedCodeTarget> {
  if (target.type === 'position') return resolvePosition(target, client, root);
  if (target.type === 'range') {
    const filePath = workspacePath(root, target.filePath);
    return {filePath, symbolName:'', position:{line:target.startLine,character:target.startCharacter},
      range:{start:{line:target.startLine,character:target.startCharacter},end:{line:target.endLine,character:target.endCharacter}},
      uri:client.toUri(filePath)};
  }
  await ensureAstFresh(store, root);
  if (target.type === 'file') {
    const filePath = workspacePath(root, target.filePath);
    const file = await store.getEntity<FileNode>(filePath, FileNode.dcr);
    if (!file || file.status === 'deprecated') throw Error(`File '${target.filePath}' not found in AST graph.`);
    return {filePath,symbolName:path.basename(filePath),position:{line:0,character:0},uri:client.toUri(filePath),graphEntityId:file.id};
  }
  const symbol = await findGraphSymbol(target, store, root);
  if (symbol.line === undefined || symbol.column === undefined) throw Error('Declaration has no source position.');
  // Preserve the parser's identifier coordinates. A same-line name scan can select another member.
  const resolved = resolvePosition({type:'position',filePath:symbol.filePath!,line:symbol.line-1,character:symbol.column-1},client,root);
  const definitions = await client.getDefinition(resolved.filePath, resolved.position);
  if (definitions.length > 1) throw Error(`Ambiguous TypeScript definitions for '${symbol.title}'; use the intended source position.`);
  if (definitions.length === 1) {
    resolved.filePath = workspacePath(root, client.fromUri(definitions[0]!.uri));
    resolved.position = definitions[0]!.range.start;
    resolved.uri = client.toUri(resolved.filePath);
  }
  return {...resolved,symbolName:symbol.title ?? '',containerName:symbol.containerName,graphEntityId:symbol.id};
}
