/**
 * Responsibility: Provide a unified, static registry for all core toolkit capabilities and codelets.
 * Scope: The single programmatic entry point for Shell, Skill, and internal orchestration.
 */

import { detectExecutionMode } from "./execution-context.ts";
import type { ExecutionContext } from "./execution-context.ts";

export type ServiceImplementation = (...args: any[]) => Promise<any>;

export class ServiceHub {
  private static _context: ExecutionContext | null = null;
  private static _registry = new Map<string, any>();

  static get context(): ExecutionContext {
    if (!this._context) {
      this._context = {
        projectRoot: process.cwd(),
        mode: detectExecutionMode()
      };
    }
    return this._context;
  }

  static setContext(context: ExecutionContext) {
    this._context = context;
  }

  // --- Dynamic Registry ---

  /**
   * Register a service or codelet implementation.
   */
  static register(id: string, implementation: any) {
    this._registry.set(id, implementation);
  }

  /**
   * Resolve a registered implementation by ID.
   */
  static resolve<T = any>(id: string): T {
    const service = this._registry.get(id);
    if (!service) {
      throw new Error(`Service not registered: ${id}`);
    }
    return service as T;
  }

  /**
   * Check if a service ID is registered.
   */
  static has(id: string): boolean {
    return this._registry.has(id);
  }

  /**
   * Execute a registered service/codelet.
   */
  static async execute(id: string, ...args: any[]): Promise<any> {
    const service = this.resolve(id);
    if (typeof service === "function") {
      return service(...args);
    }
    if (service && typeof (service as any).run === "function") {
      const options = args.length > 0 ? args[0] : {};
      return (service as any).run(options, this);
    }
    throw new Error(`Service ${id} is not executable.`);
  }

  /**
   * List all registered service IDs.
   */
  static list(): string[] {
    return Array.from(this._registry.keys());
  }
}
