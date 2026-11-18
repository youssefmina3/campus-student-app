import {wordBoxes,groupLines,classRegions,centerX,centerY} from './import-layout.js';
export const WEEKDAYS=[['Monday','Mon','الاثنين','الإثنين'],['Tuesday','Tue','الثلاثاء'],['Wednesday','Wed','Wendesday','الأربعاء','الاربعاء'],['Thursday','Thu','الخميس'],['Friday','Fri','الجمعة'],['Saturday','Sat','السبت'],['Sunday','Sun','الأحد','الاحد']];
const digits=value=>String(value??'').replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?c.charCodeAt(0)-1632:c.charCodeAt(0)-1776));
const dayText=value=>String(value??'').trim().toLowerCase().replace(/[.,:،\u0640\u064b-\u065f]/g,'').replace(/[إأآ]/g,'ا');
export function parseNamedDay(value){const text=dayText(value);for(let i=0;i<7;i++)if(WEEKDAYS[i].some(d=>dayText(d)===text))return i+1;return null}
export function parseDay(value){const text=digits(value).trim();return /^[1-7]$/.test(text)?Number(text):parseNamedDay(text)}
const TIME_PATTERN=/(?<![\p{L}\d])(?:[0-2]?\d\s*[:.：]\s*[0-5\dO]\s*[\dO](?:\s*(?:[AP]\s*\.?\s*M\.?|صباحا?[ً]?|مساء[ً]?|[صم]))?|(?:1[0-2]|0?[1-9])\s*(?:[AP]\s*\.?\s*M\.?|صباحا?[ً]?|مساء[ً]?|[صم]))(?![\p{L}\d])/giu;
export function parseTime(value){
  const s=digits(value).trim().toUpperCase().replace(/：/g,':').replace(/[\u064b-\u065f]/g,'');
  const match=s.match(/(?:^|[^\d])([0-2]?\d)\s*(?:[:.]\s*([\dO])\s*([\dO]))?\s*([AP]\s*\.?\s*M\.?|صباحا?|مساء|[صم])?(?![\p{L}\d])/u);
  if(!match||(!match[2]&&!match[4]))return '';
  let hour=Number(match[1]);const minute=Number(((match[2]||'0')+(match[3]||'0')).replace(/O/g,'0'));
  const half=(match[4]||'').replace(/[\s.]/g,'');
  if(minute>59||hour>23||half&&(hour<1||hour>12))return '';
  if(half){hour%=12;if(half==='PM'||half==='م'||half==='مساء')hour+=12}
  return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}
export function courseCodes(text){const normalized=digits(text).toUpperCase(),out=[];for(const m of normalized.matchAll(/\b([A-Z]{2,6})\s*[-:]?\s*([0-9][0-9OIL]{2,4})\b/g))if(!['ROOM','LECT','SECTION','PERIOD'].includes(m[1]))out.push({code:m[1]+m[2].replace(/O/g,'0').replace(/[IL]/g,'1'),index:m.index,length:m[0].length});return out}
export function draftRow(value={}){return {id:crypto.randomUUID(),include:true,course_code:'',name:'',has_schedule:false,weekday:null,starts_at_local:'',ends_at_local:'',title:'',room:'',building:'',source:'',warnings:[],...value}}
const classType=text=>/\b(?:sec(?:tion)?|tutorial)\b|سكشن|تمرين/i.test(text)?(/tutorial/i.test(text)?'Tutorial':'Section'):/\b(?:lect(?:ure)?)\b|محاضرة/i.test(text)?'Lecture':/\blab\b|معمل/i.test(text)?'Lab':'';
const roomCode=text=>digits(text).match(/(?:\broom\s*(?:no\.?|number)?\s*#?\s*|(?:^|\s)#)([A-Z][\dOIL]{2,4})\b/i)?.[1]?.toUpperCase().replace(/O/g,'0').replace(/[IL]/g,'1')||'';
export const parseRoomText=roomCode;
const timesIn=text=>[...digits(text).matchAll(TIME_PATTERN)].map(m=>({text:m[0],value:parseTime(m[0]),index:m.index})).filter(t=>t.value);
function uniqueRows(rows){return rows.filter((r,i)=>!rows.slice(0,i).some(a=>a.course_code===r.course_code&&a.weekday===r.weekday&&a.starts_at_local===r.starts_at_local&&a.ends_at_local===r.ends_at_local&&a.room===r.room))}
export function extractionQuality(rows){
  if(!rows.length)return 0;
  return rows.reduce((sum,r)=>sum+(r.course_code?1:0)+(r.name?2:0)+(r.weekday?2:0)+(r.starts_at_local&&r.ends_at_local&&r.ends_at_local>r.starts_at_local?4:0)+(r.title?1:0)+(r.room?1:0)-validateDraft(r).length*2,0)/rows.length;
}
export function chooseExtraction(...candidates){return candidates.reduce((best,rows)=>extractionQuality(rows)>extractionQuality(best)||extractionQuality(rows)===extractionQuality(best)&&rows.length>best.length?rows:best,[])}
export function mergeClassReadings(original,refined){
  if(!original)return refined;if(!refined)return original;
  if(original.course_code!==refined.course_code||original.weekday!==refined.weekday)return original;
  const result={...original,field_confidence:{...original.field_confidence}},warnings=new Set(original.warnings||[]);
  let disagreed=false;
  for(const key of ['name','room','title']){
    const a=original[key],b=refined[key];
    if(a&&b&&a.toLowerCase()!==b.toLowerCase())disagreed=true;
    if(b&&(!a||(refined.field_confidence?.[key]??0)>(original.field_confidence?.[key]??0))){result[key]=b;result.field_confidence[key]=refined.field_confidence?.[key]}
  }
  const valid=r=>r.starts_at_local&&r.ends_at_local&&r.ends_at_local>r.starts_at_local;
  if(valid(refined)&&(!valid(original)||(refined.field_confidence?.times??0)>(original.field_confidence?.times??0))){
    result.starts_at_local=refined.starts_at_local;result.ends_at_local=refined.ends_at_local;
  }
  if(valid(original)&&valid(refined)&&(original.starts_at_local!==refined.starts_at_local||original.ends_at_local!==refined.ends_at_local))disagreed=true;
  if(valid(result))warnings.delete('Could not confidently identify both class times.');
  if(disagreed)warnings.add('Text readings differed. Check this entry against your file.');
  result.warnings=[...warnings];return result;
}
export function timetableRegions(tokens,dimensions){return classRegions(wordBoxes(tokens),dimensions,parseNamedDay,courseCodes)}
export function parseSpatial(tokens,{width,height,source='',regions}={}){
  const average=items=>{const scores=(items||[]).map(w=>w.confidence??100);return scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0};
  const words=wordBoxes(tokens),cells=regions||classRegions(words,{width,height},parseNamedDay,courseCodes),results=[];
  for(const cell of cells){
    const {anchor}=cell;
    const nearby=words.filter(w=>centerX(w)>=cell.x0&&centerX(w)<cell.x1&&centerY(w)>=cell.y0&&centerY(w)<cell.y1);
    const lines=groupLines(nearby),text=lines.map(l=>l.text).join('\n');
    // Read both times from the same visual line, never from a neighboring class.
    const timeLines=lines.map(l=>({...l,times:timesIn(l.text)})).filter(l=>l.times.length);
    const timeLine=timeLines.filter(l=>l.times.length>=2).sort((a,b)=>Math.abs(a.y-centerY(anchor))-Math.abs(b.y-centerY(anchor)))[0];
    const foundTimes=timeLine?.times||timeLines.sort((a,b)=>Math.abs(a.y-centerY(anchor))-Math.abs(b.y-centerY(anchor)))[0]?.times||[];
    const footer=lines.find(l=>roomCode(l.text)||classType(l.text)&&l.y>anchor.box.y1);
    const nameLines=lines.filter(l=>l.y>anchor.box.y1&&l.y<(footer?.y??cell.y1)&&/\p{L}/u.test(l.text)&&!timesIn(l.text).length&&!courseCodes(l.text).length&&!parseNamedDay(l.text)&&!/^\s*(?:Dr\.?|Prof(?:essor)?\.?|Lecturer|دكتور|الدكتور|الدكتورة|أستاذ)/i.test(l.text));
    const first=nameLines[0];let name=first?.text||'';
    const second=nameLines[1];
    if(first&&second&&second.y-first.y<first.height*1.65&&Math.abs(second.height-first.height)<first.height*.2&&/[\u0600-\u06ff]/.test(first.text)===/[\u0600-\u06ff]/.test(second.text))name+=' '+second.text;
    name=name.replace(/[|•○◯]+/g,' ').replace(/\s+/g,' ').trim();
    const room=roomCode(text)||nearby.find(w=>/^[#]?[A-Z][\dOIL]{2,4}$/i.test(digits(w.text))&&w.box.y0>anchor.box.y1)?.text.replace(/^#/,'').toUpperCase().replace(/O/g,'0').replace(/[IL]/g,'1')||'';
    const confidence=nearby.filter(w=>Number.isFinite(w.confidence)).reduce((a,w)=>({sum:a.sum+w.confidence,n:a.n+1}),{sum:0,n:0});
    const warnings=[];
    if(confidence.n&&confidence.sum/confidence.n<75)warnings.push('Some text was unclear. Compare this entry with your file.');
    if(!cell.weekday)warnings.push('Weekday could not be identified.');
    if(/\broom\b/i.test(text)&&!room)warnings.push('Room number was unclear. Enter it from your file.');
    if(foundTimes.length!==2)warnings.push('Could not confidently identify both class times.');
    if(foundTimes.length>2)warnings.push('More than two times were found in this class area.');
    results.push(draftRow({course_code:anchor.code,name,has_schedule:true,weekday:cell.weekday,starts_at_local:foundTimes[0]?.value||'',ends_at_local:foundTimes[1]?.value||'',title:classType(text),room,source,warnings,field_confidence:{name:average(first?.words),room:average(lines.find(l=>roomCode(l.text))?.words),title:average(lines.find(l=>classType(l.text))?.words),times:average(timeLine?.words)}}));
  }
  return uniqueRows(results);
}
export function parsePlainText(text,source=''){
  const lines=String(text).split(/\r?\n/).map(l=>l.trim()).filter(Boolean),rows=[];let day=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i],named=parseNamedDay(line);if(named){day=named;continue}
    const codes=courseCodes(line);if(!codes.length)continue;
    for(let c=0;c<codes.length;c++){
      const code=codes[c],segment=line.slice(code.index+code.length,codes[c+1]?.index),next=[];
      if(codes.length===1)for(let j=i+1;j<Math.min(lines.length,i+5);j++){if(courseCodes(lines[j]).length||parseNamedDay(lines[j]))break;next.push(lines[j])}
      const inlineDay=WEEKDAYS.findIndex(names=>names.some(d=>dayText(segment).split(/\s+/).includes(dayText(d))));
      const content=[segment,...next].join('\n'),before=i>0&&!courseCodes(lines[i-1]).length&&!parseNamedDay(lines[i-1])?lines[i-1]:'';
      let times=timesIn(content);if(times.length<2&&timesIn(before).length>=2)times=timesIn(before);
      let name=segment.trim();if(!name)name=next.find(l=>!timesIn(l).length&&!roomCode(l)&&!classType(l)&&!/^Dr\.?\s/i.test(l))||'';
      name=name.split(TIME_PATTERN)[0].replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi,'').split(/\b(?:Room|Lecture|Lect\.?|Section|Sec\.?|Lab|Tutorial)\b/i)[0].replace(/[|;,]+/g,' ').trim();
      const weekday=inlineDay>=0?inlineDay+1:day;
      rows.push(draftRow({course_code:code.code,name,has_schedule:Boolean(times.length||weekday||classType(content)),weekday,starts_at_local:times[0]?.value||'',ends_at_local:times[1]?.value||'',title:classType(content),room:roomCode(content),source,warnings:times.length>2?['More than two class times were found. Check this entry.']:[]}));
    }
  }
  return uniqueRows(rows);
}
export function validateDraft(row){const errors=[];if(!row.name.trim())errors.push('Subject name is required');if(row.name.length>160)errors.push('Subject name is too long');if(row.course_code.length>30)errors.push('Course code is too long');if(row.has_schedule){if(!Number.isInteger(Number(row.weekday))||Number(row.weekday)<1||Number(row.weekday)>7)errors.push('Choose a weekday');if(!/^\d{2}:\d{2}$/.test(row.starts_at_local)||!parseTime(row.starts_at_local))errors.push('Set the start time');if(!/^\d{2}:\d{2}$/.test(row.ends_at_local)||!parseTime(row.ends_at_local))errors.push('Set the end time');if(row.starts_at_local&&row.ends_at_local&&row.ends_at_local<=row.starts_at_local)errors.push('End must follow start');if(!row.title)errors.push('Choose lecture, section, or lab')}return errors}
export function parseDelimited(text){const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':text.split(/\r?\n/,1)[0].includes(';')?';':',';const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=''}else field+=c}row.push(field);if(row.some(x=>x.trim()))rows.push(row);if(quoted)throw Error('The CSV has an unclosed quoted field.');const headers=(rows.shift()||[]).map(h=>h.trim().toLowerCase().replace(/[\s-]+/g,'_'));return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]?.trim()||''])))}
export function parseTable(rows,source=''){return rows.map(r=>{const code=r.course_code||r.subject_code||r.code||'',name=r.name||r.course_name||r.subject||r.subject_name||'',start=parseTime(r.starts_at_local||r.start_time||r.start||''),end=parseTime(r.ends_at_local||r.end_time||r.end||''),day=parseDay(r.weekday||r.day||'');return draftRow({course_code:code,name,has_schedule:Boolean(day||start||end),weekday:day,starts_at_local:start,ends_at_local:end,title:r.title||r.class_type||r.type||'',room:r.room||r.room_name||'',building:r.building||'',source})}).filter(r=>r.course_code||r.name)}

