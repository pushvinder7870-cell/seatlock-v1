import 'server-only';
import { forbidden, notFound, redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './session';
import { ForbiddenError, NotFoundError } from './errors';

/** For server-rendered pages: the logged-in user, or a redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Runs a service call for a page and maps authorization failures onto real
 * HTTP responses: ForbiddenError -> 403 (already audited by the service),
 * NotFoundError -> 404.
 */
export async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ForbiddenError) forbidden();
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
