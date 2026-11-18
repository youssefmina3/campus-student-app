import express from 'express';
import postgres from 'postgres';
import { randomBytes, scrypt } from 'node:crypto';
import { z } from 'zod';

const environment = z.object({
  DATABASE_URL: z.string().url().refine(value => /^postgres(?:ql)?:/.test(value)),
  APP_ORIGIN: z.string().url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  }, 'Use an origin without a trailing slash'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001)
}).safeParse(process.env);

if (!environment.success) {
  throw new Error('Check environment variables: ' +
    environment.error.issues.map(issue => issue.path.join('.')).join(', '));
}
export const config = environment.data;

const sql = postgres(config.DATABASE_URL, {
  ssl: 'require', prepare: false, max: 1, connect_timeout: 10, idle_timeout: 20
});
const registerSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).email().transform(value => value.toLowerCase()),
  password: z.string().min(12, 'Use at least 12 characters').max(128),
  timezone: z.string().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
    catch { return false; }
  }, 'Enter a valid IANA timezone').default('Africa/Cairo'),
  default_currency_code: z.string().regex(/^[A-Z]{3}$/, 'Use three uppercase letters').default('EGP')
}).strict();

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, {
      N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024
    }, (error, key) => {
      if (error) reject(error); else resolve(key.toString('hex'));
    });
  });
}

export const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && req.get('origin') !== config.APP_ORIGIN) {
    res.status(403).json({ error: 'Request origin is not allowed.' });
    return;
  }
  next();
});
app.use(express.json({ limit: '16kb' }));
app.post('/api/auth/register', async (req, res, next) => {
  if (!req.is('application/json')) {
    res.status(415).json({ error: 'Send Content-Type: application/json.' });
    return;
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Check the registration fields.', fields: parsed.error.flatten()
    });
    return;
  }
  const input = parsed.data;
  try {
    const salt = randomBytes(16).toString('hex');
    const hash = await hashPassword(input.password, salt);
    const user = await sql.begin(async transaction => {
      const [profile] = await transaction`
        INSERT INTO public.users (full_name, timezone, default_currency_code)
        VALUES (${input.full_name}, ${input.timezone}, ${input.default_currency_code})
        RETURNING id, full_name
      `;
      const [account] = await transaction`
        INSERT INTO public.login_accounts
          (user_id, email, password_hash, password_salt, role)
        VALUES (${profile.id}, ${input.email}, ${hash}, ${salt}, 'student')
        RETURNING email, role
      `;
      return {
        id: profile.id, full_name: profile.full_name,
        email: account.email, role: account.role
      };
    });
    res.status(201).json({ user });
  } catch (error) { next(error); }
});
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});
app.use((
  error: unknown, _req: express.Request,
  res: express.Response, _next: express.NextFunction
) => {
  const details = error as { code?: string; type?: string };
  if (details.code === '23505') {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }
  if (details.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body must be valid JSON.' });
    return;
  }
  if (details.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.' });
    return;
  }
  console.error('Registration failed.');
  res.status(500).json({ error: 'Could not create your account. Please try again.' });
});
