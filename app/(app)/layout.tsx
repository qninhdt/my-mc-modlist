"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isProtected = pathname.startsWith("/packs") || pathname.startsWith("/profile");

  useEffect(() => {
    if (!loading && !user && isProtected) {
      router.replace("/");
    }
  }, [user, loading, router, isProtected]);

  if (isProtected && (loading || !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }


  return <AppShell>{children}</AppShell>;
}
