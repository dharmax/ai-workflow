/** Browser presentation only. Canonical validation and persistence stay on the server. */
export function workspaceClient() {
  const $ = id => document.getElementById(id);
  const token = location.hash.slice(1) || sessionStorage.getItem('aiwf-token');
  if (token) sessionStorage.setItem('aiwf-token', token);
  history.replaceState(null, '', location.pathname);
  let catalog = [], current = null, preview = null, imported = null, pending = [], dirty = false, generation = 0, editEpoch = 0, advancedDirty = false, saving = false;
  const labels = {title:'Title',body:'Description',priority:'Priority',acceptanceCriteria:'Acceptance criteria',actor:'Actor',intent:'Intent',
    initialState:'Initial State',action:'Action',expectedResult:'Expected Result',exceptions:'Exceptions',bounds:'Bounds',story:'Legacy narrative',context:'Legacy context',sla:'Service level'};
  const editable = ['Product','Goal','Concept','Flow','Feature','Aspect','UserStory','Epic','Ticket','Module'];
  const arrayFields = ['acceptanceCriteria','actors','nonGoals','responsibilities','outcomes','behavioralRules'];
  let testPreview=null, catalogPage=0;
  const say = (message, error=false) => {
    $('notice').textContent = message; $('notice').setAttribute('role',error?'alert':'status');
    $('notice').className = error ? 'error' : 'notice';
  };
  async function api(route, body) {
    const response = await fetch('/api/'+route,{method:body===undefined?'GET':'POST',
      headers:{'x-aiwf-token':token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Workspace request failed');
    return result;
  }
  function el(tag, text, parent, props={}) {
    const node=document.createElement(tag); if(text!==undefined) node.textContent=text;
    Object.assign(node, props); if(parent) parent.append(node); return node;
  }
  function button(text, parent, action, className='') {
    return el('button',text,parent,{type:'button',className,onclick:()=>run(action)});
  }
  async function run(action) {
    if(saving) return;
    try { await action(); } catch(error) { say(error.message + ' Your unsaved text is retained.',true); }
  }
  function invalidate() {
    const reviewing=!!preview || !$('update').hidden;
    editEpoch++; dirty=true; preview=null; $('accept').disabled=true; $('review').hidden=true;
    $('update').hidden=!(imported||reviewing); $('review-button').hidden=!!imported||reviewing;
    say('Unsaved changes');
  }
  function canLeave() { return !dirty || confirm('Discard unsaved changes?'); }
  function option(select,value,text) { el('option',text,select,{value}); }
  function field(form,key,value,index,kind) {
    const label=el('label',key==='body'&&kind==='Module'?'Purpose':labels[key] || ({purpose:'Purpose',actors:'Actors',scope:'Scope',nonGoals:'Non-goals',responsibilities:'Responsibilities',boundaries:'Boundaries',outcomes:'Outcomes',behavioralRules:'Behavioral rules'}[key]) || key,form);
    const id='field-'+index+'-'+key;
    let input;
    const choices=key==='ticketKind'?['task','bug']:key==='lane'?['Backlog','Todo','In Progress','Done','Blocked']:
      key==='severity'?['','critical','high','medium','low']:key==='priority'&&kind==='Ticket'?['P0','P1','P2','P3']:null;
    if(choices) {
      input=el('select',undefined,label,{id,name:key});
      for(const choice of choices) option(input,choice,choice||'Unknown');
      input.value=value??(key==='ticketKind'?'task':key==='priority'?'P2':key==='lane'?'Todo':'');
    } else if(key==='status'||key==='intentStatus') {
      label.textContent=kind==='Epic'?'Delivery status':'Definition status';
      input=el('select',undefined,label,{id,name:key,'ariaLabel':'Definition status'});
      for(const status of key==='status'&&kind==='Epic'?['draft','planned','active','completed','cancelled']:['draft','proposed','accepted','deprecated']) option(input,status,status);
      input.value=value || 'draft';
    } else {
      input=el(key==='title'||key==='priority'?'input':'textarea',undefined,label,{id,name:key});
      input.value=Array.isArray(value)?value.join('\n'):value??'';
      if(key==='priority') {input.type='number'; input.step='any';}
      if(key==='title') input.required=true;
      if(arrayFields.includes(key)) el('small',key==='acceptanceCriteria'?'One observable criterion per line':'One entry per line',label);
    }
    input.setAttribute('aria-label',label.firstChild.textContent);
    input.oninput=invalidate;
  }
  function fieldsFor(kind, data) {
    if(kind==='Product') return ['title','purpose','actors','scope','nonGoals','bounds','status'];
    if(kind==='Module') return ['body','responsibilities','boundaries','intentStatus'];
    if(kind==='Goal'||kind==='Concept') return ['title','body','status'];
    if(kind==='Flow') return ['title','actor','body','context','status'];
    if(kind==='Epic') return ['title','body','priority','status'];
    if(kind==='Ticket') return ['title','body','priority','lane','ticketKind',...(data.ticketKind==='bug'?['reproduction','expected','actual','severity','impact','environment','evidence']:[]),'acceptanceCriteria'];
    if(kind==='UserStory') return ['title','actor','intent','initialState','action','expectedResult','exceptions','bounds','acceptanceCriteria',
      ...['story','context','sla'].filter(key=>data[key]),'status'];
    return ['title','body',...(kind==='Feature'?['priority','outcomes','scope','boundaries','behavioralRules']:[]),'acceptanceCriteria','status'];
  }
  function entityForm(data,index,create=false) {
    const section=el('section',undefined,$('forms'),{className:'entity-form'});
    section.dataset.kind=data.kind;
    el('h2',(data.kind==='UserStory'?'Story':data.kind) + (create?' · New':' · '+data.id),section);
    const meta=el('div',undefined,section,{className:'meta'});
    const label=el('label','Stable ID',meta);
    el('input',undefined,label,{name:'id',value:data.id || '',readOnly:!create||data.kind==='Product',oninput:invalidate,required:true});
    if(data.version) el('span','Revision '+data.version,meta);
    if(data.kind==='Module') el('p','Indexed path: '+(data.path||'unknown')+' · Source: '+(data.sourceStatus||'unknown'),section,{className:'hint'});
    const form=el('div',undefined,section,{className:'fields'});
    for(const key of fieldsFor(data.kind,data)) field(form,key,data[key]??data.defect?.[key],index,data.kind);
    if(data.kind==='UserStory') {
      el('p',data.definitionReview==='needs_review'?'Legacy Story needs review: complete the explicit scenario before accepting.':'Acceptance approves this definition. Story satisfaction remains unverified without execution evidence.',section,{className:'hint'});
      if(imported && create) button('Reject Story '+data.id,section,async()=>{
        const request=collect();
        const exclusiveTickets=request.mutations.filter(m=>m.kind==='product_link'&&m.predicate==='addresses'&&m.targetId===data.id)
          .map(m=>m.sourceId).filter(id=>!request.mutations.some(m=>m.kind==='product_link'&&m.predicate==='addresses'&&m.sourceId===id&&m.targetId!==data.id));
        const rejected=new Set([data.id,...exclusiveTickets]);
        request.mutations=request.mutations.filter(m=>'id' in m?!rejected.has(m.id):!rejected.has(m.sourceId)&&!rejected.has(m.targetId));
        if(!request.mutations.length) {reset();say('Story rejected. No work saved.');return;}
        invalidate();renderProposal(request);await review(request);
      });
      if(!imported) {
        const lbl=el('label','Feature',form);
        const select=el('select',undefined,lbl,{name:'feature',ariaLabel:'Feature'});
        option(select,'','No Feature');
        for(const entity of catalog.filter(e=>e.kind==='Feature')) option(select,entity.id,entity.title+' · '+entity.id);
        select.value=current?.entity.enablingFeatures?.[0] || '';
        select.dataset.original=select.value;
        select.onchange=invalidate;
        el('small','Additional Feature links are available under relationships.',lbl);
      }
    }
  }
  function reset() {
    generation++; editEpoch++; preview=null; imported=null; pending=[]; dirty=false; $('forms').replaceChildren(); $('review').hidden=true;
    $('proposal-import').hidden=true; $('context').hidden=true; $('editor').hidden=false;
    $('review-button').hidden=false; $('update').hidden=true; $('accept').disabled=true;
    $('advanced-editor').hidden=true; advancedDirty=false;
    $('derive-panel').hidden=true; $('derive-work').hidden=true;
    $('story-test-panel').hidden=true; $('story-test').hidden=true; testPreview=null;
  }
  async function refresh() {
    const result=await api('catalog'); catalog=result.entities; $('project').textContent=result.projectRoot;
    $('new-product').hidden=catalog.some(entity=>entity.kind==='Product');
    list(catalogPage);
  }
  function list(page=0) {
    const query=$('search').value.toLowerCase().trim(), kind=$('kind-filter').value;
    const rows=catalog.filter(e=>(!kind||(kind==='Bug'?e.ticketKind==='bug':e.kind===kind)) && JSON.stringify(e).toLowerCase().includes(query));
    $('results').replaceChildren();
    const pageSize=25, pages=Math.ceil(rows.length/pageSize);
    catalogPage=Math.max(0,Math.min(page,pages-1));
    $('count').textContent=rows.length+' canonical entities';
    $('catalog-pages').hidden=pages<=1;
    $('catalog-page').textContent=pages?'Page '+(catalogPage+1)+' of '+pages:'No results';
    $('previous-page').disabled=catalogPage===0;
    $('next-page').disabled=catalogPage+1>=pages;
    for(const entity of rows.slice(catalogPage*pageSize,(catalogPage+1)*pageSize)) {
      const row=el('div',undefined,$('results'),{className:'result'});
      button(entity.title||entity.id,row,()=>open(entity.kind,entity.id));
      el('small',(entity.ticketKind==='bug'?'Bug':entity.kind)+' · '+entity.id+' · '+(entity.kind==='Module'?entity.intentStatus||'unknown':entity.status||entity.lane||'unknown'),row);
    }
    if(!rows.length) el('p','No matching entities. Try a shorter search or create a definition.',$('results'));
  }
  async function open(kind,id,force=false) {
    if(!force&&!canLeave()) return;
    const sequence=++generation, detail=await api('entity?'+new URLSearchParams({kind,id}));
    if(sequence!==generation) return;
    reset(); current=detail;
    if(editable.includes(kind)) entityForm(detail.entity,0);
    else {
      el('h2',detail.entity.title,$('forms'));
      el('pre',JSON.stringify(detail.entity,null,2),$('forms'));
      $('review-button').hidden=true;
    }
    $('context').hidden=false;
    context(); $('derive-work').hidden=!['Feature','UserStory','Epic'].includes(kind);
    $('story-test').hidden=kind!=='UserStory';
    say('Loaded '+id+' · canonical revision '+detail.entity.version);
  }
  function create(kind) {
    if(!canLeave()) return; reset(); current=null;
    entityForm(kind==='Bug'?{kind:'Ticket',ticketKind:'bug',lane:'Todo',priority:'P2'}:{kind,...(kind==='Product'?{id:'PRODUCT'}:{}),status:kind==='Epic'?'planned':'draft'},0,true);
    $('context').hidden=false; context(); say('New '+(kind==='UserStory'?'Story':kind));
    $('forms').querySelector('[name=title]').focus();
  }
  function context() {
    $('aspects').replaceChildren(); $('related').replaceChildren();
    const aspects=current?.aspects||[];
    if(!aspects.length) el('p','No accepted applicable Aspects. Review linked draft concerns separately.',$('aspects'));
    for(const aspect of aspects) {
      el('h4',aspect.title+' · '+aspect.id,$('aspects')); el('p',aspect.body||'No definition text',$('aspects'));
    }
    if(current?.storyTests) el('p','Story test specification: '+JSON.stringify(current.storyTests),$('related'));
    const relations=current?.relations||[];
    if(!relations.length) el('p','No linked objects. Unlinked effects are unknown.',$('related'));
    for(const edge of relations) {
      const row=el('div',undefined,$('related'),{className:'edge'});
      el('span',edge.sourceId+' → '+edge.predicate+' → '+edge.targetId,row);
      if(editable.includes(current.entity.kind)) button('Remove '+edge.sourceId+' '+edge.predicate+' '+edge.targetId,row,()=>{
        const i=pending.findIndex(p=>p.kind==='product_unlink'&&p.sourceId===edge.sourceId&&p.predicate===edge.predicate&&p.targetId===edge.targetId);
        if(i<0) pending.push({kind:'product_unlink',...edge}); else pending.splice(i,1);
        invalidate(); row.classList.toggle('removed',i<0);
      });
    }
    for(const edge of pending.filter(p=>p.kind==='product_link')) el('p','Add: '+edge.sourceId+' → '+edge.predicate+' → '+edge.targetId,$('related'));
    $('relationship-target').replaceChildren();
    option($('relationship-target'),'','Choose an entity');
    for(const entity of catalog) option($('relationship-target'),entity.id,entity.title+' · '+entity.kind+' · '+entity.id);
    $('relationship-kind').value=current?.entity.kind==='Aspect'?'applies_to':'enables';
  }
  function collect() {
    if(imported) {
      if(advancedDirty) return JSON.parse($('advanced-json').value);
      const request=structuredClone(imported);
      const sections=[...$('forms').querySelectorAll('.entity-form')];
      for(const section of sections) {
        const mutation=request.mutations[Number(section.dataset.mutation)];
        mutation.fields={...mutation.fields,...formFields(section)};
        mutation.id=section.querySelector('[name=id]').value.trim();
      }
      return request;
    }
    const section=$('forms').querySelector('.entity-form');
    if(!section) throw new Error('Select an editable definition first.');
    const id=section.querySelector('[name=id]').value.trim(), kind=section.dataset.kind;
    if(!id) throw new Error('Stable ID is required.');
    const fields=formFields(section);
    const mutations=[{kind:current?'product_update':'product_create',entityType:kind,id,fields},...pending];
    const feature=section.querySelector('[name=feature]');
    if(feature&&feature.value!==feature.dataset.original) {
      const existing=(current?.relations||[]).filter(r=>r.targetId===id&&(r.predicate==='enables'
        || r.predicate==='contains'&&catalog.some(entity=>entity.id===r.sourceId&&entity.kind==='Feature')));
      for(const edge of existing) if(edge.sourceId!==feature.value) mutations.push({kind:'product_unlink',...edge});
      if(feature.value&&!existing.some(r=>r.sourceId===feature.value)) mutations.push({kind:'product_link',sourceId:feature.value,predicate:'enables',targetId:id});
    }
    return {action:'product_change',originalRequest:'Developer Workspace edit',basis:current?.basis||[],mutations};
  }
  function formFields(section) {
    const values={};
    for(const input of section.querySelectorAll('[name]')) {
      const key=input.name;
      if(['id','feature'].includes(key)) continue;
      if(key==='priority') {if(input.value!=='') values[key]=section.dataset.kind==='Ticket'?input.value:Number(input.value);}
      else if(key==='ticketKind') values.kind=input.value;
      else if(['reproduction','expected','actual','severity','impact','environment','evidence'].includes(key)) {
        if(input.value!=='') (values.defect??={})[key]=key==='evidence'?input.value.split('\n').map(s=>s.trim()).filter(Boolean):input.value;
      }
      else values[key]=arrayFields.includes(key)?input.value.split('\n').map(s=>s.trim()).filter(Boolean):input.value;
    }
    return values;
  }
  async function review(request=collect(), existing=null) {
    $('accept').disabled=true;
    const epoch=editEpoch;
    say('Preparing review…');
    const result=existing||await api('preview',request);
    if(epoch!==editEpoch) return;
    if(result.blocked) throw new Error(result.blockReason||'Review blocked');
    if(imported) renderProposal(request);
    preview=result; $('review').hidden=false; $('update').hidden=false; $('review-button').hidden=true;
    $('summary').textContent=result.summary;
    $('original-request').textContent=request.originalRequest || 'No original request was supplied.';
    $('diff').replaceChildren();
    for(const mutation of request.mutations) {
      const block=el('section',undefined,$('diff'));
      el('h3',mutation.kind.replace('product_','')+' · '+(mutation.id||mutation.sourceId+' → '+mutation.predicate+' → '+mutation.targetId),block);
      if(mutation.fields) {
        const before=current?.entity.id===mutation.id?current.entity:catalog.find(e=>e.id===mutation.id)||{};
        const table=el('table',undefined,block), head=el('tr',undefined,table);
        for(const title of ['Field','Before','After']) el('th',title,head);
        for(const [key,value] of Object.entries(mutation.fields)) if(JSON.stringify(before[key])!==JSON.stringify(value)) {
          const row=el('tr',undefined,table); el('th',labels[key]||key,row);
          el('td',Array.isArray(before[key])?before[key].join('\n'):String(before[key]??'—'),row);
          el('td',Array.isArray(value)?value.join('\n'):String(value??'—'),row);
        }
      }
    }
    $('impact').textContent=JSON.stringify({knownAffected:result.affectedProducts,linkedImpact:result.productImpacts,dependents:result.dependents,warnings:result.warnings},null,2);
    $('accept').disabled=false;
    say('Review ready. Nothing has been saved.');
    $('review').scrollIntoView({block:'start'});
  }
  async function decision(choice) {
    if(!preview) throw new Error('Update the review before accepting.');
    const reviewed=preview;
    $('accept').disabled=true;
    say(choice==='accept'?'Saving reviewed changes…':'Closing review…');
    const controls=[...document.querySelectorAll('button,input,textarea,select')].map(control=>[control,control.disabled]);
    for(const [control] of controls) control.disabled=true;
    saving=true;
    try {
      const result=await api('apply',{request:reviewed.request,fingerprint:reviewed.fingerprint,decision:choice});
      if(choice==='accept') {
        if(!result.ok) throw new Error(result.error||'Save refused');
        dirty=false; imported=null; preview=null; pending=[];
        try {
          await refresh();
          const mutation=reviewed.request.mutations.find(m=>m.kind==='product_create'||m.kind==='product_update');
          if(mutation&&editable.includes(mutation.entityType)) await open(mutation.entityType,mutation.id,true);
          else reset();
          say('Saved. Canonical definitions reloaded.');
        } catch(error) {
          reset(); current=null;
          say('Saved, but reload failed: '+error.message+'. Use Reload canonical data before continuing.',true);
        }
      } else {
        preview=null; $('review').hidden=true; $('accept').disabled=true;
        $('review-button').hidden=!!imported; $('update').hidden=!imported;
        say(choice==='reject'?'Proposal rejected. No changes saved.':'Review canceled. No changes saved.');
      }
    } finally {
      saving=false;
      for(const [control,disabled] of controls) control.disabled=disabled;
    }
  }
  async function loadProposal() {
    const sequence=++generation;
    const data=JSON.parse($('proposal-json').value), request=data.request||data;
    // Only a Product proposal is accepted by the server, including on apply.
    const result=await api('preview',request);
    if(sequence!==generation) return;
    if(result.blocked) throw new Error(result.blockReason||'Proposal blocked');
    if(data.fingerprint&&data.fingerprint!==result.fingerprint) throw new Error('Stale proposal fingerprint. Reload its source and review again.');
    reset(); current=null; renderProposal(request);
    await review(request,result);
    // Pin entities at editor-open time even for a hand-authored request with no basis.
    imported={...request,basis:request.basis || []};
    for(const mutation of request.mutations) {
      const ids='id' in mutation?[mutation.id]:[mutation.sourceId,mutation.targetId];
      for(const id of ids) {
        const entity=catalog.find(e=>e.id===id);
        if(entity?.version&&!imported.basis.some(revision=>revision.id===id))
          imported.basis.push({id,entityType:entity.kind,version:entity.version});
      }
    }
    dirty=true;
  }
  function renderProposal(request) {
    imported=structuredClone(request); advancedDirty=false;
    $('forms').replaceChildren(); $('advanced-editor').hidden=false;
    $('advanced-json').value=JSON.stringify(request,null,2);
    let index=0;
    for(const [i,mutation] of request.mutations.entries()) if(['product_create','product_update'].includes(mutation.kind)&&editable.includes(mutation.entityType)) {
      const before=catalog.find(e=>e.id===mutation.id)||{};
      entityForm({...before,...mutation.fields,id:mutation.id,kind:mutation.entityType},index++,mutation.kind==='product_create');
      $('forms').lastElementChild.dataset.mutation=String(i);
    }
  }
  $('run-story-test').onclick=()=>run(async()=>{
    const result=await api('run-story-test',{storyId:current.entity.id});
    $('story-test-source').textContent=JSON.stringify(result,null,2);
    say('Story test '+result.status+': '+result.reason,result.status==='blocked');
    current=await api('entity?'+new URLSearchParams({kind:current.entity.kind,id:current.entity.id}));context();
  });
  $('story-test').onclick=()=>run(()=>{
    if(dirty) throw new Error('Save or discard Story edits before specifying its test.');
    $('story-test-panel').hidden=false;testPreview=null;
    $('accept-story-test').hidden=true; $('reject-story-test').hidden=true; $('story-test-source').textContent='';
    $('story-test-json').value=JSON.stringify({storyId:current.entity.id,
      filePath:'tests/'+current.entity.id.toLowerCase()+'.test.ts',fixturePath:'',interfaceName:'',body:''},null,2);
  });
  $('story-test-json').oninput=()=>{testPreview=null;dirty=true;$('accept-story-test').hidden=true;};
  $('prepare-story-test').onclick=()=>run(async()=>{
    const specification=JSON.parse($('story-test-json').value);
    const result=await api('prepare-story-test',{specification});
    if(result.status!=='review') {say('Story uncovered: '+result.reason,true);return;}
    testPreview=result;dirty=true;
    $('story-test-source').textContent=result.content+'\n'+JSON.stringify({state:result.testState,source:result.sourcePreview,link:result.linkPreview},null,2);
    $('accept-story-test').hidden=false;$('reject-story-test').hidden=false;say('Executable test ready for developer review. No file or link saved.');
  });
  for(const [id,decision] of [['accept-story-test','accept'],['reject-story-test','reject']]) $(id).onclick=()=>run(async()=>{
    if(!testPreview) throw new Error('Review the executable test first.');
    const reviewed=testPreview; testPreview=null; $('accept-story-test').hidden=true;
    const result=await api('apply-story-test',{specification:reviewed.specification,fingerprint:reviewed.fingerprint,decision});
    $('story-test-source').textContent=JSON.stringify(result,null,2);
    dirty=result.status==='file-created-unlinked';
    say(result.status==='linked'?'Story test linked · '+result.testState:result.status+': '+(result.reason||'No changes saved.'),!['linked','rejected'].includes(result.status));
  });
  $('derive-work').onclick=()=>run(()=>{
    if(dirty) throw new Error('Save or discard definition edits before deriving work.');
    $('derive-panel').hidden=false; $('work-json').value=''; $('derive-request').value='';
  });
  $('prepare-work').onclick=()=>run(async()=>{
    if(!current) throw new Error('Select accepted intent first.');
    const result=await api('derive',{kind:current.entity.kind,id:current.entity.id,originalRequest:$('derive-request').value,
      ...($('work-json').value.trim()?{proposal:JSON.parse($('work-json').value)}:{})});
    if(result.status!=='complete') throw new Error(JSON.stringify(result.required||result.blockers));
    if(!result.value.proposals.length) {say('Existing definitions reused. No changes proposed.');return;}
    if(result.value.proposals.length!==1) throw new Error('Review one bounded proposal at a time.');
    const proposal=result.value.proposals[0]; reset(); renderProposal(proposal.request);dirty=true;
    await review(proposal.request,proposal);
  });
  $('search').oninput=()=>list(); $('kind-filter').onchange=()=>list();
  $('previous-page').onclick=()=>run(()=>list(catalogPage-1));
  $('next-page').onclick=()=>run(()=>list(catalogPage+1));
  for(const [id,kind] of [['new-product','Product'],['new-goal','Goal'],['new-concept','Concept'],['new-flow','Flow'],['new-feature','Feature'],['new-story','UserStory'],['new-aspect','Aspect'],['new-epic','Epic'],['new-bug','Bug']]) $(id).onclick=()=>run(()=>create(kind));
  $('review-button').onclick=()=>run(()=>review());
  $('update').onclick=()=>run(()=>review());
  $('accept').onclick=()=>run(()=>decision('accept'));
  $('reject').onclick=()=>run(()=>decision('reject'));
  $('cancel').onclick=()=>run(()=>decision('cancel'));
  $('reload').onclick=()=>run(async()=>{
    if(!canLeave()) return;
    await refresh(); if(current) await open(current.entity.kind,current.entity.id,true); else reset();
  });
  $('import-button').onclick=()=>{if(canLeave()) {reset();current=null;$('editor').hidden=true;$('proposal-import').hidden=false;$('proposal-json').focus();}};
  $('load-proposal').onclick=()=>run(loadProposal);
  $('advanced-json').oninput=()=>{advancedDirty=true;invalidate();};
  $('add-relationship').onclick=()=>run(()=>{
    const id=$('forms').querySelector('[name=id]')?.value.trim();
    const target=$('relationship-target').value;
    if(!id||!target) throw new Error('Choose a stable ID and relationship target.');
    const reverse=$('relationship-direction').value==='incoming';
    const edge={kind:'product_link',sourceId:reverse?target:id,predicate:$('relationship-kind').value,targetId:reverse?id:target};
    if(!pending.some(p=>JSON.stringify(p)===JSON.stringify(edge))) pending.push(edge);
    invalidate(); context();
  });
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==='k') {event.preventDefault();$('search').focus();}
    if((event.ctrlKey||event.metaKey)&&event.key==='s') {event.preventDefault();run(()=>review());}
    if(event.key==='Escape'&&preview) run(()=>decision('cancel'));
  });
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  run(async()=>{await refresh();if(!dirty&&!current) say('Ready. Select a definition or create one.');});
}
