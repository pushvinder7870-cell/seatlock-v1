import 'server-only';
import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import { AppError, NotFoundError, ValidationError } from '../errors';
import type { CurrentUser } from '../session';
import { hit } from './ratelimit';

/*
 * Image uploads (post images + event cover photos).
 *
 * The browser sends the file to OUR API; the server validates it, then stores it:
 *   - Supabase Storage, if SUPABASE_URL + a key are configured (key never leaves the server)
 *   - otherwise PostgreSQL (`images` table, served by GET /api/images/:id)
 * so photos work everywhere, including a fresh local setup.
 *
 * Checks:
 *   1. signed-in user + CSRF + rate limit (10 uploads / 10 min)
 *   2. size ≤ 4 MB (also under Vercel's 4.5 MB request limit)
 *   3. MAGIC-BYTE SNIFFING: the first bytes must be a real PNG/JPEG/GIF/WebP
 *      signature; the client's filename and Content-Type are ignored, so a
 *      renamed .html/.svg/.exe can't be smuggled in as an "image"
 *   4. random object names (UUID): no path traversal, no overwrites
 */

const MAX_BYTES = 4 * 1024 * 1024;

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

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const bucket = process.env.SUPABASE_BUCKET ?? 'post-images';
  return url && key ? { url, key, bucket } : null;
}

/** Uploads always work: Supabase if configured, otherwise the database. */
export function imageUploadsEnabled() {
  return true;
}

/** Public URL prefix of Supabase-stored images (null when not configured). */
export function publicImagePrefix(): string | null {
  const c = supabase();
  return c ? `${c.url}/storage/v1/object/public/${c.bucket}/` : null;
}

const DB_IMAGE_RE = /^\/api\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Only images WE stored may be attached to posts/events: no arbitrary
 * third-party URLs (tracking pixels, mixed content, CSP bypasses).
 * Returns null for empty input.
 */
export function assertOwnImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (DB_IMAGE_RE.test(url)) return url;
  const prefix = publicImagePrefix();
  if (prefix && url.startsWith(prefix) && /^[\w\-/.]+$/.test(url.slice(prefix.length))) return url;
  throw new ValidationError('Invalid image.');
}

export async function uploadImage(user: CurrentUser, file: File, kind: 'post' | 'event' = 'post'): Promise<{ url: string }> {
  if (file.size === 0) throw new ValidationError('Empty file.');
  if (file.size > MAX_BYTES) throw new ValidationError('Image is too large (max 4 MB).');
  await hit(`upload:${user.id}`, 10, 600, 'Too many uploads. Try again in a few minutes.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) throw new ValidationError('Only PNG, JPEG, GIF or WebP images are allowed.');

  const c = supabase();
  if (!c) {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO images (uploader_id, mime, size_bytes, data) VALUES ($1, $2, $3, $4) RETURNING id',
      [user.id, sig.type, bytes.length, Buffer.from(bytes)]
    );
    return { url: `/api/images/${rows[0].id}` };
  }

  const path = `${kind}s/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${sig.ext}`;
  const res = await fetch(`${c.url}/storage/v1/object/${c.bucket}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, apikey: c.key, 'Content-Type': sig.type, 'x-upsert': 'false', 'cache-control': '31536000' },
    body: bytes,
  });
  if (!res.ok) {
    console.error('Supabase upload failed', res.status, await res.text().catch(() => ''));
    throw new AppError(502, 'UPLOAD_FAILED', 'Could not store the image. Please try again.');
  }
  return { url: `${publicImagePrefix()}${path}` };
}

/** Reads a database-stored image (for GET /api/images/:id). */
export async function readDbImage(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError('Image not found.');
  const { rows } = await pool.query<{ mime: string; data: Buffer }>('SELECT mime, data FROM images WHERE id = $1', [id]);
  if (!rows[0]) throw new NotFoundError('Image not found.');
  return rows[0];
}
