/** Shell-only missing-argument elicitation; command parsing and effects remain with their domain owners. */
import {ParameterFacilitator} from '@dharmax/shell-ui';
import type {ToolContext} from '../tools/registry.ts';
import {commandRegistry} from '../tools/registry.ts';
import {facilitateEntityId, type EntityViewKind} from './entity-view.ts';
import {commandTokens, createCommandTree} from '../artifact-command.ts';

/** Fill only missing identifiers in interactive shell; parsing and mutation remain canonical. */
export async function facilitateArtifactCommand(tokens: string[], ctx: ToolContext, facilitator: ParameterFacilitator): Promise<string[] | null> {
  const words = [...tokens];
  const offset = words[0]?.toLowerCase() === 'please' ? 1 : 0;
  const verb = words[offset]?.toLowerCase();
  const tree=createCommandTree(()=>{},()=>{},'shell');
  const normalized=commandTokens(words,tree);
  const definition=commandRegistry.getCommands('shell').find(c=>{
    const prefix=[c.topic,...(c.subtopic?[c.subtopic]:[]),c.action];
    return prefix.every((token,index)=>normalized[index]===token);
  });
  if(definition){
    const start=definition.subtopic?3:2;
    const positions=definition.positionals??[];
    for(let index=0;index<positions.length;index++){
      const field=positions[index]!;
      if(normalized[start+index]&&!normalized[start+index]!.startsWith('--')||definition.parameters.shape[field]!.isOptional())continue;
      let value:unknown;
      if(definition.topic==='ticket'&&field==='ticketId')value=await facilitateEntityId(ctx,'ticket',facilitator);
      else {const answer=await facilitator.facilitate({[field]:{type:'string',description:field}},{},{interactive:true});value=answer[field];}
      if(typeof value!=='string')return null;
      normalized.splice(start+index,0,value);
    }
    return normalized;
  }
  let kind: EntityViewKind;
  let idIndex: number;
  if (verb === 'process') {
    if (!words[offset + 1] || words[offset + 1]!.startsWith('--')) {
      const values = await facilitator.facilitate({kind: {type: 'select', description: 'Product artifact kind', choices: ['epic', 'feature', 'story']}}, {}, {interactive: true});
      if (typeof values.kind !== 'string') return null;
      words.splice(offset + 1, 0, values.kind);
    }
    if (!['epic', 'feature', 'story'].includes(words[offset + 1]!)) return words;
    kind = words[offset + 1] as EntityViewKind;
    idIndex = offset + 2;
  } else if (verb==='ticket'&&['show','status','investigate'].includes(words[offset+1]??'')){
    kind='ticket';idIndex=offset+2;
  } else if (['resolve', 'prepare', 'investigate', 'resolve_ticket', 'prepare_ticket', 'investigate_ticket'].includes(verb || '')) {
    kind = 'ticket';
    idIndex = offset + 1;
    if (words[idIndex]?.toLowerCase() === 'ticket') idIndex++;
  } else if (['process_epic', 'process_feature', 'process_story'].includes(verb || '')) {
    kind = verb!.slice(8) as EntityViewKind;
    idIndex = offset + 1;
  } else return words;
  if (!words[idIndex] || words[idIndex]!.startsWith('--')) {
    const id = await facilitateEntityId(ctx, kind, facilitator);
    if (!id) return null;
    words.splice(idIndex, 0, id);
  }
  return words;
}

