import source from './administration-branch-source.json';
import type {State} from './model';
export function syncAdministrationBranches(s:State){
 s.branches??=[];let changed=false;
 for(const item of source){
  const existing=s.branches.find(b=>b.scheduleId===item.scheduleId||b.name.trim().toLowerCase()===item.name.toLowerCase()||b.id==='schedule-'+item.scheduleId);
  if(existing){if(!existing.scheduleId){existing.scheduleId=item.scheduleId;changed=true;}continue;}
  let abbreviation=item.abbreviation,n=2;
  while(s.branches.some(b=>b.abbreviation?.toLowerCase()===abbreviation.toLowerCase()))abbreviation=item.abbreviation+n++;
  s.branches.push({id:'schedule-'+item.scheduleId,scheduleId:item.scheduleId,name:item.name,abbreviation,manager:'',crm:'',cres:[],version:1});changed=true;
 }
 return changed;
}
