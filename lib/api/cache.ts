import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

// Server-side Firestore cache mirror. Every upstream API read flows through this
// so 1000 users share one cached copy instead of each hitting ModpackIndex
// (3,600 req/hr total cap) or Modrinth (300 req/min per IP — all users egress the
// one Vercel IP). Tiered TTL: ID/detail lookups cache long (bounded key space),
// search queries cache short and the collection is capped (unbounded query strings).

export type CacheTier = "detail" | "search";

const TTL_SECONDS: Record<CacheTier, number> = {
  detail: 6 * 60 * 60, // 6h — project/version/tag lookups change rarely
  search: 10 * 60, // 10min — search results, kept fresh-ish
};

// Firestore doc IDs can't contain "/" and cap at 1500 bytes. Normalize any key
// (URLs, query strings) to a safe, bounded, collision-resistant id.
function safeDocId(key: string): string {
  const normalized = key.toLowerCase().trim();
  // Replace unsafe chars; if too long, suffix with a hash to keep it unique.
  const cleaned = normalized.replace(/[^a-z0-9._-]+/g, "_");
  if (cleaned.length <= 200) return cleaned;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `${cleaned.slice(0, 180)}_${(hash >>> 0).toString(36)}`;
}

type CacheDoc = {
  payload: unknown;
  fetchedAt: Timestamp;
  ttlSeconds: number;
};

function cacheRef(tier: CacheTier, key: string) {
  return adminDb().collection("cache").doc(`${tier}_${safeDocId(key)}`);
}

// Returns the cached payload if present and still fresh, else null.
export async function cacheGet<T>(tier: CacheTier, key: string): Promise<T | null> {
  const snap = await cacheRef(tier, key).get();
  if (!snap.exists) return null;
  const data = snap.data() as CacheDoc | undefined;
  if (!data) return null;
  const ageMs = Date.now() - data.fetchedAt.toMillis();
  if (ageMs > data.ttlSeconds * 1000) return null;
  return data.payload as T;
}

export async function cacheSet(tier: CacheTier, key: string, payload: unknown): Promise<void> {
  const doc: CacheDoc = {
    payload,
    fetchedAt: Timestamp.now(),
    ttlSeconds: TTL_SECONDS[tier],
  };
  await cacheRef(tier, key).set(doc);
}

// Wraps a fetcher with cache-aside semantics: serve fresh cache, else fetch +
// store. The fetcher runs only on miss/stale, so it's where the upstream call lives.
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
