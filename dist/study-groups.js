// Keep subject grouping independent of page rendering and preserve task records.
export function groupStudyTasks(tasks,courses,allTasks=tasks){
 const knownCourses=new Map(courses.map(c=>[c.id,c])),byId=new Map(allTasks.map(t=>[t.id,t])),groups=new Map();
 function subject(task){let current=task,seen=new Set();while(current&&!seen.has(current.id)){seen.add(current.id);if(knownCourses.has(current.course_id))return current.course_id;current=byId.get(current.parent_task_id)}return null}
 for(const task of tasks){const courseId=subject(task),key=courseId||'personal';if(!groups.has(key))groups.set(key,{courseId,course:knownCourses.get(courseId)||null,tasks:[]});groups.get(key).tasks.push(task)}
 const order=new Map(courses.map((c,i)=>[c.id,i]));return [...groups.values()].sort((a,b)=>(order.get(a.courseId)??Infinity)-(order.get(b.courseId)??Infinity)).map(g=>({...g,tasks:g.tasks.slice().sort((a,b)=>Number(a.status==='done')-Number(b.status==='done')||(a.planned_start_at||'9999').localeCompare(b.planned_start_at||'9999')||a.title.localeCompare(b.title))}));
}
