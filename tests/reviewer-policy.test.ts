import {afterEach,expect,it,spyOn} from 'bun:test';
import {Asker,z,type ProviderConfig} from '@dharmax/llm-utils';
import {budgetedInference,type PaidUsage} from '../src/paid-inference.ts';
import type {ProjectConfig} from '../src/config.ts';

let fetchSpy:ReturnType<typeof spyOn>|undefined;
afterEach(()=>fetchSpy?.mockRestore());
const provider:ProviderConfig={id:'openrouter',baseUrl:'https://openrouter.ai/api/v1',apiKey:'controlled-fixture',available:true,local:false};
const policy={providers:['openrouter'],tasks:['verification'],ceilingUSD:0.012};
const options={model:'openrouter/openai/gpt-4o',maxTokens:16,maxRetries:1};

function fixture(approval:ProjectConfig['paidInference'],response:{invalid?:boolean;unknownUsage?:boolean;unknownPrice?:boolean}={}) {
    let calls=0;
    const reports:PaidUsage[]=[];
    fetchSpy=spyOn(globalThis,'fetch').mockImplementation((async(input)=>{
        const url=String(input);
        if(url.endsWith('/models')) return Response.json({data:[{id:'openai/gpt-4o',...(!response.unknownPrice?{pricing:{prompt:'0.0000025',completion:'0.00001'}}:{})}]});
        if(!url.endsWith('/chat/completions')) throw Error('Unexpected endpoint '+url);
        calls++;
        return Response.json({id:'controlled',model:'openai/gpt-4o',choices:[{message:{role:'assistant',content:response.invalid?'{}':'{"ok":true}'},finish_reason:'stop'}],
            ...(!response.unknownUsage?{usage:{prompt_tokens:2000,completion_tokens:8,total_tokens:2008,cost:0.00508}}:{})});
    }) as typeof fetch);
    const asker=new Asker({providers:{openrouter:provider},advicePath:false});
    const generate=budgetedInference(approval,'verification',async usage=>{reports.push(usage)});
    asker.getCompletion().registerAdapter({id:'openrouter',generate:request=>{
        const {prompt,modelId,config,...settings}=request;
        return generate(prompt,{providerId:'openrouter',modelId},config,settings);
    }});
    return {asker,reports,calls:()=>calls};
}

const blockedApprovals:Array<ProjectConfig['paidInference']>=[undefined,{...policy,providers:['openai']},{...policy,tasks:['design']}];
it.each(blockedApprovals)('blocks absent or mismatched provider/task approval before inference: %j',async approval=>{
    const test=fixture(approval);
    expect((await test.asker.ask('Review.',options)).ok).toBe(false);
    expect(test.calls()).toBe(0);
});

it('shares the spending ceiling across successive scope and composition calls',async()=>{
    const test=fixture(policy);
    expect((await test.asker.ask('Review scope.',options)).ok).toBe(true);
    expect((await test.asker.ask('Compose verdict.',options)).ok).toBe(false);
    expect(test.calls()).toBe(1);
    expect(test.reports[0]).toMatchObject({costUSD:0.00508,spentUSD:0.00508,reservedUSD:0,ceilingUSD:0.012});
});

it('checks the remaining ceiling before the one targeted correction',async()=>{
    const test=fixture(policy,{invalid:true});
    const result=await test.asker.json('Review scope.',z.object({ok:z.literal(true)}),options);
    expect(result.ok).toBe(false);
    expect(result.failure?.message).toContain('ceilingUSD');
    expect(test.calls()).toBe(1);
});

it('reserves funds before concurrent provider calls',async()=>{
    const test=fixture(policy);
    const results=await Promise.all([test.asker.ask('Review first scope.',options),test.asker.ask('Review second scope.',options)]);
    expect(results.filter(result=>result.ok)).toHaveLength(1);
    expect(test.calls()).toBe(1);
});

it('retains an unknown charge reservation and blocks subsequent spending',async()=>{
    const test=fixture({...policy,ceilingUSD:1},{unknownUsage:true});
    expect((await test.asker.ask('Review scope.',options)).ok).toBe(false);
    expect((await test.asker.ask('Review again.',options)).ok).toBe(false);
    expect(test.calls()).toBe(1);
    expect(test.reports[0].costUSD).toBeNull();
    expect(test.reports[0].reservedUSD).toBeGreaterThan(0);
});

it('blocks unpriced models without issuing an inference request',async()=>{
    const test=fixture(policy,{unknownPrice:true});
    const result=await test.asker.ask('Review scope.',options);
    expect(result.ok).toBe(false);
    expect(result.failure?.message).toContain('pricing');
    expect(test.calls()).toBe(0);
});


it('counts extra request input before reserving paid funds',async()=>{
    const test=fixture(policy);
    const result=await test.asker.ask('Review scope.',{...options,providerOptions:{metadata:'x'.repeat(6000)}});
    expect(result.ok).toBe(false);
    expect(result.failure?.message).toContain('ceilingUSD');
    expect(test.calls()).toBe(0);
});

it('rejects multiple paid completions before inference',async()=>{
    const test=fixture(policy);
    const result=await test.asker.ask('Review scope.',{...options,providerOptions:{n:2}});
    expect(result.ok).toBe(false);
    expect(test.calls()).toBe(0);
});


for(const scenario of ['corrected','exhausted','negative'] as const) it(`definition Critic preserves exact criterion identity and one correction: ${scenario}`,async()=>{
    const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
    const {WorkflowStore}=await import('../src/graph/store.ts');
    const {saveConfig}=await import('../src/config.ts');
    const {AiArtifactCritic}=await import('../src/artifact-critic.ts');
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-critic-identity-')),store=new WorkflowStore(root),prompts:string[]=[];
    const criterion='Review the complete current definition against every charter boundary.';
    try {
        saveConfig(root,{modelRoutes:{critic:'ollama/fixture'}});
        fetchSpy=spyOn(globalThis,'fetch').mockImplementation((async(_input,init)=>{
            const body=JSON.parse(String(init?.body));prompts.push(body.messages.map((message:{content:string})=>message.content).join('\n'));
            const correct=scenario==='negative'||scenario==='corrected'&&prompts.length===2;
            return Response.json({model:'fixture',message:{role:'assistant',content:JSON.stringify({criteria:[{criterion:correct?criterion:'Paraphrased partial criterion',covered:scenario!=='negative',evidence:'Supplied definition.'}],aspects:[],review:{verdict:'accept',findings:[],required:[]}})},done:true});
        }) as typeof fetch);
        const operation=new AiArtifactCritic('auto',root).review({artifactId:'STORY',intent:'Definition review',neighborhood:[],proposal:[],applicableAspects:[],candidateAspects:[],completeness:'functional',depth:0,acceptanceCriteria:[criterion],evidence:['Current definition']});
        if(scenario==='exhausted') await expect(operation).rejects.toThrow('Independent Critic failed');
        else expect((await operation).verdict).toBe(scenario==='negative'?'revise':'accept');
        expect(prompts).toHaveLength(scenario==='negative'?1:2);
        if(scenario!=='negative') {expect(prompts[1]).toContain('Previous response failed validation');expect(prompts[1]).toContain(criterion);}
    } finally {fetchSpy?.mockRestore();store.close();fs.rmSync(root,{recursive:true,force:true});}
});
