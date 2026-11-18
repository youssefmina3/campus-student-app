# Campus student app

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm install
npm run setup
npm start
```

Setup downloads pinned PDF.js/Tesseract assets and English/Arabic OCR models. Without DATABASE_URL, local use keeps the original .local JSON accounts and workspaces. These private files are excluded from Git. Local passwords retain their original hashing format.

## Vercel and Supabase

The root website now uses PostgreSQL whenever DATABASE_URL is configured or VERCEL=1. Vercel never falls back to local account files. Set DATABASE_URL as a server-only secret containing the Supabase transaction pooler URL, then redeploy. Prepared statements are disabled and each function opens at most one database connection. The bundled Supabase public CA certificate verifies both the TLS certificate and server hostname.

The existing project has sql/001-original.sql and sql/002-custom-login.sql applied. sql/003-hosted-storage.sql adds persistent sessions, shared authentication throttling, and planner storage. Apply migrations only once, in order, against a new project. The restricted campus_web_backend login role must be provisioned separately with a generated password; credentials never belong in SQL committed to Git.

The current frontend sends an entire workspace to /api/workspace. To preserve its format, this release stores it as a per-user JSONB document in app_workspaces. Accounts use users and login_accounts. Planner records are not yet synchronized into the individual courses/tasks/budget tables. Each workspace query uses the authenticated session's user ID, never a client-supplied owner.

Sessions are random 256-bit tokens in HttpOnly, SameSite=Strict cookies, with Secure on HTTPS. Only token hashes are stored in app_sessions, with a 12-hour expiry. Sessions work across instances and restarts; logout revokes the stored token. Passwords use scrypt N=131072, r=8, p=1, a random 16-byte salt, and a 64-byte hash. Responses never include hashes or salts. Database errors log only an error code and request path.

The app role has only the required table privileges and explicit backend-only RLS policies. The browser has no direct credential/session/workspace access. Login and signup attempts are throttled in PostgreSQL across instances. There is currently no password-reset/email-verification flow.

## API

- POST /api/auth/signup: full_name, email, password (8–128 characters); role is always student.
- POST /api/auth/login: email, password.
- GET /api/auth/me: current public user.
- POST /api/auth/logout: revoke current session.
- GET /api/workspace: current user's planner or null for a new account.
- PUT /api/workspace: {workspace: ...}; validates collections and owner references.
- GET /api/health: application version and storage mode; no secrets.

Mutations require the exact same Origin as the request host. Vercel deployment domains are automatically trusted; add CAMPUS_PUBLIC_ORIGIN for explicit custom domains. Never use VITE_ or NEXT_PUBLIC_ prefixes for DATABASE_URL.

The separate backend/ TypeScript registration starter is retained for reference; the deployed site uses the root server.mjs.

## Verification

```sh
npm test
```

The PostgreSQL integration test is opt-in, creates uniquely named test accounts, and writes their IDs to .test-accounts.json for administrative cleanup:

```sh
CAMPUS_TEST_DATABASE=1 node --env-file=.env.local --test tests/cloud-auth.test.mjs
```

Use a test database for this command. It verifies signup, duplicate/invalid input, login, shared sessions, restart persistence, logout, account isolation, workspace persistence, and shared throttling. Generated test IDs and credentials must never be committed.

## Public CA source

certs/supabase-ca.crt is Supabase's public root certificate, downloaded over HTTPS from https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt. It is not a secret.

