/**
 * Responsibility: Greenfield code scaffolding and test harness generation.
 * Scope: Creating typed source skeletons paired with automated test suites and triggering immediate graph indexing.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { indexCodebase } from '../graph/indexer.ts';

export function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, chr => chr.toUpperCase());
}

export function registerScaffoldTools() {
  registry.register({
    name: 'scaffold_file',
    description: 'Scaffold a new typed source file paired with an automated test suite and index it immediately.',
    category: 'compiler',
    parameters: z.object({
      targetPath: z.string().describe('Relative path to the new source file (e.g. src/services/auth.ts)'),
      description: z.string().optional().describe('Optional description of the module')
    }),
    execute: async ({ targetPath, description }, ctx: ToolContext) => {
      const fullPath = path.resolve(ctx.projectRoot, targetPath);
      if (fs.existsSync(fullPath)) {
        throw new Error(`Target file already exists: ${targetPath}`);
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      const ext = path.extname(targetPath).toLowerCase();
      const baseName = path.basename(targetPath, ext);
      const pascalName = toPascalCase(baseName);
      const desc = description || `${pascalName} module`;

      let boilerplate = '';
      if (ext === '.ts' || ext === '.tsx') {
        boilerplate = `/**
 * ${desc}
 */

export interface ${pascalName}Options {
  // Add module configuration options here
}

export class ${pascalName} {
  constructor(readonly options: ${pascalName}Options = {}) {}

  execute(): boolean {
    return true;
  }
}
`;
      } else {
        boilerplate = `// ${desc}\nexport const ${baseName} = {};\n`;
      }

      fs.writeFileSync(fullPath, boilerplate, 'utf8');

      // Create paired test file in tests/
      const testDir = path.join(ctx.projectRoot, 'tests');
      fs.mkdirSync(testDir, { recursive: true });
      const testFileName = `${baseName}.test.ts`;
      const testFullPath = path.join(testDir, testFileName);

      let createdTest = false;
      if (!fs.existsSync(testFullPath)) {
        const relImport = path.relative(testDir, fullPath).replace(/\\/g, '/');
        const importPath = relImport.startsWith('.') ? relImport : `./${relImport}`;

        const testContent = `import { describe, it, expect } from 'bun:test';
import { ${pascalName} } from '${importPath}';

describe('${pascalName}', () => {
  it('instantiates and executes default behavior', () => {
    const instance = new ${pascalName}();
    expect(instance).toBeDefined();
    expect(instance.execute()).toBe(true);
  });
});
`;
        fs.writeFileSync(testFullPath, testContent, 'utf8');
        createdTest = true;
      }

      // Incrementally re-index into graph store
      await indexCodebase(ctx.store, ctx.projectRoot);

      return {
        success: true,
        createdFile: targetPath,
        createdTest: createdTest ? `tests/${testFileName}` : null,
        symbol: pascalName
      };
    }
  });
}
