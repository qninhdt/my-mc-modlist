"use client";

import { useState } from "react";
import { Mail, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InviteFormProps {
  onInviteAction: (email: string, role: "editor" | "viewer") => Promise<void>;
  disabled: boolean;
}

export function InviteForm({ onInviteAction, disabled }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Email address is required.");
      return;
    }

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      await onInviteAction(trimmedEmail, role);
      setEmail("");
    } catch (err: any) {
      setError(err?.message || "Failed to send invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="collaborator@example.com"
            disabled={disabled || submitting}
            className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            required
          />
        </div>
        
        <div className="flex gap-2 shrink-0">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
            disabled={disabled || submitting}
            className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="editor">Editor (Can edit)</option>
            <option value="viewer">Viewer (Read-only)</option>
          </select>

          <Button type="submit" disabled={disabled || submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-1.5 size-4" />
                Invite
              </>
            )}
          </Button>
        </div>
      </div>
      
      {error && (
        <p className="text-xs text-destructive font-medium">{error}</p>
      )}
    </form>
  );
}
