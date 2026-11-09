/** Product-owned intent mutation request and preview contracts. */
import type {ProductMutation, ProductRevision} from './mutation.ts';
import type {ChangePreview as Preview, ChangeApplyResult as ApplyResult} from '../model/change-result.ts';

export type ProductChangeRequest = {action: 'product_change'; mutations: ProductMutation[]; basis?: ProductRevision[]; originalRequest?: string};
export type ProductChangePreview = Preview<ProductChangeRequest, ProductMutation>;
export type ProductChangeApplyResult = ApplyResult<ProductChangePreview>;
