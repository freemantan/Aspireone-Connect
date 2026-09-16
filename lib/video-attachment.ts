export function isMp4(bytes:Uint8Array){
 if(bytes.length<16||String.fromCharCode(...bytes.slice(4,8))!=='ftyp')return false;
 const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
 return size>=16&&size<=bytes.length;
}
