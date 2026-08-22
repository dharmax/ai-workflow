import { WorkflowStore } from './store.ts';

export function renderTuiDashboard(store: WorkflowStore): string {
  const health = store.getProjectHealth();
  const lines: string[] = [];

  lines.push(`\x1b[1;36m=================================================================\x1b[0m`);
  lines.push(`\x1b[1;37m   AI-WORKFLOW CAUSAL OS & PROJECT VISIBILITY DASHBOARD\x1b[0m`);
  lines.push(`\x1b[1;36m=================================================================\x1b[0m`);
  lines.push(``);

  // Kanban lanes overview
  lines.push(`\x1b[1;33m[KANBAN LANES]\x1b[0m`);
  const laneStr = Object.entries(health.laneCounts)
    .map(([lane, count]) => `${lane}: \x1b[1;32m${count}\x1b[0m`)
    .join('  |  ');
  lines.push(`  ${laneStr}`);
  lines.push(`  Total Tickets: \x1b[1;37m${health.totalTickets}\x1b[0m  |  Open Bug Badges: \x1b[1;31m${health.openBugsCount} 🔴\x1b[0m  |  Accepted ADRs: \x1b[1;34m${health.acceptedDecisionsCount} 📜\x1b[0m`);
  lines.push(``);

  // Module health matrix
  lines.push(`\x1b[1;33m[MODULE HEALTH & DEPENDENCY MATRIX]\x1b[0m`);
  lines.push(`  \x1b[4mModule Name\x1b[0m              \x1b[4mProgress\x1b[0m          \x1b[4mSymbols\x1b[0m   \x1b[4mBugs\x1b[0m   \x1b[4mActive Tickets\x1b[0m`);

  for (const m of health.modules) {
    const barWidth = 10;
    const filled = Math.round((m.completionPercent / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    const color = m.completionPercent === 100 ? '\x1b[32m' : '\x1b[33m';
    const bugBadge = m.bugsCount > 0 ? `\x1b[31m${m.bugsCount} 🔴\x1b[0m` : `\x1b[32m0\x1b[0m`;
    const namePadded = m.name.padEnd(24).substring(0, 24);
    const active = m.activeTickets.join(', ') || '-';

    lines.push(`  ${namePadded} ${color}[${bar}] ${m.completionPercent}%\x1b[0m    ${String(m.symbolCount).padEnd(8)} ${bugBadge.padEnd(14)} ${active}`);
  }

  lines.push(``);
  lines.push(`\x1b[1;36m-----------------------------------------------------------------\x1b[0m`);
  return lines.join('\n');
}

export function startWebServer(store: WorkflowStore, port: number = 3456) {
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/health') {
        return Response.json(store.getProjectHealth());
      }
      if (url.pathname === '/api/tickets') {
        return Response.json(store.listEntities({ type: 'ticket' }));
      }
      if (url.pathname === '/api/decisions') {
        return Response.json(store.listEntities({ type: 'decision' }));
      }

      const health = store.getProjectHealth();
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AI-Workflow Project Graph Dashboard</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    h1 { color: #38bdf8; font-size: 24px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; }
    .card h3 { margin-top: 0; color: #94a3b8; font-size: 14px; text-transform: uppercase; }
    .stat { font-size: 28px; font-weight: bold; color: #f1f5f9; }
    .module-table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
    .module-table th, .module-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #334155; }
    .module-table th { background: #0f172a; color: #94a3b8; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge-bug { background: #7f1d1d; color: #fca5a5; }
    .badge-ok { background: #14532d; color: #86efac; }
  </style>
</head>
<body>
  <h1>🌐 AI-Workflow Causal Graph Dashboard</h1>
  <div class="grid">
    <div class="card"><h3>Total Work Tickets</h3><div class="stat">${health.totalTickets}</div></div>
    <div class="card"><h3>Open Bug Badges</h3><div class="stat" style="color: #f87171;">${health.openBugsCount} 🔴</div></div>
    <div class="card"><h3>Accepted ADRs</h3><div class="stat" style="color: #60a5fa;">${health.acceptedDecisionsCount} 📜</div></div>
    <div class="card"><h3>Active Modules</h3><div class="stat" style="color: #4ade80;">${health.modules.length}</div></div>
  </div>

  <h2>Modules & Implementation Health</h2>
  <table class="module-table">
    <thead>
      <tr><th>Module</th><th>Completion</th><th>AST Symbols</th><th>Bugs</th><th>Active Tickets</th></tr>
    </thead>
    <tbody>
      ${health.modules.map(m => `
        <tr>
          <td><strong>${m.name}</strong></td>
          <td>${m.completionPercent}%</td>
          <td>${m.symbolCount}</td>
          <td>${m.bugsCount > 0 ? `<span class="badge badge-bug">${m.bugsCount} Bugs</span>` : `<span class="badge badge-ok">Clean</span>`}</td>
          <td>${m.activeTickets.join(', ') || 'None'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
      `;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }
  });

  console.log(`\x1b[1;32m[aiwf-ui] Live Web Dashboard running at http://localhost:${server.port}\x1b[0m`);
  return server;
}
