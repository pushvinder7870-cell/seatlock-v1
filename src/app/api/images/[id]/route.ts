import type { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/http';
import { readDbImage } from '@/lib/services/storage';

/** Serves images stored in Postgres. Content is immutable (random id), so it can be cached by the browser. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const img = await readDbImage(id);
    return new Response(new Uint8Array(img.data), {
      headers: {
        'Content-Type': img.mime,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (e) {
    return errorResponse(e, false, '/');
  }
}
