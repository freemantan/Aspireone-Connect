import {State} from './model';
export function updateBoardNames(state:State){
 let changed=false;
 for(const [id,oldName,name] of [['board-2','CRM (Customer Relationship Manager)','Customer Relationship'],['board-3','Ops','Operations'],['board-5','Technology Department','Technology']]){
  const board=state.boards.find(b=>b.id===id);
  if(board&&board.name===oldName&&!board.namesUpdated){board.name=name;board.namesUpdated=true;board.version++;changed=true;}
 }
 return changed;
}
