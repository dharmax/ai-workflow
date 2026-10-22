#!/usr/bin/env bun
/**
 * Register this repository's explicitly approved Product Charter through AIWF.
 * Preview by default. --apply uses the existing reviewed Product CLI and
 * re-exports its projections. Never hand-edit the graph or the manifest.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const charter = readFileSync(resolve(root, 'docs/product-charter.md'), 'utf8')
const approvedBlob = 'f72d22db05c49c48369c2c72b657e085e1bf3c63'
const actualBlob = createHash('sha1')
  .update('blob ' + Buffer.byteLength(charter) + '\0')
  .update(charter)
  .digest('hex')

if (actualBlob !== approvedBlob) {
  throw Error('Charter differs from the developer-approved revision. Review the edit before updating this script.')
}
if (!charter.includes('**ID:** ' + String.fromCharCode(96) + 'PRODUCT' + String.fromCharCode(96)) ||
    !charter.includes('**Status:** Accepted — developer-approved on 2026-10-22')) {
  throw Error('Approved charter metadata is missing.')
}

const argv = process.argv.slice(2)
if (argv.some(arg => arg !== '--apply') || argv.length > 1) {
  throw Error('Usage: bun run register:charter [--apply]')
}
const apply = argv.includes('--apply')

function section(heading) {
  const marker = '## ' + heading + '\n'
  const start = charter.indexOf(marker)
  if (start < 0 || charter.indexOf(marker, start + marker.length) !== -1) {
    throw Error('Expected one charter section: ' + heading)
  }
  const from = start + marker.length
  const next = charter.indexOf('\n## ', from)
  return charter.slice(from, next < 0 ? undefined : next).trim()
}

const purpose = section('1. Purpose')
const actorSection = section('2. Actors')
const scope = section('3. Scope')
const nonGoalSection = section('4. Non-goals')
const constraintSection = section('5. Boundaries and Constraints')
const actorLines = actorSection.split('\n').filter(line => line.startsWith('- '))
const actors = actorLines.map(line => {
  const match = line.match(/^- \*\*(.+?):\*\* (.+)$/)
  if (!match) throw Error('Unexpected charter actor format: ' + line)
  return match[1] + ': ' + match[2]
})
const actorNotes = actorSection.split('\n').map(line => line.trim())
  .filter(line => line && !line.startsWith('- '))
if (actors.length !== 4 || actorNotes.length !== 1) {
  throw Error('Actor definitions or role-overlap constraint changed; review the mapping.')
}
const nonGoals = nonGoalSection.split('\n')
  .filter(line => line.startsWith('- ')).map(line => line.slice(2))
if (nonGoals.length !== 7 || !purpose || !scope || !constraintSection) {
  throw Error('Charter fields do not match the approved structure.')
}
// The canonical Product has no separate actor-role note field; preserve the
// approved note under bounds, where authorization and verifier independence belong.
const fields = {
  title: 'AI-Workflow (AIWF)',
  purpose,
  actors,
  scope,
  nonGoals,
  bounds: constraintSection + '\n\n' + actorNotes[0],
  status: 'accepted'
}

function run(args, json = true) {
  const result = spawnSync(process.execPath, ['src/cli.ts', ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    throw Error('AIWF command failed: ' + args.join(' ') + '\n' +
      (result.stderr || '') + '\n' + (result.stdout || '') +
      '\nInspect "bun src/cli.ts product show" before retrying.')
  }
  if (!json) return result.stdout.trim()
  try { return JSON.parse(result.stdout) }
  catch { throw Error('AIWF returned unexpected output for: ' + args.join(' ') + '\n' + result.stdout) }
}

const definitionArgs = [
  'product', 'define', '--title', fields.title,
  '--purpose', fields.purpose, '--scope', fields.scope,
  ...fields.actors.flatMap(actor => ['--actor', actor]),
  ...fields.nonGoals.flatMap(goal => ['--non-goal', goal]),
  '--bounds', fields.bounds, '--status', fields.status
]
const existing = run(['product', 'show'])
const same = product => ['title', 'purpose', 'actors', 'scope', 'nonGoals', 'bounds', 'status']
  .every(key => JSON.stringify(product[key]) === JSON.stringify(fields[key]))

if (existing.defined) {
  if (!same(existing.product)) {
    throw Error('A different PRODUCT record already exists (v' + existing.product?.version +
      '). Nothing changed. Inspect/reconcile it through AIWF rather than overwriting it.')
  }
  console.log('PRODUCT already matches the approved charter (v' + existing.product.version + ').')
} else {
  const preview = run(definitionArgs)
  if (preview.status !== 'preview' || preview.blocked) {
    throw Error('AIWF did not produce an unblocked, inert Product preview:\n' +
      JSON.stringify(preview, null, 2))
  }
  console.log('AIWF Product preview:\n' + JSON.stringify(preview, null, 2))
  if (!apply) {
    console.log('\nNo canonical changes made. Run: bun run register:charter --apply')
    process.exit(0)
  }
  const outcome = run([...definitionArgs, '--yes'])
  if (outcome.status !== 'applied' || outcome.result?.verification?.passed === false) {
    throw Error('Registration was not verified. Inspect the native outcome and Product state:\n' +
      JSON.stringify(outcome, null, 2))
  }
}

if (!apply) {
  console.log('No canonical changes made. Run: bun run register:charter --apply')
  process.exit(0)
}
const verified = run(['product', 'show'])
if (!verified.defined || !same(verified.product) ||
    !Number.isInteger(verified.product.version) || verified.product.version < 1) {
  throw Error('PRODUCT read-back differs from the approved charter. Projections were not exported.')
}
console.log('Verified canonical PRODUCT v' + verified.product.version + ' (accepted).')
console.log(run(['product', 'export'], false))
console.log('Charter registered; inspect product-manifest.md and the exported authored snapshot.')
