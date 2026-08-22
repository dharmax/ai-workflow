import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { WorkflowStore } from './store.ts';

export interface AuditRuleHeader {
  id: string;
  include: string[];
  extensions: string[];
  exclude?: string[];
  requiredNearTop: string[];
  maxLines?: number;
  message: string;
}

export interface AuditRulePattern {
  id: string;
  include: string[];
  extensions: string[];
  pattern: string;
  flags?: string;
  message?: string;
}

export interface EnforcementConfig {
  headers?: AuditRuleHeader[];
  forbiddenPatterns?: AuditRulePattern[];
  requiredPatterns?: AuditRulePattern[];
}

export interface AuditFinding {
  ruleId: string;
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
  conflicts: string[];
}

/**
 * Validates a rule for syntax errors, regex safety, and conflicts.
 */
export function validateAndModerateRule(
  rule: AuditRulePattern, 
  existingRules: AuditRulePattern[] = []
): RuleValidationResult {
  const errors: string[] = [];
  const conflicts: string[] = [];

  if (!rule.id || rule.id.trim().length === 0) {
    errors.push('Rule ID cannot be empty.');
  }

  if (!rule.pattern || rule.pattern.trim().length === 0) {
    errors.push('Rule pattern cannot be empty.');
  } else {
    try {
      new RegExp(rule.pattern, rule.flags || '');
    } catch (e: any) {
      errors.push(`Invalid regular expression: ${e.message}`);
    }

    // Catastrophic backtracking check
    if (/(\([a-zA-Z0-9_\.\*]+\+\)\+|\(\.\*\)\+)/.test(rule.pattern)) {
      errors.push('High risk of catastrophic regex backtracking detected.');
    }
  }

  // Conflict check against existing rules
  for (const existing of existingRules) {
    if (existing.id === rule.id) {
      conflicts.push(`Duplicate rule ID "${rule.id}" already exists.`);
    }
    if (existing.pattern === rule.pattern && hasOverlap(existing.include, rule.include)) {
      conflicts.push(`Rule "${rule.id}" has identical pattern to existing rule "${existing.id}".`);
    }
  }

  return {
    valid: errors.length === 0 && conflicts.length === 0,
    errors,
    conflicts
  };
}

function hasOverlap(arr1: string[] = [], arr2: string[] = []): boolean {
  if (arr1.length === 0 || arr2.length === 0) return true;
  return arr1.some(item => arr2.includes(item));
}

export async function parseAndStoreGuidelines(store: WorkflowStore) {
  const root = store.root;
  const guidelinesPath = path.join(root, 'project-guidelines.md');
  const enforcementPath = path.join(root, 'enforcement.md');

  // 1. Ingest project-guidelines.md
  if (existsSync(guidelinesPath)) {
    const content = await readFile(guidelinesPath, 'utf8');
    const sections = content.split(/\n##\s+/);

    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const lines = section.split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();
      const id = `GL-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

      store.upsertEntity({
        id,
        type: 'guideline',
        title,
        status: 'accepted',
        body
      });
    }
  }

  // 2. Ingest enforcement.md
  if (existsSync(enforcementPath)) {
    const content = await readFile(enforcementPath, 'utf8');
    const auditMatch = content.match(/```ai-workflow-audit\s*\n([\s\S]*?)\n```/);
    if (auditMatch) {
      try {
        const config: EnforcementConfig = JSON.parse(auditMatch[1]);
        store.upsertEntity({
          id: 'ENF-BASELINE',
          type: 'guideline',
          title: 'Machine-Enforced Baseline Policy',
          status: 'accepted',
          body: content,
          metadata: config
        });
      } catch {
        // Skip malformed audit JSON
      }
    }
  }
}

export async function auditCodebase(
  store: WorkflowStore, 
  options: { targetFiles?: string[]; autofix?: boolean } = {}
): Promise<{ passed: boolean; violationsCount: number; findings: AuditFinding[] }> {
  const root = store.root;
  const findings: AuditFinding[] = [];

  const enfEntity = store.getEntity('ENF-BASELINE');
  const config: EnforcementConfig = enfEntity?.metadata ?? {};

  const files = options.targetFiles && options.targetFiles.length > 0 
    ? options.targetFiles 
    : store.listEntities({ type: 'file' }).map(f => f.id);

  for (const relPath of files) {
    const fullPath = path.join(root, relPath);
    if (!existsSync(fullPath)) continue;

    let content: string;
    try {
      content = await readFile(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // Check Header rules
    if (config.headers) {
      for (const rule of config.headers) {
        if (!matchesFilter(relPath, rule.include, rule.extensions, rule.exclude)) continue;
        const checkLines = lines.slice(0, rule.maxLines ?? 24).join('\n');
        for (const req of rule.requiredNearTop) {
          if (!checkLines.includes(req)) {
            findings.push({
              ruleId: rule.id,
              file: relPath,
              line: 1,
              message: `${rule.message} (missing "${req}")`,
              severity: 'error'
            });
          }
        }
      }
    }

    // Check Forbidden Patterns
    if (config.forbiddenPatterns) {
      for (const rule of config.forbiddenPatterns) {
        if (!matchesFilter(relPath, rule.include, rule.extensions)) continue;
        const regex = new RegExp(rule.pattern, rule.flags || '');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            findings.push({
              ruleId: rule.id,
              file: relPath,
              line: i + 1,
              message: rule.message || `Forbidden pattern matched: ${rule.pattern}`,
              severity: 'error'
            });
          }
        }
      }
    }
  }

  return {
    passed: findings.length === 0,
    violationsCount: findings.length,
    findings
  };
}

function matchesFilter(relPath: string, include: string[], extensions: string[], exclude: string[] = []): boolean {
  for (const exc of exclude) {
    if (relPath.startsWith(exc) || relPath === exc) return false;
  }

  const ext = path.extname(relPath).toLowerCase();
  if (extensions.length > 0 && !extensions.includes(ext)) return false;

  if (include.length === 0) return true;
  return include.some(inc => relPath.startsWith(inc) || relPath === inc);
}
