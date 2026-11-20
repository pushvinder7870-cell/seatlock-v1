import type { Role } from './token';

/** Landing page after login, per role. */
export function homeFor(role: Role): string {
  return role === 'admin' ? '/admin' : '/events';
}
