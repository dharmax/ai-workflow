import { describe, test, expect } from 'bun:test';
import { validateAndModerateRule, type AuditRulePattern } from '../src/guidelines.ts';

describe('ai-workflow Enforcement Rule Moderation Tests', () => {
  test('Validates safe, correct rule', () => {
    const rule: AuditRulePattern = {
      id: 'no-eval',
      include: ['src'],
      extensions: ['.ts', '.js'],
      pattern: '\\beval\\s*\\(',
      message: 'Do not use eval()'
    };

    const res = validateAndModerateRule(rule);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
    expect(res.conflicts.length).toBe(0);
  });

  test('Detects invalid regex syntax', () => {
    const rule: AuditRulePattern = {
      id: 'broken-regex',
      include: ['src'],
      extensions: ['.ts'],
      pattern: '(?<=unclosed',
      message: 'Invalid regex'
    };

    const res = validateAndModerateRule(rule);
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('Invalid regular expression'))).toBe(true);
  });

  test('Detects catastrophic regex backtracking', () => {
    const dangerousRule: AuditRulePattern = {
      id: 'redos-risk',
      include: ['src'],
      extensions: ['.ts'],
      pattern: '(a+)+',
      message: 'Dangerous regex'
    };

    const res = validateAndModerateRule(dangerousRule);
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('catastrophic regex backtracking'))).toBe(true);
  });

  test('Detects duplicate and conflicting rule IDs', () => {
    const existingRules: AuditRulePattern[] = [
      { id: 'no-console', include: ['src'], extensions: ['.ts'], pattern: 'console\\.log' }
    ];

    const duplicateRule: AuditRulePattern = {
      id: 'no-console',
      include: ['src'],
      extensions: ['.ts'],
      pattern: 'console\\.log'
    };

    const res = validateAndModerateRule(duplicateRule, existingRules);
    expect(res.valid).toBe(false);
    expect(res.conflicts.some(c => c.includes('already exists'))).toBe(true);
  });
});
