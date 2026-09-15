import { redirect } from 'next/navigation';
import Login from '@/app/login';
import { getAppUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Someone who already holds a valid session belongs in the studio, not on the sign-in form.
export default async function LoginPage() {
  const user = await getAppUser().catch(() => null);
  if (user && !user.mustChangePassword) redirect('/#home');
  return <Login initialStep={user?.mustChangePassword ? 'change-password' : 'sign-in'} email={user?.email} />;
}
