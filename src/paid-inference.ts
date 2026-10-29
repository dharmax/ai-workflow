/** Developer-approved spending bounds around the existing llm-utils completion adapter. */
import {CompletionEngine,ProviderDiscovery,calculateUsageCost,type ModelInfo,type ModelTarget,type ProviderConfig,type CompletionOptions,type GenerationResult} from '@dharmax/llm-utils';
import type {ProjectConfig} from './services/config-service.ts';

type Policy=ProjectConfig['paidInference'];
export type PaidUsage={model:string;costUSD:number|null;spentUSD:number;reservedUSD:number;ceilingUSD:number};
type Budget={policy:NonNullable<Policy>;spentUSD:number;reservedUSD:number;unknownUsage:boolean};
type Report=(usage:PaidUsage)=>Promise<void>;

export function paidProviderAllowed(policy:Policy,provider:string,task:string):boolean {
    return !!policy?.providers.includes(provider) && policy.tasks.includes(task);
}

async function requestPrice(model:ModelTarget,config:ProviderConfig):Promise<ModelInfo> {
    const environment=await ProviderDiscovery.discoverEnvironment({providers:{[model.providerId]:config},timeoutMs:3000});
    const price=environment.providers.find(provider=>provider.id===model.providerId)?.models?.find(item=>item.id===model.modelId);
    if(!price || price.inputPer1M===undefined || price.outputPer1M===undefined)
        throw Error(`No current request pricing for ${model.providerId}/${model.modelId}; paid execution blocked.`);
    return price;
}

function reserveRequest(budget:Budget,prompt:string,options:CompletionOptions,price:ModelInfo):number {
    if(budget.unknownUsage) throw Error('Previous paid request has unknown usage; further paid execution blocked.');
    const bytes=new TextEncoder().encode(prompt+(options.system??'')+JSON.stringify(options.format??{})+JSON.stringify(options.providerOptions??{})).length;
    // One input token per UTF-8 byte plus wire overhead is deliberately conservative.
    const maximum=((bytes+4096)*price.inputPer1M!+(options.maxTokens??1024)*price.outputPer1M!)/1_000_000;
    if(budget.spentUSD+budget.reservedUSD+maximum>budget.policy.ceilingUSD)
        throw Error(`Paid inference ceilingUSD ${budget.policy.ceilingUSD} cannot cover the next request; spentUSD ${budget.spentUSD}.`);
    budget.reservedUSD+=maximum;
    return maximum;
}

async function settleRequest(budget:Budget,model:ModelTarget,result:GenerationResult,price:ModelInfo,reservation:number,report:Report):Promise<GenerationResult> {
    const measured=result.costUsd??calculateUsageCost(result.usage,{inputCostPerMillionTokensUsd:price.inputPer1M,outputCostPerMillionTokensUsd:price.outputPer1M});
    const cost=measured!==null && Number.isFinite(measured) && measured>=0?measured:null;
    if(cost===null) budget.unknownUsage=true;
    else {budget.spentUSD+=cost;budget.reservedUSD-=reservation;}
    await report({model:`${model.providerId}/${model.modelId}`,costUSD:cost,spentUSD:budget.spentUSD,reservedUSD:budget.reservedUSD,ceilingUSD:budget.policy.ceilingUSD});
    if(cost===null || budget.spentUSD>budget.policy.ceilingUSD) return {...result,ok:false,
        failure:{kind:'configuration',message:cost===null?'Paid request usage unknown; further paid execution blocked.':'Provider charge exceeded the approved ceiling; further paid execution blocked.',fatal:false,retryable:false}};
    return {...result,costUsd:cost};
}

export function budgetedInference(policy:Policy,task:string,report:Report):CompletionEngine['generate'] {
    const transport=new CompletionEngine();
    const budget=policy?{policy,spentUSD:0,reservedUSD:0,unknownUsage:false}:undefined;
    const prices=new Map<string,Promise<ModelInfo>>();
    return async(prompt,model,config,options={})=>{
        if(config.local) return transport.generate(prompt,model,config,options);
        if(!budget || !paidProviderAllowed(policy,model.providerId,task))
            throw Error(`Paid inference requires developer authorization for provider ${model.providerId}, task ${task}, and ceilingUSD.`);
        options.signal?.throwIfAborted();
        options={...options,maxTokens:options.maxTokens??config.maxTokens??1024,providerOptions:{...config.providerOptions,...options.providerOptions}};
        if(options.providerOptions?.n!==undefined && options.providerOptions.n!==1) throw Error('Paid verification requires one completion per request.');
        const key=`${model.providerId}/${model.modelId}`;
        if(!prices.has(key)) prices.set(key,requestPrice(model,config));
        const price=await prices.get(key)!;
        const reservation=reserveRequest(budget,prompt,options,price);
        const result=await transport.generate(prompt,model,config,options);
        return settleRequest(budget,model,result,price,reservation,report);
    };
}
