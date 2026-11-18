import {randomBytes,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
const scrypt=promisify(derive),directory=process.env.CAMPUS_DATA_DIR||path.join(import.meta.dirname,'.local'),file=path.join(directory,'accounts.json');
let accounts=[];try{accounts=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
let writes=Promise.resolve();
const publicUser=u=>({id:u.id,full_name:u.full_name,email:u.email,adopt_existing_workspace:u.adopt_existing_workspace});
export function validCredentials(email,password){return typeof email==='string'&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&typeof password==='string'&&password.length>=8&&password.length<=128}
export async function register({full_name,email,password}){if(typeof full_name!=='string'||!full_name.trim()||full_name.length>100||!validCredentials(email,password))throw Object.assign(Error('Enter your name, a valid email, and a password of 8–128 characters.'),{status:400});email=email.trim().toLowerCase();const task=writes.then(async()=>{if(accounts.some(a=>a.email===email))throw Object.assign(Error('An account with this email already exists. Sign in instead.'),{status:409});const salt=randomBytes(16).toString('hex'),hash=(await scrypt(password,salt,64)).toString('hex'),user={id:crypto.randomUUID(),created_at:new Date().toISOString(),full_name:full_name.trim(),email,salt,password_hash:hash,adopt_existing_workspace:accounts.length===0};const next=[...accounts,user];await fs.mkdir(directory,{recursive:true});const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(next),{mode:0o600});await fs.rename(temp,file);accounts=next;return publicUser(user)});writes=task.catch(()=>{});return task}
export async function login({email,password}){if(typeof email!=='string'||typeof password!=='string'||password.length>128)return null;const user=accounts.find(a=>a.email===email.trim().toLowerCase()),salt=user?.salt||'b48946589bdc48689ad5f1fa42d144d0',hash=await scrypt(password,salt,64);if(!user||!timingSafeEqual(hash,Buffer.from(user.password_hash,'hex')))return null;return publicUser(user)}
export const findUser=id=>{const user=accounts.find(a=>a.id===id);return user?publicUser(user):null};
