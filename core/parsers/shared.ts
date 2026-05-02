/**
 * Shared utilities for codebase parsing.
 */

import { SEMANTICS } from "../lib/registry.ts";

export function buildCandidateTitle(note) {
  const raw = String(note.body ?? "").replace(/[.]+$/, "").trim();
  if (!raw) {
    return `Follow up ${note.noteType.toLowerCase()}`;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function scoreNote(note) {
  const typeWeights = {
    BUG: 100,
    FIXME: 80,
    HACK: 50,
    TODO: 20,
    NOTE: 5
  };
  return typeWeights[note.noteType] || 0;
}
