import {describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {JevSystemOne, LayaSystemOne, type SystemOne} from '@dharmax/llm-utils';
import {CausalChangeEngine} from '../src/change/engine.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {screenCharter} from '../src/product/charter-screen.ts';
import type {ProductMutation} from '../src/product/mutation.ts';
import {initializeTools, commandRegistry} from '../src/tools/index.ts';
import {reviewProductChange} from '../src/product/links.ts';
import {saveConfig} from '../src/services/config-service.ts';

const charter = {purpose: 'Help developers', actors: ['Developer'], scope: 'Engineering tools', nonGoals: ['Write poetry', 'Act without approval'], bounds: 'Preserve source'};
const target = {id: 'F', kind: 'Feature', fields: {title: 'Diagnostics', body: 'Find defects'}};
const answers = (questions: Record<string, unknown>, low = '') => Object.fromEntries(Object.keys(questions).map(key => [key, {type: 'score' as const, score: key === low ? 1 : 4}]));

describe('Product alignment advice', () => {
  it('batches independent questions with every original constraint and reports a questionable clause', async () => {
    let calls = 0;
    const model: SystemOne = {assess: async (_state, questions) => {
      calls++;
      expect(Object.keys(questions)).toEqual(['purpose_0', 'actors_0', 'scope_0', 'nonGoals_0', 'nonGoals_1', 'bounds_0', 'coherence']);
      return {backendId: 'fixture', quality: 'high', latencyMs: 0, answers: answers(questions, 'nonGoals_1')};
    }};
    expect(await screenCharter(charter, [target], model)).toEqual(['F: nonGoals_1 scored 25/100; review against: Act without approval']);
    expect(calls).toBe(1);
  });

  it('reports unavailable and malformed assessments honestly', async () => {
    const unavailable: SystemOne = {assess: async () => null};
    const warnings = await screenCharter(charter, [target], unavailable);
    expect(warnings).toEqual(['F: System-1 alignment assessment unavailable; Product alignment is unknown.']);
    const partial: SystemOne = {assess: async (_state, questions) => ({backendId:'fixture', quality:'high', latencyMs:0, answers:{...answers(questions), bounds_0:{type:'score', score:NaN}}})};
    expect(await screenCharter(charter, [target], partial)).toEqual([expect.stringContaining('bounds_0: Preserve source')]);
    const lowConfidence: SystemOne = {assess: async (_state, questions) => ({backendId:'fixture', quality:'high', latencyMs:0, answers:{...answers(questions), scope_0:{type:'score', score:4, confidence:0.1}}})};
    expect(await screenCharter(charter, [target], lowConfidence)).toEqual([expect.stringContaining('uncertain for scope_0: Engineering tools')]);
  });

  it('shows warnings through the change preview without granting authorization', async () => {
    const original = LayaSystemOne.prototype.assess;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-warning-'));
    const store = new WorkflowStore(root);
    try {
      LayaSystemOne.prototype.assess = async (_state, questions) => ({backendId:'fixture', quality:'high', latencyMs:0, answers:answers(questions, 'nonGoals_0')});
      const mutations: ProductMutation[] = [
        {kind:'product_create', entityType:'Product', id:'PRODUCT', fields:{title:'Product', ...charter, status:'accepted'}},
        {kind:'product_create', entityType:'Feature', id:'F', fields:{...target.fields, status:'accepted'}},
      ];
      const engine = new CausalChangeEngine({store, projectRoot:root});
      const preview = await engine.previewChange({action:'product_change', mutations});
      expect(preview.blocked).toBe(false);
      expect(preview.warnings).toEqual([expect.stringContaining('Write poetry')]);
      expect(await store.getEntity('F')).toBeNull();
    } finally {
      LayaSystemOne.prototype.assess = original;
      store.close();
      fs.rmSync(root, {recursive:true, force:true});
    }
  });

  it('screens proposed Features, Stories, Epics and Aspects through the Product preview', async () => {
    const original = LayaSystemOne.prototype.assess;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-kinds-'));
    const store = new WorkflowStore(root);
    const seen: string[] = [];
    try {
      LayaSystemOne.prototype.assess = async (state, questions) => {
        seen.push((state as {proposed: {kind: string}}).proposed.kind);
        return {backendId:'fixture', quality:'high', latencyMs:0, answers:answers(questions)};
      };
      const engine = new CausalChangeEngine({store, projectRoot:root});
      for (const entityType of ['Feature', 'UserStory', 'Epic', 'Aspect'] as const) {
        const mutations: ProductMutation[] = [
          {kind:'product_create', entityType:'Product', id:'PRODUCT', fields:{title:'Product', ...charter, status:'accepted'}},
          {kind:'product_create', entityType, id:'ITEM', fields:{title:'Definition', ...(entityType==='UserStory' ? {intent:'Help developers'} : {body:'Help developers'}), status:'draft'}},
        ];
        const preview = await engine.previewChange({action:'product_change', mutations});
        if (preview.blocked) throw Error(`${entityType}: ${preview.blockReason}`);
      }
      expect(seen).toEqual(['Feature', 'UserStory', 'Epic', 'Aspect']);
    } finally {
      LayaSystemOne.prototype.assess = original;
      store.close();
      fs.rmSync(root, {recursive:true, force:true});
    }
  });

  it('uses configured remote Laya for Product previews', async () => {
    const originalFetch = globalThis.fetch;
    const oldKey = process.env.TYPESAFE_API_KEY;
    const oldUrl = process.env.LAYA_URL;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-remote-laya-'));
    const store = new WorkflowStore(root);
    try {
      delete process.env.TYPESAFE_API_KEY; delete process.env.LAYA_URL;
      saveConfig(root, {systemOneUrl:'http://laya.test:7890'});
      let calls = 0;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('http://laya.test:7890/classify'); calls++;
        const request = JSON.parse(String(init?.body));
        return Response.json({answers:answers(request.questions), usage:{input_tokens:100}});
      }) as typeof fetch;
      const mutations: ProductMutation[] = [
        {kind:'product_create', entityType:'Product', id:'PRODUCT', fields:{title:'Product', ...charter, status:'accepted'}},
        {kind:'product_create', entityType:'Feature', id:'F', fields:{...target.fields, status:'accepted'}},
      ];
      const preview = await new CausalChangeEngine({store, projectRoot:root}).previewChange({action:'product_change', mutations});
      expect(preview.blocked).toBe(false); expect(preview.warnings).toEqual([]); expect(calls).toBe(1);
    } finally {
      globalThis.fetch=originalFetch;
      if(oldKey===undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY=oldKey;
      if(oldUrl===undefined) delete process.env.LAYA_URL; else process.env.LAYA_URL=oldUrl;
      store.close();fs.rmSync(root,{recursive:true,force:true});
    }
  });

  it('uses Jev with the environment credential without a new SDK dependency', async () => {
    const originalFetch=globalThis.fetch, oldKey=process.env.TYPESAFE_API_KEY;
    let calls=0;
    try {
      process.env.TYPESAFE_API_KEY='fixture-key';
      globalThis.fetch=(async (input: RequestInfo | URL,init?: RequestInit)=>{
        expect(String(input)).toBe('https://api.typesafe.ai/v1/systemone');
        expect((init?.headers as Record<string,string>).Authorization).toBe('Bearer fixture-key');
        const request=JSON.parse(String(init?.body));calls++;
        return Response.json({model:'fixture', answers:answers(request.questions)});
      }) as typeof fetch;
      const local: SystemOne = {assess:async()=>{throw Error('Jev should handle the full context');}};
      expect(await screenCharter(charter,[target],local,true)).toEqual([]);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch=originalFetch;
      if(oldKey===undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY=oldKey;
    }
  });

  it('selects Jev for a configured Product preview', async () => {
    const originalFetch=globalThis.fetch, oldKey=process.env.TYPESAFE_API_KEY, oldHome=process.env.HOME;
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-jev-preview-'));
    const home=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-jev-home-'));
    const store=new WorkflowStore(root);
    try {
      delete process.env.TYPESAFE_API_KEY; process.env.HOME=home;
      fs.mkdirSync(path.join(home,'.ai-workflow'));
      fs.writeFileSync(path.join(home,'.ai-workflow/config.json'),JSON.stringify({providers:{typesafe:{apiKey:'fixture-key'}}}),{mode:0o600});
      saveConfig(root,{systemOneProvider:'jev'});
      let calls=0;
      globalThis.fetch=(async (input: RequestInfo | URL,init?: RequestInit)=>{
        calls++;
        if (String(input)==='http://laya.test:7890/classify') return new Response('',{status:503});
        expect(String(input)).toBe('https://api.typesafe.ai/v1/systemone');
        expect((init?.headers as Record<string,string>).Authorization).toBe('Bearer fixture-key');
        const request=JSON.parse(String(init?.body));
        return Response.json({model:'fixture',answers:answers(request.questions)});
      }) as typeof fetch;
      const mutations: ProductMutation[]=[
        {kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'Product',...charter,status:'accepted'}},
        {kind:'product_create',entityType:'Feature',id:'F',fields:{...target.fields,status:'accepted'}},
      ];
      const engine=new CausalChangeEngine({store,projectRoot:root});
      const preview=await engine.previewChange({action:'product_change',mutations});
      expect(preview.blocked).toBe(false);expect(preview.warnings).toEqual([]);expect(calls).toBe(1);
      saveConfig(root,{systemOneProvider:'laya',systemOneUrl:'http://laya.test:7890'});
      const fallback=await engine.previewChange({action:'product_change',mutations});
      expect(fallback.fingerprint).toBe(preview.fingerprint);
      expect(fallback.blocked).toBe(false);expect(fallback.warnings).toEqual([]);expect(calls).toBe(3);
    } finally {
      globalThis.fetch=originalFetch;
      if(oldKey===undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY=oldKey;
      if(oldHome===undefined) delete process.env.HOME; else process.env.HOME=oldHome;
      store.close();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(home,{recursive:true,force:true});
    }
  });

  it('requires a separate host answer for a Decision recording an advisory warning', async () => {
    const original = LayaSystemOne.prototype.assess;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-answer-'));
    const store = new WorkflowStore(root);
    try {
      initializeTools();
      LayaSystemOne.prototype.assess = async (state, questions) => ({backendId:'fixture', quality:'high', latencyMs:0,
        answers:answers(questions, JSON.stringify(state).includes('Write poems') ? 'nonGoals_0' : '')});
      const ctx = {store, projectRoot:root, executionAuthority:'project-write' as const};
      const call = (name:string, args:Record<string,unknown>) => commandRegistry.execute(name, args, ctx);
      const create = {action:'product_change' as const, mutations:[{kind:'product_create' as const, entityType:'Product' as const, id:'PRODUCT', fields:{title:'Product', ...charter, status:'accepted'}}]};
      const initial = await call('preview_change', create);
      expect((await store.withExecutionContext('project-write', undefined, () => call('apply_change', {request:create, fingerprint:initial.fingerprint, decision:'accept'}), initial.fingerprint)).ok).toBe(true);
      const proposal = {action:'product_change' as const, mutations:[{kind:'product_create' as const, entityType:'Feature' as const, id:'F', fields:{title:'Write poems', body:'Write poems for all users', status:'accepted'}}]};
      const raised = await call('preview_change', proposal);
      const warning = raised.warnings[0]!;
      expect(warning).toContain('Write poetry');
      const response = 'Limit this Feature to diagnosing software defects for developers.';
      const request = {action:'product_change' as const, mutations:[
        {kind:'product_create' as const, entityType:'Feature' as const, id:'F', fields:{title:'Diagnose software defects', body:'Diagnose source defects for developers', status:'accepted'}},
        {kind:'product_create' as const, entityType:'Decision' as const, id:'ANSWER', fields:{title:'Restrict scope', status:'accepted', decision:response, context:JSON.stringify({warning, proposal, reviewFingerprint:raised.fingerprint, charterRevision:1})}},
        {kind:'product_link' as const, sourceId:'ANSWER', predicate:'governs', targetId:'F'},
      ]};
      const preview = await call('preview_change', request);
      expect(preview.status).toBe('needs_input');
      expect((await store.withExecutionContext('project-write', undefined, () => call('apply_change', {request, fingerprint:preview.fingerprint, decision:'accept'}), preview.fingerprint)).ok).toBe(false);
      let asked = 0;
      const result = await reviewProductChange({request, fingerprint:preview.fingerprint, decision:'accept'}, ctx, async question => {
        asked++; expect(question).toContain(warning); return response;
      });
      expect(result.ok).toBe(true);
      expect(asked).toBe(1);
    } finally {
      LayaSystemOne.prototype.assess = original;
      store.close();
      fs.rmSync(root, {recursive:true, force:true});
    }
  });

  it('retries an unavailable assessment for the same proposal', async () => {
    const original=LayaSystemOne.prototype.assess, originalJev=JevSystemOne.prototype.assess;
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-retry-system1-'));
    const store=new WorkflowStore(root);let calls=0;
    try {
      JevSystemOne.prototype.assess=async()=>null;
      LayaSystemOne.prototype.assess=async (_state,questions)=>{
        calls++;
        return calls===1 ? null : {backendId:'fixture',quality:'high',latencyMs:0,answers:answers(questions)};
      };
      const mutations: ProductMutation[]=[
        {kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'Product',...charter,status:'accepted'}},
        {kind:'product_create',entityType:'Feature',id:'F',fields:{...target.fields,status:'accepted'}},
      ];
      const engine=new CausalChangeEngine({store,projectRoot:root});
      const request={action:'product_change' as const,mutations};
      const first=await engine.previewChange(request);
      expect(first.warnings.join(' ')).toContain('unavailable');
      const second=await engine.previewChange(request);
      expect(second.fingerprint).toBe(first.fingerprint);expect(second.warnings).toEqual([]);expect(calls).toBe(2);
    } finally {
      LayaSystemOne.prototype.assess=original;JevSystemOne.prototype.assess=originalJev;
      store.close();fs.rmSync(root,{recursive:true,force:true});
    }
  });

  it('requires host approval, reuses the assessment, and rejects stale changes', async () => {
    const original = LayaSystemOne.prototype.assess;
    let calls = 0;
    LayaSystemOne.prototype.assess = async (_state, questions) => {
      calls++;
      return {backendId: 'fixture', quality: 'high', latencyMs: 0, answers: answers(questions)};
    };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-alignment-'));
    const store = new WorkflowStore(root);
    try {
      const mutations: ProductMutation[] = [
        {kind:'product_create', entityType:'Product', id:'PRODUCT', fields:{title:'Product', ...charter, status:'accepted'}},
        {kind:'product_create', entityType:'Feature', id:'F', fields:{...target.fields, status:'accepted'}},
      ];
      const request = {action:'product_change' as const, mutations};
      const engine = new CausalChangeEngine({store, projectRoot:root});
      const preview = await engine.previewChange(request);
      expect(preview.blocked).toBe(false);
      expect(preview.warnings).toEqual([]);
      expect(calls).toBe(1);
      expect(await store.getEntity('F')).toBeNull();
      const denied = await store.withExecutionContext('project-write', undefined, () => engine.applyChange(request, preview.fingerprint));
      expect(denied.ok).toBe(false);
      expect(await store.getEntity('F')).toBeNull();
      const changed = {...request, mutations: [mutations[0]!, {...mutations[1]!, fields:{...target.fields, title:'Changed', status:'accepted'}}] as ProductMutation[]};
      await expect(store.withExecutionContext('project-write', undefined, () => engine.applyChange(changed, preview.fingerprint), preview.fingerprint)).rejects.toThrow('Stale change preview');
      const fresh = await engine.previewChange(request);
      const before = calls;
      const applied = await store.withExecutionContext('project-write', undefined, () => engine.applyChange(request, fresh.fingerprint), fresh.fingerprint);
      expect(applied.ok).toBe(true);
      expect(calls).toBe(before);
      expect(await store.getEntity('F')).not.toBeNull();
    } finally {
      LayaSystemOne.prototype.assess = original;
      store.close();
      fs.rmSync(root, {recursive:true, force:true});
    }
  });
});
