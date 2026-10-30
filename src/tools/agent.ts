/**
 * Responsibility: Existing WorkflowActor execution as a registered capability.
 * Scope: Host authority and runtime cancellation remain with the existing Actor.
 */
import {z} from 'zod';
import {commandRegistry} from './registry.ts';
export function registerAgentTools(){
 commandRegistry.register({name:'execute_shell_wish',category:'planning',description:'Execute an instruction via the AI-Workflow cognitive engine with bounded host authority and automatic mode switching.',
  parameters:z.object({wish:z.string().min(1),mode:z.enum(['design','dev','triage','product']).optional()}).strict(),
  execute:async({wish,mode},ctx)=>{
   const {WorkflowActor}=await import('../helpers/actor/engine.ts');
   const actor=ctx.actor??new WorkflowActor({store:ctx.store,projectRoot:ctx.projectRoot,preferLocal:true});
   const result=await actor.execute(wish,mode,{executionAuthority:ctx.executionAuthority,signal:ctx.signal});
   return '### [AI-Workflow: '+result.mode.toUpperCase()+']\n'+result.answer+(result.stepsCount>0?'\n\n*Executed '+result.stepsCount+' autonomous step(s).*':'');
  }});
}
