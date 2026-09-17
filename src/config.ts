/**
 * Responsibility: Project and Global Configuration Management.
 * Scope: Reads and updates .ai-workflow/config.json with global user fallbacks.
 */

import path from 'node:path';
import fs from 'node:fs';

export interface ProjectConfig {
  defaultAgentId: string;
  defaultLeaseMinutes: number;
  ollamaUrl: string;
  model: string;
  autoSync: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: ProjectConfig = {
  defaultAgentId: 'human-operator',
  defaultLeaseMinutes: 30,
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  model: process.env.AIWF_MODEL || 'qwen2.5-coder:7b',
  autoSync: true,
  logLevel: 'info'
};

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.ai-workflow', 'config.json');
}

export function loadConfig(projectRoot: string): ProjectConfig {
  const cfgPath = getConfigPath(projectRoot);
  if (fs.existsSync(cfgPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...raw };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(projectRoot: string, config: Partial<ProjectConfig>): ProjectConfig {
  const cfgPath = getConfigPath(projectRoot);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  const existing = loadConfig(projectRoot);
  const updated: ProjectConfig = { ...existing, ...config };
  fs.writeFileSync(cfgPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
