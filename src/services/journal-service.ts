/** Ticket execution history in the project's existing Semantika store. */
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {WorkflowStore} from '../graph/store.ts';
import {Ticket} from '../model/ontology.ts';
import {canonical} from '../kb/canonical.ts';

export const TicketEventKindSchema=z.enum(['created','specification','state','lease','decision','action','failure','correction','outcome','legacy']);
export const TicketEventInputSchema=z.object({
  ticketId:z.string().min(1), kind:TicketEventKindSchema,
  message:z.string().trim().min(1).max(12000), references:z.array(z.string().min(1)).default([])
}).strict();
export interface JournalEntry {
  _id:string; ticketId:string; type:'event'; kind:z.infer<typeof TicketEventKindSchema>;
  message:string; references:string[]; timestamp:string;
}
interface HistorySummary {
  _id:string; type:'summary'; ticketId:string; text:string; references:string[];
  through:string; count:number; timestamp:string; _version:number;
}
export function systemJournal(store:WorkflowStore) {
  return store.sp.basicCollection('system-journal', collection => collection.ensureIndex({ticketId:1,type:1}));
}

/** Callers include this append in their existing atomic write, before reporting success. */
export async function ticketEventBatch(store:WorkflowStore, ticketId:string, kind:JournalEntry['kind'], message:string, references:string[]=[]) {
  const journal=await systemJournal(store), id=Bun.randomUUIDv7();
  return {collectionName:journal.name,id,expectedVersion:null,record:{
    ticketId:store.localId(ticketId),type:'event',kind,message,references:[...new Set(references)],timestamp:new Date().toISOString()
  }};
}
export async function recordTicketEvent(store:WorkflowStore, input:z.infer<typeof TicketEventInputSchema>) {
  store.assertCanWrite();
  const {ticketId,kind,message,references}=TicketEventInputSchema.parse(input);
  if(!await store.getEntity<Ticket>(ticketId,Ticket.dcr)) throw Error(`Ticket '${ticketId}' not found.`);
  const entry=await ticketEventBatch(store,ticketId,kind,message,references);
  store.sqliteStore.applyBatch([entry]);
  return {id:entry.id,ticketId:store.localId(ticketId)};
}

/** A single change classifier shared by Product batches and direct entity updates. */
export async function ticketChangeEvents(store:WorkflowStore,ticketId:string,previous:Record<string,unknown>|undefined,next:Record<string,unknown>) {
  const events:Awaited<ReturnType<typeof ticketEventBatch>>[]=[];
  if(!previous) events.push(await ticketEventBatch(store,ticketId,'created',`Created: ${String(next.title ?? store.localId(ticketId))}.`));
  else {
    const fields=['title','body','acceptanceCriteria','priority','kind','defect'].filter(key=>canonical(previous[key])!==canonical(next[key]));
    if(fields.length) events.push(await ticketEventBatch(store,ticketId,'specification',`Updated current work specification: ${fields.join(', ')}.`));
  }
  if(previous && previous.lane!==next.lane)
    events.push(await ticketEventBatch(store,ticketId,'state',`${String(previous.lane)} → ${String(next.lane)}.`,next.lane==='Done'?[`VERIFY-${store.localId(ticketId)}`]:[]));
  if(canonical(previous?.claim)!==canonical(next.claim)) {
    const before=previous?.claim as Ticket['claim'], after=next.claim as Ticket['claim'];
    // Routine lease renewal is noise; record acquisition, owner change and release.
    if(before?.agentId!==after?.agentId || before?.leaseId!==after?.leaseId) events.push(await ticketEventBatch(store,ticketId,'lease',after?`Claimed by ${after.agentId}.`:'Released lease.'));
  }
  return events;
}
export async function getTicketHistory(store:WorkflowStore,ticketId:string,limit=100,after?:string) {
  const journal=await systemJournal(store), id=store.localId(ticketId);
  const offset=after?Number(after):0;
  if(!Number.isSafeInteger(offset)||offset<0) throw Error('Invalid journal cursor.');
  const rows=await journal.findSome<JournalEntry>({ticketId:id,type:'event'},{sort:{_id:1},limit:limit+1,from:offset});
  const entries=rows.slice(0,limit);
  return {ticketId:id,entries,nextCursor:rows.length>limit?String(offset+limit):null};
}
export async function ticketHistoryContext(store:WorkflowStore,ticketId:string) {
  const journal=await systemJournal(store), id=store.localId(ticketId);
  const summary=await journal.findById<HistorySummary>(`summary:${id}`);
  const count=await journal.count({ticketId:id,type:'event'});
  const recent=(await journal.findSome<JournalEntry>({ticketId:id,type:'event'},{sort:{_id:-1},limit:5})).filter(entry=>!summary || entry._id>summary.through);
  return {count,summary:summary?{text:summary.text,references:summary.references.slice(0,20),through:summary.through,count:summary.count,stale:summary.count!==count}:null,
    recent:recent.reverse().map(entry=>({id:entry._id,kind:entry.kind,message:entry.message.slice(0,240),references:entry.references.slice(0,10)}))};
}

/** Explicit deterministic condensation; summaries are replaceable, events never are. */
export async function condenseTicketHistory(store:WorkflowStore,ticketId:string) {
  store.assertCanWrite();
  if(!await store.getEntity<Ticket>(ticketId,Ticket.dcr)) throw Error(`Ticket '${ticketId}' not found.`);
  const journal=await systemJournal(store), id=store.localId(ticketId);
  const entries=await journal.findSome<JournalEntry>({ticketId:id,type:'event'},{sort:{_id:1}});
  const counts=new Map<string,number>(), latest=new Map<string,JournalEntry>();
  for(const entry of entries) {counts.set(entry.kind,(counts.get(entry.kind)??0)+1);latest.set(entry.kind,entry);}
  const text=[`${entries.length} events.`,...Array.from(latest,([kind,entry])=>`${kind} (${counts.get(kind)}): ${entry.message.replace(/\s+/g,' ').slice(0,240)}`)].join('\n');
  const references=[...new Set(entries.flatMap(entry=>entry.references))];
  const key=`summary:${id}`, previous=await journal.findById<HistorySummary>(key);
  const summary={type:'summary',ticketId:id,text,references,through:entries.at(-1)?._id??'',count:entries.length,timestamp:new Date().toISOString()};
  store.sqliteStore.applyBatch([{collectionName:journal.name,id:key,expectedVersion:previous?._version??null,record:summary}]);
  return summary;
}

/** Preserve the exact old body and references in the same transaction that replaces it.
 * Historical body cleanup preserves the original signature basis and leaves receipts intact.
 */
export async function migrateTicketBody(store:WorkflowStore,ticketId:string,expectedBody:string,specification:string,references:string[]=[]) {
  store.assertCanWrite();
  if(!specification.trim()) throw Error('Migration requires a current specification.');
  const ticket=await store.getEntity<Ticket>(ticketId,Ticket.dcr);
  if(!ticket) throw Error(`Ticket '${ticketId}' not found.`);
  const collection=await store.sp.collectionForEntityType(Ticket.dcr);
  const previous=await collection.findById<Record<string,unknown>&{_version:number}>(ticket.id);
  if(previous.body!==expectedBody) throw Error('Ticket body changed before migration.');
  if(expectedBody===specification) return {migrated:false};
  const fingerprint=createHash('sha256').update(canonical({ticketId:ticket.id,version:ticket.version,expectedBody,specification,references})).digest('hex');
  if(!store.canReviewProduct(fingerprint)) return {status:'review_required' as const,fingerprint};
  const history=await ticketEventBatch(store,ticket.id,'legacy',expectedBody,references);
  const verificationBody=await ticketVerificationBody(store,ticket);
  history.record=Object.assign(history.record,{specification,...(verificationBody===expectedBody?{}:{verificationBody})});
  store.sqliteStore.applyBatch([history,{collectionName:collection.name,id:ticket.id,expectedVersion:previous._version,record:{...previous,body:specification}}]);
  return {migrated:true,entryId:history.id};
}

/** Only an exact host-reviewed archival migration can retain an older body signature.
 * Later specification edits and all other signature inputs retain normal freshness checks.
 */
export async function ticketVerificationBody(store:WorkflowStore,ticket:Ticket):Promise<string> {
  const journal=await systemJournal(store);
  const migrations=await journal.findSome<JournalEntry & {verificationBody:string;specification:string}>(
    {ticketId:store.localId(ticket.id),type:'event',kind:'legacy',specification:ticket.body},{sort:{_id:-1},limit:1});
  return migrations[0]?.verificationBody ?? migrations[0]?.message ?? ticket.body;
}
