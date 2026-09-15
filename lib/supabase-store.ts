import {initial,State,AppError} from './model';
import {rpc,privateFiles,settings} from './supabase';
export const runtime=()=>({...settings(),BUCKET:privateFiles}) as any;
export async function load():Promise<{state:State;revision:number}>{return rpc('ao_load');}
export async function transact<T>(fn:(s:State)=>T):Promise<T>{
 for(let attempt=0;attempt<5;attempt++){
  const {state,revision}=await load(),before=JSON.stringify(state),out=fn(state);
  if(before===JSON.stringify(state))return out;
  if(await rpc('ao_commit',{expected_revision:revision,new_state:state}))return out;
 }
 throw new AppError('Workspace is busy. Please retry your saved draft.',409);
}
export async function bootstrap(){await transact(s=>{if(!s.boards?.length)Object.assign(s,initial());});}
