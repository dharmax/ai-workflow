/**
 * Responsibility: Manage a shared terminal/tty handle to prevent mode conflicts.
 * Scope: Provides a singleton or shared Readline interface for all tool modes.
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export class TerminalContext {
  private static instance: readline.Interface | null = null;

  static getInterface(): readline.Interface {
    if (!this.instance) {
      this.instance = readline.createInterface({ input, output });
    }
    return this.instance;
  }


  static async question(prompt: string): Promise<string> {
    const rl = this.getInterface();
    
    // BUG-TERM-SIGINT-001: Ensure sub-prompts handle SIGINT gracefully
    const handler = () => {
      rl.write("\n");
      rl.close();
      process.exit(130);
    };
    process.once("SIGINT", handler);
    
    try {
      return await rl.question(prompt);
    } finally {
      process.off("SIGINT", handler);
    }
  }


  static close() {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
  }

  static pause() {
    this.instance?.pause();
  }

  static resume() {
    this.instance?.resume();
  }
}
