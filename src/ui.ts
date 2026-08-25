import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { WorkflowStore } from './store.ts';
import { exportMarkdown } from './sync.ts';
import { getBlastRadius, getFeatureBlastRadius } from './impact.ts';
import { InteractiveShell } from './shell.ts';
import { packTicketContext } from './context.ts';
import { auditCodebase } from './guidelines.ts';
import {
  triageTestFailures,
  getEpicProgress,
  getGitHotspots,
  getEnvironmentInfo
} from './helpers.ts';

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

      if (url.pathname === '/api/metrics') {
        return Response.json(shell.metrics.getSummary());
      }

      if (url.pathname === '/api/burndown') {
        return Response.json(getEpicProgress(store));
      }

      if (url.pathname === '/api/hotspots') {
        const days = Number(url.searchParams.get('days') || '14');
        const res = await getGitHotspots(store.root, days);
        return Response.json(res);
      }

      if (url.pathname === '/api/env') {
        return Response.json(getEnvironmentInfo(store.root));
      }

      if (url.pathname === '/api/triage') {
        const cmd = url.searchParams.get('cmd') || undefined;
        const res = await triageTestFailures(store.root, cmd);
        return Response.json(res);
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

      // Static CSS & Riot Assets
      if (url.pathname.startsWith('/fe/')) {
        const filePath = path.join(store.root, url.pathname);
        if (existsSync(filePath)) {
          const contentType = url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8';
          const content = readFileSync(filePath, 'utf8');
          return new Response(content, { headers: { 'Content-Type': contentType } });
        }
        return new Response('Asset Not Found', { status: 404 });
      }

      // Root HTML Document loading modular Riot Pages & Components
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI-Workflow Causal Cockpit</title>
  <link rel="stylesheet" href="/fe/css/theme.css">
  <script src="/vendor/riot.js"></script>
  <script type="riot" data-src="/fe/pages/page-kanban.riot"></script>
  <script type="riot" data-src="/fe/pages/page-epics.riot"></script>
  <script type="riot" data-src="/fe/pages/page-graph.riot"></script>
  <script type="riot" data-src="/fe/pages/page-decisions.riot"></script>
  <script type="riot" data-src="/fe/pages/page-modules.riot"></script>
  <script type="riot" data-src="/fe/pages/page-metrics.riot"></script>
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
