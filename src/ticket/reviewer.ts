/** Verification model eligibility and observed contract evidence; routing stays in llm-utils. */
import {parseModelTarget,type Asker,type ModelTarget,type GenerationResult} from '@dharmax/llm-utils';
import {ModelService} from '../services/model-service.ts';
import {inspectConfig, type ProjectConfig} from '../services/config-service.ts';
import {recordTicketEvent,systemJournal,type JournalEntry} from '../graph/journal.ts';
import type {WorkflowStore} from '../graph/store.ts';
import {budgetedInference,type PaidUsage} from '../paid-inference.ts';

const failedPrefix='verification-contract-failed:';
const passedPrefix='verification-contract-passed:';

export async function failedVerificationModels(store:WorkflowStore):Promise<Set<string>> {
    const journal=await systemJournal(store);
    const failures=await journal.findSome<JournalEntry>({type:'event',kind:'failure'});
    const outcomes=await journal.findSome<JournalEntry>({type:'event',kind:'outcome'});
    const failed=new Set<string>();
    for(const entry of [...failures,...outcomes].sort((a,b)=>a._id.localeCompare(b._id)))
        for(const reference of entry.references) {
            if(reference.startsWith(failedPrefix)) failed.add(reference.slice(failedPrefix.length));
            if(reference.startsWith(passedPrefix)) failed.delete(reference.slice(passedPrefix.length));
        }
    return failed;
}

export async function prepareReviewer(store:WorkflowStore,cfg:ProjectConfig,ticketId:string):Promise<{asker:Asker;model?:ModelTarget}> {
    const failed=await failedVerificationModels(store);
    const service=new ModelService(store.root);
    const asker=service.createAsker({},false,failed);
    const explicit=cfg.modelRoutes?.critic??cfg.modelRoutes?.design??cfg.modelRoutes?.verification??
        (inspectConfig(store.root,'model')[0]?.source!=='default'?cfg.model:undefined);
    const generate=budgetedInference(cfg.paidInference,'verification',usage=>recordPaidUsage(store,ticketId,usage));
    guardReviewerModels(asker,service.runtime.providers,failed,generate);
    return {asker,model:explicit?parseModelTarget(explicit):undefined};
}

function guardReviewerModels(asker:Asker,providers:ModelService['runtime']['providers'],failed:ReadonlySet<string>,generate:ReturnType<typeof budgetedInference>):void {
    for(const id of Object.keys(providers)) asker.getCompletion().registerAdapter({id,async generate(request) {
        const {modelId,prompt,config,...options}=request;
        const model={providerId:id,modelId};
        if(failed.has(`${id}/${modelId}`)) return {ok:false,text:'',model,
            failure:{kind:'configuration',message:`Verification model ${id}/${modelId} previously failed its structured-response contract; explicit routes are not silently replaced.`,fatal:false,retryable:false}};
        return generate(prompt,model,config,options);
    }});
}

async function recordPaidUsage(store:WorkflowStore,ticketId:string,usage:PaidUsage):Promise<void> {
    await recordTicketEvent(store,{ticketId,kind:'outcome',message:'Paid verification usage: '+JSON.stringify(usage),references:[usage.model]});
}

export async function recordReviewerResult(store:WorkflowStore,ticketId:string,response:GenerationResult,evidenceIds:string[]):Promise<void> {
    const model=`${response.model.providerId}/${response.model.modelId}`;
    const contractFailed=!response.ok && response.failure?.kind==='invalid_response';
    await recordTicketEvent(store,{ticketId,kind:response.ok?'outcome':'failure',
        message:response.ok?`Verification reviewer ${model} returned a schema-valid assessment. Mandatory verdicts still require acceptance checks.`:
            `Verification reviewer ${model}: ${response.failure?.message}`.slice(0,12000),
        references:[...evidenceIds,...(response.ok?[passedPrefix+model]:contractFailed?[failedPrefix+model]:[])]});
}
