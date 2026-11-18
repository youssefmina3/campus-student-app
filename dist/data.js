import {ensureSubjectColors,nextSubjectColor} from './subject-colors.js';
export {nextSubjectColor};
export const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:window.CampusWorkspace?.users?.[0]?.timezone||'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const uid=()=>crypto.randomUUID();
const row=x=>({id:uid(),created_at:new Date().toISOString(),...x});
// Weekly times and rooms transcribed from the supplied timetable image.
// Date range and all non-timetable content remain prototype examples.
export const TIMETABLE=[
 ['BMK2106',6,'12:30','14:30','C101','Section'],
 ['BAC2105',6,'16:30','18:30','B502','Section'],
 ['BIS2104',6,'18:30','20:30','B206','Section'],
 ['BMK2106',7,'08:30','10:30','B104','Lecture'],
 ['BIS3426',7,'10:30','12:30','B401','Lecture'],
 ['BIS2107',7,'14:30','16:30','C401','Lecture'],
 ['BIS3112',7,'16:30','18:30','C302','Section'],
 ['BIS3112',1,'08:30','10:30','B402','Lecture'],
 ['BAC2105',1,'10:30','12:30','B502','Lecture'],
 ['BIS2108',1,'16:30','18:30','B206','Section'],
 ['BIS2108',2,'08:30','10:30','B202','Lecture'],
 ['BIS2107',2,'10:30','12:30','B306','Section'],
 ['BIS2104',2,'12:30','14:30','B402','Lecture'],
 ['BIS3426',3,'14:30','16:30','B204','Section']
];
export function zonedISO(day,time,timezone='Africa/Cairo'){
 const target=new Date(day+'T'+time.slice(0,5)+':00Z');let guess=target;
 for(let i=0;i<3;i++){const local=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(guess).replace(' ','T');const difference=target-new Date(local+'Z');if(!difference)break;guess=new Date(guess.getTime()+difference)}return guess.toISOString();
}
export function seed(){
 const u=row({full_name:'Youssef Ahmed',timezone:'Africa/Cairo',default_currency_code:'EGP'});
 const courses=[['BMK2106','Organizational Behavior'],['BAC2105','Managerial Accounting'],['BIS2104','Database Management'],['BIS3426','Artificial Intelligence for Business'],['BIS2107','Multimedia'],['BIS3112','Operations Management for BIS'],['BIS2108','Introduction to Programming']].map(([course_code,name])=>row({user_id:u.id,course_code,name,professor_name:null,professor_email:null,semester:'Fall 2026',semester_start:'2026-09-20',semester_end:'2027-01-15',minimum_attendance_percent:75,late_counts_as_present:true,exclude_excused_from_percentage:true,attendance_alert_enabled:true}));
 const rooms=[...new Set(TIMETABLE.map(s=>s[4]))].map(room_name=>row({user_id:u.id,room_name,building:null,campus:null,directions:null}));
 const schedules=TIMETABLE.map(([code,weekday,starts_at_local,ends_at_local,room_name,title])=>row({course_id:courses.find(c=>c.course_code===code).id,room_id:rooms.find(r=>r.room_name===room_name).id,title,weekday,starts_at_local,ends_at_local,timezone:'Africa/Cairo',repeat_every_weeks:1,effective_from:'2026-09-20',effective_until:'2027-01-15',is_active:true}));
 const class_sessions=[];
 for(let d=new Date('2026-09-20T12:00Z');d<=new Date('2027-01-15T12:00Z');d.setUTCDate(d.getUTCDate()+1)){let date=d.toISOString().slice(0,10);for(const s of schedules.filter(s=>s.weekday===(d.getUTCDay()||7))){class_sessions.push(row({course_id:s.course_id,schedule_id:s.id,room_id:s.room_id,occurrence_date:date,starts_at:zonedISO(date,s.starts_at_local),ends_at:zonedISO(date,s.ends_at_local),status:date<TODAY?'completed':'scheduled',notes:''}))}}
 const tasks=[['Design a library database','BIS2104','assignment','in_progress','2026-10-30T23:59',null],['Programming exercises — loops','BIS2108','assignment','todo','2026-10-29T17:00',null],['Managerial accounting quiz','BAC2105','exam','todo','2026-11-02T10:00',null],['Review multimedia concepts','BIS2107','study','todo','2026-10-29T14:00','2026-10-27T16:00'],['Sketch tables and relationships','BIS2104','study','todo','2026-10-28T20:00','2026-10-27T18:00'],['Read organizational behavior notes','BMK2106','study','todo','2026-10-31T12:30','2026-10-28T17:00'],['AI in business case study','BIS3426','assignment','todo','2026-11-04T18:00',null]].map(([title,code,task_type,status,due,planned])=>row({user_id:u.id,course_id:courses.find(c=>c.course_code===code).id,parent_task_id:null,title,description:'Example only. This task and deadline were not included in your timetable screenshot.',task_type,status,priority:task_type==='exam'?3:2,planned_start_at:planned?zonedISO(planned.slice(0,10),planned.slice(11)):null,planned_end_at:planned?zonedISO(planned.slice(0,10),String(Number(planned.slice(11,13))+1).padStart(2,'0')+':00'):null,due_at:zonedISO(due.slice(0,10),due.slice(11)),estimated_minutes:60,completed_at:null}));tasks[4].parent_task_id=tasks[0].id;
 const monthly_budgets=[row({user_id:u.id,month_start:'2026-10-01',spending_limit:4000,currency_code:'EGP'}),row({user_id:u.id,month_start:'2026-09-01',spending_limit:3500,currency_code:'EGP'})];
 const transactions=[['2026-10-02',900,'expense','Food','Weekly groceries'],['2026-10-05',450,'expense','Transport','Monthly bus pass'],['2026-10-10',620,'expense','Study','Textbooks and printing'],['2026-10-15',320,'expense','Food','Groceries'],['2026-10-20',180,'expense','Social','Coffee with classmates'],['2026-10-26',45,'expense','Food','Campus lunch'],['2026-10-01',4000,'income','Allowance','Monthly allowance']].map(([transaction_date,amount,transaction_type,category,description])=>row({monthly_budget_id:monthly_budgets[0].id,transaction_date,amount,transaction_type,category,description}));
 const university_info=[['Your timetable, at a glance','note','Imported from your screenshot: 7 courses, 14 weekly classes, and 28 class hours. Saturday through Wednesday have classes. No classes are shown for Thursday; Friday was not visible in the screenshot. Recurrence dates can be adjusted in your schedules.','','','',''],['Academic advising office','office','Illustrative office hours and contact information. Confirm details with your university.','Example administration office','Academic Advising','advising@example.edu',''],['Attendance policy','rule','The screenshot does not specify attendance requirements. The 75% thresholds and late/excused policies are editable initial defaults. Set the real policy in each course.','','','',''],['Library & study spaces','link','Placeholder library resource. Replace this with your university’s real link.','','','','https://example.edu/library'],['Coding Club','club','Example meetup: Wednesdays at 5 pm. Replace with your real club details.','Example student center','Club coordinator','coding@example.edu',''],['Enrollment letter guide','note','Prepare your student ID and ask Student Affairs about the current enrollment letter process. This is illustrative guidance.','','','','']].map(([title,info_type,content,location,contact_name,contact_email,url])=>row({user_id:u.id,course_id:null,title,info_type,content,location,contact_name,contact_email,contact_phone:'',url}));
 const reminders=[row({user_id:u.id,task_id:tasks[0].id,class_session_id:null,remind_at:zonedISO('2026-10-29','18:00'),channel:'in_app',status:'pending',attempt_count:0,next_attempt_at:null,delivered_at:null,last_error:null})];
 return {users:[u],courses,rooms,schedules,class_sessions,attendance:[],tasks,reminders,monthly_budgets,transactions,university_info};
}
const account=window.CampusSession;
if(!account?.id)throw Error('A signed-in session is required.');
const KEY='campus-timetable-v2:'+account.id;
export function emptyWorkspace(){return {users:[{id:account.id,created_at:new Date().toISOString(),full_name:account.full_name,timezone:'Africa/Cairo',default_currency_code:'EGP'}],courses:[],rooms:[],schedules:[],class_sessions:[],attendance:[],tasks:[],reminders:[],monthly_budgets:[],transactions:[],university_info:[],appointments:[]}}
let cached=null,pending=false;try{cached=JSON.parse(localStorage.getItem(KEY)||'null');pending=localStorage.getItem(KEY+':pending')==='1';if(!cached&&!window.CampusWorkspace&&account.adopt_existing_workspace)cached=JSON.parse(localStorage.getItem('campus-timetable-v2')||'null')}catch{}
export let db=(pending&&cached?cached:window.CampusWorkspace||cached)||emptyWorkspace();
for(const table of Object.keys(emptyWorkspace()))if(!Array.isArray(db[table]))db[table]=[];
if(!db.users[0])db.users=emptyWorkspace().users;const oldUserId=db.users[0].id;db.users[0].id=account.id;for(const table of ['courses','rooms','tasks','reminders','monthly_budgets','university_info'])for(const record of db[table])if(record.user_id===oldUserId)record.user_id=account.id;
if(!db.appointments.length&&account.adopt_existing_workspace&&!window.CampusWorkspace)try{db.appointments=JSON.parse(localStorage.getItem('campus-appointments-v1:'+account.id)||localStorage.getItem('campus-appointments-v1')||'[]')}catch{}
for(const table of ['tasks','university_info'])for(const record of db[table])if(typeof record.title==='string')record.title=record.title.replace(/^Demo:\s*/i,'');
for(const record of db.transactions)if(typeof record.description==='string')record.description=record.description.replace(/^Demo:\s*/i,'');
for(const record of db.courses)if(typeof record.semester==='string')record.semester=record.semester.replace(/ \(demo dates\)/gi,'');
ensureSubjectColors(db.courses);
let version=0,synced=0,syncTask=null;
function sync(){if(syncTask)return syncTask;if(synced>=version)return Promise.resolve(true);syncTask=(async()=>{try{while(synced<version){const target=version,response=await fetch('/api/workspace',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({workspace:db})});if(response.status===401){location.replace('login.html');return false}if(!response.ok)throw Error('Workspace could not sync');synced=target;if(synced===version)try{localStorage.removeItem(KEY+':pending')}catch{}}return true}catch{window.dispatchEvent(new CustomEvent('workspace-sync-error'));return false}finally{syncTask=null}})();return syncTask}
export async function flushWorkspace(){await sync();return synced===version}
export function save(){ensureSubjectColors(db.courses);version++;try{localStorage.setItem(KEY,JSON.stringify(db));localStorage.setItem(KEY+':pending','1')}catch{}window.dispatchEvent(new Event('datachange'));void sync()}
export function reset(){const profile={...db.users[0]};db=emptyWorkspace();db.users=[profile];save()}
export function put(table,r){let i=db[table].findIndex(x=>x.id===r.id);if(table==='courses'&&!r.color)r.color=nextSubjectColor(db.courses);if(i<0)db[table].push(row(r));else db[table][i]=r;save()}
window.addEventListener('online',()=>void sync());
queueMicrotask(()=>save());
export const course=id=>db.courses.find(x=>x.id===id);
export const room=id=>db.rooms.find(x=>x.id===id);
export function attendanceStats(id){let c=course(id),sessions=db.class_sessions.filter(s=>s.course_id===id&&s.status==='completed'),marked=sessions.map(s=>db.attendance.find(a=>a.class_session_id===s.id)).filter(Boolean),counted=marked.filter(a=>!(a.status==='excused'&&c.exclude_excused_from_percentage)),present=counted.filter(a=>a.status==='present'||(a.status==='late'&&c.late_counts_as_present)).length;return {percent:counted.length?Math.round(present/counted.length*100):null,present,total:counted.length,unmarked:sessions.length-marked.length}}
export function budgetSummary(month=TODAY.slice(0,7)+'-01'){let budget=db.monthly_budgets.find(b=>b.month_start===month),transactions=db.transactions.filter(t=>t.monthly_budget_id===budget?.id),spent=transactions.filter(t=>t.transaction_type==='expense').reduce((a,t)=>a+Number(t.amount),0),income=transactions.filter(t=>t.transaction_type==='income').reduce((a,t)=>a+Number(t.amount),0);return {budget,transactions,spent,income,remaining:(budget?.spending_limit||0)-spent}}
