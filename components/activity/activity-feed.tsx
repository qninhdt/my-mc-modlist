"use client";

import { useActivity } from "@/lib/activity/use-activity";
import { ActivityEntry } from "./activity-entry";
import { CommentComposer } from "./comment-composer";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare, AlertCircle } from "lucide-react";

interface ActivityFeedProps {
  packId: string;
  isPackOwner: boolean;
  role: "editor" | "viewer" | undefined;
}

export function ActivityFeed({ packId, isPackOwner, role }: ActivityFeedProps) {
  const { entries, loading, error, hasMore, loadMore } = useActivity(packId);

  const isMember = role !== undefined;

  return (
    <div className="space-y-6">
      {/* 1. Comment Composer (Only visible to members) */}
      {isMember ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Post Comment / Update
          </h3>
          <CommentComposer packId={packId} />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground bg-muted/5">
          <AlertCircle className="size-4 text-amber-500 shrink-0" />
          <span>You must be a member of this modpack to comment.</span>
        </div>
      )}

      {/* 2. Feed Timeline */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="size-3.5" />
          Activity & Comments
        </h3>

        {error && (
          <div className="p-3 text-xs text-destructive bg-destructive/5 rounded-lg border border-destructive/10">
            Failed to load activity feed: {error.message}
          </div>
        )}

        {entries.length === 0 && !loading && !error && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No activity or comments logged yet.
          </div>
        )}

        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1 divide-y divide-muted/30">
          {entries.map((entry, idx) => (
            <div
              key={entry.id}
              className={`pt-3 first:pt-0 ${
                entry.type === "comment" ? "" : "border-t border-muted/20"
              }`}
            >
              <ActivityEntry
                entry={entry}
                isPackOwner={isPackOwner}
              />
            </div>
          ))}
        </div>

        {/* Load More Button */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loading}
              className="text-xs px-4 h-8 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : null}
              Load Older Activity
            </Button>
          </div>
        )}

        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
