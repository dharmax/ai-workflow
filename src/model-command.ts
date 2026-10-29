import {ParameterFacilitator, type ViewRequest} from '@dharmax/shell-ui';
import {inspectConfig, loadConfig, readConfigOverrides, setConfigOverride} from './config.ts';
import {MODE_CONFIGS, type WorkflowActor} from './helpers/actor/engine.ts';
import {readModelAdvice} from '@dharmax/llm-utils';
import {refreshDefaultModelAdvice} from './model-runtime.ts';

export async function runModelCommand(projectRoot: string, actor: WorkflowActor, tokens: string[], facilitator?: ParameterFacilitator): Promise<{output: string; view?: ViewRequest} | null> {
  const action = tokens[0] || 'list';
  if (action === 'set') {
    if (tokens.length > 3) throw new Error('Usage: model set <task> <modelTarget>');
    let task = tokens[1];
    let target = tokens[2];
    if ((!task || !target) && facilitator) {
      const values = await facilitator.facilitate({task: {type: 'select', description: 'Model task', choices: ['design', 'dev', 'triage', 'product', 'radar']}, target: {type: 'string', description: 'Provider/model target'}}, {task, target}, {interactive: true});
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
    const refresh = ['refresh', '--refresh', '-r'].includes(tokens[1] ?? '')
    const criticFlag = tokens[2] === '--critic'
    if ((tokens.length > 1 && !refresh) || (tokens.length > 2 && !criticFlag) || (criticFlag && tokens.length < 4))
      throw new Error('Usage: model radar [refresh [--critic <focus>]]');
    const criticFocus = criticFlag ? tokens.slice(3).join(' ').replace(/^['"]|['"]$/g, '') : undefined
    const data = refresh ? await refreshDefaultModelAdvice(projectRoot, criticFocus) : readModelAdvice();
    return {output: data ? `Model advice: ${data.updatedAt} | Authority: ${data.advisor}\n` + Object.entries(data.workloads).map(([task, advice]) => `${task}: ${advice.primary.target.providerId}/${advice.primary.target.modelId} | ${advice.primary.reason}`).join('\n') : 'No valid model advice snapshot. Run model radar refresh explicitly.'};
  }
  if (action !== 'list' || tokens.length > 1) throw new Error('Usage: model [list|radar [refresh [--critic <focus>]]|set <task> <modelTarget>]');
  const config = loadConfig(projectRoot);
  const providers = actor.configuredProviders;
  const defaultSource = inspectConfig(projectRoot, 'model')[0]?.source;
  const advice = readModelAdvice();
  const routes = [...Object.keys(MODE_CONFIGS), 'summarization', 'verification'];
  const routeLines = routes.map(task => {
    const workload = MODE_CONFIGS[task as keyof typeof MODE_CONFIGS]?.taskClass ?? task;
    const recommendation = advice?.workloads[workload]?.primary;
    const override = config.modelRoutes?.[workload] ?? config.modelRoutes?.[task];
    return `[${task.toUpperCase()}] Effective: ${actor.resolveRoute(task)?.target || 'unknown'} | Recommendation: ${recommendation ? recommendation.target.providerId + '/' + recommendation.target.modelId : 'none'}${override ? ` (Override: ${override})` : ''}`;
  });
  const last = actor.lastExecutionMetrics;
  const output = [`Model & Gateway Status`, `Active Gateway: ${config.gateway}`, `Default: ${config.model}${defaultSource !== 'default' ? ' (Override: ' + defaultSource + ')' : ''}`, `Configured Providers: ${providers.join(', ')} (reachability not probed)`, `Escalation Policy: ${config.escalation.policy} (Blast threshold: ${config.escalation.blastRadiusThreshold})`, `Advice: ${advice ? advice.updatedAt + ' | Authority: ' + advice.advisor : 'none'}`, 'Mode Routing:', ...routeLines, ...(last ? [`Last Execution: ${last.providerId}/${last.modelId} (${last.latencyMs}ms, ${last.totalTokens} tokens, success: ${last.success})`] : [])].join('\n');
  const fields = {gateway: config.gateway, providers: providers.join(', '), escalation: config.escalation.policy, ...Object.fromEntries(routes.map((task, index) => [task, routeLines[index]!]))};
  return {output, view: {id: 'model', title: 'Model & Gateway Status', mode: 'readonly', fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, {type: 'text', mode: 'readonly', label: key, value}]))}};
}
