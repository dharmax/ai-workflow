import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const projectRoot = path.resolve(import.meta.dir, '..')
const packageJson = await Bun.file(path.join(projectRoot, 'package.json')).json() as { version: string }

const revisionResult = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {stderr: 'inherit'})
if (!revisionResult.success) throw new Error('Cannot determine AIWF git revision for compiled build')
const revision = revisionResult.stdout.toString().trim()
const shortRevisionResult = Bun.spawnSync(['git', 'rev-parse', '--short=12', 'HEAD'], {stderr: 'inherit'})
if (!shortRevisionResult.success) throw new Error('Cannot determine AIWF short git revision for compiled build')
const shortRevision = shortRevisionResult.stdout.toString().trim()
const buildNumberResult = Bun.spawnSync(['git', 'rev-list', '--count', 'HEAD'], {stderr: 'inherit'})
if (!buildNumberResult.success) throw new Error('Cannot determine AIWF build number for compiled build')
const buildNumber = buildNumberResult.stdout.toString().trim()
const updatedAtResult = Bun.spawnSync(['git', 'show', '-s', '--format=%cI', 'HEAD'], {stderr: 'inherit'})
if (!updatedAtResult.success) throw new Error('Cannot determine AIWF last update time for compiled build')
const updatedAt = updatedAtResult.stdout.toString().trim()
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

/** Keep the parser's generated relative JS/native loaders intact in the executable. */
async function stageOxcRuntime(staging: string) {
  await import('@dharmax/codebase-parser')
  const packageRoot = path.dirname(Bun.resolveSync('oxc-parser/package.json', projectRoot))
  const entry = path.relative(packageRoot, Bun.resolveSync('oxc-parser', projectRoot))
  const directory = path.join(staging, 'oxc-parser')
  fs.cpSync(packageRoot, directory, {recursive: true})
  const nativeAddons = Object.keys(require.cache).filter(file => file.endsWith('.node'))
  if (!nativeAddons.length) throw new Error('Parser native addon was not loaded; refusing an incomplete standalone build')
  for (const file of nativeAddons)
    fs.copyFileSync(file, path.join(directory, path.dirname(entry), path.basename(file)))
  return {directory, importPath: './oxc-parser/' + entry.split(path.sep).join('/')}
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-parser-build-'))
let result: Awaited<ReturnType<typeof Bun.build>>
try {
  const parser = await stageOxcRuntime(staging)
  result = await Bun.build({
  entrypoints: ['src/cli.ts'],
  plugins: [{name: 'embedded-parser-runtime', setup(build) {
    build.onResolve({filter: /^oxc-parser$/}, () => ({path: parser.importPath, external: true}))
  }}],
  compile: {outfile: 'dist/aiwf', assets: [parser.directory]},
  minify: true,
  define: {
    AIWF_VERSION: JSON.stringify(packageJson.version),
    AIWF_BUILD_NUMBER: JSON.stringify(buildNumber),
    AIWF_BUILD_REVISION: JSON.stringify(revision),
    AIWF_BUILD_UPDATED_AT: JSON.stringify(updatedAt),
    AIWF_BUILD_DIRTY: JSON.stringify(dirty),
    LLM_UTILS_BUILD_REVISION: JSON.stringify(llmUtilsRevision),
    LLM_UTILS_BUILD_DIRTY: JSON.stringify(llmUtilsDirty),
  },
  })
} finally {
  fs.rmSync(staging, {recursive: true, force: true})
}

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`Built AIWF ${packageJson.version} build ${buildNumber} @ ${shortRevision}${dirty ? ' (dirty)' : ''}, updated ${updatedAt}; llm-utils @ ${llmUtilsRevision}${llmUtilsDirty ? ' (dirty)' : ''}`)
