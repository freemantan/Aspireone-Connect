import {env} from 'cloudflare:workers';
import {AppError} from './model';
export const settings=()=>env as any;
export async function supabase(path:string,init:RequestInit={},accessToken?:string,publicKey=false){
 const e=settings(),key=publicKey?e.SUPABASE_PUBLISHABLE_KEY:e.SUPABASE_SECRET_KEY;
 if(!e.SUPABASE_URL||!key)throw new AppError('Supabase setup is incomplete. Configure the Worker secret and database script.',503);
 const headers=new Headers(init.headers);headers.set('apikey',key);
 if(accessToken)headers.set('Authorization','Bearer '+accessToken);
 else if(key.startsWith('eyJ'))headers.set('Authorization','Bearer '+key);
 const res=await fetch(e.SUPABASE_URL+path,{...init,headers});
 if(!res.ok)throw new AppError(path.startsWith('/auth/')?'Google sign-in could not be verified. Please sign in again.':'Supabase request failed. Check the database setup and server key.',path.startsWith('/auth/')?401:503);
 return res;
}
export async function rpc(name:string,body:Record<string,unknown>={}):Promise<any>{return (await supabase('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();}
const objectPath=(key:string)=>'/storage/v1/object/aspireone-files/'+key.split('/').map(encodeURIComponent).join('/');
export const privateFiles={
 async put(key:string,bytes:Uint8Array,options:any){await supabase(objectPath(key),{method:'POST',headers:{'Content-Type':options.httpMetadata.contentType},body:bytes as BodyInit});},
 async get(key:string){return supabase(objectPath(key));},
 async delete(key:string){await supabase('/storage/v1/object/aspireone-files',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key]})});}
};
