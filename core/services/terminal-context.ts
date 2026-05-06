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
    return rl.question(prompt);
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
