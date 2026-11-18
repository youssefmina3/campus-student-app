import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Opt in against a configured test database. Only creates uniquely named test accounts.
test('PostgreSQL signup, shared sessions, logout, and workspace isolation', {skip:!process.env.CAMPUS_TEST_DATABASE}, async t => {
  const ports=[19451,19452],servers=[],created=[],tag=randomUUID();
  async function start(port){
    const child=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port),VERCEL:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
    servers.push(child);child.stdout.resume();child.stderr.resume();
    for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)return child}catch{}await new Promise(r=>setTimeout(r,100))}
    throw Error('Test server did not start');
  }
  async function call(port,path,{method='GET',cookie,body,origin}={}){
    const base=`http://127.0.0.1:${port}`;
    const r=await fetch(base+path,{method,headers:{Origin:origin||base,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  t.after(async()=>{for(const child of servers){if(child.exitCode!==null||child.signalCode!==null)continue;child.kill();await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve))}await fs.writeFile(new URL('../.test-accounts.json',import.meta.url),JSON.stringify(created));});
  let first=await start(ports[0]);await start(ports[1]);
  const password='Testing-'+randomUUID();
  const email=`campus-test-${tag}@example.invalid`;
  const signup=await call(ports[0],'/api/auth/signup',{method:'POST',body:{full_name:'Cloud storage test',email,password}});
  assert.equal(signup.status,200);created.push(signup.data.user.id);
  assert.ok(signup.cookie);assert.equal(signup.data.user.role,'student');
  assert.ok(!JSON.stringify(signup.data).includes('password'));
  const cookie=signup.cookie;
  assert.equal((await call(ports[1],'/api/auth/me',{cookie})).data.user.id,signup.data.user.id);
  assert.equal((await call(ports[0],'/api/auth/signup',{method:'POST',body:{full_name:'Duplicate',email:email.toUpperCase(),password}})).status,409);
  assert.equal((await call(ports[0],'/api/auth/signup',{method:'POST',body:{full_name:'',email:'bad',password:'x'}})).status,400);
  assert.equal((await call(ports[0],'/api/auth/login',{method:'POST',body:{email,password:'incorrect'}})).status,401);
  assert.equal((await call(ports[0],'/api/auth/login',{method:'POST',origin:'https://untrusted.invalid',body:{email,password}})).status,403);
  const workspace={users:[{id:'client-id',full_name:'Test profile',timezone:'Africa/Cairo'}],courses:[{id:randomUUID(),user_id:'other-account',name:'Private course'}]};
  assert.equal((await call(ports[0],'/api/workspace',{method:'PUT',cookie,body:{workspace}})).status,200);
  const saved=await call(ports[1],'/api/workspace',{cookie});
  assert.equal(saved.data.workspace.courses[0].user_id,signup.data.user.id);
  assert.equal(saved.data.workspace.users[0].id,signup.data.user.id);
  first.kill();await new Promise(resolve=>first.once('exit',resolve));
  first=await start(ports[0]);
  assert.equal((await call(ports[0],'/api/auth/me',{cookie})).status,200);
  assert.equal((await call(ports[0],'/api/workspace',{cookie})).data.workspace.courses.length,1);
  const second=await call(ports[0],'/api/auth/signup',{method:'POST',body:{full_name:'Second test',email:`campus-test-second-${tag}@example.invalid`,password}});
  assert.equal(second.status,200);created.push(second.data.user.id);
  assert.equal((await call(ports[1],'/api/workspace',{cookie:second.cookie})).data.workspace,null);
  assert.equal((await call(ports[0],'/api/auth/logout',{method:'POST',cookie})).status,200);
  assert.equal((await call(ports[1],'/api/auth/me',{cookie})).status,401);
  const loggedIn=await call(ports[0],'/api/auth/login',{method:'POST',body:{email,password}});
  assert.equal(loggedIn.status,200);
  assert.equal((await call(ports[1],'/api/auth/me',{cookie:loggedIn.cookie})).status,200);
  const rotated=await call(ports[0],'/api/auth/login',{method:'POST',cookie:loggedIn.cookie,body:{email,password}});
  assert.equal(rotated.status,200);
  assert.equal((await call(ports[1],'/api/auth/me',{cookie:loggedIn.cookie})).status,401);
  assert.equal((await call(ports[1],'/api/auth/me',{cookie:rotated.cookie})).status,200);
  assert.equal((await call(ports[1],'/api/workspace',{method:'PUT',cookie:rotated.cookie,body:null})).status,400);
  assert.equal((await call(ports[1],'/api/auth/signup',{method:'POST',body:null})).status,400);
  // Limits are shared by both instances, including independent of the URL path.
  const {limited}=await import('../cloud-store.mjs');
  const key='test-rate-'+tag;
  assert.equal(await limited(key,1),false);assert.equal(await limited(key,1),true);
  await (await import('../database.mjs')).closeDatabase();
});
