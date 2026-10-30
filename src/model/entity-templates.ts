/**
 * Responsibility: Provide validators and field defaults shared by entity descriptors.
 * Scope: Common field defaults, passthrough validation and completeness validation.
 */
import { z } from 'zod'

export const CompletenessSchema = z.enum(['poc', 'functional', 'advanced', 'production']);

export const passthroughValidator = { validate: (v: unknown) => ({ value: v }) }

export const baseTemplate = {
    id: passthroughValidator,
    _id: passthroughValidator,
    title: passthroughValidator,
    status: { validate: (v: unknown) => ({ value: v ?? "implemented" }) },
    body: { validate: (v: unknown) => ({ value: v ?? "" }) },
    metadata: { validate: (v: unknown) => ({ value: v ?? {} }) },
    createdAt: passthroughValidator,
    updatedAt: passthroughValidator
}

export const completenessValidator = { validate: (v: unknown) => ({ value: v == null ? undefined : CompletenessSchema.parse(v) }) }
