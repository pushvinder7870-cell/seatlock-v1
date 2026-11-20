import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { verifyCsrf } from '@/lib/token';
import { errorResponse } from '@/lib/http';
import { ForbiddenError, UnauthorizedError, ValidationError } from '@/lib/errors';
import { uploadImage } from '@/lib/services/storage';

/** multipart/form-data { file } + X-CSRF-Token → { url }. Validation lives in uploadImage(). */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();
    if (!verifyCsrf(user.sessionId, req.headers.get('x-csrf-token'))) throw new ForbiddenError('Missing or invalid CSRF token.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ValidationError('No file uploaded.');
    const kind = form.get('kind') === 'event' ? 'event' : 'post';
    return Response.json(await uploadImage(user, file, kind), { status: 201 });
  } catch (e) {
    return errorResponse(e, false, '/community');
  }
}
