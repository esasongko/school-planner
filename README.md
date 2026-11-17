# School Planner

Mobile-first PWA for tracking a student's **Homework, ULHA (Ulangan Harian), UTS (Ujian Tengah Semester) and UAS (Ujian Akhir Semester)**. He adds and edits items by
**chatting** (a Claude tool-use agent writes to the database); list and calendar views plus **push reminders** keep him on track.

```
Chat ──► /api/chat ──► agent (Claude API, tool use) ──► lib/items.ts ──► Postgres (Neon)
List/Calendar ─► /api/items ────────────────────────────────────┘
Vercel cron (daily 07:00 MYT) ─► /api/cron/reminders ─► Web Push ─► phones
Google sign-in (OAuth + PKCE) ─► signed session cookie ─► allowlist decides who gets in, and as what role
```

## Roles
Set in `AUTH_ALLOWLIST` (`email:role,email:role`). Anyone else is refused, even with a valid Google account.
- **admin (parent):** everything, including deleting any item.
- **child (student):** add, edit, mark done; can delete only items he created himself.

Changing the allowlist takes effect immediately (roles are checked on every request) and stops push reminders to removed users.

## Reminders
Homework: 1 day before + the day. ULHA: 3d, 1d, 0d. UTS/UAS: 7d, 3d, 1d, 0d.
Each is sent once (`reminders_sent`); rescheduling re-arms them. Vercel Hobby allows only daily crons, hence 07:00 MYT.

## Deploy (Vercel + Neon)
1. **Neon:** create a project (region: Singapore), copy the connection string -> `DATABASE_URL`.
2. **Google OAuth:** Google Cloud Console -> APIs & Services -> Credentials -> *OAuth client ID* (Web application).
   Authorized redirect URI: `https://<your-domain>/api/auth/callback` (add `http://localhost:3000/api/auth/callback` for local dev).
   Configure the consent screen; while it's in *Testing*, add both emails as test users (or publish it).
3. **Vercel:** import the project, add every variable from `.env.example` (`APP_URL` = your final URL), deploy.
4. **Migrate once:** `DATABASE_URL=... npm run db:migrate` (safe to re-run; upgrades older data).
5. On his phone: open the site, sign in, **Add to Home Screen** (needed for push on iPhone), tap "Turn on reminders".

## Tests
`npm test` (logic) and `npm run e2e` (sign-in + roles against a running server with a fake Google).
Both need a **scratch** `DATABASE_URL`: they truncate tables. See the header of `scripts/e2e.ts` for the setup.
