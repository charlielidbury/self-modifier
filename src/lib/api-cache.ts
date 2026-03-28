/**
 * Server-side in-memory response cache with ETag / 304 support.
 *
 * Expensive API routes (e.g. those shelling out to git) can use `cachedJsonResponse()`
 * to avoid redundant work. Each entry is held for a configurable TTL. On subsequent
 * requests the computed content-hash is compared against the client's `If-None-Match`
 * header — if it matches, a lightweight 304 is returned with zero body.
 *
 * This is especially impactful for the self-improve panel, which polls many endpoints
 * every 1-5 seconds. Without caching, each poll triggers shell execs and file reads
 * that produce identical results until the next commit lands.
 */

import crypto from "crypto";

type CacheEntry = {
  data: unknown;
  etag: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

/** Compute a fast content hash for ETag generation. */
function contentHash(data: unknown): string {
  const json = JSON.stringify(data);
  return crypto.createHash("md5").update(json).digest("hex").slice(0, 16);
}

/**
 * Return a cached JSON response with ETag / 304 support.
 *
 * @param key     Unique cache key (typically the route path)
 * @param ttlMs   How long to cache (default: 5 000 ms)
 * @param compute Async function that produces the response data
 * @param req     The incoming Request (for If-None-Match header)
 */
export async function cachedJsonResponse(
  key: string,
  ttlMs: number,
  compute: () => Promise<unknown> | unknown,
  req?: Request,
): Promise<Response> {
  const now = Date.now();
  let entry = cache.get(key);

  // Check if cache is still fresh
  if (!entry || entry.expiresAt < now) {
    const data = await compute();
    const etag = `"${contentHash(data)}"`;
    entry = { data, etag, expiresAt: now + ttlMs };
    cache.set(key, entry);
  }

  // Check If-None-Match → return 304 if client already has this version
  if (req) {
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === entry.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: entry.etag,
          "Cache-Control": `private, max-age=${Math.ceil(ttlMs / 1000)}`,
        },
      });
    }
  }

  return new Response(JSON.stringify(entry.data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: entry.etag,
      "Cache-Control": `private, max-age=${Math.ceil(ttlMs / 1000)}`,
    },
  });
}

/**
 * Invalidate one or more cache keys. Call this when you know the underlying
 * data has changed (e.g. after a commit lands or a session completes).
 */
export function invalidateCache(...keys: string[]): void {
  for (const key of keys) {
    cache.delete(key);
  }
}

/** Invalidate all cache entries. Nuclear option. */
export function invalidateAll(): void {
  cache.clear();
}
