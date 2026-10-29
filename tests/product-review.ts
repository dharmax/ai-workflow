import {Aspect} from '../src/model/ontology.ts';
import type {WorkflowStore} from '../src/graph/store.ts';
import {initializeTools,registry} from '../src/tools/index.ts';
import type {ProductMutation} from '../src/product/mutation.ts';

export function reviewedApply(store: WorkflowStore, params: Record<string,unknown>) {
 const ctx={store,projectRoot:store.root,executionAuthority:'project-write' as const};
 return store.withExecutionContext('project-write',undefined,()=>registry.execute('apply_change',params,ctx),
  typeof params.fingerprint==='string'?params.fingerprint:undefined);
}

/** Emulate a local host reviewing an exact S2 preview, never agent self-approval. */
export async function acceptProduct(store: WorkflowStore, mutations: ProductMutation[]) {
 initializeTools();
 const ctx={store,projectRoot:store.root,executionAuthority:'project-write' as const};
 const request={action:'product_change' as const,mutations};
 const preview=await registry.execute('preview_change',request,ctx);
 if(preview.blocked) throw Error(preview.blockReason);
 const result=await reviewedApply(store,{request,fingerprint:preview.fingerprint,decision:'accept'});
 if(!result.ok || !result.verification.passed) throw Error(result.error ?? result.verification.errors.join('; '));
 return result;
}
type DefinitionKind='Goal'|'Concept'|'Flow'|'Epic'|'Feature'|'UserStory'|'Aspect';
async function readProduct(store: WorkflowStore, kind: DefinitionKind, id: string) {
 const readers: Record<DefinitionKind,[string,string]>={Goal:['get_goal','id'],Concept:['get_concept','id'],Flow:['get_flow','id'],Epic:['get_epic','epicId'],Feature:['get_feature','featureId'],UserStory:['get_user_story','storyId'],Aspect:['get_aspect','id']};
 const [name,key]=readers[kind];
 return registry.execute(name,{[key]:id},{store,projectRoot:store.root});
}
export async function createAspect(store: WorkflowStore, data: {id:string;[key:string]:unknown}) {
 const {id,...fields}=data;
 await acceptProduct(store,[{kind:'product_create',entityType:'Aspect',id,fields}]);
 return (await store.getEntity<Aspect>(id,Aspect.dcr))!;
}
export async function createProduct(store: WorkflowStore, entityType: DefinitionKind, data: {id:string;[key:string]:unknown}) {
 const {id,...fields}=data;
 await acceptProduct(store,[{kind:'product_create',entityType,id,fields}]);
 return readProduct(store,entityType,id);
}
export async function updateProduct(store: WorkflowStore, entityType: DefinitionKind, data: {id:string;[key:string]:unknown}) {
 const {id,...fields}=data;
 await acceptProduct(store,[{kind:'product_update',entityType,id,fields}]);
 return readProduct(store,entityType,id);
}
