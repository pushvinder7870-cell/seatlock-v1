import { apiRoute, str } from '@/lib/http';
import { updateUser } from '@/lib/services/users';

export const POST = apiRoute<{ id: string }>(async ({ user, params, body }) => {
  const r = await updateUser(user, params.id, {
    role: str(body, 'role'),
    isActive: ['on', 'true', '1'].includes(str(body, 'isActive')),
  });
  return { json: r, redirect: '/admin/users', notice: 'user_updated' };
});
