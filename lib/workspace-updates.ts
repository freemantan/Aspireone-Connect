import {State} from './model';
export function updateBoardNames(state:State){
 let changed=false;
 for(const [id,oldName,name] of [['board-2','CRM (Customer Relationship Manager)','Customer Relationship'],['board-3','Ops','Operations'],['board-5','Technology Department','Technology']]){
  const board=state.boards.find(b=>b.id===id);
  if(board&&board.name===oldName&&!board.namesUpdated){board.name=name;board.namesUpdated=true;board.version++;changed=true;}
 }
 return changed;
}
export function updateCommonColumns(s:State){
 const board=s.boards.find(b=>b.id==='board-1');if(!board||board.duplicateLinksRemoved)return false;
 const removed=board.columns.filter((c:any)=>/^(custom\s+)?links?$/i.test(c.name.trim()));
 if(!removed.length)return false;
 for(const task of [...s.tasks.filter(t=>t.board===board.id),...s.recurrences.filter(r=>r.board===board.id).flatMap(r=>r.template||[])]){
  for(const column of removed){const value=task.custom?.[column.id];if(value&&column.type==='link'){const link=typeof value==='string'?{label:column.name,url:value}:value;task.links=task.links||[];if(link.url&&!task.links.some((x:any)=>x.url===link.url))task.links.push(link);}if(task.custom)delete task.custom[column.id];}
  if(removed.length)task.version++;
 }
 board.columns=board.columns.filter((c:any)=>!removed.includes(c));board.hidden=(board.hidden||[]).filter((id:string)=>!removed.some((c:any)=>c.id===id));board.commonColumnsUpdated=true;board.duplicateLinksRemoved=true;board.version++;return true;
}
