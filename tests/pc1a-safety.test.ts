import {productReviewFixture} from './product-review-fixture.ts';
import {createProduct} from './product-review.ts';
import {afterEach,beforeEach,describe,expect,it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket,Decision,TestNode,Artifact,entityDescriptors} from '../src/graph/ontology.ts';
import {initializeTools,registry} from '../src/tools/index.ts';
import {spyOn} from 'bun:test';
import {importProjections} from '../src/services/projection-service.ts';
import {runTicketCommand} from '../src/ticket-command.ts';
import {z} from 'zod';
import {ToolRegistry} from '../src/tools/registry.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {WorkflowActor} from '../src/helpers/actor/engine.ts';
import type {Asker} from '@dharmax/llm-utils';

describe('PC1a canonical safety through public tools',()=>{
  let root:string,store:WorkflowStore;
  let stopReviewer:(()=>void)|undefined;
  const call=(name:string,params:unknown,executionAuthority:'read-only'|'project-write'='project-write',signal?:AbortSignal)=>
    registry.execute(name,params,{store,projectRoot:root,executionAuthority,signal});
  const reopen=()=>{store.close();store=new WorkflowStore(root);};
  const snapshot=()=>{
    using tables=store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'aiwf_%' ORDER BY name");
    return JSON.stringify((tables.all() as Array<{name:string}>).map(({name})=>{
      using rows=store.db.prepare('SELECT * FROM "'+name+'" ORDER BY _id');
      return [name,rows.all()];
    }));
  };
  beforeEach(async()=>{
    root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-pc1a-'));
    store=new WorkflowStore(root);initializeTools();
    for(const dcr of entityDescriptors) await store.listEntities(dcr);
    await store.sp.predicateCollection(store.sp.ontology.pdcr('addresses'));
  });
  afterEach(()=>{stopReviewer?.();stopReviewer=undefined;store.close();fs.rmSync(root,{recursive:true,force:true});});

  it('read-only create_ticket Done cannot persist a verified Ticket',async()=>{
    const before=snapshot();
    let refused=false;
    try {await call('create_ticket',{id:'T',title:'Unauthorized completion',lane:'Done'},'read-only');} catch {refused=true;}
    reopen();
    expect(await store.getEntity('T',Ticket.dcr)).toBeNull();
    expect(refused).toBe(true);expect(snapshot()).toBe(before);
  });
  it('read-only Decision proposal is inert and cannot persist acceptance',async()=>{
    const before=snapshot();
    await call('propose_decision',{id:'D',title:'Proposal',decision:'Proposed choice'},'read-only');
    reopen();
    expect(await store.getEntity('D',Decision.dcr)).toBeNull();expect(snapshot()).toBe(before);
  });
  it('authorized Decision proposal is also inert',async()=>{
    const proposal=await call('propose_decision',{id:'D',title:'Proposal',decision:'Proposed choice'});
    reopen();
    expect(await store.getEntity('D',Decision.dcr)).toBeNull();
    expect(proposal.status).toBe('proposed');
  });
  it('read-only and aborted legacy Ticket writes leave no record',async()=>{
    await expect(call('create_ticket',{id:'R',title:'Read only'},'read-only')).rejects.toThrow('read-only');
    await expect(call('create_ticket',{id:'A',title:'Aborted'},'project-write',AbortSignal.abort())).rejects.toThrow();
    reopen();
    expect(await store.getEntity('R',Ticket.dcr)).toBeNull();
    expect(await store.getEntity('A',Ticket.dcr)).toBeNull();
  });
  it('normal creation works but create/update/state cannot manufacture completion',async()=>{
    await expect(call('create_ticket',{id:'D',title:'Done',lane:'Done'})).rejects.toThrow();
    await call('create_ticket',{id:'T',title:'Normal'});
    for(const [name,params] of [
      ['update_ticket',{ticketId:'T',lane:'Done'}],
      ['update_ticket_state',{ticketId:'T',lane:'Done'}]
    ] as const) await expect(call(name,params)).rejects.toThrow();
    reopen();
    expect(await store.getEntity('D',Ticket.dcr)).toBeNull();
    expect(await store.getEntity('T',Ticket.dcr)).toMatchObject({lane:'Todo'});
    expect(await store.getIncoming((await store.getEntity('T',Ticket.dcr))!.id,'verifies')).toEqual([]);
  });
  it('generic Product JSON cannot author Test proof or verifies',async()=>{
    await call('create_ticket',{id:'T',title:'Normal'});
    await store.upsertEntity(TestNode.dcr,{id:'TEST',title:'Indexed test',filePath:'tests/example.test.ts'});
    await store.upsertEntity(Artifact.dcr,{id:'A',title:'Ordinary artifact'});
    for(const mutation of [
      {kind:'product_create',entityType:'Ticket',id:'D',fields:{title:'Forged',lane:'Done'}},
      {kind:'product_update',entityType:'Ticket',id:'T',fields:{status:'verified',lane:'Done'}},
      {kind:'product_update',entityType:'Test',id:'TEST',fields:{testState:'green',testSourceHash:'forged'}},
      {kind:'product_link',sourceId:'TEST',predicate:'verifies',targetId:'T'},
      {kind:'product_link',sourceId:'A',predicate:'verifies',targetId:'T'}
    ]) {
      const request={action:'product_change',mutations:[mutation]};
      const preview=await call('preview_change',request);
      expect(preview.blocked).toBe(true);
    }
    reopen();
    expect(await store.getEntity('TEST',TestNode.dcr)).not.toMatchObject({testState:'green'});
    expect(await store.getOutgoing((await store.getEntity('A',Artifact.dcr))!.id,'verifies')).toEqual([]);
  });
  it('refuses missing and self-attested authority, including a nested upgrade',async()=>{
    await expect(registry.execute('create_ticket',{id:'M',title:'Missing authority',executionAuthority:'project-write'},{store,projectRoot:root})).rejects.toThrow('read-only');
    const local=new ToolRegistry();
    local.register({name:'nested_write',category:'ticket',parameters:z.object({}),description:'Adversarial host fixture',
      execute:()=>store.withExecutionContext('project-write',undefined,()=>store.upsertEntity(Ticket.dcr,{id:'N',title:'Nested upgrade'}))});
    await expect(local.execute('nested_write',{}, {store,projectRoot:root,executionAuthority:'read-only'})).rejects.toThrow('read-only');
    reopen();
    expect(await store.getEntity('M',Ticket.dcr)).toBeNull();
    expect(await store.getEntity('N',Ticket.dcr)).toBeNull();
  });

  it('denies legacy content, lease, relation and state writes with the canonical rows unchanged',async()=>{
    await call('create_ticket',{id:'T',title:'Original'});
    await createProduct(store,'UserStory',{id:'S',title:'Draft story'});
    const before=snapshot();
    for(const [name,params] of [
      ['update_ticket',{ticketId:'T',title:'Unauthorized'}],
      ['update_ticket_state',{ticketId:'T',lane:'Blocked'}],
      ['claim_ticket',{ticketId:'T',agentId:'intruder'}],
      ['release_ticket',{ticketId:'T'}],
      ['link_product',{sourceId:'T',predicate:'addresses',targetId:'S'}],
      ['create_aspect',{id:'A',title:'Unauthorized policy'}],
      ['create_feature',{id:'F',title:'Unauthorized feature'}]
    ] as const) await expect(call(name,params,'read-only')).rejects.toThrow('read-only');
    reopen();
    expect(snapshot()).toBe(before);
    expect(await store.getOutgoing((await store.getEntity('T',Ticket.dcr))!.id)).toEqual([]);
    expect(await store.getEntity('A')).toBeNull();expect(await store.getEntity('F')).toBeNull();
  });

  it('legacy done and move Done refuse without a provider call or lease release',async()=>{
    await call('create_ticket',{id:'T',title:'Still requires independent verification'});
    await call('claim_ticket',{ticketId:'T',agentId:'owner'});
    const ticket=await store.getEntity<Ticket>('T',Ticket.dcr);
    for(const command of ['done','move'] as const)
      await expect(runTicketCommand(command,command==='done'?['T']:['T','Done'],{store,projectRoot:root,executionAuthority:'project-write'})).rejects.toThrow('independent Ticket completion');
    reopen();
    expect(await store.getEntity('T',Ticket.dcr)).toMatchObject({lane:'In Progress',claim:ticket!.claim});
    expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
  });

  it('generic store and returned entity mutations cannot forge proof or accepted Decisions',async()=>{
    const ticket=await store.upsertEntity<Ticket>(Ticket.dcr,{id:'T',title:'Task',lane:'Todo'});
    const test=await store.upsertEntity<TestNode>(TestNode.dcr,{id:'TEST',title:'Test'});
    await expect(store.upsertEntity(Ticket.dcr,{id:'D',title:'Forged',lane:'Done'})).rejects.toThrow();
    await expect(ticket.update({lane:'Done'},true,false)).rejects.toThrow();
    // Mutating the caller-owned object must not counterfeit canonical previous state.
    ticket.lane='Done';
    await expect(ticket.update({lane:'Done'},true,false)).rejects.toThrow();
    await expect(test.update({passed:true,lastRun:new Date().toISOString()},true,false)).rejects.toThrow('owned');
    await expect(store.upsertEntity(TestNode.dcr,{id:'TEST',executionHashes:{fake:'hash'}})).rejects.toThrow('owned');
    await expect(store.upsertEntity(Artifact.dcr,{id:'VERIFY-T',title:'Forged receipt',body:'{}'})).rejects.toThrow('owner-managed');
    await expect(store.relate(test,'verifies',ticket)).rejects.toThrow('owned');
    await expect(store.upsertEntity(Decision.dcr,{id:'D',title:'Forged acceptance',status:'accepted'})).rejects.toThrow('PC2');
    reopen();
    expect(await store.getEntity('T',Ticket.dcr)).toMatchObject({lane:'Todo'});
    expect((await store.getEntity<TestNode>('TEST',TestNode.dcr))!.passed).toBeUndefined();
    expect(await store.getEntity('D',Decision.dcr)).toBeNull();
  });

  it('projection import cannot manufacture new completion or Decision acceptance',async()=>{
    fs.writeFileSync(path.join(root,'kanban.md'),'# Kanban\n\n## Done\n- [x] **IMPORTED**: Forged completion\n');
    await expect(importProjections(store,root)).rejects.toThrow('independent Ticket completion');
    fs.unlinkSync(path.join(root,'kanban.md'));
    fs.writeFileSync(path.join(root,'decisions.md'),'# Decisions\n\n## D: Forged acceptance\nImported content\n');
    await expect(importProjections(store,root)).rejects.toThrow('PC2');
    reopen();
    expect(await store.getEntity('IMPORTED',Ticket.dcr)).toBeNull();
    expect(await store.getEntity('D',Decision.dcr)).toBeNull();
  });

  it('abort at the atomic commit leaves no partial accepted records and releases admission',async()=>{
    stopReviewer=await productReviewFixture(store);
    const request={action:'product_change',mutations:[
      {kind:'product_create',entityType:'Feature',id:'F',fields:{title:'Feature',body:'Deliver the reviewed capability',status:'accepted'}},
      {kind:'product_create',entityType:'Ticket',id:'T',fields:{title:'Task'}}
    ]};
    const preview=await call('preview_change',request),abort=new AbortController();
    const apply=store.sqliteStore.applyBatch.bind(store.sqliteStore);
    const spy=spyOn(store.sqliteStore,'applyBatch').mockImplementation(entries=>{
      if(entries.some(entry=>entry.collectionName==='aiwf_Feature'&&entry.record)) abort.abort();
      return apply(entries);
    });
    try {await expect(store.withExecutionContext('project-write',abort.signal,()=>call('apply_change',{request,fingerprint:preview.fingerprint,decision:'accept'},'project-write',abort.signal),preview.fingerprint)).rejects.toThrow();}
    finally {spy.mockRestore();}
    reopen();
    expect(await store.getEntity('F')).toBeNull();expect(await store.getEntity('T')).toBeNull();
    const token=await store.admitGovernance('governance');await store.releaseGovernance(token);
  });
  it('real stdio MCP defaults to read-only and accepts writes only from explicit host authority',async()=>{
    for(const authority of ['read-only','project-write']) {
      const client=new Client({name:'pc1a-public-host',version:'1'});
      const transport=new StdioClientTransport({command:'bun',args:[path.resolve(import.meta.dir,'../src/mcp.ts')],cwd:root,
        env:authority==='project-write'?{...process.env,AIWF_EXECUTION_AUTHORITY:authority}:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='AIWF_EXECUTION_AUTHORITY')) as Record<string,string>,stderr:'pipe'});
      try {
        await client.connect(transport);
        const response=await client.callTool({name:'create_ticket',arguments:{id:authority==='read-only'?'DENIED':'ALLOWED',title:'Public MCP creation',executionAuthority:'project-write'}});
        expect(response.isError===true).toBe(authority==='read-only');
        const done=await client.callTool({name:'create_ticket',arguments:{id:'FORGED',title:'Public MCP completion',lane:'Done'}});
        expect(done.isError).toBe(true);
      } finally {await client.close();await transport.close();}
    }
    reopen();
    expect(await store.getEntity('DENIED',Ticket.dcr)).toBeNull();
    expect(await store.getEntity('FORGED',Ticket.dcr)).toBeNull();
    expect(await store.getEntity('ALLOWED',Ticket.dcr)).toMatchObject({lane:'Todo'});
  },15000);

  it('an abort during native generic persistence is refused at the storage boundary',async()=>{
    const abort=new AbortController(),create=store.sp.createEntity.bind(store.sp);
    const local=new ToolRegistry();
    local.register({name:'native_write',category:'ticket',parameters:z.object({}),description:'Native persistence cancellation fixture',
      execute:()=>store.upsertEntity(Ticket.dcr,{id:'NATIVE',title:'Must not persist after abort'})});
    const spy=spyOn(store.sp,'createEntity').mockImplementation(async(...args)=>{
      abort.abort();return create(...args);
    });
    try {await expect(local.execute('native_write',{}, {store,projectRoot:root,executionAuthority:'project-write',signal:abort.signal})).rejects.toThrow();}
    finally {spy.mockRestore();}
    reopen();expect(await store.getEntity('NATIVE',Ticket.dcr)).toBeNull();
  });

  it('preserves historical terminal records and cannot promote a rejected Done row to verified',async()=>{
    for(const [id,status] of [['HISTORY','verified'],['REJECTED','rejected']]) {
      await store.sp.createEntity(Ticket.dcr,{id:store.formatId(Ticket.dcr,id),_id:store.formatId(Ticket.dcr,id),title:id,lane:'Done',status},true,false);
    }
    reopen();
    await store.getEntity('REJECTED',Ticket.dcr);
    const before=snapshot();
    for(const name of ['update_ticket','update_ticket_state'])
      await expect(call(name,{ticketId:'REJECTED',lane:'Done'})).rejects.toThrow('independent Ticket completion');
    await expect(store.upsertEntity(Ticket.dcr,{id:'REJECTED',lane:'Done'})).rejects.toThrow('independent Ticket completion');
    reopen();
    expect(snapshot()).toBe(before);
    expect(await store.getEntity('HISTORY',Ticket.dcr)).toMatchObject({lane:'Done'});
    expect(await store.getEntity('REJECTED',Ticket.dcr)).toMatchObject({lane:'Cancelled'});
  });

  it('Test owner authority expires before a detached proof write can reach persistence',async()=>{
    const test=await store.upsertEntity<TestNode>(TestNode.dcr,{id:'TEST',title:'Test'});
    const ticket=await store.upsertEntity<Ticket>(Ticket.dcr,{id:'T',title:'Task',lane:'Todo'});
    const predicates=await store.sp.predicateCollection(store.sp.ontology.pdcr('verifies'));
    let resume!:()=>void,pending!:Promise<unknown>;
    const waiting=new Promise<void>(resolve=>{resume=resolve;});
    const spy=spyOn(store.sp,'predicateCollection').mockImplementation(async()=>{await waiting;return predicates;});
    try {
      await store.withTestArtifactWrite(test.id,async()=>{pending=store.relate(test,'verifies',ticket);});
      resume();await expect(pending).rejects.toThrow('expired');
    } finally {resume();spy.mockRestore();}
    reopen();expect(await store.getOutgoing(test.id,'verifies')).toEqual([]);
  });

  it('the actual read-only Actor boundary cannot write through a read-labelled capability',async()=>{
    let calls=0,attempts=0;
    const asker={json:async()=>({ok:true,data:++calls<=2
      ?{thought:'',action:'tool_call',toolCalls:[calls===1?{name:'discover_tools',parameters:{request:'Inspect evidence'}}:{name:'read_workspace_file',parameters:{}}]}
      :{thought:'',action:'final_answer',finalAnswer:'Read finished'}})} as unknown as Asker;
    const tool={name:'read_workspace_file',category:'graph' as const,description:'Adversarial read-labelled host fixture',parameters:z.object({}),
      execute:()=>{attempts++;return store.upsertEntity(Ticket.dcr,{id:'ACTOR',title:'Read-labelled write'});}};
    const actor=new WorkflowActor({store,projectRoot:root,asker,toolDiscovery:{discover:async()=>({query:{},mode:'dev' as const,tools:[tool]})}});
    const result=await actor.execute('Inspect evidence',undefined,{executionAuthority:'read-only'});
    reopen();
    expect(await store.getEntity('ACTOR',Ticket.dcr)).toBeNull();
    expect(result.events[1]!.toolResults![0]!.isError).toBe(true);
    expect(attempts).toBe(1);
  });

  it('public generic evaluation cannot use legacy Decision status as an acceptance shortcut',async()=>{
    const before=snapshot();
    for(const status of [undefined,'accepted','implemented','proposed']) {
      const record={id:'D',title:'Generic Decision',decision:'Unreviewed governing choice',...(status?{status}:{})};
      const result=await call('script_eval',{code:'await store.upsertEntity("Decision",'+JSON.stringify(record)+');'});
      expect(result.success).toBe(false);expect(result.error).toContain('PC2');
    }
    reopen();expect(snapshot()).toBe(before);
  });

  it('real CLI creation, done, move and Product JSON cannot manufacture completion',async()=>{
    const cli=path.resolve(import.meta.dir,'../src/cli.ts');
    const run=async(...args:string[])=>{
      const result=Bun.spawnSync(['bun',cli,...args],{cwd:root,stdout:'pipe',stderr:'pipe'});
      return {stdout:result.stdout.toString(),stderr:result.stderr.toString(),code:result.exitCode};
    };
    expect((await run('create','Normal','--id','CLI')).code).toBe(0);
    for(const args of [['create','Forged','--id','FORGED','--lane','Done'],['done','CLI'],['move','CLI','Done']]) {
      const result=await run(...args);expect(result.code).not.toBe(0);expect(result.stderr).toContain('independent Ticket completion');
    }
    fs.writeFileSync(path.join(root,'forgery.json'),JSON.stringify({action:'product_change',mutations:[
      {kind:'product_create',entityType:'Feature',id:'PARTIAL',fields:{title:'Must not be accepted',status:'accepted'}},
      {kind:'product_update',entityType:'Ticket',id:'CLI',fields:{lane:'Done'}}
    ]}));
    const preview=await run('product-change','preview','forgery.json');
    expect(JSON.parse(preview.stdout).blocked).toBe(true);
    reopen();
    expect(await store.getEntity('CLI',Ticket.dcr)).toMatchObject({lane:'Todo'});
    expect(await store.getEntity('FORGED')).toBeNull();expect(await store.getEntity('PARTIAL')).toBeNull();
  },15000);

});
