(()=>{
 const controls=$('grouping-controls'),list=$('grouping-list'),status=$('grouping-status');if(!controls)return;
 controls.className='edit-grid';let busy=false;const selected=new Set();
 const branch=field(controls,'Branch','group-branch','text',[]),day=field(controls,'Day','group-day','text',days.map((d,i)=>[String(i+1),d]));
 const coach=field(controls,'Coach','group-coach','text',[]);coach.required=false;coach.add(new Option('Unassigned (optional)',''));
 const reload=el('button','Reload');reload.type='button';controls.append(reload);reload.addEventListener('click',()=>run('reload'));
 function rows(){return (catalogue?.records||[]).filter(r=>r.branch_id===branch.value&&r.day===Number(day.value)&&r.status!=='discontinued').sort((a,b)=>a.academic_year-b.academic_year||(a.term||0)-(b.term||0)||a.start_minute-b.start_minute||a.subject.localeCompare(b.subject));}
 function render(){selected.clear();list.replaceChildren();const previous=coach.value;coach.replaceChildren(new Option('Unassigned (optional)',''));for(const name of [...new Set((catalogue.branchStaff?.[branch.value]||[]).filter(p=>(p.roles||[]).includes('Coach')).map(p=>p.name))].sort((a,b)=>a.localeCompare(b)))coach.add(new Option(name,name));coach.value=[...coach.options].some(o=>o.value===previous)?previous:'';
  const groups=new Map();for(const r of rows()){const id=r.class_group_id||r.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
  if(!groups.size){list.append(el('p','No classes for this branch and day.'));return;}
  for(const records of groups.values()){
   const box=el('section',null,'class-group-row'),header=el('div',null,'class-group-heading'),identity=el('div',null,'class-group-identity');identity.append(el('h3',records[0].class_prefix||'Class ID pending'));
   const coaches=[...new Set(records.map(r=>r.coach||'Unassigned'))];identity.append(el('span','Coach: '+coaches.join(' / '),'class-group-coach'));header.append(identity);
   const actions=el('div',null,'class-group-actions');for(const [action,title]of [['merge','Group'],['ungroup','Ungroup']]){const button=el('button',title);button.type='button';button.addEventListener('click',()=>run(action,records));actions.append(button)}header.append(actions);box.append(header);
   for(const r of records){const label=el('label',null,'class-group-record'),input=el('input');input.type='checkbox';input.addEventListener('change',()=>{if(input.checked)selected.add(r.id);else selected.delete(r.id)});const content=el('div'),ids=el('div',null,'class-group-ids');for(const id of r.class_ids||[r.level_label])ids.append(el('span',id));content.append(ids,el('small',subjectName(r.subject)+' · '+clock(r.start_minute)+'–'+clock(r.end_minute)+' · '+r.academic_year+' Term '+(r.term||0)+' · Room '+(r.room_id||'X')));label.append(input,content);box.append(label);}
   list.append(box);
  }
 }
 async function load(){const previous=branch.value;catalogue=await scheduleRequest();data=catalogue.data;branches=catalogue.branches;populateEditor('edit');branch.replaceChildren();for(const b of branches.filter(b=>catalogue.permissions[b[0]]>=2).sort((a,b)=>a[1].localeCompare(b[1])))branch.add(new Option(b[1],b[0]));if([...branch.options].some(o=>o.value===previous))branch.value=previous;render();}
 async function run(action,records=[]){if(busy)return;
  const ids=action==='ungroup'?records.filter(r=>selected.has(r.id)).map(r=>r.id):[...selected];
  if(action!=='reload'&&!ids.length){status.textContent=action==='ungroup'?'Select classes underneath this group to ungroup.':'Select the classes you want to group, then click Group.';return;}
  if(action==='merge'&&(ids.length<2||!records.some(r=>selected.has(r.id)))){status.textContent='Select at least two class records, including one underneath this group.';return;}
  busy=true;for(const b of [...controls.querySelectorAll('input,select,button'),...list.querySelectorAll('input,button')])b.disabled=true;
  try{if(action!=='reload'){const chosen=catalogue.records.filter(r=>ids.includes(r.id)),gids=new Set(chosen.map(r=>r.class_group_id));const versions=Object.fromEntries(catalogue.records.filter(r=>gids.has(r.class_group_id)&&r.status!=='discontinued').map(r=>[r.id,r.revision]));let chosenCoach=coach.value;if(!chosenCoach&&action==='merge'){const existing=[...new Set(catalogue.records.filter(r=>gids.has(r.class_group_id)&&r.status!=='discontinued').map(r=>r.coach||''))];if(existing.length>1)throw Error('These classes have different coaches. Select their common Coach before grouping.');chosenCoach=existing[0]||'';}await scheduleRequest({op:'group',revision:0,action,ids,versions,coach:chosenCoach});}await load();status.textContent=action==='reload'?'Latest classes loaded.':'Class grouping saved.';}catch(e){status.textContent=e.message;}finally{busy=false;for(const b of [...controls.querySelectorAll('input,select,button'),...list.querySelectorAll('input,button')])b.disabled=false;}
 }
 branch.addEventListener('change',()=>{coach.value='';render()});day.addEventListener('change',render);$('grouping-tab')?.addEventListener('click',()=>run('reload'));
})();
