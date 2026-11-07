const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
(async()=>{
const dom=new JSDOM(fs.readFileSync('public/schedules/index.html','utf8'),{url:'https://connect.aspireone.ai/',runScripts:'outside-only'}),w=dom.window,ctx=dom.getInternalVMContext();w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.structuredClone=structuredClone;
vm.runInContext(w.document.querySelector('script:not([src])').textContent,ctx);await new Promise(r=>setImmediate(r));
vm.runInContext(`branches=[['Z','Zeta','West'],['A','Alpha','East']];catalogue={permissions:{Z:2,A:2},records:['IBY1','IPY1','JC1','S1','P1'].map((code,i)=>({id:String(i),branch_id:'A',subject:'Mathematics',levels:JSON.stringify([code]),level_label:code,day:1,start_minute:900,end_minute:1020,coach:'Alice',academic_year:2027,term:1,status:'published'})).concat([{id:'z',branch_id:'Z',subject:'English',levels:'["P1"]',coach:'Zach',academic_year:2027,term:1,status:'published'}])};buildWeekEditor();`,ctx);
const d=w.document,change=id=>d.getElementById(id).dispatchEvent(new w.Event('change'));
assert(!d.getElementById('week-zone'));assert.deepEqual([...d.getElementById('week-branch').options].map(o=>o.text),['Select a branch','Alpha','Zeta']);
d.getElementById('week-branch').value='A';change('week-branch');assert.deepEqual([...d.getElementById('week-coach').options].map(o=>o.text),['All coaches','Alice']);assert.deepEqual([...d.getElementById('week-level').options].map(o=>o.value),['','*','P1','S1','JC1','IPY1','IBY1']);
d.getElementById('week-level').value='*';change('week-level');d.querySelector('#week-subjects input').click();d.querySelector('.week-editor-search').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.deepEqual([...d.querySelectorAll('.manage-level-heading')].map(e=>e.textContent),['P1','S1','JC1','IPY1','IBY1']);assert.equal(d.querySelectorAll('.manage-calendar thead th').length,35);assert.equal(d.querySelector('.class-subject').textContent,'Maths');assert.equal(d.querySelector('.class-time').tagName,'SPAN');
d.querySelector('[data-operation="edit"]').click();d.querySelector('.week-class').click();assert.equal(d.getElementById('edit-class-detail').hidden,false);
d.getElementById('week-branch').value='Z';change('week-branch');assert.deepEqual([...d.getElementById('week-coach').options].map(o=>o.text),['All coaches','Zach']);assert(![...d.getElementById('level').options].some(o=>o.value==='*'));dom.window.close();console.log('PASS Manage Class filters, level ordering, subject cards and edit selection');
})().catch(e=>{console.error(e);process.exitCode=1});
