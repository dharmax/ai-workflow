import {ParameterFacilitator, type ViewRequest} from '@dharmax/shell-ui';
import {loadConfig, readConfigOverrides, setConfigOverride} from './config.ts';
import type {WorkflowActor} from './actor/engine.ts';

export async function runModelCommand(projectRoot: string, actor: WorkflowActor, tokens: string[], facilitator?: ParameterFacilitator): Promise<{output: string; view?: ViewRequest} | null> {
  const action = tokens[0] || 'list';
  if (action === 'set') {
    if (tokens.length > 3) throw new Error('Usage: model set <task> <modelTarget>');
    let task = tokens[1];
    let target = tokens[2];
    if ((!task || !target) && facilitator) {
      const values = await facilitator.facilitate({task: {type: 'select', description: 'Model task', choices: ['design', 'dev', 'triage', 'product']}, target: {type: 'string', description: 'Provider/model target'}}, {task, target}, {interactive: true});
      if (typeof values.task !== 'string' || typeof values.target !== 'string') return null;
      task = values.task;
      target = values.target;
    }
    if (!task || !target) throw new Error('Usage: model set <task> <modelTarget>');
    loadConfig(projectRoot);
    const routes = readConfigOverrides(projectRoot).modelRoutes as Record<string, string> | undefined;
    setConfigOverride(projectRoot, 'modelRoutes', JSON.stringify({...routes, [task.toLowerCase()]: target}));
    actor.reloadConfig();
    return {output: `Set model for [${task.toUpperCase()}] to: ${target}`};
  }
  if (action === 'radar') {
    if (tokens.slice(1).some(token => !['refresh', '--refresh', '-r'].includes(token))) throw new Error('Usage: model radar [--refresh]');
    const data = tokens.length > 1 ? await actor.radar.probe(true) : actor.radar.getData();
    return {output: [`SOTA Model Radar (Source: ${data.source.toUpperCase()}, Updated: ${new Date(data.lastUpdated).toLocaleDateString()})`, 'Model Target · Elo · $/1M input/output · Pareto · Recommended', ...data.models.map(model => `${model.id} · ${model.codingElo} · $${model.promptPricePer1M}/$${model.completionPricePer1M} · ${model.paretoScore} · ${model.bestFor.join(', ')}`)].join('\n')};
  }
  if (action !== 'list' || tokens.length > 1) throw new Error('Usage: model [list|radar [--refresh]|set <task> <modelTarget>]');
  const config = loadConfig(projectRoot);
  const providers = actor.getConfiguredProviders();
  const recommendations = actor.radar.getRecommendations();
  const routes = ['design', 'dev', 'triage', 'product'] as const;
  const routeLines = routes.map(task => `[${task.toUpperCase()}] Effective: ${actor.getEffectiveRoute(task)?.target || 'unknown'} | Local: ${config.model} | Cloud: ${recommendations[task]}${config.modelRoutes?.[task] ? ` (Override: ${config.modelRoutes[task]})` : ''}`);
  const last = actor.getLastExecutionMetrics();
  const output = [`Model & Gateway Status`, `Active Gateway: ${config.gateway}`, `Configured Providers: ${providers.join(', ')} (reachability not probed)`, `Escalation Policy: ${config.escalation.policy} (Blast threshold: ${config.escalation.blastRadiusThreshold})`, 'Mode Routing:', ...routeLines, ...(last ? [`Last Execution: ${last.providerId}/${last.modelId} (${last.latencyMs}ms, ${last.totalTokens} tokens, success: ${last.success})`] : [])].join('\n');
  const fields = {gateway: config.gateway, providers: providers.join(', '), escalation: config.escalation.policy, ...Object.fromEntries(routes.map((task, index) => [task, routeLines[index]!]))};
  return {output, view: {id: 'model', title: 'Model & Gateway Status', mode: 'readonly', fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, {type: 'text', mode: 'readonly', label: key, value}]))}};
}
