/** Public Code/Product change transport unions. Domain services use their own contracts. */
import type {SourceChangeRequest, SourceChangeMutation, ResolvedCodeTarget} from '../services/code-mutation/types.ts';
import type {ProductChangeRequest} from '../product/change-types.ts';
import type {ProductMutation} from '../product/mutation.ts';
import type {ChangePreview as Preview, ChangeApplyResult as ApplyResult} from '../model/change-result.ts';

export type ChangeRequest = SourceChangeRequest | ProductChangeRequest;
export type ChangeMutation = SourceChangeMutation | ProductMutation;
export type ChangePreview = Preview<ChangeRequest, ChangeMutation, ResolvedCodeTarget>;
export type ChangeApplyResult = ApplyResult<ChangePreview>;
