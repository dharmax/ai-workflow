/**
 * Responsibility: Define domain vocabulary shared across entities.
 * Scope: Shared authored priority and entity/intent status vocabulary.
 */
import {z} from 'zod';

/** Lower numbers rank first; shared by every authored work priority. */
export const PrioritySchema = z.number().int().min(0).max(5);

export type EntityStatus = 'draft' | 'proposed' | 'accepted' | 'implemented' | 'verified' | 'deprecated';

export type IntentStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'deprecated';
