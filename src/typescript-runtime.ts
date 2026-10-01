/**
 * Responsibility: Single authoritative resolver and provisioner for TypeScript 7 runtime.
 * Scope: Shared across setup, doctor, and TsLspClient.
 * Rules:
 *   - Resolution order:
 *     1. Compatible project-local TypeScript 7 (without mutating project dependencies)
 *     2. aiwf's own packaged runtime TypeScript 7
 *     3. Compatible host PATH TypeScript 7
 *   - Only provision at user/global scope if no compatible host command exists.
 *   - Never alter a project's pinned TypeScript version as a setup side effect.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export interface TsRuntimeResolution {
  executablePath: string;
  version: string;
  source: 'project' | 'packaged' | 'host';
  isCompatible: boolean;
  lspReady: boolean;
  error?: string;
}

export interface TsProvisionResult {
  attempted: boolean;
  provisioned: boolean;
  executablePath?: string;
  version?: string;
  error?: string;
}

export interface TsResolverSeams {
  execCommand?: (cmd: string[], options?: { cwd?: string; env?: Record<string, string> }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  fsExists?: (p: string) => boolean;
  pathEnv?: string;
  homeDir?: string;
  packagedTsDir?: string;
}

/**
 * Extracts and validates version string (must be 7.x.x).
 */
export function isCompatibleTsVersion(versionStr: string): boolean {
  const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const major = parseInt(match[1], 10);
  return major === 7;
}

/**
 * Runs executable with -v to get exact TypeScript version string.
 */
async function queryTsVersion(
  executablePath: string,
  exec: (cmd: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
): Promise<string | null> {
  try {
    const res = await exec([executablePath, '-v']);
    if (res.exitCode === 0) {
      const match = res.stdout.match(/Version\s+([\d.]+)/i) || res.stdout.match(/([\d.]+)/);
      if (match) return match[1].trim();
    }
  } catch {}
  return null;
}

/**
 * Probes whether the executable supports `--lsp`.
 */
async function probeLspReadiness(
  executablePath: string,
  exec: (cmd: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
): Promise<boolean> {
  try {
    // tsc --lsp --help exits with code 2 and outputs "Usage of lsp:" or contains lsp options
    const res = await exec([executablePath, '--lsp', '--help']);
    const combined = `${res.stdout} ${res.stderr}`;
    return combined.toLowerCase().includes('usage of lsp') || combined.toLowerCase().includes('-stdio');
  } catch {
    return false;
  }
}

/**
 * Default process execution seam using Bun.spawn.
 */
async function defaultExec(cmd: string[], options?: { cwd?: string; env?: Record<string, string> }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn(cmd, {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  } catch (err: any) {
    return { exitCode: 1, stdout: '', stderr: err.message || String(err) };
  }
}

/**
 * Resolves the active TypeScript 7 executable following the strict hierarchy:
 * 1. Compatible project-local TS7
 * 2. aiwf packaged TS7
 * 3. Compatible host PATH TS7
 */
export async function resolveTypeScriptRuntime(
  projectRoot: string,
  seams?: TsResolverSeams
): Promise<TsRuntimeResolution> {
  const exec = seams?.execCommand || defaultExec;
  const exists = seams?.fsExists || fs.existsSync;
  const pathEnv = seams?.pathEnv ?? process.env.PATH ?? '';
  const home = seams?.homeDir ?? process.env.HOME ?? os.homedir();

  // 1. Check Project-local node_modules/.bin/tsc
  const projectTsc = path.join(projectRoot, 'node_modules', '.bin', 'tsc');
  if (exists(projectTsc)) {
    const version = await queryTsVersion(projectTsc, exec);
    if (version && isCompatibleTsVersion(version)) {
      const lspReady = await probeLspReadiness(projectTsc, exec);
      return {
        executablePath: projectTsc,
        version,
        source: 'project',
        isCompatible: true,
        lspReady
      };
    }
  }

  // 2. Check aiwf packaged runtime TypeScript 7
  // Package directory of ai-workflow itself
  const packagedRoot = seams?.packagedTsDir || path.resolve(__dirname, '..');
  const packagedTsc = path.join(packagedRoot, 'node_modules', '.bin', 'tsc');
  if (packagedTsc !== projectTsc && exists(packagedTsc)) {
    const version = await queryTsVersion(packagedTsc, exec);
    if (version && isCompatibleTsVersion(version)) {
      const lspReady = await probeLspReadiness(packagedTsc, exec);
      return {
        executablePath: packagedTsc,
        version,
        source: 'packaged',
        isCompatible: true,
        lspReady
      };
    }
  }

  // 3. Check Host PATH tsc candidates
  const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);
  // Also consider Bun global/user bin (~/.bun/bin) if not in PATH
  const bunGlobalBin = path.join(home, '.bun', 'bin');
  if (!pathDirs.includes(bunGlobalBin)) {
    pathDirs.push(bunGlobalBin);
  }

  for (const dir of pathDirs) {
    const candidate = path.join(dir, 'tsc');
    if (exists(candidate) && candidate !== projectTsc && candidate !== packagedTsc) {
      const version = await queryTsVersion(candidate, exec);
      if (version && isCompatibleTsVersion(version)) {
        const lspReady = await probeLspReadiness(candidate, exec);
        return {
          executablePath: candidate,
          version,
          source: 'host',
          isCompatible: true,
          lspReady
        };
      }
    }
  }

  // If we reached here, no compatible TS7 is available.
  // Check if project has an incompatible TS version for clear error reporting.
  let errorMsg = 'No compatible TypeScript 7 executable found.';
  if (exists(projectTsc)) {
    const incompVer = await queryTsVersion(projectTsc, exec);
    if (incompVer) {
      errorMsg = `Project TypeScript version is ${incompVer} (requires 7.x). No compatible packaged or host TS7 found.`;
    }
  }

  return {
    executablePath: '',
    version: '',
    source: 'host',
    isCompatible: false,
    lspReady: false,
    error: errorMsg
  };
}

/**
 * Checks host-level compatibility. Returns true if host PATH provides a working TS7.
 */
export async function checkHostTypeScriptCompatibility(seams?: TsResolverSeams): Promise<{ compatible: boolean; version?: string; path?: string }> {
  const exec = seams?.execCommand || defaultExec;
  const exists = seams?.fsExists || fs.existsSync;
  const pathEnv = seams?.pathEnv ?? process.env.PATH ?? '';
  const home = seams?.homeDir ?? process.env.HOME ?? os.homedir();

  const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);
  const bunGlobalBin = path.join(home, '.bun', 'bin');
  if (!pathDirs.includes(bunGlobalBin)) pathDirs.push(bunGlobalBin);

  for (const dir of pathDirs) {
    const candidate = path.join(dir, 'tsc');
    if (exists(candidate)) {
      const version = await queryTsVersion(candidate, exec);
      if (version && isCompatibleTsVersion(version)) {
        return { compatible: true, version, path: candidate };
      }
    }
  }
  return { compatible: false };
}

/**
 * Ensures a compatible host-level TS7 is provisioned at user/global Bun scope if needed.
 * Never modifies project dependencies or uses sudo.
 */
export async function ensureHostTypeScript7(
  seams?: TsResolverSeams
): Promise<TsProvisionResult> {
  const hostCheck = await checkHostTypeScriptCompatibility(seams);
  if (hostCheck.compatible) {
    return {
      attempted: false,
      provisioned: false,
      executablePath: hostCheck.path,
      version: hostCheck.version
    };
  }

  const exec = seams?.execCommand || defaultExec;
  // Attempt user/global installation via `bun add -g typescript@^7`
  try {
    const res = await exec(['bun', 'add', '-g', 'typescript@^7']);
    if (res.exitCode !== 0) {
      return {
        attempted: true,
        provisioned: false,
        error: `Failed to install typescript@^7 globally via Bun: ${res.stderr || res.stdout}`
      };
    }

    const recheck = await checkHostTypeScriptCompatibility(seams);
    if (recheck.compatible) {
      return {
        attempted: true,
        provisioned: true,
        executablePath: recheck.path,
        version: recheck.version
      };
    }

    return {
      attempted: true,
      provisioned: false,
      error: 'Provisioned typescript@^7 via Bun, but executable was not found or verified compatible in PATH.'
    };
  } catch (err: any) {
    return {
      attempted: true,
      provisioned: false,
      error: err.message || String(err)
    };
  }
}

export interface Ts6RefactorResolution {
  isAvailable: boolean;
  tslsBinPath?: string;
  tsserverPath?: string;
  tslsVersion?: string;
  ts6Version?: string;
  error?: string;
}

/**
 * Pinned TS6 version for the compatibility sidecar.
 */
export const PINNED_TS6_VERSION = '6.0.3';

/**
 * Authoritative resolver for the TS6 tsserver refactor sidecar.
 * Locates:
 * 1. typescript-language-server binary
 * 2. pinned/compatible TypeScript 6 tsserver.js
 */
export async function resolveTs6RefactorRuntime(
  projectRoot: string,
  seams?: TsResolverSeams
): Promise<Ts6RefactorResolution> {
  const exists = seams?.fsExists || fs.existsSync;
  const exec = seams?.execCommand || defaultExec;
  const home = seams?.homeDir ?? process.env.HOME ?? os.homedir();
  const packagedRoot = seams?.packagedTsDir || path.resolve(__dirname, '..');

  // 1. Resolve typescript-language-server executable
  const tslsCandidates = [
    path.join(projectRoot, 'node_modules', '.bin', 'typescript-language-server'),
    path.join(packagedRoot, 'node_modules', '.bin', 'typescript-language-server'),
    path.join(home, '.bun', 'bin', 'typescript-language-server')
  ];

  let tslsBinPath: string | undefined;
  for (const c of tslsCandidates) {
    if (exists(c)) {
      tslsBinPath = c;
      break;
    }
  }

  if (!tslsBinPath) {
    return {
      isAvailable: false,
      error: 'typescript-language-server executable not found. Run `aiwf setup`.'
    };
  }

  // 2. Resolve TS6 tsserver.js
  const tsserverCandidates = [
    path.join(home, '.aiwf', 'ts6', 'node_modules', 'typescript', 'lib', 'tsserver.js'),
    path.join(home, '.bun', 'install', 'global', 'node_modules', 'typescript6', 'lib', 'tsserver.js'),
    path.join(packagedRoot, 'node_modules', 'typescript6', 'lib', 'tsserver.js'),
    path.join(projectRoot, 'node_modules', 'typescript6', 'lib', 'tsserver.js')
  ];

  let tsserverPath: string | undefined;
  for (const c of tsserverCandidates) {
    if (exists(c)) {
      tsserverPath = c;
      break;
    }
  }

  if (!tsserverPath) {
    return {
      isAvailable: false,
      tslsBinPath,
      error: `Pinned TypeScript ${PINNED_TS6_VERSION} (tsserver.js) not found. Run \`aiwf setup\`.`
    };
  }

  // Query tsls version
  let tslsVersion: string | undefined;
  try {
    const res = await exec([tslsBinPath, '--version']);
    if (res.exitCode === 0) {
      tslsVersion = res.stdout.trim();
    }
  } catch {}

  return {
    isAvailable: true,
    tslsBinPath,
    tsserverPath,
    tslsVersion,
    ts6Version: PINNED_TS6_VERSION
  };
}

/**
 * Ensures TS6 tsserver and typescript-language-server are provisioned in user scope (~/.aiwf/ts6)
 * without touching target project dependencies.
 */
export async function ensureTs6RefactorRuntime(
  projectRoot: string,
  seams?: TsResolverSeams
): Promise<TsProvisionResult> {
  const current = await resolveTs6RefactorRuntime(projectRoot, seams);
  if (current.isAvailable) {
    return {
      attempted: false,
      provisioned: false,
      executablePath: current.tslsBinPath,
      version: `${current.ts6Version} (tsls: ${current.tslsVersion})`
    };
  }

  const exec = seams?.execCommand || defaultExec;
  const home = seams?.homeDir ?? process.env.HOME ?? os.homedir();
  const ts6Dir = path.join(home, '.aiwf', 'ts6');

  try {
    fs.mkdirSync(ts6Dir, { recursive: true });
    // Write a standalone package.json in ~/.aiwf/ts6 so bun add installs locally there
    const pkgJsonPath = path.join(ts6Dir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify({
        name: 'aiwf-ts6-sidecar',
        private: true,
        dependencies: {}
      }, null, 2));
    }

    // Install pinned typescript@6.0.3 inside ~/.aiwf/ts6
    const res = await exec(['bun', 'add', `typescript@${PINNED_TS6_VERSION}`], { cwd: ts6Dir });
    if (res.exitCode !== 0) {
      return {
        attempted: true,
        provisioned: false,
        error: `Failed to install typescript@${PINNED_TS6_VERSION} in ${ts6Dir}: ${res.stderr || res.stdout}`
      };
    }

    const recheck = await resolveTs6RefactorRuntime(projectRoot, seams);
    if (recheck.isAvailable) {
      return {
        attempted: true,
        provisioned: true,
        executablePath: recheck.tslsBinPath,
        version: `${recheck.ts6Version} (tsls: ${recheck.tslsVersion})`
      };
    }

    return {
      attempted: true,
      provisioned: false,
      error: recheck.error || 'Provisioning TS6 sidecar completed, but resolution failed.'
    };
  } catch (err: any) {
    return {
      attempted: true,
      provisioned: false,
      error: err.message || String(err)
    };
  }
}

