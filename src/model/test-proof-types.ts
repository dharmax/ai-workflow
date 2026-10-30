/**
 * Responsibility: Define cross-entity technical proof and binding contracts.
 * Scope: Reviewed Ticket/Test scope bindings and hashed technical proof contracts.
 */
import {z} from 'zod';
const SourceSchema=z.object({projectRoot:z.string().min(1).optional(),filePath:z.string().min(1),symbolName:z.string().min(1).optional()}).strict();
export const ScopeSchema=z.object({
 id:z.string().min(1),criteria:z.array(z.string().min(1)).min(1),
 projectRoot:z.string().min(1).optional(),testId:z.string().min(1),sources:z.array(SourceSchema).min(1)
}).strict();
export const TestBindingSpecificationSchema=z.object({
 ticketId:z.string().min(1),testId:z.string().min(1),scopes:z.array(ScopeSchema).min(1)
}).strict();
export type TestBindingSpecification=z.infer<typeof TestBindingSpecificationSchema>;
const BoundScopeSchema=ScopeSchema.extend({
 projectRoot:z.string(),filePath:z.string(),reviewedTestVersion:z.number().int().positive(),
 hashes:z.record(z.string(),z.string())
});
export const TechnicalProofSchema=z.object({
 ticketId:z.string(),basisHash:z.string(),scopes:z.array(BoundScopeSchema).min(1)
}).strict();
export type TechnicalProof=z.infer<typeof TechnicalProofSchema>;

