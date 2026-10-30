/**
 * Responsibility: MCP projection of the single explicit public command catalog.
 * Scope: Compact families and transitional protocol aliases from registered descriptors only.
 */
import type {CommandRegistry} from './registry.ts';
export function getPublicMcpTools(commandRegistry:CommandRegistry,compact=false){return commandRegistry.publicTools(compact);}
