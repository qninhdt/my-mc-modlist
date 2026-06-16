import { Redis } from "@upstash/redis";

export type CacheTier = "detail" | "search";

const TTL_SECONDS: Record<CacheTier, number> = {
  detail: 6 * 60 * 60, // 6h — project/version/tag lookups change rarely
  search: 10 * 60, // 10min — search results, kept fresh-ish
};

// Lazy initialize Redis to prevent initialization errors if env vars are missing
let redisInstance: Redis | null = null;
function getRedis() {
  if (!redisInstance) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env variables");
    }
    redisInstance = new Redis({ url, token });
  }
  return redisInstance;
}

// Normalize key to a safe, collision-resistant identifier
function safeDocId(key: string): string {
  const normalized = key.toLowerCase().trim();
  const cleaned = normalized.replace(/[^a-z0-9._-]+/g, "_");
  if (cleaned.length <= 200) return cleaned;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `${cleaned.slice(0, 180)}_${(hash >>> 0).toString(36)}`;
}

// Returns the cached payload if present and still fresh, else null.
export async function cacheGet<T>(tier: CacheTier, key: string): Promise<T | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null; // Silent fallback to API fetch if Redis is not configured
  }
  try {
    const redisKey = `cache:${tier}:${safeDocId(key)}`;
    const redis = getRedis();
    const data = await redis.get<T>(redisKey);
    return data;
  } catch (err) {
    console.warn(`[Redis Cache Error] Failed to get key "${key}":`, err);
    return null;
  }
}

export async function cacheSet(tier: CacheTier, key: string, payload: unknown): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return;
  }
  try {
    const redisKey = `cache:${tier}:${safeDocId(key)}`;
    const ttl = TTL_SECONDS[tier];
    const redis = getRedis();
    await redis.set(redisKey, payload, { ex: ttl });
  } catch (err) {
    console.warn(`[Redis Cache Error] Failed to set key "${key}":`, err);
  }
}

// Wraps a fetcher with cache-aside semantics: serve fresh cache, else fetch + store.
export async function cached<T>(
  tier: CacheTier,
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet<T>(tier, key);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  await cacheSet(tier, key, fresh);
  return fresh;
}
