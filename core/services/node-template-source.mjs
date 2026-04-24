import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getToolkitRoot } from '../lib/operating-context.mjs';

import { fileURLToPath } from 'node:url';

/**
 * Superb bridge for local template storage.
 * Standard JS implementation for ai-workflow ESM.
 */
export class NodeTemplateSource {
  async fetch(name) {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    // core/services/node-template-source.mjs -> ../../ is project root
    const toolkitRoot = path.resolve(dir, '../../');
    const templatePath = path.resolve(toolkitRoot, 'shared', 'prompts', `${name}.md`);
    return readFile(templatePath, 'utf8');
  }
}
