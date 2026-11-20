import { apiRoute } from '@/lib/http';
import { logout } from '@/lib/services/auth';
import { clearSessionCookie } from '@/lib/session';

export const POST = apiRoute(async ({ user }) => {
  await logout(user);
  await clearSessionCookie();
  return { redirect: '/login', notice: 'logged_out' };
});
