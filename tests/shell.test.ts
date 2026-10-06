import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { ProcessViewport, type UiRenderer, type ViewRequest, type ViewResult } from '@dharmax/shell-ui';
import { WorkflowActor } from '../src/actor/engine.ts';
import { processShellInput, type ShellSession } from '../src/shell.ts';

class TestViewRenderer implements UiRenderer {
  readonly mode = 'plain'
  readonly requests: ViewRequest[] = []
  constructor(private readonly result: ViewResult) {}
  isAvailable() { return true }
  async elicit() { return { status: 'unavailable', id: 'test' } as const }
  async form() { return { status: 'unavailable' } as const }
  async review() { return { status: 'unavailable' } as const }
  async view(request: ViewRequest): Promise<ViewResult> {
    this.requests.push(request)
    return this.result
  }
  showProcess(model: any) {
    return {
      step() {},
      label() {},
      mode() {},
      finish() {},
      model,
    }
  }
  dispose() {}
}

describe('Interactive Shell REPL Bridge', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let session: ShellSession;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-shell-test-'));
    store = new WorkflowStore(tempDir, true);
    initializeTools();
    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      offline: true
    });
    session = { store, actor, projectRoot: tempDir };
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should handle session control and help', async () => {
    const exitRes = await processShellInput('exit', session);
    expect(exitRes.exit).toBe(true);

    const helpRes = await processShellInput('help', session);
    expect(helpRes.output).toContain('AI-Workflow 2.0 Terminal REPL');
  });

  it('should dynamically switch modes', async () => {
    const designRes = await processShellInput('/design', session);
    expect(designRes.newMode).toBe('design');
    expect(session.actor.mode).toBe('design');
    expect(session.modeOverride).toBe('design');

    const triageRes = await processShellInput('/triage', session);
    expect(triageRes.newMode).toBe('triage');
    expect(session.actor.mode).toBe('triage');
    expect(session.modeOverride).toBe('triage');

    const autoRes = await processShellInput('/auto', session);
    expect(autoRes.output).toContain('[AUTO]');
    expect(session.modeOverride).toBeUndefined();
  });

  it('should not force the current mode for ordinary input in auto mode', async () => {
    let forcedMode: any = 'unset'
    const autoSession: ShellSession = {
      store,
      projectRoot: tempDir,
      actor: {
        mode: 'dev',
        execute: async (_line: string, mode?: any) => {
          forcedMode = mode
          return {mode: 'product', stepsCount: 0, answer: 'selected', events: []}
        },
      } as any,
    }

    const res = await processShellInput('list current project tickets', autoSession)
    expect(forcedMode).toBeUndefined()
    expect(res.output.startsWith('[PRODUCT]')).toBe(true)
  })

  it('should preserve the selected shell mode for natural-language instructions', async () => {
    await processShellInput('/design', session);
    const res = await processShellInput('review the README against the implementation', session);
    expect(res.output.startsWith('[DESIGN]')).toBe(true);
    expect(res.output).toContain('LLM unavailable');

    const inline = await processShellInput('/triage check the failing tests', session);
    expect(inline.output.startsWith('[TRIAGE]')).toBe(true);
  });

  it('should handle trace controls as deterministic shell commands', async () => {
    // Match the viewport supplied by startShell, without requiring a terminal.
    session.viewport = new ProcessViewport({mode: 'fold', interactive: false})
    const execute = spyOn(session.actor, 'execute')
    try {
      const on = await processShellInput('trace on', session)
      expect(on.output).toBe('Trace mode: full')
      expect(session.viewport?.getMode()).toBe('full')

      const off = await processShellInput('trace off', session)
      expect(off.output).toBe('Trace mode: fold')
      expect(session.viewport?.getMode()).toBe('fold')

      const mode = await processShellInput('trace', session)
      expect(mode.output).toBe('Trace mode: fold')
      expect(execute).not.toHaveBeenCalled()
    } finally {
      execute.mockRestore()
    }
  })

  it('should report unavailable trace controls without invoking the Actor', async () => {
    const execute = spyOn(session.actor, 'execute')
    try {
      const result = await processShellInput('trace on', session)
      expect(result.output).toBe('Trace viewport unavailable.')
      expect(session.viewport).toBeUndefined()
      expect(execute).not.toHaveBeenCalled()
    } finally {
      execute.mockRestore()
    }
  })

  it('should facilitate interactive escalation policy selection', async () => {
    const { ParameterFacilitator } = await import('@dharmax/shell-ui')
    const requests: unknown[] = []
    session.interactive = true
    session.facilitator = new ParameterFacilitator({
      elicit: async request => {
        requests.push(request)
        return {status: 'answered', id: request.id, value: 'local_only'}
      },
      form: async () => ({status: 'unavailable'}),
      review: async () => ({status: 'unavailable'}),
      view: async () => ({status: 'unavailable'}),
    })
    const result = await processShellInput('escalate', session)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({kind: 'select', choices: [
      {id: 'auto'}, {id: 'local_only'}, {id: 'prompt'}, {id: 'sota'}
    ]})
    expect(result.output).toContain('local_only')
    const { loadConfig } = await import('../src/config.ts')
    expect(loadConfig(tempDir).escalation?.policy).toBe('local_only')
  })

  it('should execute all domain fast-paths without LLM invocation', async () => {
    // 1. Status & Diff
    const statusRes = await processShellInput('status', session);
    expect(statusRes.output).toContain('[Git]');
    expect(statusRes.output).toContain('[Active Leases]');

    const diffRes = await processShellInput('diff', session);
    expect(typeof diffRes.output).toBe('string');

    // 2. Eval
    const evalRes = await processShellInput('eval 10 * 4', session);
    expect(evalRes.output).toBe('40');

    // 3. Tickets, Claim, Next, Release
    const emptyTickets = await processShellInput('tickets', session);
    expect(emptyTickets.output).toContain('No tickets found');

    const nextRes = await processShellInput('next', session);
    expect(nextRes.output).toContain('No pending tasks');

    // Create a ticket via eval or direct store
    const { Ticket } = await import('../src/graph/ontology.ts');
    await session.store.upsertEntity(Ticket.dcr, {
      id: 'TKT-SHELL-1',
      title: 'Test Shell Verb Execution',
      lane: 'Todo'
    });

    const listRes = await processShellInput('tickets', session);
    expect(listRes.output).toContain('TKT-SHELL-1');
    expect(listRes.output).toContain('Test Shell Verb Execution');

    const claimRes = await processShellInput('claim TKT-SHELL-1 agent-tester 15', session);
    expect(claimRes.output).toContain("Claimed ticket TKT-SHELL-1 for 15m by 'agent-tester'");

    const releaseRes = await processShellInput('release TKT-SHELL-1', session);
    expect(releaseRes.output).toContain('Released ticket TKT-SHELL-1');

    const moveRes = await processShellInput('move TKT-SHELL-1 In Progress', session);
    expect(moveRes.output).toContain("Moved ticket 'TKT-SHELL-1' to 'In Progress'");

    const doneRes = await processShellInput('done TKT-SHELL-1', session);
    expect(doneRes.output).toContain("Marked ticket 'TKT-SHELL-1' as Done and synced Kanban");

    // 4. Config Get & Set
    const cfgGet = await processShellInput('config get defaultAgentId', session);
    expect(cfgGet.output).toContain('defaultAgentId');

    const cfgSet = await processShellInput('config set defaultAgentId custom-operator', session);
    expect(cfgSet.output).toContain('defaultAgentId = custom-operator');

    // 5. Index & Doctor
    const idxRes = await processShellInput('index', session);
    expect(idxRes.output).toContain('Indexed');

    const docRes = await processShellInput('doctor', session);
    expect(docRes.output).toContain('Doctor Report');

    const auditRes = await processShellInput('audit', session);
    expect(auditRes.output).toContain('AI-Workflow Audit');

    const metricsRes = await processShellInput('metrics', session);
    expect(metricsRes.output).toContain('Performance Metrics');
  });

  it('should open and save Ticket Views through the canonical update tool', async () => {
    await registry.execute('create_ticket', {
      id: 'TKT-VIEW-1',
      title: 'Original title',
      lane: 'Todo',
      priority: 'P2',
      body: 'Original body'
    }, { store, projectRoot: tempDir });

    const renderer = new TestViewRenderer({
      status: 'submitted',
      values: {
        title: 'Updated title',
        lane: 'In Progress',
        priority: 'P1',
        body: 'Updated body',
        acceptanceCriteria: 'works\npersists'
      }
    });
    session.renderer = renderer;
    session.interactive = true;

    const result = await processShellInput('ticket TKT-VIEW-1', session);
    expect(result.output).toContain("Saved ticket 'TKT-VIEW-1'");

    const ticket = await store.getEntity<any>('TKT-VIEW-1');
    expect(ticket.title).toBe('Updated title');
    expect(ticket.lane).toBe('In Progress');
    expect(ticket.priority).toBe('P1');
    expect(ticket.body).toBe('Updated body');
    expect(ticket.acceptanceCriteria).toEqual(['works', 'persists']);

    const request = renderer.requests.at(-1) as any;
    expect(request.fields.id.mode).toBe('readonly');
    expect(request.fields.body.grow).toBe(true);
  });

  it('should auto-complete shell commands with shellCompleter', async () => {
    const { shellCompleter } = await import('../src/shell.ts');

    const [staHits] = shellCompleter('sta');
    expect(staHits).toContain('status');

    const [cliHits] = shellCompleter('cl');
    expect(cliHits).toContain('claim');

    const [docHits] = shellCompleter('doc');
    expect(docHits).toContain('doctor');

    const [modeHits] = shellCompleter('/d');
    expect(modeHits).toContain('/design');
    expect(modeHits).toContain('/dev');
  });

  it('should delegate complex natural language wishes to cognitive actor', async () => {
    const wishRes = await processShellInput('tell me about the project architecture', session);
    expect(wishRes.output).toContain('LLM unavailable');
    expect(wishRes.output).not.toContain('Target Domain');
  });

  it('should reject missing required parameters with usage info in non-interactive mode', async () => {
    session.interactive = false;

    const claimRes = await processShellInput('claim', session);
    expect(claimRes.output).toBe('Usage: claim <ticketId> [agent] [minutes]');

    const moveRes = await processShellInput('move', session);
    expect(moveRes.output).toBe('Usage: move <ticketId> <Backlog|Todo|"In Progress"|Done|Blocked>');

    const moveNoLaneRes = await processShellInput('move TKT-1', session);
    expect(moveNoLaneRes.output).toBe('Usage: move <ticketId> <Backlog|Todo|"In Progress"|Done|Blocked>');

    const releaseRes = await processShellInput('release', session);
    expect(releaseRes.output).toBe('Usage: release <ticketId>');

    const doneRes = await processShellInput('done', session);
    expect(doneRes.output).toBe('Usage: done <ticketId>');

    const createRes = await processShellInput('create', session);
    expect(createRes.output).toBe('Usage: create <title>');

    const symbolRes = await processShellInput('symbol', session);
    expect(symbolRes.output).toBe('Usage: symbol <name>');

    const sliceRes = await processShellInput('slice', session);
    expect(sliceRes.output).toBe('Usage: slice <filePath> <symbolName>');

    const blastRes = await processShellInput('blast', session);
    expect(blastRes.output).toBe('Usage: blast <target>');
  });

  it('should dynamically complete tickets and lanes with buildSmartCompleter', async () => {
    const { buildSmartCompleter } = await import('../src/shell.ts');
    const { Ticket } = await import('../src/graph/ontology.ts');

    await session.store.upsertEntity(Ticket.dcr, {
      id: 'TKT-AUTOCOMPLETE-99',
      title: 'Dynamic Autocompletion Target',
      lane: 'Todo'
    });

    const completer = buildSmartCompleter(session);

    // 1. Complete ticket ID after 'claim '
    const claimRes = completer.complete('claim ', 6);
    expect(claimRes.completions).toContain('TKT-AUTOCOMPLETE-99');

    // 2. Complete ticket ID with prefix
    const prefixRes = completer.complete('claim TKT-AUTO', 14);
    expect(prefixRes.completions).toContain('TKT-AUTOCOMPLETE-99');

    // 3. Complete ticket ID for 'move '
    const moveTicketRes = completer.complete('move ', 5);
    expect(moveTicketRes.completions).toContain('TKT-AUTOCOMPLETE-99');

    // 4. Complete lane for 'move TKT-AUTOCOMPLETE-99 '
    const moveLaneRes = completer.complete('move TKT-AUTOCOMPLETE-99 ', 25);
    expect(moveLaneRes.completions).toContain('In Progress');
    expect(moveLaneRes.completions).toContain('Done');
    expect(moveLaneRes.completions).toContain('Blocked');

    // 5. Complete partial lane
    const movePartialLaneRes = completer.complete('move TKT-AUTOCOMPLETE-99 In', 27);
    expect(movePartialLaneRes.completions).toEqual(['In Progress']);
  });

  it('should interactively facilitate missing parameters via InteractivePrompter', async () => {
    const { Ticket } = await import('../src/graph/ontology.ts');
    const { InteractivePrompter, ParameterFacilitator } = await import('@dharmax/shell-ui');

    await session.store.upsertEntity(Ticket.dcr, {
      id: 'TKT-PROMPT-1',
      title: 'Interactive Test Ticket',
      lane: 'Todo'
    });

    class MockPrompter extends InteractivePrompter {
      constructor(
        private askMap: Record<string, string>,
        private selectMap: Record<string, string> = {}
      ) {
        super();
      }
      override getIsTty() {
        return true;
      }
      override async ask(message: string): Promise<string> {
        for (const [key, val] of Object.entries(this.askMap)) {
          if (message.toLowerCase().includes(key.toLowerCase())) return val;
        }
        return Object.values(this.askMap)[0] || '';
      }
      override async select(message: string, choices: string[]): Promise<string> {
        for (const [key, val] of Object.entries(this.selectMap)) {
          if (message.toLowerCase().includes(key.toLowerCase())) return val;
        }
        return choices[0] || '';
      }
    }

    const mockPrompter = new MockPrompter(
      {
        'ticket id': 'TKT-PROMPT-1',
        title: 'Interactively Created Ticket'
      },
      {
        ticket: 'TKT-PROMPT-1',
        lane: 'In Progress'
      }
    );

    session.prompter = mockPrompter;
    session.facilitator = new ParameterFacilitator(mockPrompter);
    session.interactive = true;

    // 1. Interactive claim: user typed just 'claim', prompter selected 'TKT-PROMPT-1'
    const claimRes = await processShellInput('claim', session);
    expect(claimRes.output).toContain("Claimed ticket TKT-PROMPT-1 for 30m by 'human-operator'");

    // 2. Interactive move: user typed 'move TKT-PROMPT-1', prompter selected 'In Progress'
    const moveRes = await processShellInput('move TKT-PROMPT-1', session);
    expect(moveRes.output).toContain("Moved ticket 'TKT-PROMPT-1' to 'In Progress'");

    // 3. Interactive create: user typed just 'create', prompter entered title
    const createRes = await processShellInput('create', session);
    expect(createRes.output).toContain("Created ticket '");
    expect(createRes.output).toContain("in lane 'Todo' and synced Kanban.");
  });
});
