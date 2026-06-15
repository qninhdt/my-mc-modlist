"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav } from "@/components/layout/user-nav";
import { Footer } from "@/components/layout/footer";
import { DoodleBackground } from "@/components/landing/doodle-background";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLogin = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user") {
        console.error("Authentication failed:", err);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col relative">
      <DoodleBackground />
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="MMCM Logo"
                width={28}
                height={28}
                className="rounded-md shrink-0"
                priority
              />
              <span className="font-display text-xs sm:text-base tracking-tight font-semibold">
                MMCM
              </span>
            </Link>
            <nav className="flex items-center gap-2.5 sm:gap-4 text-xs sm:text-sm font-medium">
              <Link href="/search" className="text-muted-foreground hover:text-foreground transition-colors">
                Discover
              </Link>
              {user && (
                <Link href="/packs" className="text-muted-foreground hover:text-foreground transition-colors">
                  Packs
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <a
              href="https://github.com/qninhdt/my-mc-modlist"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="GitHub Repository"
            >
              <svg viewBox="0 0 24 24" className="size-4.5 fill-current" strokeWidth="2.5" stroke="currentColor" fill="none">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </a>
            {!user && (
              <>
                <ThemeToggle className="h-8 w-8 sm:h-9 sm:w-9" />
                <Button
                  size="sm"
                  onClick={handleLogin}
                  disabled={loading || isSigningIn}
                  className="rounded-lg text-xs font-semibold cursor-pointer h-8 px-3"
                >
                  {isSigningIn && <Loader2 className="size-3 animate-spin mr-1" />}
                  Log In
                </Button>
              </>
            )}
            {user && <UserNav />}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
