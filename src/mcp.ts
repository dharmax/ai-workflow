#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WorkflowStore } from './store.ts';
import { packTicketContext } from './context.ts';
import { CodeletEngine } from './compiler.ts';
import { LocalGitTransport } from './transport.ts';
import { auditCodebase } from './guidelines.ts';
import { DecisionManager } from './decisions.ts';
import { getBlastRadius, getFeatureBlastRadius, generateDigest, recommendNextTask, doctorCheck } from './impact.ts';
import { MetricsCollector } from './metrics.ts';
import { InteractiveShell } from './shell.ts';

export function createAiWorkflowMcpServer(projectRoot: string = process.cwd()) {
  const store = new WorkflowStore(projectRoot);
  const compiler = new CodeletEngine(store);
  const decisions = new DecisionManager(store);
  const transport = new LocalGitTransport(store);
  const metrics = new MetricsCollector(store);
  const server = new McpServer({
    name: 'ai-workflow',
    version: '1.0.0'
  });

  // 1. get_ticket_context
  server.tool('get_ticket_context', 'Fetch high-density bounded context (ticket + epic + AST symbols + guidelines + past lessons + test command)', {
    ticketId: z.string(),
    maxTokens: z.number().optional(),
    format: z.enum(['xml', 'markdown', 'json']).optional()
  }, async ({ ticketId, maxTokens, format }) => {
    const res = await packTicketContext(store, ticketId, { maxTokens, format });
    return {
      content: [{ type: 'text', text: res.rendered || `Ticket not found: ${ticketId}` }]
    };
  });

  // 2. get_project_overview
  server.tool('get_project_overview', 'Fetch complete module health, completion levels, bug indicators, and Kanban lanes', {}, async () => {
    const health = store.getProjectHealth();
    return {
      content: [{ type: 'text', text: JSON.stringify(health, null, 2) }]
    };
  });

  // 3. audit_guidelines
  server.tool('audit_guidelines', 'Audit codebase against machine-enforced policies and design guidelines', {
    targetFiles: z.array(z.string()).optional()
  }, async ({ targetFiles }) => {
    const res = await auditCodebase(store, { targetFiles });
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 4. get_telemetry_metrics
  server.tool('get_telemetry_metrics', 'Get context compression ratios, token savings, and execution latency metrics', {}, async () => {
    const summary = metrics.getSummary();
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
    };
  });

  // 5. update_ticket_state
  server.tool('update_ticket_state', 'Move a ticket, record execution output or failure lessons, and sync markdown', {
    ticketId: z.string(),
    lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']),
    status: z.enum(['planned', 'partial', 'implemented', 'verified']).optional(),
    lesson: z.record(z.any()).optional()
  }, async ({ ticketId, lane, status, lesson }) => {
    const existing = store.getEntity(ticketId);
    const updated = store.upsertEntity({
      id: ticketId,
      type: 'ticket',
      title: existing?.title || ticketId,
      lane,
      status: status ?? (lane === 'Done' ? 'verified' : lane === 'In Progress' ? 'partial' : 'planned')
    });

    if (lesson) {
      store.recordRunArtifact({
        id: `run-${Date.now()}`,
        ticketId,
        action: 'mcp-update',
        status: lane === 'Done' ? 'passed' : 'failed',
        lessons: lesson
      });
    }

    await transport.sync();
    return {
      content: [{ type: 'text', text: `Ticket ${ticketId} updated to ${lane}. Synced with kanban.md.` }]
    };
  });

  // 6. compile_codelet
  server.tool('compile_codelet', 'Synthesize and compile a natural language wish into a tested, reusable JavaScript routine', {
    wish: z.string(),
    compound: z.number().optional(),
    tags: z.array(z.string()).optional()
  }, async ({ wish, compound, tags }) => {
    const codelet = await compiler.compileWish(wish, { compound, tags });
    return {
      content: [{ type: 'text', text: JSON.stringify({
        title: codelet.meta.title,
        titleHash: codelet.meta.titleHash,
        doc: codelet.meta.doc,
        sourceCode: codelet.sourceCode
      }, null, 2) }]
    };
  });

  // 7. list_codelets
  server.tool('list_codelets', 'List all compiled routines and codelets in the repository', {}, async () => {
    const list = await compiler.listCodelets();
    return {
      content: [{ type: 'text', text: JSON.stringify(list, null, 2) }]
    };
  });

  // 8. search_codelets
  server.tool('search_codelets', 'Search compiled routines by keyword, tag, or title', {
    query: z.string()
  }, async ({ query }) => {
    const list = await compiler.listCodelets();
    const lower = query.toLowerCase();
    const matched = list.filter((c: any) => 
      c.meta?.title?.toLowerCase().includes(lower) || 
      c.meta?.doc?.toLowerCase().includes(lower) ||
      (c.meta?.tags || []).some((t: string) => t.toLowerCase().includes(lower))
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(matched, null, 2) }]
    };
  });

  // 9. run_codelet
  server.tool('run_codelet', 'Execute a compiled routine by name or titleHash with input arguments', {
    nameOrHash: z.string(),
    args: z.record(z.any()).optional()
  }, async ({ nameOrHash, args }) => {
    const result = await compiler.runCodelet(nameOrHash, args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify({ nameOrHash, result }, null, 2) }]
    };
  });

  // 10. propose_decision
  server.tool('propose_decision', 'Propose an Architectural Decision Record (ADR) and link affected modules or epics', {
    id: z.string(),
    title: z.string(),
    body: z.string(),
    impactedModules: z.array(z.string()).optional(),
    epicId: z.string().optional()
  }, async ({ id, title, body, impactedModules, epicId }) => {
    const dec = decisions.proposeDecision({ id, title, body, impactedModules, epicId });
    await transport.sync();
    return {
      content: [{ type: 'text', text: `Proposed ADR ${id}: ${title}. Synced with decisions.md.` }]
    };
  });

  // 11. revert_decision
  server.tool('revert_decision', 'Revert an Architectural Decision Record (ADR), cancel affected tickets, and log reason', {
    id: z.string(),
    reason: z.string()
  }, async ({ id, reason }) => {
    const res = decisions.revertDecision(id, reason);
    await transport.sync();
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 12. get_blast_radius
  server.tool('get_blast_radius', 'Analyze blast radius for a target file or symbol', {
    target: z.string()
  }, async ({ target }) => {
    const res = getBlastRadius(store, target);
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 13. search_knowledge
  server.tool('search_knowledge', 'Search across entities, epics, decisions, and in-code notes', {
    query: z.string()
  }, async ({ query }) => {
    const lower = query.toLowerCase();
    const entities = store.listEntities().filter(e => e.title.toLowerCase().includes(lower) || (e.body || '').toLowerCase().includes(lower));
    const notes = store.listCodeNotes().filter(n => n.body.toLowerCase().includes(lower) || n.filePath.toLowerCase().includes(lower));

    return {
      content: [{ type: 'text', text: JSON.stringify({ matchedEntities: entities, matchedNotes: notes }, null, 2) }]
    };
  });

  // 14. claim_ticket
  server.tool('claim_ticket', 'Atomically claim/lease a ticket for an AI agent to prevent task collision', {
    ticketId: z.string(),
    agentId: z.string(),
    durationMinutes: z.number().optional()
  }, async ({ ticketId, agentId, durationMinutes }) => {
    const durationMs = (durationMinutes ?? 30) * 60 * 1000;
    const res = store.claimTicket(ticketId, agentId, durationMs);
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 15. release_ticket
  server.tool('release_ticket', 'Release an active ticket claim/lease', {
    ticketId: z.string(),
    agentId: z.string().optional()
  }, async ({ ticketId, agentId }) => {
    const res = store.releaseTicket(ticketId, agentId);
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 16. execute_shell_wish
  server.tool('execute_shell_wish', 'Execute an autonomous wish or command through the ai-workflow Shell Engine', {
    wish: z.string()
  }, async ({ wish }) => {
    const shell = new InteractiveShell(store);
    const output = await shell.executeCommand(wish);
    return {
      content: [{ type: 'text', text: output }]
    };
  });

  // 17. recommend_next_task
  server.tool('recommend_next_task', 'Get the highest leverage task from the dependency graph', {}, async () => {
    const res = recommendNextTask(store);
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 18. analyze_feature_blast_radius
  server.tool('analyze_feature_blast_radius', 'Analyze AI-driven semantic blast radius for a proposed feature or refactoring', {
    featureWish: z.string()
  }, async ({ featureWish }) => {
    const res = await getFeatureBlastRadius(store, featureWish);
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 19. doctor_diagnose
  server.tool('doctor_diagnose', 'Run repository health diagnostics and optionally auto-create tickets for unlinked notes', {
    fix: z.boolean().optional()
  }, async ({ fix }) => {
    const res = doctorCheck(store, { fix });
    if (fix) await transport.sync();
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
    };
  });

  // 20. get_ticket_deep_view
  server.tool('get_ticket_deep_view', 'Get deep inspection payload for a ticket including AST symbols, callers, past run artifacts and lessons', {
    ticketId: z.string()
  }, async ({ ticketId }) => {
    const ticket = store.getEntity(ticketId);
    if (!ticket) return { content: [{ type: 'text', text: `Ticket ${ticketId} not found.` }] };
    const context = await packTicketContext(store, ticketId);
    const artifacts = store.getRunArtifacts(ticketId);
    const outgoing = store.getOutgoing(ticketId);
    const incoming = store.getIncoming(ticketId);
    return {
      content: [{ type: 'text', text: JSON.stringify({ ticket, context, artifacts, outgoing, incoming }, null, 2) }]
    };
  });

  // 21. get_ui_state
  server.tool('get_ui_state', 'Fetch unified cockpit state (health, lanes, claims, ADRs, module matrix)', {}, async () => {
    const health = store.getProjectHealth();
    const tickets = store.listEntities({ type: 'ticket' });
    const claims = store.getActiveClaims();
    const decisions = store.listEntities({ type: 'decision' });
    const epics = store.listEntities({ type: 'epic' });
    return {
      content: [{ type: 'text', text: JSON.stringify({ health, tickets, claims, decisions, epics }, null, 2) }]
    };
  });

  return { server, store, compiler, decisions, metrics };
}

export async function runMcpStdio(projectRoot?: string) {
  if (process.stdin.isTTY) {
    process.stderr.write('\x1b[1;36mai-workflow MCP server is running on stdio (listening for host JSON-RPC)...\x1b[0m\n');
    process.stderr.write('\x1b[33mNote: This process is launched automatically by AI clients (Claude Desktop, Cursor, Gemini CLI, Claude Code).\x1b[0m\n');
    process.stderr.write('Run \x1b[1;32maiwf setup\x1b[0m to see client configurations. Press \x1b[1mCtrl+C\x1b[0m to exit.\n\n');
  }
  const { server } = createAiWorkflowMcpServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  runMcpStdio().catch(err => {
    console.error('MCP Server Error:', err);
    process.exit(1);
  });
}

