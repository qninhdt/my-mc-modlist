"use client";

import { useState } from "react";
import {
  PlusCircle,
  MinusCircle,
  ArrowUpCircle,
  History,
  UserPlus,
  UserMinus,
  Settings,
  Trash2,
  Loader2,
  MessageSquare,
} from "lucide-react";
import type { ActivityEntry as EntryType } from "@/lib/activity/types";
import { useAuth } from "@/lib/auth/use-auth";
import { deleteComment } from "@/lib/activity/comments";
import { Button } from "@/components/ui/button";

interface ActivityEntryProps {
  entry: EntryType;
  isPackOwner: boolean;
  onDeleted?: () => void;
}

function formatRelativeTime(dateInput: any): string {
  if (!dateInput) return "just now";
  let date: Date;
  if (typeof dateInput.toDate === "function") {
    date = dateInput.toDate();
  } else if (dateInput.seconds) {
    date = new Date(dateInput.seconds * 1000);
  } else {
    date = new Date(dateInput);
  }
  
  if (isNaN(date.getTime())) return "just now";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ActivityEntry({ entry, isPackOwner, onDeleted }: ActivityEntryProps) {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const isComment = entry.type === "comment";
  const isAuthor = user?.uid === entry.actor.uid;
  const canDelete = isComment && (isAuthor || isPackOwner);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      setDeleting(true);
      await deleteComment(entry.packId, entry.id);
      if (onDeleted) onDeleted();
    } catch (err) {
      console.error("Failed to delete comment:", err);
      alert("Failed to delete comment");
    } finally {
      setDeleting(false);
    }
  };

  const timeStr = formatRelativeTime(entry.createdAt);

  // Render comments as chat bubbles
  if (isComment) {
    return (
      <div className="flex gap-3 text-sm group">
        {entry.actor.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.actor.photoURL}
            alt=""
            className="size-8 rounded-full bg-secondary shrink-0 object-cover mt-0.5"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="size-8 rounded-full bg-secondary shrink-0 flex items-center justify-center font-semibold text-xs mt-0.5">
            {entry.actor.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground">
              {entry.actor.displayName}
            </span>
            <span className="text-[10px] text-muted-foreground">{timeStr}</span>
          </div>
          <div className="relative inline-block rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground max-w-[90%] break-words">
            <p className="whitespace-pre-wrap">{entry.payload.text}</p>
          </div>
        </div>
        {canDelete && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive cursor-pointer"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span className="sr-only">Delete comment</span>
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Render system/auto events as inline timeline items
  let icon = <MessageSquare className="size-4 text-muted-foreground" />;
  let textContent = null;

  switch (entry.type) {
    case "mod_added":
      icon = <PlusCircle className="size-4 text-emerald-500" />;
      textContent = (
        <span>
          added mod <span className="font-semibold text-foreground">{entry.payload.modName}</span>
          {entry.payload.viaDependency && (
            <span className="text-muted-foreground text-xs italic ml-1">
              (as dependency)
            </span>
          )}
        </span>
      );
      break;
    case "mod_removed":
      icon = <MinusCircle className="size-4 text-destructive" />;
      textContent = (
        <span>
          removed mod <span className="font-semibold text-foreground">{entry.payload.modName}</span>
        </span>
      );
      break;
    case "version_updated":
      icon = <ArrowUpCircle className="size-4 text-sky-500" />;
      textContent = (
        <span>
          updated mod <span className="font-semibold text-foreground">{entry.payload.modName}</span> version from{" "}
          <span className="font-mono text-xs text-muted-foreground px-1 bg-muted rounded">
            {entry.payload.fromVersion || "unpinned"}
          </span>{" "}
          to{" "}
          <span className="font-mono text-xs text-foreground px-1 bg-primary/10 text-primary rounded">
            {entry.payload.toVersion}
          </span>
        </span>
      );
      break;
    case "snapshot_restored":
      icon = <History className="size-4 text-amber-500" />;
      textContent = (
        <span>
          restored snapshot{" "}
          <span className="font-semibold text-foreground">{entry.payload.snapshotName}</span>
        </span>
      );
      break;
    case "member_joined":
      icon = <UserPlus className="size-4 text-teal-500" />;
      textContent = (
        <span>
          joined the modpack as{" "}
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium capitalize">
            {entry.payload.role}
          </span>
        </span>
      );
      break;
    case "role_changed":
      icon = <Settings className="size-4 text-indigo-500" />;
      textContent = (
        <span>
          changed role of collaborator{" "}
          <span className="font-semibold text-foreground">{entry.payload.text}</span> to{" "}
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium capitalize">
            {entry.payload.role}
          </span>
        </span>
      );
      break;
    case "member_left":
      icon = <UserMinus className="size-4 text-destructive" />;
      textContent = (
        <span>
          collaborator <span className="font-semibold text-foreground">{entry.payload.text}</span> left or was removed from the modpack
        </span>
      );
      break;
  }

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground py-1 px-1">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 truncate">
        <span className="font-medium text-foreground mr-1.5">
          {entry.actor.displayName}
        </span>
        {textContent}
      </div>
      <div className="shrink-0 text-[10px] text-muted-foreground/60">{timeStr}</div>
    </div>
  );
}
