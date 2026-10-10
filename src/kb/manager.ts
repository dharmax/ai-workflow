/**
 * Responsibility: Bridge @dharmax/skill-manager into AIWF runtime, Actor, and Tool Registry.
 * Scope: Project-local skills and explicitly configured source repositories.
 */

import path from 'node:path';
import fs from 'node:fs';
import { SkillManager, SemantikaSkillStore } from '@dharmax/skill-manager';

export interface AIWFSkillManagerOptions {
  projectRoot?: string;
  extraSources?: Array<{ id: string; path: string; writable?: boolean }>;
}

export function resolveSkillSources(projectRoot?: string) {
  const sources: Array<{ id: string; path: string; writable?: boolean }> = [];

  // SkillManager sources are repository roots containing skills/<id>/skill.json.
  if (projectRoot) {
    const projectSkills = path.join(projectRoot, 'skills');
    if (fs.existsSync(projectSkills)) {
      sources.push({ id: 'project-skills', path: projectRoot, writable: true });
    }
  }

  return sources;
}

export async function getAIWFSkillManager(options: AIWFSkillManagerOptions = {}): Promise<SkillManager> {
  const sources = [
    ...resolveSkillSources(options.projectRoot),
    ...(options.extraSources || [])
  ];

  const manager = new SkillManager({
    sources,
    store: new SemantikaSkillStore()
  });

  const report = await manager.sync();
  const failures = report.sources.filter(source => source.error);
  if (failures.length) {
    throw new Error(`SkillManager sync failed: ${failures.map(source => `${source.sourceId}: ${source.error}`).join('; ')}`);
  }
  return manager;
}
