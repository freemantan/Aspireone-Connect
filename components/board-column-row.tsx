'use client';
import React from 'react';
import {TableRow} from './ui/table';
import {columnOrder,moveColumn} from '../lib/column-order';
export function BoardColumnRow({board,onReorder,children,...props}:React.ComponentProps<typeof TableRow>&{board?:any;onReorder?:(order:string[])=>void}){
 const order=columnOrder(board);
 const cells=React.Children.toArray(children) as React.ReactElement<any>[];
 const rank=(cell:any)=>cell.props['data-column']==='task'?-1:order.includes(cell.props['data-column'])?order.indexOf(cell.props['data-column']):order.length;
 cells.sort((a,b)=>rank(a)-rank(b));
 return <TableRow {...props}>{cells.map((cell:any)=>{
  const id=cell.props['data-column'];if(!onReorder||!order.includes(id))return cell;
  return React.cloneElement(cell,{onDragOver:(e:React.DragEvent)=>{if(e.dataTransfer.types.includes('application/aspireone-column'))e.preventDefault();},onDrop:(e:React.DragEvent)=>{const source=e.dataTransfer.getData('application/aspireone-column');if(!source)return;e.preventDefault();e.stopPropagation();onReorder(moveColumn(order,source,id));}},<><button className="drag-handle" draggable aria-label={'Reorder '+(typeof cell.props.children==='string'?cell.props.children:'column')} onDragStart={e=>{e.dataTransfer.setData('application/aspireone-column',id);e.dataTransfer.effectAllowed='move';}}>⠿</button>{cell.props.children}</>);
 })}</TableRow>;
}
