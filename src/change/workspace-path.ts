import fs from 'node:fs';
import path from 'node:path';

/** Reject lexical and symlink escapes before any workspace write. */
export function workspacePath(root: string, file: string): string {
  const absolute = path.resolve(root, file), relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Target '${file}' escapes the workspace.`);
  let existing = absolute;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const actualRoot = fs.realpathSync(root), actual = fs.realpathSync(existing), actualRelative = path.relative(actualRoot, actual);
  if (actualRelative === '..' || actualRelative.startsWith('../') || path.isAbsolute(actualRelative)) throw new Error(`Target '${file}' escapes through a symlink.`);
  return relative;
}
