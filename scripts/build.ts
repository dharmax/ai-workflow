const revisionResult = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {stderr: 'inherit'})
if (!revisionResult.success) throw new Error('Cannot determine AIWF git revision for compiled build')
const revision = revisionResult.stdout.toString().trim()

const result = await Bun.build({
  entrypoints: ['src/cli.ts'],
  compile: {outfile: 'dist/aiwf'},
  minify: true,
  define: {
    AIWF_BUILD_REVISION: JSON.stringify(revision),
  },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`Built dist/aiwf @ ${revision}`)
