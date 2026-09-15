import { authSettings, sessionSettings } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ googleConfigured: !!authSettings(), passwordConfigured: !!sessionSettings() }, { headers: { 'Cache-Control': 'no-store' } });
}
