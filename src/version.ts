import fs from 'node:fs'
import path from 'node:path'

declare const AIWF_VERSION: string | undefined
declare const AIWF_BUILD_NUMBER: string | undefined
declare const AIWF_BUILD_REVISION: string | undefined
declare const AIWF_BUILD_UPDATED_AT: string | undefined

export interface BuildInfo {
  version: string
  build: string
  revision: string
  updatedAt: string
}

function git(projectRoot: string, ...args: string[]): string | undefined {
  const result = Bun.spawnSync(['git', '-C', projectRoot, ...args], { stderr: 'ignore' })
  return result.success ? result.stdout.toString().trim() || undefined : undefined
}

function packageVersion(projectRoot: string): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function getBuildInfo(): BuildInfo {
  const projectRoot = path.resolve(import.meta.dir, '..')
  const version = typeof AIWF_VERSION !== 'undefined'
    ? AIWF_VERSION
    : packageVersion(projectRoot)
  const revision = typeof AIWF_BUILD_REVISION !== 'undefined'
    ? AIWF_BUILD_REVISION
    : git(projectRoot, 'rev-parse', '--short=12', 'HEAD') || 'unknown'
  const build = typeof AIWF_BUILD_NUMBER !== 'undefined'
    ? AIWF_BUILD_NUMBER
    : git(projectRoot, 'rev-list', '--count', 'HEAD') || 'unknown'
  const updatedAt = typeof AIWF_BUILD_UPDATED_AT !== 'undefined'
    ? AIWF_BUILD_UPDATED_AT
    : git(projectRoot, 'show', '-s', '--format=%cI', 'HEAD') || 'unknown'

  return { version, build, revision, updatedAt }
}

export function formatBuildInfo(name = 'AIWF'): string {
  const info = getBuildInfo()
  return `${name} ${info.version} · build ${info.build} (${info.revision.slice(0, 12)}) · updated ${info.updatedAt}`
}
