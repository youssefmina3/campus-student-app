import {randomBytes, scrypt as derive, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {database} from './database.mjs';
const scrypt = promisify(derive);
const options = {N:131072,r:8,p:1,maxmem:256 * 1024 * 1024};
const publicUser = row => ({id:row.id, full_name:row.full_name, email:row.email, role:row.role, adopt_existing_workspace:false});
const tokenHash = token => createHash('sha256').update(token).digest('hex');
export function validCredentials(email,password) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && typeof password === 'string' && password.length >= 8 && password.length <= 128;
}
export async function register(values) {
  const {full_name,email,password} = values || {};
  if(typeof full_name !== 'string' || !full_name.trim() || full_name.length > 100 || !validCredentials(email,password)) {
    throw Object.assign(new Error('Enter your name, a valid email, and a password of 8–128 characters.'),{status:400});
  }
  const sql = await database();
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password,salt,64,options)).toString('hex');
  try {
    return await sql.begin(async tx => {
      const [profile] = await tx`INSERT INTO public.users (full_name, timezone, default_currency_code)
        VALUES (${full_name.trim()}, 'Africa/Cairo', 'EGP') RETURNING id, full_name`;
      const [account] = await tx`INSERT INTO public.login_accounts (user_id,email,password_hash,password_salt,role)
        VALUES (${profile.id},${email.toLowerCase()},${hash},${salt},'student') RETURNING email,role`;
      return publicUser({...profile,...account});
    });
  } catch(error) {
    if(error.code === '23505') throw Object.assign(new Error('An account with this email already exists. Sign in instead.'),{status:409});
    throw error;
  }
}
export async function login({email,password} = {}) {
  if(typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) return null;
  const sql = await database();
  const [account] = await sql`SELECT u.id,u.full_name,a.email,a.role,a.password_hash,a.password_salt
    FROM public.login_accounts a JOIN public.users u ON u.id=a.user_id WHERE lower(a.email)=${email.trim().toLowerCase()}`;
  // Derive even for unknown emails to avoid a fast account-existence timing signal.
  const hash = await scrypt(password,account?.password_salt || '00000000000000000000000000000000',64,options);
  if(!account || !timingSafeEqual(hash,Buffer.from(account.password_hash,'hex'))) return null;
  return publicUser(account);
}
export async function findUser(id) {
  const sql = await database();
  const [row] = await sql`SELECT u.id,u.full_name,a.email,a.role FROM public.users u
    JOIN public.login_accounts a ON a.user_id=u.id WHERE u.id=${id}`;
  return row ? publicUser(row) : null;
}
export async function createSession(userId,ttl) {
  const sql = await database(), token = randomBytes(32).toString('hex');
  await sql`INSERT INTO public.app_sessions (user_id,token_hash,expires_at)
    VALUES (${userId},${tokenHash(token)},${new Date(Date.now()+ttl)})`;
  return token;
}
export async function readSession(token) {
  if(typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const sql = await database();
  const [row] = await sql`SELECT u.id,u.full_name,a.email,a.role FROM public.app_sessions s
    JOIN public.users u ON u.id=s.user_id JOIN public.login_accounts a ON a.user_id=u.id
    WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now()`;
  return row ? {token,user:publicUser(row)} : null;
}
export async function deleteSession(token) {
  if(typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return;
  const sql = await database();
  await sql`DELETE FROM public.app_sessions WHERE token_hash=${tokenHash(token)}`;
}
export async function limited(key,maximum=15) {
  const sql = await database();
  const [row] = await sql`INSERT INTO public.auth_rate_limits (key_hash,attempt_count,window_start)
    VALUES (${tokenHash(key)},1,now()) ON CONFLICT (key_hash) DO UPDATE SET
    attempt_count=CASE WHEN auth_rate_limits.window_start < now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempt_count+1 END,
    window_start=CASE WHEN auth_rate_limits.window_start < now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_start END
    RETURNING attempt_count`;
  return row.attempt_count > maximum;
}
export async function readWorkspace(user) {
  const sql = await database();
  const [row] = await sql`SELECT document FROM public.app_workspaces WHERE user_id=${user.id}`;
  return row?.document || null;
}
export async function writeWorkspace(user,workspace) {
  const sql = await database();
  await sql`INSERT INTO public.app_workspaces (user_id,document) VALUES (${user.id},${sql.json(workspace)})
    ON CONFLICT (user_id) DO UPDATE SET document=EXCLUDED.document,updated_at=now()`;
  return workspace;
}
