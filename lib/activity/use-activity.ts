import { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { ActivityEntry } from "./types";

/**
 * Real-time Paginated hook for pack activities.
 * Ordered by createdAt (descending: newest first).
 */
export function useActivity(packId: string, initialLimit = 15) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [pageSize, setPageSize] = useState(initialLimit);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!packId) return;

    setLoading(true);
    const q = query(
      collection(db, "modpacks", packId, "activity"),
      orderBy("createdAt", "desc"),
      limit(pageSize)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: ActivityEntry[] = [];
        snap.forEach((d) => {
          list.push({
            id: d.id,
            packId,
            ...d.data(),
          } as ActivityEntry);
        });

        setEntries(list);
        setLoading(false);
        // If we fetched fewer items than the current limit, there are no more entries
        setHasMore(snap.size === pageSize);
      },
      (err) => {
        console.error("Activity hook snapshot error:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [packId, pageSize]);

  const loadMore = () => {
    if (!loading && hasMore) {
      setPageSize((prev) => prev + 15);
    }
  };

  return {
    entries,
    loading,
    error,
    hasMore,
    loadMore,
  };
}
