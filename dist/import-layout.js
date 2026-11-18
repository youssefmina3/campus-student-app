// Layout helpers shared by PDF text extraction and screenshot OCR.
export const centerX=t=>(t.box.x0+t.box.x1)/2;
export const centerY=t=>(t.box.y0+t.box.y1)/2;
export function wordBoxes(tokens){
  return tokens.filter(t=>t.text?.trim()&&t.box).flatMap(t=>{
    const text=t.text.trim(),parts=[...text.matchAll(/\S+/g)],width=t.box.x1-t.box.x0;
    return parts.map(m=>({...t,text:m[0],box:{x0:t.box.x0+width*m.index/text.length,x1:t.box.x0+width*(m.index+m[0].length)/text.length,y0:t.box.y0,y1:t.box.y1}}));
  });
}
export function groupLines(tokens){
  const lines=[];
  for(const token of [...tokens].sort((a,b)=>centerY(a)-centerY(b)||a.box.x0-b.box.x0)){
    const height=token.box.y1-token.box.y0,y=centerY(token);
    let line=lines.find(l=>Math.abs(l.y-y)<Math.max(3,Math.min(l.height,height)*.55));
    if(!line){line={y,height,words:[]};lines.push(line)}
    line.words.push(token);line.y=line.words.reduce((n,w)=>n+centerY(w),0)/line.words.length;
  }
  return lines.sort((a,b)=>a.y-b.y).map(l=>({...l,words:l.words.sort((a,b)=>a.box.x0-b.box.x0),text:l.words.sort((a,b)=>a.box.x0-b.box.x0).map(w=>w.text).join(' ')}));
}
export function courseAnchors(words,findCodes){
  const anchors=[];
  for(const word of words){
    let found=findCodes(word.text),box=word.box;
    if(!found.length&&/^[A-Z]{2,6}$/i.test(word.text)){
      const next=words.filter(w=>w!==word&&/^[0-9٠-٩۰-۹][0-9٠-٩۰-۹OIL]{2,4}$/i.test(w.text)
        &&Math.abs(centerY(w)-centerY(word))<Math.max(3,(box.y1-box.y0)*.6)
        &&w.box.x0>=box.x1-2&&w.box.x0-box.x1<(box.y1-box.y0)*2)
        .sort((a,b)=>a.box.x0-b.box.x0)[0];
      if(next){found=findCodes(word.text+next.text);box={x0:box.x0,x1:next.box.x1,y0:Math.min(box.y0,next.box.y0),y1:Math.max(box.y1,next.box.y1)}}
    }
    for(const c of found){
      const anchor={...word,box,code:c.code};
      if(!anchors.some(a=>a.code===anchor.code&&Math.abs(centerX(a)-centerX(anchor))<8&&Math.abs(centerY(a)-centerY(anchor))<8))anchors.push(anchor);
    }
  }
  return anchors;
}
export function classRegions(words,{width,height},parseNamedDay,findCodes){
  const anchors=courseAnchors(words,findCodes);
  // A numbered period header (1–7) is never a weekday label.
  const days=words.map(w=>({...w,day:parseNamedDay(w.text)})).filter(w=>w.day);
  const spread=(items,coordinate)=>items.length?Math.max(...items.map(coordinate))-Math.min(...items.map(coordinate)):0;
  const leftDays=days.filter(d=>d.box.x0<width*.25);
  const topDays=days.filter(d=>d.box.y0<height*.28);
  let orientation='rows',labels=leftDays;
  if(topDays.length>=2&&spread(topDays,centerX)>width*.2&&spread(topDays,centerY)<height*.12){orientation='columns';labels=topDays}
  else if(leftDays.length<2&&days.length>=2&&spread(days,centerY)>height*.2){labels=days}
  else if(!labels.length&&topDays.length){orientation='columns';labels=topDays}
  const coordinate=orientation==='rows'?centerY:centerX;
  const limit=orientation==='rows'?height:width;
  labels=labels.sort((a,b)=>coordinate(a)-coordinate(b)).filter((d,i,a)=>!i||Math.abs(coordinate(d)-coordinate(a[i-1]))>5);
  return anchors.map(anchor=>{
    const nearest=labels.length?labels.reduce((a,b)=>Math.abs(coordinate(a)-coordinate(anchor))<Math.abs(coordinate(b)-coordinate(anchor))?a:b):null;
    const at=labels.indexOf(nearest),start=nearest&&at>0?(coordinate(labels[at-1])+coordinate(nearest))/2:0;
    const end=nearest&&at<labels.length-1?(coordinate(labels[at+1])+coordinate(nearest))/2:limit;
    const peers=anchors.filter(a=>coordinate(a)>=start&&coordinate(a)<end);
    let x0=0,x1=width,y0=0,y1=height;
    if(orientation==='rows'){
      y0=start;y1=end;
      const row=peers.filter(a=>Math.abs(centerY(a)-centerY(anchor))<Math.max(20,(anchor.box.y1-anchor.box.y0)*3)).sort((a,b)=>centerX(a)-centerX(b));
      const i=row.indexOf(anchor);
      x0=i>0?(centerX(row[i-1])+centerX(anchor))/2:nearest?Math.min(width*.28,nearest.box.x1+8):0;
      x1=i<row.length-1?(centerX(anchor)+centerX(row[i+1]))/2:width;
      // Also separate classes stacked within a weekday's row.
      const above=peers.filter(a=>a!==anchor&&Math.abs(centerX(a)-centerX(anchor))<(x1-x0)*.4&&centerY(a)<centerY(anchor)-20);
      const below=peers.filter(a=>a!==anchor&&Math.abs(centerX(a)-centerX(anchor))<(x1-x0)*.4&&centerY(a)>centerY(anchor)+20);
      if(above.length)y0=Math.max(y0,(Math.max(...above.map(centerY))+centerY(anchor))/2);
      if(below.length)y1=Math.min(y1,(Math.min(...below.map(centerY))+centerY(anchor))/2);
    }else{
      x0=start;x1=end;y0=nearest?nearest.box.y1+5:0;
      const column=peers.sort((a,b)=>centerY(a)-centerY(b)),i=column.indexOf(anchor);
      if(i>0)y0=(centerY(column[i-1])+centerY(anchor))/2;
      if(i<column.length-1)y1=(centerY(anchor)+centerY(column[i+1]))/2;
    }
    return {anchor,weekday:nearest?.day||null,orientation,x0:Math.max(0,x0),x1:Math.min(width,x1),y0:Math.max(0,y0),y1:Math.min(height,y1)};
  });
}
