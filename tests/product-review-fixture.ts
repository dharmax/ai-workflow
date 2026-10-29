import {saveConfig} from '../src/services/config-service.ts';
import type {WorkflowStore} from '../src/graph/store.ts';
import {acceptProduct} from './product-review.ts';

/** Controlled external reviewer for tests of mechanics, including synchronous CLI
 * children. This deliberately asserts alignment; it is not semantic acceptance.
 */
if (import.meta.main) {
 const server=Bun.serve({port:0,fetch:async request=>{
  const body=await request.json() as {messages:Array<{content:string}>};
  const prompt=body.messages.map(message=>message.content).join('\n');
  const input=JSON.parse(prompt.split('Review context: ')[1]!);
  return Response.json({message:{content:JSON.stringify({
   criteria:(input.acceptanceCriteria??[]).map((criterion:string)=>({criterion,covered:true,evidence:'Controlled fixture: proposed Feature is within the test charter scope.'})),
   aspects:(input.applicableAspects??[]).map((id:string)=>({id,covered:true,evidence:'Controlled fixture coverage.'})),
   review:{verdict:'accept'},
   ...(input.charterAlignment?{alignment:{status:'aligned',explanation:'Controlled fixture explicitly covers the current charter and complete downstream definition.',observations:[],conflicts:[]}}:{})
  })}});
 }});
 console.log(server.url.toString());
}

/** Explicitly supply the now-mandatory charter and configured reviewer as initial
 * state for existing acceptance suites. All their behavioral assertions remain.
 */
export async function productReviewFixture(store:WorkflowStore, registerCharter=true) {
 const child=Bun.spawn([process.execPath,import.meta.filename],{stdout:'pipe',stderr:'pipe'});
 const reader=child.stdout.getReader();
 let output='';
 while(!output.includes('\n')) {
  const {done,value}=await reader.read();
  if(done) throw Error('Controlled Product reviewer failed to start.');
  output+=new TextDecoder().decode(value);
 }
 reader.releaseLock();
 const previousHost=process.env.OLLAMA_HOST;
 process.env.OLLAMA_HOST=output.trim();
 saveConfig(store.root,{model:'ollama/controlled-product-review',modelRoutes:{critic:'ollama/controlled-product-review'},ollamaUrl:output.trim()});
 const close=()=>{child.kill();if(previousHost===undefined)delete process.env.OLLAMA_HOST;else process.env.OLLAMA_HOST=previousHost;};
 try {
  if(registerCharter) await acceptProduct(store,[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{
   title:'Public operation fixture',purpose:'Exercise the capabilities specified by this acceptance suite',actors:['User','Developer'],scope:'The public operations and product capabilities under test',nonGoals:[],bounds:'Isolated disposable test project',status:'accepted'
  }}]);
  return close;
 } catch(error) {close();throw error;}
}
