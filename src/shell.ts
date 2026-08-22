import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Asker, z } from '@dharmax/llm-utils';
import { WorkflowStore } from './store.ts';
import { CodeletEngine } from './compiler.ts';
import { DecisionManager } from './decisions.ts';
import { packTicketContext } from './context.ts';
import { renderTuiDashboard } from './ui.ts';
import { getBlastRadius, generateDigest, recommendNextTask, doctorCheck } from './impact.ts';
import { LocalGitTransport } from './transport.ts';

export type ShellMode = 'design' | 'product' | 'dev' | 'triage';

export class InteractiveShell {
  private mode: ShellMode = 'design';
  private asker = new Asker();
  private compiler: CodeletEngine;
  private decisions: DecisionManager;
  private transport: LocalGitTransport;

  constructor(private store: WorkflowStore) {
    this.compiler = new CodeletEngine(store);
    this.decisions = new DecisionManager(store);
    this.transport = new LocalGitTransport(store);
  }

  async start() {
    const rl = readline.createInterface({ input, output });
    console.log(`\x1b[1;36m==================================================\x1b[0m`);
    console.log(`\x1b[1;37m   AI-WORKFLOW REPL & CAUSAL ENGINEERING OS\x1b[0m`);
    console.log(`\x1b[1;36m==================================================\x1b[0m`);
    console.log(`Modes: /design (Architect) | /product (PM) | /dev (Engineer) | /triage (Reviewer)`);
    console.log(`Commands: sync, status, next, impact <target>, digest, doctor, run <codelet>, exit\n`);

    while (true) {
      const modeColor = this.mode === 'design' ? '\x1b[35m' : this.mode === 'product' ? '\x1b[34m' : this.mode === 'dev' ? '\x1b[32m' : '\x1b[33m';
      const prompt = `${modeColor}[${this.mode.toUpperCase()}]\x1b[0m \x1b[1m>\x1b[0m `;
      const line = (await rl.question(prompt)).trim();

      if (!line) continue;
      if (line === 'exit' || line === 'quit') break;

      if (line.startsWith('/')) {
        const targetMode = line.slice(1).toLowerCase();
        if (['design', 'product', 'dev', 'triage'].includes(targetMode)) {
          this.mode = targetMode as ShellMode;
          console.log(`\x1b[32mSwitched to ${this.mode.toUpperCase()} mode.\x1b[0m\n`);
          continue;
        }
      }

      await this.handleInput(line);
    }
    rl.close();
  }

  private async handleInput(line: string) {
    const parts = line.split(' ');
    const cmd = parts[0].toLowerCase();

    // Fast direct commands
    if (cmd === 'sync') {
      await this.transport.sync();
      console.log(`\x1b[32mSynced Markdown (kanban.md, epics.md, decisions.md, modules.md) with SQLite.\x1b[0m\n`);
      return;
    }
    if (cmd === 'status' || cmd === 'view') {
      console.log(renderTuiDashboard(this.store));
      return;
    }
    if (cmd === 'next') {
      const rec = recommendNextTask(this.store);
      console.log(`\x1b[1;33mNext Recommended Task:\x1b[0m ${rec.ticket ? `\x1b[1m${rec.ticket.id}: ${rec.ticket.title}\x1b[0m` : 'None'}`);
      console.log(`Reason: ${rec.reason}\n`);
      return;
    }
    if (cmd === 'impact' && parts[1]) {
      const res = getBlastRadius(this.store, parts[1]);
      console.log(`\x1b[1;36mBlast Radius for ${parts[1]}:\x1b[0m ${res.affectedFilesCount} files affected.`);
      console.log(`Files: ${res.affectedFiles.join(', ')}`);
      console.log(`Affected Tickets: ${res.affectedTickets.map(t => t.id).join(', ') || 'None'}`);
      console.log(`Recommended Tests: ${res.recommendedTests.join(', ')}\n`);
      return;
    }
    if (cmd === 'digest') {
      const dig = generateDigest(this.store);
      console.log(`\x1b[1;32m24h Digest:\x1b[0m Completed: ${dig.completedTickets.length} | In Progress: ${dig.inProgressTickets.length} | Open Bugs: ${dig.openBugsCount}\n`);
      return;
    }
    if (cmd === 'doctor') {
      const fix = parts.includes('--fix');
      const doc = doctorCheck(this.store, { fix });
      console.log(`\x1b[1;34mDoctor Report:\x1b[0m ${doc.totalFiles} files indexed | ${doc.unlinkedBugNotes} unlinked bug notes.`);
      if (fix) console.log(`Auto-created ${doc.autoFixedTickets.length} tickets.\n`);
      return;
    }
    if (cmd === 'start' && parts[1]) {
      this.store.upsertEntity({ id: parts[1], type: 'ticket', title: parts[1], lane: 'In Progress' });
      await this.transport.sync();
      console.log(`\x1b[32mTicket ${parts[1]} moved to In Progress.\x1b[0m\n`);
      return;
    }
    if (cmd === 'done' && parts[1]) {
      this.store.upsertEntity({ id: parts[1], type: 'ticket', title: parts[1], lane: 'Done', status: 'verified' });
      await this.transport.sync();
      console.log(`\x1b[32mTicket ${parts[1]} moved to Done.\x1b[0m\n`);
      return;
    }

    // Natural Language Mode Handling
    await this.handleNaturalLanguage(line);
  }

  private async handleNaturalLanguage(line: string) {
    if (this.mode === 'dev') {
      console.log(`\x1b[33m[Compiler] Synthesizing routine for wish: "${line}"...\x1b[0m`);
      try {
        const codelet = await this.compiler.compileWish(line);
        console.log(`\x1b[32mCompiled routine: ${codelet.meta.title} (Hash: ${codelet.meta.titleHash})\x1b[0m`);
        console.log(`Doc: ${codelet.meta.doc}`);
        const testRes = await codelet.test();
        console.log(`Automated Test Verification: ${testRes.passed ? '\x1b[32mPASSED ✅\x1b[0m' : '\x1b[31mFAILED ❌\x1b[0m'}\n`);
      } catch (err: any) {
        console.log(`\x1b[31mSynthesis error:\x1b[0m ${err.message}\n`);
      }
      return;
    }

    // Design / Product / Triage Conversational Reasoning
    const systemPrompt = `You are the AI-Workflow Causal Engineer in ${this.mode.toUpperCase()} mode.
Help the operator with software architecture, ADRs, product scoping, and technical tradeoffs.
Keep answers concise, actionable, and grounded in the project graph.`;

    try {
      const res = await this.asker.ask(line, { system: systemPrompt });
      console.log(`\n${res.text}\n`);
    } catch (err: any) {
      console.log(`\x1b[31mLLM error:\x1b[0m ${err.message}\n`);
    }
  }
}
