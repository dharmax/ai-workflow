/**
 * Responsibility: Bridge @dharmax/skill-manager into AIWF runtime, Actor, and Tool Registry.
 * Scope: Multi-source discovery across sibling skill-manager, local workspace, and user-global skills.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SkillManager, SemantikaSkillStore, type ActivatedSkill, type SkillSummary } from '@dharmax/skill-manager';

export interface AIWFSkillManagerOptions {
  projectRoot?: string;
  extraSources?: Array<{ id: string; path: string; writable?: boolean }>;
}

let cachedManager: SkillManager | null = null;

export function resolveSkillSources(projectRoot?: string) {
  const sources: Array<{ id: string; path: string; writable?: boolean }> = [];

  // 1. Sibling skill-manager repository if available (check projectRoot relative and process.cwd() relative)
  const candidateSiblingPaths = [
    projectRoot ? path.resolve(projectRoot, '../skill-manager') : null,
    path.resolve(process.cwd(), '../skill-manager'),
    path.resolve(import.meta.dir, '../../../skill-manager')
  ].filter(Boolean) as string[];

  const siblingSkillManager = candidateSiblingPaths.find(p => fs.existsSync(path.join(p, 'package.json')));
  if (siblingSkillManager) {
    sources.push({ id: 'sibling-skill-manager', path: siblingSkillManager, writable: false });
  }

  // 2. Project local skills directory if available (.ai-workflow/skills or skills/)
  if (projectRoot) {
    const projectSkills = path.join(projectRoot, 'skills');
    if (fs.existsSync(projectSkills)) {
      sources.push({ id: 'project-skills', path: projectRoot, writable: true });
    }
  }

  // 3. User global skills (~/.gemini/config/skills)
  const globalSkills = path.join(os.homedir(), '.gemini', 'config', 'skills');
  if (fs.existsSync(globalSkills)) {
    sources.push({ id: 'global-skills', path: globalSkills, writable: false });
  }

  return sources;
}

export function getAIWFSkillManager(options: AIWFSkillManagerOptions = {}): SkillManager {
  if (cachedManager) return cachedManager;

  const sources = [
    ...resolveSkillSources(options.projectRoot),
    ...(options.extraSources || [])
  ];

  cachedManager = new SkillManager({
    sources,
    store: new SemantikaSkillStore()
  });

  return cachedManager;
}

export function resetAIWFSkillManager(): void {
  cachedManager = null;
}
