import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSpatial,parsePlainText,parseDay,parseTime,parseDelimited,parseTable,validateDraft,courseCodes,mergeClassReadings,draftRow} from '../dist/import-parser.js';
const token=(text,x,y,width=text.length*7,confidence=98)=>({text,confidence,box:{x0:x,y0:y,x1:x+width,y1:y+14}});
const card=(x,y,code,name,start,end,room,type='Lecture')=>[
  token(start,x,y),token(end,x+150,y),token(code,x+60,y+30),token(name,x+20,y+55),token('Room '+room,x,y+100),token(type,x+200,y+100)
];
test('period numbers cannot become weekdays in a screenshot',()=>{
  const words=[token('1',10,5),token('2',100,5),token('Saturday',5,130),token('Sunday',5,310),...card(140,90,'CS101','Computer Science','8:30 AM','10:30 AM','B204'),...card(140,270,'DBS202','Database Systems','12:30 PM','2:30 PM','C101')];
  const rows=parseSpatial(words,{width:800,height:420});
  assert.deepEqual(rows.map(r=>r.weekday),[6,7]);assert.deepEqual(rows.map(r=>r.name),['Computer Science','Database Systems']);
});
test('adjacent classes retain their own times, names and rooms even when OCR word order is scrambled',()=>{
  const words=[token('Monday',5,120),...card(140,70,'BIO101','Biology','09:00 AM','10:30 AM','B204'),...card(500,70,'CS102','Computing','11:00 AM','12:30 PM','C101','Section')];
  const rows=parseSpatial(words.reverse(),{width:900,height:260}).sort((a,b)=>a.course_code.localeCompare(b.course_code));
  assert.deepEqual(rows.map(({name,starts_at_local,ends_at_local,room,title})=>({name,starts_at_local,ends_at_local,room,title})),[
    {name:'Biology',starts_at_local:'09:00',ends_at_local:'10:30',room:'B204',title:'Lecture'},
    {name:'Computing',starts_at_local:'11:00',ends_at_local:'12:30',room:'C101',title:'Section'}]);
});
test('weekdays across the top of a timetable map to columns',()=>{
  const rows=parseSpatial([token('Monday',170,10),token('Tuesday',530,10),...card(140,80,'BIO101','Biology','09:00 AM','10:30 AM','B204'),...card(500,80,'CS102','Computing','11:00 AM','12:30 PM','C101')],{width:900,height:500});
  assert.deepEqual(rows.map(r=>r.weekday),[1,2]);
});
test('course-code pieces join by position rather than OCR iteration order',()=>{
  const words=[token('Monday',5,120),...card(140,70,'BIO','Biology','09:00 AM','10:30 AM','B204'),token('101',225,100)];
  const rows=parseSpatial(words.reverse(),{width:800,height:260});assert.equal(rows[0].course_code,'BIO101');
});
test('Arabic days, numerals and meridiems are supported',()=>{
  assert.equal(parseDay('الإثنين'),1);assert.equal(parseDay('الْأَرْبِعَاء'),3);assert.equal(parseTime('٨:٣٠ ص'),'08:30');assert.equal(parseTime('٢:٣٠ م'),'14:30');assert.equal(parseTime('12:00 AM'),'00:00');assert.equal(parseTime('12:00 PM'),'12:00');assert.equal(parseTime('9 AM'),'09:00');
  assert.equal(parseTime('09:3O AM'),'09:30');assert.equal(parseTime('24:00'),'');assert.equal(parseTime('12:65'),'');
});
test('multiline text retains its weekday and time header',()=>{
  const rows=parsePlainText('Monday\n09:00 AM 10:30 AM\nBIO101\nBiology\nRoom B204 Lecture\nTuesday\nCS102 Computing 2:30 PM 4:00 PM Section Room C101');
  assert.equal(rows.length,2);assert.equal(rows[0].name,'Biology');assert.equal(rows[0].starts_at_local,'09:00');assert.equal(rows[1].weekday,2);assert.equal(rows[1].ends_at_local,'16:00');
});
test('partial recognition requests correction instead of silently saving a subject with no class',()=>{
  const rows=parseSpatial([token('Monday',5,120),token('BIO101',200,100),token('Biology',180,140)],{width:700,height:260});
  assert.equal(rows[0].has_schedule,true);assert.ok(rows[0].warnings.length);assert.ok(validateDraft(rows[0]).includes('Set the start time'));
});
test('Arabic professor names do not get appended to an English subject name',()=>{
  const rows=parseSpatial([token('Monday',5,120),...card(140,70,'BIO101','Biology','09:00 AM','10:30 AM','B204'),token('محمد أحمد',160,145)],{width:800,height:260});assert.equal(rows[0].name,'Biology');
});
test('CSV import remains compatible and validates its class times',()=>{
  const rows=parseTable(parseDelimited('course_code,name,day,start,end,type,room\nBIO101,"Biology, introductory",Monday,09:00,10:30,Lecture,B204'));
  assert.equal(rows[0].name,'Biology, introductory');assert.equal(rows[0].weekday,1);assert.deepEqual(validateDraft(rows[0]),[]);
});
test('misread numeric rooms do not become fake subjects',()=>{
  assert.deepEqual(courseCodes('Room 6206'),[]);assert.deepEqual(courseCodes('ROOM 8502'),[]);
});
test('a crop can recover a room without replacing a more reliable subject name',()=>{
  const original=draftRow({course_code:'BIO101',weekday:1,name:'Biology',starts_at_local:'09:00',ends_at_local:'10:30',field_confidence:{name:98,times:95}});
  const refined=draftRow({course_code:'BIO101',weekday:1,name:'Biclogy',room:'B204',starts_at_local:'09:00',ends_at_local:'10:30',field_confidence:{name:40,times:90,room:96}});
  const merged=mergeClassReadings(original,refined);assert.equal(merged.name,'Biology');assert.equal(merged.room,'B204');assert.ok(merged.warnings.length);
});
test('conflicting class times are kept as a pair and flagged for review',()=>{
  const original=draftRow({course_code:'BIO101',weekday:1,starts_at_local:'09:00',ends_at_local:'10:30',field_confidence:{times:95}});
  const refined=draftRow({course_code:'BIO101',weekday:1,starts_at_local:'09:30',ends_at_local:'11:00',field_confidence:{times:60}});
  const merged=mergeClassReadings(original,refined);assert.equal(merged.starts_at_local,'09:00');assert.equal(merged.ends_at_local,'10:30');assert.ok(merged.warnings.some(w=>w.includes('differed')));
});
