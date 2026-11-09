/** Public Code/Product change request schema; owns only the transport union. */
import {z} from 'zod';
import {CodeChangeRequestSchema} from '../services/code-mutation/request-schema.ts';
import {ProductMutationSchema, ProductRevisionSchema} from '../product/mutation.ts';

export const ChangeRequestSchema = z.discriminatedUnion('action', [
  ...CodeChangeRequestSchema.options,
  z.object({ action: z.literal('product_change'), mutations: z.array(ProductMutationSchema).min(1), basis: z.array(ProductRevisionSchema).optional(), originalRequest: z.string().optional() })
]);

