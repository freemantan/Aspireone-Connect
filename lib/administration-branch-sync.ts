import source from './administration-branch-source.json';
import type {State} from './model';
export function syncAdministrationBranches(s:State){
 s.branches??=[];let changed=false;
 // CRE was briefly introduced as a separate role; preserve access under its canonical name.
 function migrate(value:any):void{
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(let i=0;i<value.length;i++){if(value[i]==='CRE'){value[i]='Customer Relationship';changed=true;}else migrate(value[i]);}return;}
  if(Object.prototype.hasOwnProperty.call(value,'CRE')){
   const old=value.CRE,current=value['Customer Relationship'];
   const rank=(v:any)=>({None:0,View:1,Edit:2,Manage:3}[String(v)]||0);
   if(current===undefined||rank(old)>rank(current))value['Customer Relationship']=old;
   delete value.CRE;changed=true;
  }
  for(const key of Object.keys(value))if(['roles','requestedRoles','audienceRoles','accessRoles'].includes(key)&&Array.isArray(value[key])){const next=[...new Set(value[key].map((r:any)=>r==='CRE'?'Customer Relationship':r))];if(JSON.stringify(next)!==JSON.stringify(value[key])){value[key]=next;changed=true;}}else if(['roles','roleAccess','noticeGroupAccess','categoryAccess','members'].includes(key))migrate(value[key]);
 }
 for(const user of [...s.users,...s.invites])migrate(user);
 for(const board of s.boards)migrate(board);
 for(const article of s.articles||[])migrate(article);
 for(const item of source){
  if((s.branchDeletions||[]).some(b=>b.scheduleId===item.scheduleId||b.id==='schedule-'+item.scheduleId||b.name?.trim().toLowerCase()===item.name.toLowerCase()))continue;
  const existing=s.branches.find(b=>b.scheduleId===item.scheduleId||b.name.trim().toLowerCase()===item.name.toLowerCase()||b.id==='schedule-'+item.scheduleId);
  if(existing&&item.scheduleId==='US'&&existing.name==='Novena Thomson'){existing.name='Novena';existing.abbreviation='N';existing.version=(existing.version||0)+1;changed=true;}
  if(existing){if(!existing.scheduleId){existing.scheduleId=item.scheduleId;changed=true;}continue;}
  let abbreviation=item.abbreviation,n=2;
  while(s.branches.some(b=>b.abbreviation?.toLowerCase()===abbreviation.toLowerCase()))abbreviation=item.abbreviation+n++;
  s.branches.push({id:'schedule-'+item.scheduleId,scheduleId:item.scheduleId,name:item.name,abbreviation,manager:'',crm:'',cres:[],version:1});changed=true;
 }
 return changed;
}
