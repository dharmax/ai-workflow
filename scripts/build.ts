import path from 'node:path'

const revisionResult = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {stderr: 'inherit'})
if (!revisionResult.success) throw new Error('Cannot determine AIWF git revision for compiled build')
const revision = revisionResult.stdout.toString().trim()
const llmUtilsRoot = path.resolve(import.meta.dir, '../../llm-utils')
const llmRevisionResult = Bun.spawnSync(['git', '-C', llmUtilsRoot, 'rev-parse', 'HEAD'], {stderr: 'inherit'})
if (!llmRevisionResult.success) throw new Error('Cannot determine llm-utils git revision for compiled build')
const llmUtilsRevision = llmRevisionResult.stdout.toString().trim()

const result = await Bun.build({
  entrypoints: ['src/cli.ts'],
  compile: {outfile: 'dist/aiwf'},
  minify: true,
  define: {
    AIWF_BUILD_REVISION: JSON.stringify(revision),
    LLM_UTILS_BUILD_REVISION: JSON.stringify(llmUtilsRevision),
  },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`Built dist/aiwf @ ${revision} with llm-utils @ ${llmUtilsRevision}`)
