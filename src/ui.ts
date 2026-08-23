import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { WorkflowStore } from './store.ts';
import { exportMarkdown } from './sync.ts';
import { getBlastRadius, getFeatureBlastRadius } from './impact.ts';
import { InteractiveShell } from './shell.ts';
import { packTicketContext } from './context.ts';
import { auditCodebase } from './guidelines.ts';

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
  const shell = new InteractiveShell(store);
  const localRiotPath = '/home/dharmax/work/WebstormProjects/simple-graph/node_modules/riot/riot+compiler.min.js';
  const feDir = path.join(store.root, 'fe');

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS Preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      // Vendor JS (Riot compiler bundle)
      if (url.pathname === '/vendor/riot.js') {
        if (existsSync(localRiotPath)) {
          const content = readFileSync(localRiotPath, 'utf8');
          return new Response(content, { headers: { 'Content-Type': 'application/javascript' } });
        }
        return Response.redirect('https://cdn.jsdelivr.net/npm/riot@6/riot+compiler.min.js', 302);
      }

      // Static Riot Component Serving
      if (url.pathname.startsWith('/fe/components/')) {
        const filePath = path.join(store.root, url.pathname);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf8');
          return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
        return new Response('Component Not Found', { status: 404 });
      }

      // API Endpoints
      if (url.pathname === '/api/health') {
        return Response.json(store.getProjectHealth());
      }

      if (url.pathname === '/api/tickets') {
        return Response.json(store.listEntities({ type: 'ticket' }));
      }

      if (url.pathname.startsWith('/api/tickets/') && url.pathname.endsWith('/deep')) {
        const ticketId = url.pathname.replace('/api/tickets/', '').replace('/deep', '');
        const ticket = store.getEntity(ticketId);
        if (!ticket) return Response.json({ error: 'Ticket not found' }, { status: 404 });
        const context = await packTicketContext(store, ticketId);
        const artifacts = store.getRunArtifacts(ticketId);
        const outgoing = store.getOutgoing(ticketId);
        const incoming = store.getIncoming(ticketId);
        return Response.json({ ticket, context, artifacts, outgoing, incoming });
      }

      if (url.pathname === '/api/claims') {
        return Response.json(store.getActiveClaims());
      }

      if (url.pathname === '/api/decisions') {
        return Response.json(store.listEntities({ type: 'decision' }));
      }

      if (url.pathname === '/api/epics') {
        const epics = store.listEntities({ type: 'epic' });
        const enriched = epics.map(ep => {
          const children = store.getOutgoing(ep.id, 'implements').concat(store.getIncoming(ep.id, 'implements'));
          return { ...ep, children };
        });
        return Response.json(enriched);
      }

      if (url.pathname === '/api/impact') {
        const target = url.searchParams.get('target') || '';
        if (!target) return Response.json({ error: 'target required' }, { status: 400 });
        return Response.json(getBlastRadius(store, target));
      }

      if (url.pathname === '/api/impact/feature' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const wish = body.wish || '';
          if (!wish) return Response.json({ error: 'wish required' }, { status: 400 });
          const res = await getFeatureBlastRadius(store, wish, shell.asker);
          return Response.json(res);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      }

      if (url.pathname === '/api/tickets/move' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const { ticketId, lane, status } = body;
          const existing = store.getEntity(ticketId);
          if (!existing) return Response.json({ error: 'Ticket not found' }, { status: 404 });

          const updated = store.upsertEntity({
            ...existing,
            lane,
            status: status ?? (lane === 'Done' ? 'verified' : lane === 'In Progress' ? 'partial' : 'planned')
          });
          await exportMarkdown(store);
          return Response.json({ success: true, ticket: updated });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      }

      if (url.pathname === '/api/tickets/claim' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const { ticketId, agentId, durationMinutes } = body;
          const durationMs = (durationMinutes ?? 30) * 60 * 1000;
          const res = store.claimTicket(ticketId, agentId || 'human-ui', durationMs);
          await exportMarkdown(store);
          return Response.json(res);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      }

      if (url.pathname === '/api/tickets/release' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const { ticketId, agentId } = body;
          const res = store.releaseTicket(ticketId, agentId);
          await exportMarkdown(store);
          return Response.json(res);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      }

      if (url.pathname === '/api/tickets/save' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const { ticketId, title, body: ticketBody, lane, status } = body;
          const existing = store.getEntity(ticketId);
          if (!existing) return Response.json({ error: 'Ticket not found' }, { status: 404 });

          const updated = store.upsertEntity({
            ...existing,
            title: title ?? existing.title,
            body: ticketBody ?? existing.body,
            lane: lane ?? existing.lane,
            status: status ?? existing.status
          });
          await exportMarkdown(store);
          return Response.json({ success: true, ticket: updated });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400 });
        }
      }

      if (url.pathname === '/api/tickets/audit' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const { ticketId } = body;
          const files = store.getOutgoing(ticketId, 'modifies').concat(store.getIncoming(ticketId, 'modifies')).filter(e => e.type === 'file');
          const targetFiles = files.length > 0 ? files.map(f => f.id) : undefined;
          const res = await auditCodebase(store, { targetFiles });
          return Response.json(res);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      }

      if (url.pathname === '/api/tickets/verify' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const { ticketId } = body;
          const ctx = await packTicketContext(store, ticketId);
          const cmd = ctx.context?.verificationCommand || 'bun test';
          const parts = cmd.split(/\s+/);

          const proc = Bun.spawn(parts, { stdout: 'pipe', stderr: 'pipe' });
          const exitCode = await proc.exited;
          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          const passed = exitCode === 0;

          store.recordRunArtifact({
            id: `run-${Date.now()}`,
            ticketId,
            action: 'automated-test',
            status: passed ? 'passed' : 'failed',
            lessons: { command: cmd, exitCode, output: stdout.slice(0, 500) }
          });

          return Response.json({ passed, command: cmd, exitCode, stdout, stderr });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      }

      if (url.pathname === '/api/tickets/execute' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const { ticketId } = body;
          const existing = store.getEntity(ticketId);
          if (!existing) return Response.json({ error: 'Ticket not found' }, { status: 404 });

          // 1. Claim lease
          store.claimTicket(ticketId, 'shell-agent', 30 * 60 * 1000);
          // 2. Move to In Progress
          store.upsertEntity({
            ...existing,
            lane: 'In Progress',
            status: 'partial'
          });
          await exportMarkdown(store);

          // 3. Pack bounded context
          const packed = await packTicketContext(store, ticketId);
          const output = `⚡ Autonomously dispatched ticket ${ticketId} ("${existing.title}"). Claimed lease for shell-agent. Packed ${packed.tokenCount} tokens.`;

          return Response.json({ success: true, output, packed });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      }

      if (url.pathname === '/api/shell/exec' && req.method === 'POST') {
        try {
          const body = await req.json() as any;
          const command = body.command || '';
          const output = await shell.executeCommand(command);
          return Response.json({ output, mode: shell.mode });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      }

      // Root HTML Document loading Riot Components via data-src
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI-Workflow Causal Cockpit</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131c2e;
      --card-border: #24344d;
      --text: #f1f5f9;
      --text-muted: #8e9fb5;
      --accent: #38bdf8;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --lane-bg: #0e1626;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 20px; line-height: 1.5; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 16px; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .logo-area { display: flex; align-items: center; gap: 12px; }
    .logo-area h1 { font-size: 20px; font-weight: 700; color: var(--accent); letter-spacing: -0.5px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: var(--card); border: 1px solid var(--card-border); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button { background: var(--card); color: var(--text); border: 1px solid var(--card-border); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; }
    button:hover { background: #1e293b; border-color: var(--accent); }
    button.primary { background: #0284c7; border-color: #38bdf8; color: #fff; }
    button.primary:hover { background: #0369a1; }
    button.danger { background: #991b1b; border-color: #f87171; color: #fff; }
    button.success { background: #166534; border-color: #4ade80; color: #fff; }
    
    /* Navigation Bar */
    .nav-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--card-border); margin-bottom: 20px; }
    .nav-btn { background: transparent; border: none; border-bottom: 2px solid transparent; border-radius: 0; padding: 10px 16px; color: var(--text-muted); font-weight: 600; font-size: 14px; cursor: pointer; }
    .nav-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

    /* Overview Stats */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .stat-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 8px; padding: 14px 18px; }
    .stat-card h3 { font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
    .stat-card .val { font-size: 26px; font-weight: 700; }

    /* Kanban Board */
    .kanban-board { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; align-items: flex-start; }
    .kanban-col { background: var(--lane-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; min-height: 480px; }
    .col-header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--card-border); color: var(--text-muted); }
    .ticket-card { background: var(--card); border: 1px solid var(--card-border); border-radius: 6px; padding: 12px; margin-bottom: 10px; cursor: pointer; transition: transform 0.1s, border-color 0.1s; }
    .ticket-card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .ticket-id { font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 4px; display: flex; justify-content: space-between; }
    .ticket-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; line-height: 1.3; }
    .ticket-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); }
    .claim-badge { background: #4c1d95; color: #c4b5fd; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px; }
    .status-badge { background: #0f172a; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--card-border); font-size: 11px; }

    /* Tables & Trees */
    .data-table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 8px; overflow: hidden; border: 1px solid var(--card-border); }
    .data-table th, .data-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--card-border); font-size: 13px; }
    .data-table th { background: #0b1120; color: var(--text-muted); font-weight: 600; }
    .tree-node { background: var(--card); border: 1px solid var(--card-border); border-radius: 6px; padding: 14px; margin-bottom: 12px; }
    .tree-node h4 { color: var(--accent); font-size: 14px; margin-bottom: 4px; }
    .tree-children { margin-left: 20px; margin-top: 8px; border-left: 2px solid #24344d; padding-left: 14px; }

    /* Modal / Inspector Drawer */
    .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: none; justify-content: flex-end; z-index: 2000; }
    .drawer-overlay.open { display: flex; }
    .drawer-panel { width: 620px; max-width: 90vw; background: #0f172a; height: 100vh; border-left: 1px solid var(--card-border); padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
    .drawer-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--card-border); padding-bottom: 12px; }
    .drawer-section { background: var(--card); border: 1px solid var(--card-border); border-radius: 6px; padding: 12px 16px; }
    .drawer-section h4 { font-size: 12px; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }

    /* Shell Console Drawer */
    .shell-drawer { position: fixed; bottom: 0; left: 0; right: 0; background: #040813; border-top: 2px solid #38bdf8; padding: 14px 20px; transition: transform 0.25s ease; box-shadow: 0 -10px 25px rgba(0,0,0,0.6); z-index: 1000; }
    .shell-drawer.collapsed { transform: translateY(calc(100% - 42px)); }
    .shell-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; margin-bottom: 10px; }
    .shell-log { height: 180px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #a7f3d0; background: #0b1120; padding: 12px; border-radius: 4px; margin-bottom: 8px; white-space: pre-wrap; border: 1px solid var(--card-border); }
    .shell-input-box { display: flex; gap: 8px; }
    .shell-input { flex: 1; background: #131c2e; border: 1px solid var(--card-border); border-radius: 4px; padding: 8px 12px; color: #fff; font-family: monospace; font-size: 13px; }
  </style>
  <script src="/vendor/riot.js"></script>
  <script type="riot" data-src="/fe/components/page-kanban.riot"></script>
  <script type="riot" data-src="/fe/components/page-epics.riot"></script>
  <script type="riot" data-src="/fe/components/page-graph.riot"></script>
  <script type="riot" data-src="/fe/components/page-decisions.riot"></script>
  <script type="riot" data-src="/fe/components/page-modules.riot"></script>
  <script type="riot" data-src="/fe/components/ticket-inspector.riot"></script>
  <script type="riot" data-src="/fe/components/web-shell.riot"></script>
  <script type="riot" data-src="/fe/components/app-root.riot"></script>
</head>
<body>
  <app-root></app-root>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      if (window.riot && window.riot.compile) {
        window.riot.compile().then(() => {
          window.riot.mount('app-root');
        }).catch(err => {
          console.error('Riot compilation failed:', err);
        });
      }
    });
  </script>
</body>
</html>`;

      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }
  });

  console.log(`\x1b[1;32m[aiwf-ui] Live Riot.js Cockpit running at http://localhost:${server.port}\x1b[0m`);
  return server;
}
