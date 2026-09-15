# The One Core — Tracker

The One Tracker runs **The One Flow** for the studio and its clients, without ClickUp: the four-status workflow, the timed validation clock, the revision budget, the frozen calendar week, the evergreen reserve, a request form, a real client portal (FR / AR, RTL) and the six numbers that tell whether the system works.

## The One Flow — what the app enforces

Every rule lives in one file, [lib/flow.ts](lib/flow.ts), as pure functions with the constants at the top. The API applies them; the Dashboard page and the contract annex read them. Change a number there and the app, the receipts and the annex agree.

| Rule | Where it bites |
|---|---|
| **48 h validation, silence is approval** | Sending a deliverable stores `approvalDueAt` (never recomputed). The sweep auto-validates at the deadline with a `silence` receipt, after reminders at 24 h and 6 h left. |
| **2 consolidated revision rounds** | Each client “request changes” increments `revisionRound`; round 3+ is flagged *hors forfait* on the task, the table and the Dashboard. Internal rejections are not counted. |
| **J−7 lock** | Creating or moving an item into the coming 7 days is refused for creatives and needs an explicit, logged override (`lockOverride`) from an admin. Past dates are backfills and stay free. |
| **Four backward gates** | From the publish date `due`: brief validé J−14 · envoi au client J−7 · validation J−5 · prêt à publier J−1. Shown on the task page with reached / late state. |
| **Court** (who must act) | Derived from status, never typed: Studio / Client / Terminé. Chip on every row, board card and in the Dashboard; filterable. |
| **Evergreen reserve** | Validated, undated, unpublished items count toward ≥ 3 per client. Dating one takes it out of the reserve. |
| **Request bank** | The portal form creates an `À faire` task with `source: Portail` and a `request` stamp; the studio sees it on the home page and in the Dashboard. |
| **J−1 sweep / J−7 alerts** | Studio-only events for items publishing tomorrow that aren’t validated, and items inside the lock window not yet sent. |
| **Sign-off receipt** | Every validation (explicit, silence or studio) writes `signOff` — who, e-mail, when, mode, rounds used — shown to both sides. |
| **Single channel** | Comments on the task. Client feedback is posted as `[Retours client — tour N]`. The app sends no e-mail, SMS or WhatsApp. |

### The six numbers (Dashboard page)

On-time publish rate (≥ 95 %), median client validation time (< 24 h, explicit decisions only), share validated by silence (watch > 30 %), revision rounds per item (≤ 1,4), delivered vs sold (100–105 %, from each client’s `quota`), evergreen reserve (≥ 3 per client). Computed by `computeMetrics` for this month, last month or 30 days.

### Clocks

- **Lazily**: every authenticated read or write runs the sweep for that workspace first, so the app is correct even with no scheduler.
- **Vercel Cron**: [vercel.json](vercel.json) calls `GET /api/flow/sweep` once a day at 06:00 UTC (the most the Hobby plan allows); Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set in the project. On Pro, change the schedule to `*/15 * * * *`. The lazy sweep keeps the app correct in between; a daily cron only means reminders can wait until the next visit or the next morning.
- Any other scheduler can call the same route with the same bearer token.

### Roles and the client portal

Roles: **owner** (unique — the `OWNER_EMAIL` account), **admin** (optional delegated manager: everything but the owner role and client creation), **member** (`creative`: moves forward the tasks assigned to them or not yet assigned — enforced server-side by `memberView` — comments and manages sub-projects, sees the team read-only; does not create or edit clients, does not create tasks, has no Dashboard, cannot archive or act as the client in the portal preview), **viewer** (read-only, legacy), and **client**. `owner · admin · viewer` see the whole studio. A **`client`** member is scoped to one client (`workspace_members.client_id`) and only ever sees the portal: home, à valider, calendrier, livrables, demande and the review page with the countdown. Internal fields (assignee, source, reminders, studio links) are stripped server-side (`portalView`). Clients can approve, request changes, comment and submit requests — nothing else.

**Languages**: the whole app — studio, client portal, sign-in and the contract annex — is available in French, English and Arabic (RTL). The FR / EN / AR toggle lives in each person’s settings (click your picture in the sidebar) and on the sign-in screen; the choice is remembered per browser (`the-one.locale`). A client who never chose a language starts in the language recorded on their client file. French is the source language: UI strings are translated through `lib/i18n` (English and Arabic dictionaries keyed by the French text, so an untranslated string falls back to French rather than breaking); the portal keeps its structured copy in `lib/portal-i18n.ts`. Data (task names, briefs, comments) is shown as typed. Invitation e-mails are still sent in French.

**Client creation**: only the owner can add clients or load demo clients. Admins, creatives, viewers and clients cannot create clients.

**Accounts and invitations**: there is no sign-up page. The owner (`OWNER_EMAIL`) signs in with `OWNER_PASSWORD` the first time and should change it in the app. Owners/admins invite people from Équipe → *Inviter une personne* (name, e-mail, role, and the client for portal access): the account is created immediately with a **temporary password**, e-mailed from the studio's Gmail (`GMAIL_USER` + `GMAIL_APP_PASSWORD`) — or shown once on the Team page when mail isn't configured. At first login the person must choose their own password; until then the app refuses every request (`password-change-required`). *Renvoyer / Réinitialiser* on a member issues a new temporary password and closes their sessions — that is the "forgot my password" path. Clicking your picture at the bottom of the sidebar opens **Paramètres** (studio and portal alike): profile picture (uploaded as an `avatar` asset, squared and resized in the browser), display name, the FR / EN / AR language toggle and sign-out. The greeting, roster, comments and validation receipts use that name and picture — the seeded owner starts as the studio name, so set yours once.

The portal follows the client record’s `language`: `العربية` renders right-to-left with Arabic copy ([lib/portal-i18n.ts](lib/portal-i18n.ts)).

### Contract annex

`#annex` (or *Annexe contractuelle* on a client page) prints the Phase 0 annex with the live numbers from `lib/flow.ts`.

### API actions added

`approve`, `request-changes`, `publish` (`day` optional), `request` (`clientId` for studio use, `data`), `invite-member`, `mark-read`; `set-member-role` accepts `clientId` for the client role; `create`/`update` accept `lockOverride` and return `code: "lock"` (409 admin / 403 creative) when the J−7 lock applies. `GET /api/records` also returns `workspaces` and `today` (Africa/Casablanca).

### Not done, on purpose

- No e-mail/WhatsApp delivery of reminders or invitations — reminders are in-app events and the portal countdown; pick a provider (Resend, Brevo…) to add delivery on top of the existing events.
- Reminders are not e-mailed (only invitations are). The same Gmail sender could carry them; it is a small addition on top of the existing events.
- Working-day calendars and holidays are not modelled: 48 h is 48 calendar hours, as the costs doc specifies.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router) on **Vercel** |
| Database | **Supabase Postgres** through `postgres.js` — one small `Db` interface in [lib/database.ts](lib/database.ts) |
| Local dev / tests | **PGlite** (embedded Postgres) in `.data/pglite` when `DATABASE_URL` is empty; tests run on a fresh in-memory PGlite |
| Schema | Drizzle `pg-core` ([db/schema.ts](db/schema.ts)); migrations in `drizzle/`, applied with `pnpm db:migrate` |
| Auth | **E-mail + password only** ([lib/password-auth.ts](lib/password-auth.ts): scrypt hashes, 5-attempt lockout, hashed session tokens). No self sign-up: the owner is seeded from `OWNER_EMAIL`/`OWNER_PASSWORD`, everyone else is invited with a temporary password |

`records.data` is `jsonb`; clients, projects, tasks, comments and events share that table with a `kind`.

## Local development

```sh
pnpm install
cp .env.example .env      # set OWNER_EMAIL / OWNER_PASSWORD
pnpm dev                  # http://127.0.0.1:5173 — embedded Postgres, no Supabase needed
pnpm test                 # 6 suites on in-memory Postgres
```

Delete `.data/` to start from an empty local database.

## Supabase

1. Create the project (business Google account). In **Project settings → Database**, copy two URIs:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL` — used by the app at runtime.
   - **Direct / session** (port `5432`) → `DIRECT_URL` — used by migrations only.
2. Apply the schema:
   ```sh
   pnpm db:migrate
   ```
   Drizzle records applied migrations in the `drizzle.__drizzle_migrations` table; re-running is safe.
3. After a schema change in `db/schema.ts`: `pnpm db:generate` then `pnpm db:migrate`.

Security: migration `0002_lock_down_postgrest` enables RLS on every table (no policies) and revokes all grants from the `anon`/`authenticated` API roles — the app only ever connects as the owner role and never uses the Supabase REST API, so the public anon key gives access to nothing. Re-run `pnpm db:migrate` after adding tables; the default privileges are altered so new tables stay closed.

Backups: Supabase Pro takes daily backups; `pg_dump "$DIRECT_URL" > backup.sql` works from any machine.

## Vercel

1. Import the repository; framework preset **Next.js**, build `pnpm build`.
2. Environment variables (Production): `AUTH_URL=https://<your-domain>`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET` (32+ random chars).
3. The cron in [vercel.json](vercel.json) is picked up on deploy.

Sign-in works on every https address the app is served from (the custom domain and the `*.vercel.app` address alike): the guard is a same-origin check. `AUTH_URL` is the canonical public address — it sets the cookie's Secure flag and the links in invitation e-mails — so set it to the domain you give people.

## Team backend

The Team page reads workspace memberships from Postgres. Owners and administrators can invite people, change another existing member’s role or remove access. The owner is protected, self-modification is blocked, and creative/viewer/client roles cannot manage membership. Removing access preserves records and contributions.

- `GET /api/records` returns `records`, the current `user` (including `id`), `workspace`, `members`, `workspaces` and `today`. Names and emails are synced from authenticated identity on access.
- Once an active workspace is loaded, the frontend sends `X-Workspace-Id` on reads and writes. The server verifies membership and rejects a revoked or unauthorized workspace rather than silently writing to another one.
- Membership mutations use `action: "set-member-role"` (with `role`, and `clientId` for the client role), `action: "remove-member"`, or `action: "invite-member"`. A conflicting role returns 409; refresh before retrying.
- Run `pnpm test` for the API checks (records, auth, team, images) plus the flow rules ([tests/flow.mjs](tests/flow.mjs)) and the flow API ([tests/flow-api.mjs](tests/flow-api.mjs)). Tests never touch `.data/` or Supabase.

## Scripts

- `pnpm dev` — Next.js dev server on `127.0.0.1:5173`
- `pnpm build` / `pnpm start` — production build and server
- `pnpm test` — all suites
- `pnpm lint`
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations
- `pnpm auth:check` — validates the `.env` auth values without printing secrets
