import type {ViewRequest} from '@dharmax/shell-ui';
import {runSetup, type SetupOptions, type SetupStepResult} from './setup.ts';

export function setupCommandOptions(tokens: string[]): SetupOptions {
  const allowed = ['--check', '--global', '-g', '--mcp', '--link'];
  if (tokens.some(token => !allowed.includes(token))) throw new Error('Usage: setup [--check] [--global|--mcp|--link]');
  const selected = tokens.some(token => token !== '--check');
  return {check: tokens.includes('--check'), global: !selected || tokens.some(token => ['--global', '-g', '--link'].includes(token)), mcp: !selected || tokens.includes('--mcp'), link: tokens.includes('--link')};
}
export async function runSetupCommand(projectRoot: string, tokens: string[]): Promise<SetupStepResult[]> {
  return runSetup(projectRoot, setupCommandOptions(tokens));
}
export function formatSetupResult(steps: SetupStepResult[]): string {
  return steps.map(step => `[${step.state}] ${step.id}: ${step.message}`).join('\n');
}
export function setupView(steps: SetupStepResult[]): ViewRequest {
  return {id: 'setup', title: 'Setup state', mode: 'readonly', fields: Object.fromEntries(steps.map(step => [step.id, {type: 'text', mode: 'readonly', label: `${step.id} · ${step.state}`, value: step.message}]))};
}
