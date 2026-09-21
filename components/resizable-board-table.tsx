'use client';
import React,{useEffect,useState} from 'react';
import {Table} from './ui/table';
import {columnOrder} from '../lib/column-order';

const defaults:Record<string,number>={task:320,chats:90,assignee:130,team:170,budget:130,status:150,priority:130,start:150,due:150,remark:240,links:220};
const clamp=(n:number)=>Math.max(80,Math.min(1200,n));
export function ResizableBoardTable({board,userId,children}:{board?:any;userId:string;children:React.ReactNode}){
 const storageKey='ao-widths-'+userId+'-'+(board?.id||'overview');
 const [saved,setSaved]=useState<{key:string;values:Record<string,number>}>({key:'',values:{}});
 useEffect(()=>{
  const read=()=>{try{const raw=JSON.parse(localStorage.getItem(storageKey)||'{}');const values:Record<string,number>={};for(const [id,w] of Object.entries(raw||{}))if(typeof w==='number'&&Number.isFinite(w))values[id]=clamp(w);setSaved({key:storageKey,values});}catch{setSaved({key:storageKey,values:{}});}};
  read();window.addEventListener('ao-column-widths',read);window.addEventListener('storage',read);
  return()=>{window.removeEventListener('ao-column-widths',read);window.removeEventListener('storage',read);};
 },[storageKey]);
 const widths=saved.key===storageKey?saved.values:{};
 const sections=React.Children.toArray(children) as React.ReactElement<any>[];
 const header=sections[0],row=header.props.children;
 const cells=React.Children.toArray(row.props.children) as React.ReactElement<any>[];
 const order=columnOrder(board);
 const idOf=(cell:React.ReactElement<any>,i:number)=>cell.props['data-column']||'extra-'+i;
 const columns=cells.map((cell,i)=>({cell,id:idOf(cell,i)}));
 const rank=(id:string)=>id==='task'?-1:order.includes(id)?order.indexOf(id):order.length;
 columns.sort((a,b)=>rank(a.id)-rank(b.id));
 const width=(id:string)=>widths[id]||defaults[id]||180;
 const update=(id:string,n:number)=>{
  let latest=widths;try{latest={...latest,...JSON.parse(localStorage.getItem(storageKey)||'{}')};}catch{}
  const values={...latest,[id]:clamp(n)};setSaved({key:storageKey,values});
  try{localStorage.setItem(storageKey,JSON.stringify(values));window.dispatchEvent(new Event('ao-column-widths'));}catch{}
 };
 const resized=cells.map((cell,i)=>{const id=idOf(cell,i);const label=typeof cell.props.children==='string'?cell.props.children:id;
  return React.cloneElement(cell,{},<>{cell.props.children}<span className="column-resizer" role="separator" tabIndex={0} aria-label={'Resize '+label+' column'} aria-orientation="vertical" aria-valuemin={80} aria-valuemax={1200} aria-valuenow={width(id)} title="Drag to resize; arrow keys adjust width" onClick={e=>e.stopPropagation()} onDragStart={e=>e.preventDefault()} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.start=String(e.clientX);e.currentTarget.dataset.width=String(width(id));}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))update(id,Number(e.currentTarget.dataset.width)+e.clientX-Number(e.currentTarget.dataset.start));}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();update(id,width(id)+(e.key==='ArrowRight'?10:-10));}}}/></>);
 });
 return <Table className="resizable-board-table" style={{tableLayout:'fixed',width:columns.reduce((sum,c)=>sum+width(c.id),0),minWidth:0}}><colgroup>{columns.map(c=><col key={c.id} style={{width:width(c.id)}}/>)}</colgroup>{React.cloneElement(header,{},React.cloneElement(row,{},resized))}{sections.slice(1)}</Table>;
}
