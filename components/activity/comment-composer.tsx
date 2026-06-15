"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { postComment } from "@/lib/activity/comments";
import { makeActor } from "@/lib/activity/log";

interface CommentComposerProps {
  packId: string;
  onCommentPosted?: () => void;
}

export function CommentComposer({ packId, onCommentPosted }: CommentComposerProps) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  if (!user) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || posting) return;

    try {
      setPosting(true);
      await postComment(packId, trimmed, makeActor(user));
      setText("");
      if (onCommentPosted) onCommentPosted();
    } catch (err) {
      console.error("Failed to post comment:", err);
      alert(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  const isOverLimit = text.length > 2000;

  return (
    <form onSubmit={handleSend} className="space-y-2">
      <div className="relative flex items-end gap-2 rounded-lg border bg-background p-1 focus-within:ring-1 focus-within:ring-ring">
        <textarea
          value={text}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
          placeholder="Write a message or comment…"
          className="min-h-[44px] max-h-[160px] flex-1 resize-none border-0 bg-transparent py-2.5 px-3 focus:outline-none focus:ring-0 text-sm shadow-none"
          disabled={posting}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
        />
        <div className="flex items-center gap-2 px-2 pb-1.5 shrink-0">
          <span
            className={`text-[10px] font-mono ${
              isOverLimit ? "text-destructive font-bold" : "text-muted-foreground"
            }`}
          >
            {text.length}/2000
          </span>
          <Button
            type="submit"
            size="icon"
            className="size-8 cursor-pointer rounded-md"
            disabled={posting || !text.trim() || isOverLimit}
          >
            {posting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span className="sr-only">Send comment</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
