import path from 'node:path'

const revisionResult = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {stderr: 'inherit'})
if (!revisionResult.success) throw new Error('Cannot determine AIWF git revision for compiled build')
const revision = revisionResult.stdout.toString().trim()
const dirtyResult = Bun.spawnSync(['git', 'status', '--porcelain'], {stderr: 'inherit'})
if (!dirtyResult.success) throw new Error('Cannot determine AIWF working-tree state for compiled build')
const dirty = Boolean(dirtyResult.stdout.toString().trim())
const llmUtilsRoot = path.resolve(import.meta.dir, '../../llm-utils')
const llmRevisionResult = Bun.spawnSync(['git', '-C', llmUtilsRoot, 'rev-parse', 'HEAD'], {stderr: 'inherit'})
if (!llmRevisionResult.success) throw new Error('Cannot determine llm-utils git revision for compiled build')
const llmUtilsRevision = llmRevisionResult.stdout.toString().trim()
const llmDirtyResult = Bun.spawnSync(['git', '-C', llmUtilsRoot, 'status', '--porcelain'], {stderr: 'inherit'})
if (!llmDirtyResult.success) throw new Error('Cannot determine llm-utils working-tree state for compiled build')
const llmUtilsDirty = Boolean(llmDirtyResult.stdout.toString().trim())

const result = await Bun.build({
  entrypoints: ['src/cli.ts'],
  compile: {outfile: 'dist/aiwf'},
  minify: true,
  define: {
    AIWF_BUILD_REVISION: JSON.stringify(revision),
    AIWF_BUILD_DIRTY: JSON.stringify(dirty),
    LLM_UTILS_BUILD_REVISION: JSON.stringify(llmUtilsRevision),
    LLM_UTILS_BUILD_DIRTY: JSON.stringify(llmUtilsDirty),
  },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`Built dist/aiwf @ ${revision}${dirty ? ' (dirty)' : ''} with llm-utils @ ${llmUtilsRevision}${llmUtilsDirty ? ' (dirty)' : ''}`)
