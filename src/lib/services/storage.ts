import 'server-only';
import { randomUUID } from 'node:crypto';
import { AppError, ValidationError } from '../errors';
import type { CurrentUser } from '../session';
import { hit } from './ratelimit';

/*
 * Image uploads → Supabase Storage (server-side).
 *
 * The browser sends the file to OUR API; the server checks it and uploads it
 * with a key that never leaves the server. Checks:
 *   1. signed-in user + CSRF (apiRoute) + rate limit (10 uploads / 10 min)
 *   2. size ≤ 5 MB
 *   3. MAGIC-BYTE SNIFFING: the first bytes must be a real PNG/JPEG/GIF/WebP
 *      signature. We ignore the client's filename and Content-Type, so a
 *      renamed .html/.svg/.exe can't be smuggled in as an "image".
 *   4. random object name (UUID) → no path traversal, no overwrites.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY if the
 * bucket has an insert policy), SUPABASE_BUCKET (default "post-images", public).
 * Without them the feature is simply hidden.
 */

const MAX_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/gif', ext: 'gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    type: 'image/webp',
    ext: 'webp',
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const bucket = process.env.SUPABASE_BUCKET ?? 'post-images';
  return url && key ? { url, key, bucket } : null;
}

export function imageUploadsEnabled() {
  return config() !== null;
}

/** Public URL prefix every stored image starts with (used to validate image_url on posts). */
export function publicImagePrefix(): string | null {
  const c = config();
  return c ? `${c.url}/storage/v1/object/public/${c.bucket}/` : null;
}

export async function uploadImage(user: CurrentUser, file: File): Promise<{ url: string }> {
  const c = config();
  if (!c) throw new AppError(501, 'UPLOADS_DISABLED', 'Image uploads are not configured on this server.');
  if (file.size === 0) throw new ValidationError('Empty file.');
  if (file.size > MAX_BYTES) throw new ValidationError('Image is too large (max 5 MB).');
  await hit(`upload:${user.id}`, 10, 600, 'Too many uploads. Try again in a few minutes.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = SIGNATURES.find((s) => s.test(bytes));
  if (!kind) throw new ValidationError('Only PNG, JPEG, GIF or WebP images are allowed.');

  const path = `posts/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${kind.ext}`;
  const res = await fetch(`${c.url}/storage/v1/object/${c.bucket}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, apikey: c.key, 'Content-Type': kind.type, 'x-upsert': 'false', 'cache-control': '31536000' },
    body: bytes,
  });
  if (!res.ok) {
    console.error('Supabase upload failed', res.status, await res.text().catch(() => ''));
    throw new AppError(502, 'UPLOAD_FAILED', 'Could not store the image. Please try again.');
  }
  return { url: `${publicImagePrefix()}${path}` };
}
