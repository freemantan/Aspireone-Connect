/** Product B wording only; never changes money, rates or stored schedule times. */
export function productBLabel(text:string){
 return text.replace(/120-(?:minute|min) Dedicated Class/gi,'Dedicated Class').replace(/\bPhysical (?:Tutorial(?: \/ Lecture(?: Class)?)?|Class(?:es)?)(?!room)\b/gi,'Dedicated Class')
 .replace(/(Dedicated Class.{0,100}?)(1\.5-hour lessons|90 minutes|90-minute)/g,(_,prefix,duration)=>prefix+(duration==='1.5-hour lessons'?'2-hour lessons':'120 minutes'));
}
