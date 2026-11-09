import fs from 'node:fs';
import path from 'node:path';

/** Reject lexical and symlink escapes before any workspace write. */
export function workspacePath(root: string, file: string): string {
  const absolute = path.resolve(root, file), relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Target '${file}' escapes the workspace.`);
  if (['.git', '.ai-workflow'].includes(relative.split(path.sep)[0]!))
    throw new Error(`Target '${file}' is protected workspace metadata.`);
  let existing = absolute;
  while (!fs.existsSync(existing)) {
    // existsSync follows symlinks and reports false for a dangling link.
    // Walking past one would allow the eventual write to bypass the realpath check.
    if (fs.lstatSync(existing, {throwIfNoEntry: false})?.isSymbolicLink())
      throw new Error(`Target '${file}' escapes through a dangling symlink.`);
    existing = path.dirname(existing);
  }
  const actualRoot = fs.realpathSync(root), actual = fs.realpathSync(existing), actualRelative = path.relative(actualRoot, actual);
  if (actualRelative === '..' || actualRelative.startsWith('../') || path.isAbsolute(actualRelative)) throw new Error(`Target '${file}' escapes through a symlink.`);
  return relative;
}
