# Direct Google sign-in — setup and handoff

The app uses Auth.js with Google OpenID Connect and Postgres-backed sessions (Supabase in production, embedded PGlite locally). It does not use the old password/demo form or ChatGPT identity headers. Google sign-in is not live until real OAuth credentials are configured and a real Google account has completed the end-to-end check.

## 1. Create the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create the project for The One Core.
2. In **Google Auth Platform → Branding**, configure the application name, support email and developer contact. Use your real contact details; do not use the preview test address.
3. Under **Audience**, choose Internal only if all users belong to your Google Workspace organization. Otherwise choose External, leave the app in Testing during setup, and add your Google email under test users.
4. Under **Clients**, create a **Web application** OAuth client.
5. Add this exact local **Authorized redirect URI**:

   `http://127.0.0.1:5173/api/auth/callback/google`

   The app uses server redirects, not the Google browser JavaScript SDK, so a JavaScript origin is not required for this flow. Do not substitute `localhost` unless you also change AUTH_URL and the browser URL consistently.
6. Obtain the client ID and client secret. Do not paste the secret into chat, commit it, or put it in frontend code.

Only `openid email profile` scopes are requested. No Gmail, Drive or Calendar access is requested.

## 2. Add credentials locally

An ignored, owner-readable `.env` already contains the local AUTH_URL and a randomly generated session-protection secret. Fill in only these two empty values:

```dotenv
AUTH_GOOGLE_ID=your-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-client-secret
```

The complete key list is in `.env.example`. None of these keys should be prefixed with `VITE_` or `NEXT_PUBLIC_`. 

Run `npm run auth:check` to check presence and URL format without printing secrets, then restart the local preview. Open `http://127.0.0.1:5173/` and click **Continuer avec Google**. For real Google OAuth, use a normal system browser if the embedded side browser is rejected by Google.

## 3. Verify the real flow

- Google shows the correct app name and only identity permissions.
- After consent, the same account returns to the same private workspace on later logins.
- Signing out invalidates that session in the database; a refresh cannot reopen the workspace.
- A second Google account cannot access the first account’s clients or team.
- Cancelling consent or using an expired login attempt shows an error, not a successful login.

The automated suite already exercises the real Auth.js handlers against a mocked Google transport, including state/PKCE/nonce, CSRF, verified emails, session hashing, expiry, logout and workspace isolation. That does not replace this final real-provider verification.

## 4. Data

The Supabase database starts empty: the first Google sign-in creates the user, its workspace and the owner membership. Nothing is migrated from the earlier deployments; if any of them held real data, export it deliberately and import it after choosing which Google identity owns it.

## 5. Production on Vercel

- Set `AUTH_URL` to the exact HTTPS origin (for example `https://tracker.theonecore.ma`), plus `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` as Vercel environment variables. Never commit them.
- Register the exact production `/api/auth/callback/google` URL in the same Google client (or a separate production client).
- Publish the consent screen so clients’ Google accounts can sign in without being listed as test users; the scopes requested need no verification review.
- Repeat the real-flow checks above on the production origin before inviting anyone.

Session cookies are HttpOnly, SameSite=Lax, and Secure with a `__Host-` prefix on HTTPS. Sessions last seven days and are stored as SHA-256 hashes; Google access/refresh/ID tokens are discarded instead of stored. Names and emails are not used to automatically link Google accounts; e-mail matching is used only to claim a pending invitation created by the studio.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Auth.js Google](https://authjs.dev/getting-started/providers/google), [Supabase connection strings](https://supabase.com/docs/guides/database/connecting-to-postgres).
