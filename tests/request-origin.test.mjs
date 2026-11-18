import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedOrigins,requestOrigin,cookieSecurity} from '../request-origin.mjs';
const request = (host, extra = {}) => ({headers:{host,...extra}});
test('local hosts work; unknown hosts and malformed headers do not', () => {
  const origins=trustedOrigins({},4173);
  assert.equal(requestOrigin(request('localhost:4173'),origins),'http://localhost:4173');
  assert.equal(requestOrigin(request('127.0.0.1:4173'),origins),'http://127.0.0.1:4173');
  for(const host of ['evil.example','localhost:4174','localhost:4173@evil.example',' localhost:4173','localhost:4173/path',undefined,['localhost:4173']]) {
    assert.equal(requestOrigin(request(host),origins),null);
  }
});
test('Vercel only accepts its configured exact deployment hosts', () => {
  const origins=trustedOrigins({VERCEL:'1',VERCEL_URL:'campus-abc.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'campus.vercel.app',VERCEL_BRANCH_URL:'campus-git-main.vercel.app'},4173);
  for(const host of ['campus-abc.vercel.app','campus.vercel.app','campus-git-main.vercel.app'])
    assert.equal(requestOrigin(request(host),origins),'https://'+host);
  assert.equal(requestOrigin(request('attacker.vercel.app'),origins),null);
  assert.equal(requestOrigin(request('evil.example',{'x-forwarded-host':'campus.vercel.app'}),origins),null);
});
test('custom domains are explicit and HTTPS cookies are Secure', () => {
  const origins=trustedOrigins({CAMPUS_PUBLIC_ORIGIN:'https://campus.example.edu,https://www.campus.example.edu'},4173);
  assert.equal(requestOrigin(request('campus.example.edu'),origins),'https://campus.example.edu');
  assert.equal(cookieSecurity('https://campus.example.edu'),'; Secure');
  assert.equal(cookieSecurity('http://localhost:4173'),'');
  for(const bad of ['https://user:pass@example.edu','https://example.edu/path','file:///tmp/campus','https://example.edu?x=1'])
    assert.throws(()=>trustedOrigins({CAMPUS_PUBLIC_ORIGIN:bad},4173));
});
