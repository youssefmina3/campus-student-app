// Resolve requests only against explicitly trusted local/deployment origins.
// Never trust arbitrary Host, X-Forwarded-Host, or X-Forwarded-Proto values.
export function trustedOrigins(env = process.env, port = Number(env.PORT || 4173)) {
  const origins = new Map([
    ['127.0.0.1:' + port, 'http://127.0.0.1:' + port],
    ['localhost:' + port, 'http://localhost:' + port]
  ]);
  const add = value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('CAMPUS_PUBLIC_ORIGIN must contain only a valid HTTP(S) origin.');
    }
    origins.set(url.host, url.origin);
  };
  // Explicit custom domains; comma-separated if multiple aliases are needed.
  for (const value of (env.CAMPUS_PUBLIC_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)) add(value);
  if (env.VERCEL === '1') {
    for (const name of ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL']) {
      if (env[name]) add('https://' + env[name]);
    }
  }
  return origins;
}
export function requestOrigin(req, origins) {
  const host = req.headers.host;
  if (typeof host !== 'string' || !host || host !== host.trim()
      || /[\\/\s@?#]/.test(host)) return null;
  return origins.get(host.toLowerCase()) || null;
}
export function cookieSecurity(origin) {
  return origin.startsWith('https://') ? '; Secure' : '';
}
