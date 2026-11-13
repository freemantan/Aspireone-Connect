/* Export only the schedule records returned by the permission-checked API. */
(()=>{
 const host=document.querySelector('.schedule-tabs');if(!host)return;
 const button=document.createElement('button');button.type='button';button.textContent='Download schedules CSV';
 const status=document.createElement('span');status.setAttribute('role','status');status.style.fontSize='13px';
 const toolbar=document.createElement('div');toolbar.className='toolbar';toolbar.append(button,status);host.after(toolbar);
 const cell=value=>{let text=String(value??'');if(/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 const time=n=>n==null?'':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Loading latest schedules…';try{
 const response=await fetch('/api/scheduling',{credentials:'same-origin',cache:'no-store'});const latest=await response.json();if(!response.ok)throw Error(latest.error||'Unable to export schedules.');
 const names=new Map((latest.branches||[]).map(b=>[b[0],b[1]]));
 const rows=[['Class ID','Branch','Branch Code','Product','Class Type','Subject','Levels','Academic Year','Term','Day','Start Time (SGT)','End Time (SGT)','Duration (minutes)','Coach','Delivery','Format','Effective From','Effective Until','Status','Class Notes','Revision']];
 const records=[...(latest.records||[])].sort((a,b)=>(names.get(a.branch_id)||'').localeCompare(names.get(b.branch_id)||'')||(a.academic_year-b.academic_year)||((a.day||0)-(b.day||0))||((a.start_minute||0)-(b.start_minute||0)));
 for(const r of records){let levels=r.levels,notes=r.notes;try{if(typeof levels==='string')levels=JSON.parse(levels);}catch{}try{if(typeof notes==='string')notes=JSON.parse(notes);}catch{notes={};}
 const product=r.product_mode||'A';rows.push([r.id,names.get(r.branch_id)||r.branch_id,r.branch_id,product,({A:'Academic Coaching',B:'Dedicated Class',C:'Live Online Tutorial',D:'E-Learning'})[product]||product,r.subject,Array.isArray(levels)?levels.join('; '):r.level_label||levels,r.academic_year,r.term,(['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[r.day]||'',time(r.start_minute),time(r.end_minute),r.start_minute==null||r.end_minute==null?'':r.end_minute-r.start_minute,r.coach,r.delivery_mode,r.format,r.effective_from,r.effective_to,r.status,notes?.public_notes||r.public_notes||'',r.revision]);}
 if(!records.length){status.textContent='No schedule details are available for your management permissions.';return;}
 const csv='\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Aspire-Hub-All-Schedules-'+new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'})+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Downloaded '+records.length+' schedules, including discontinued records where available. All times are Singapore time.';
 }catch(error){status.textContent=error.message||'Download failed. Please retry.';}finally{button.disabled=false;}});
})();
