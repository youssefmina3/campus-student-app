import {cloudMode} from './database.mjs';
const store = cloudMode ? await import('./cloud-store.mjs') : await import('./local-auth-store.mjs');
export const register=store.register, login=store.login, findUser=store.findUser, validCredentials=store.validCredentials;

