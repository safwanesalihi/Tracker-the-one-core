import { sessionSettings } from '@/lib/auth';
import { env } from '@/lib/env';
import { mailConfigured } from '@/lib/mail';
export const dynamic = 'force-dynamic';
// Public, secret-free health check for the sign-in setup: which pieces of configuration are present.
export function GET() {
  return Response.json({
    passwordConfigured: !!sessionSettings(),
    ownerConfigured: !!(env.OWNER_EMAIL ?? '').trim() && !!(env.OWNER_PASSWORD ?? ''),
    mailConfigured: mailConfigured(),
    // Not a secret — it's the exact address every invitation e-mail and PDF already prints.
    authUrl: env.AUTH_URL ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
