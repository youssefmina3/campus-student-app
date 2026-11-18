# Campus student app

## Run the existing website locally

Install Node.js 22 or newer, then run from this repository:

```sh
npm run setup
npm start
```

The first command downloads the pinned PDF.js and Tesseract packages and English/Arabic OCR models into dist/vendor. It requires internet and the tar command (included with modern Windows). The launcher then opens Campus in your browser. Keep its window open. The core app and imports work offline after setup.

The existing website is plain HTML/CSS/JavaScript, with local Node.js credential sessions and JSON workspace storage. It includes dashboard, courses, schedule, attendance, tasks, study planning, budgets, notes, reminders, appointments, light/dark mode, and screenshot/PDF imports. It has not been converted to React.

Accounts and workspaces are created under .local and are excluded from Git. The Windows runtime and downloadable ZIPs are excluded; the launcher uses your installed Node.js.

## PostgreSQL registration backend — first route

backend/ contains the separate TypeScript/Express registration API from the latest implementation discussion. It is not wired into the existing local website. Login/JWT/role middleware, PostgreSQL feature routes, the shared adviser directory, and staff dashboard remain future work.

Run the schema only if it has not already been applied: sql/001-original.sql is the original Supabase schema; sql/002-custom-login.sql is the one-time update. Do not rerun existing migrations blindly. No migration runs automatically.

From backend/:

```sh
npm install
```

Copy .env.example to .env.local and fill DATABASE_URL with the Supabase transaction pooler URL and APP_ORIGIN with the exact frontend origin (no trailing slash). Then:

```sh
npm run check
npm run dev
```

POST /api/auth/register accepts JSON full_name, email, password (12–128 characters), optional timezone, and default_currency_code. Set Origin to APP_ORIGIN. It creates profile and student login credentials atomically, returning only id, full_name, email, and role. Public clients cannot select the admin role.

React/Vite callers can use backend/examples/register.ts and configure Vite's /api proxy to http://127.0.0.1:3001. The backend exports an Express application at backend/api/index.ts for later Vercel integration; hosting/routing setup is not completed in this commit.

The new backend uses scrypt N=131072, r=8, p=1, a 16-byte random salt, and a 64-byte hash. These settings differ from the older local JSON login. Do not import old hashes into the new login table without a versioned migration/reset flow.

Expected checks: valid registration 201; duplicate case-insensitive email 409; invalid fields or client-supplied role 400; incorrect/missing Origin 403; malformed JSON 400; wrong content type 415; oversized JSON 413. The PostgreSQL backend has not been run against a live database. Before public exposure add persistent registration/login throttling; an Origin check alone does not prevent automated signup abuse.

## Privacy

Secrets belong only in server environment variables. No original account data, .env files, logs, runtimes, or generated archives are included in this repository. Custom-login APIs must enforce ownership; a privileged PostgreSQL connection does not automatically inherit a browser user's identity.
