(()=>{
 const controls=$('grouping-controls'),list=$('grouping-list'),status=$('grouping-status');if(!controls)return;
 controls.className='edit-grid';let busy=false;const selected=new Set();
 const branch=field(controls,'Branch','group-branch','text',[]),day=field(controls,'Day','group-day','text',days.map((d,i)=>[String(i+1),d]));
 const coach=field(controls,'Coach for merged class','group-coach');coach.maxLength=200;
 const actions=el('div',null,'week-details-actions');controls.append(actions);
 const buttons=[];for(const [action,title] of [['merge','Merge selected'],['split','Split selected class'],['ungroup','Ungroup selected'],['reload','Reload']]){const button=el('button',title);button.type='button';actions.append(button);buttons.push(button);button.addEventListener('click',()=>run(action));}
 function rows(){return (catalogue?.records||[]).filter(r=>r.branch_id===branch.value&&r.day===Number(day.value)&&r.status!=='discontinued').sort((a,b)=>a.academic_year-b.academic_year||(a.term||0)-(b.term||0)||a.start_minute-b.start_minute||a.subject.localeCompare(b.subject));}
 function render(){selected.clear();list.replaceChildren();const groups=new Map();for(const r of rows()){const id=r.class_group_id||r.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
  if(!groups.size){list.append(el('p','No classes for this branch and day.'));return;}
  for(const records of groups.values()){const box=el('section',null,'panel');box.append(el('h3',records[0].class_prefix||'Class ID pending database update'));const coaches=[...new Set(records.map(r=>r.coach||'Unassigned'))];box.append(el('p','Coach: '+coaches.join(' / ')+(coaches.length>1?' — choose a common coach when merging or editing this group.':'')));
   for(const r of records){const label=el('label');label.style.cssText='display:flex;align-items:center;gap:12px;padding:9px 0';const input=el('input');input.type='checkbox';input.style.cssText='width:auto;flex:none';input.addEventListener('change',()=>{if(input.checked)selected.add(r.id);else selected.delete(r.id);if(selected.size===1)coach.value=r.coach||'';});label.append(input,el('span',(r.class_ids||[r.level_label]).join(', ')+' · '+subjectName(r.subject)+' · '+clock(r.start_minute)+'–'+clock(r.end_minute)+' · '+r.academic_year+' Term '+(r.term||0)+' · Room '+(r.room_id||'X')));box.append(label);}
   list.append(box);
  }
 }
 async function load(){const previous=branch.value;catalogue=await scheduleRequest();data=catalogue.data;branches=catalogue.branches;populateEditor('edit');branch.replaceChildren();for(const b of branches.filter(b=>catalogue.permissions[b[0]]>=2).sort((a,b)=>a[1].localeCompare(b[1])))branch.add(new Option(b[1],b[0]));if([...branch.options].some(o=>o.value===previous))branch.value=previous;render();}
 async function run(action){if(busy)return;if(action!=='reload'&&!selected.size){status.textContent='Select a class first.';return;}if(action==='split'&&selected.size!==1){status.textContent='Select one class to split.';return;}if(action==='merge'&&selected.size<2){status.textContent='Select at least two records to merge.';return;}
  if(action==='split'&&!confirm('Split into two independently editable classes? A single-level class will be copied. Update its Room ID or time in Manage Classes afterwards.'))return;
  busy=true;buttons.forEach(b=>b.disabled=true);branch.disabled=day.disabled=true;
  try{if(action!=='reload'){const chosen=catalogue.records.filter(r=>selected.has(r.id));const gids=new Set(chosen.map(r=>r.class_group_id));const versions=Object.fromEntries(catalogue.records.filter(r=>gids.has(r.class_group_id)&&r.status!=='discontinued').map(r=>[r.id,r.revision]));await scheduleRequest({op:'group',revision:0,action,ids:[...selected],versions,coach:coach.value});}await load();status.textContent=action==='reload'?'Latest classes loaded.':'Class grouping saved. Find Classes and downloads now use the updated records.';}catch(e){status.textContent=e.message;}finally{busy=false;buttons.forEach(b=>b.disabled=false);branch.disabled=day.disabled=false;}
 }
 branch.addEventListener('change',render);day.addEventListener('change',render);$('grouping-tab')?.addEventListener('click',()=>run('reload'));
})();
