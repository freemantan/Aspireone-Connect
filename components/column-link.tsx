'use client';
export function ColumnLink({value,onChange,disabled,display,label}:any){
 const link=typeof value==='string'?{url:value,label:''}:value||{url:'',label:''};
 if(display)return /^https?:\/\//i.test(link.url||'')?<a className="task-column-link" href={link.url} title={link.url} target="_blank" rel="noopener noreferrer">{link.label||label||'Open link'}</a>:null;
 return <div className="link-row"><input aria-label={label+' link name'} placeholder="Link name" disabled={disabled} value={link.label||''} onChange={e=>onChange({...link,label:e.target.value})}/><input aria-label={label+' URL'} placeholder="https://" disabled={disabled} value={link.url||''} onChange={e=>onChange({...link,url:e.target.value})}/></div>;
}
