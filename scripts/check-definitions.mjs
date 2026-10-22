// Small repository-local documentation guard; no runtime dependencies or product semantics.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defs = join(root, 'docs/definitions')
const glossary = readdirSync(defs).filter(name => name.endsWith('.md'))
const checked = [
  ...glossary.map(name => join(defs, name)),
  ...['AGENTS.md', 'README.md', 'docs/README.md', 'docs/definition-usage-check.md'].map(name => join(root, name))
]
const errors = []
let links = 0

for (const file of checked) {
  if (!existsSync(file)) { errors.push(`Missing: ${file}`); continue }
  for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    const pathname = target.split('#')[0].split('?')[0]
    if (!pathname || /^[a-z][a-z0-9+.-]*:/i.test(pathname)) continue
    links++
    if (!existsSync(resolve(dirname(file), decodeURIComponent(pathname))))
      errors.push(`Broken link in ${file.slice(root.length + 1)}: ${target}`)
  }
}

const index = readFileSync(join(defs, 'README.md'), 'utf8')
for (const name of glossary.filter(name => name !== 'README.md')) {
  if (!index.includes(`](${name})`)) errors.push(`Unindexed definition: ${name}`)
}

const story = readFileSync(join(defs, 'user-story.md'), 'utf8')
const fieldSection = story.split('## Exact US fields')[1]?.split(/^## /m)[0] ?? ''
const actual = [...fieldSection.matchAll(/^\|\s*\*\*([^*]+)\*\*/gm)].map(m => m[1])
const expected = ['ID', 'Title', 'Actor', 'Intent', 'Initial State', 'Action', 'Expected Result', 'Domains', 'Comments']
if (JSON.stringify(actual) !== JSON.stringify(expected))
  errors.push(`US field table changed: expected ${expected.join(', ')}; got ${actual.join(', ')}`)

if (errors.length) {
  for (const problem of errors) console.error(problem)
  process.exitCode = 1
} else {
  console.log(`Definitions OK: ${glossary.length - 1} concepts, ${links} internal links, ${actual.length} exact US fields`)
}
