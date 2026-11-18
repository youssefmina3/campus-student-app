// Server-only. Never import this module from dist/ or expose DATABASE_URL.
import {readFile} from 'node:fs/promises';
let connection;
export const cloudMode = Boolean(process.env.DATABASE_URL) || process.env.VERCEL === '1';
export async function database() {
  if (!connection) {
    const value = process.env.DATABASE_URL;
    let url;
    try { url = new URL(value); } catch {}
    if (!url || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.password) {
      throw Object.assign(new Error('Account service is not configured. Please contact the site owner.'), {status:503, code:'DATABASE_NOT_CONFIGURED'});
    }
    const {default:postgres} = await import('postgres');
    connection = postgres(value, {
      ssl: {ca:await readFile(new URL('./certs/supabase-ca.crt',import.meta.url),'utf8'),rejectUnauthorized:true}, prepare:false, max:1,
      connect_timeout:10, idle_timeout:20, max_lifetime:60 * 10
    });
  }
  return connection;
}
export async function closeDatabase() {
  if (connection) await connection.end({timeout:5});
  connection = undefined;
}
