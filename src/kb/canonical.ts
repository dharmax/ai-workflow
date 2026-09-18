/**
 * Responsibility: Deterministic Canonical JSON Serializer & SHA-256 Hasher.
 * Scope: Exact hash parity across ai-workflow, ai-cli, and dharmax/knowledgebase.
 */

import crypto from 'node:crypto';

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (isObject(value)) {
    return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

export function computeHash(value: unknown): string {
  const serialized = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : canonical(value);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
