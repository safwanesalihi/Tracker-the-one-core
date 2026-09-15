import { sessionSettings } from '@/lib/auth';
import { mailConfigured } from '@/lib/mail';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ passwordConfigured: !!sessionSettings(), mailConfigured: mailConfigured() }, { headers: { 'Cache-Control': 'no-store' } });
}
