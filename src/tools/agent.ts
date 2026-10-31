/**
 * Responsibility: Existing WorkflowActor execution as a registered capability.
 * Scope: Host authority and runtime cancellation remain with the existing Actor.
 */
import {z} from 'zod';
import {IntelligenceSchema} from '../helpers/actor/engine.ts';
import {commandRegistry} from './registry.ts';
export function registerAgentTools(){
 commandRegistry.register({name:'execute_shell_wish',category:'planning',description:'Execute an instruction via the AI-Workflow cognitive engine with bounded host authority and per-operation native model routing.',
  parameters:z.object({wish:z.string().min(1),intelligence:IntelligenceSchema.optional()}).strict(),
  execute:async({wish,intelligence},ctx)=>{
   const {WorkflowActor}=await import('../helpers/actor/engine.ts');
   const actor=ctx.actor??new WorkflowActor({store:ctx.store,projectRoot:ctx.projectRoot,preferLocal:true});
   const result=await actor.execute(wish,{intelligence,executionAuthority:ctx.executionAuthority,codeMutationAllowed:ctx.codeMutationAllowed,signal:ctx.signal});
   return '### AI-Workflow\n'+result.answer+(result.stepsCount>0?'\n\n*Executed '+result.stepsCount+' autonomous step(s).*':'');
  }});
}
