"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Layers, Users, Code, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";

export default function LandingPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const router = useRouter();



  const handleAction = async () => {
    if (user) {
      router.push("/packs");
    } else {
      try {
        setIsSigningIn(true);
        await signInWithGoogle();
      } catch (err: any) {
        if (err?.code !== "auth/popup-closed-by-user") {
          console.error("Failed to sign in with Google:", err);
        }
      } finally {
        setIsSigningIn(false);
      }
    }
  };

  return (
    <AppShell>
      <div className="relative min-h-[calc(100vh-10rem)] py-6 flex flex-col gap-16">
        {/* Hero Section */}
        <section className="text-center space-y-6 max-w-3xl mx-auto pt-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold uppercase tracking-wider">
            <Sparkles className="size-3.5 fill-current" />
            Minecraft Modpack Manager
          </div>

          <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-relaxed text-foreground">
            Build & Share Minecraft Modpacks
          </h1>

          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Create custom modpacks, resolve dependencies automatically, and collaborate in real-time.
          </p>

          <div className="flex justify-center pt-2">
            <Button
              size="default"
              disabled={loading || isSigningIn}
              onClick={handleAction}
              className="h-10 rounded-xl text-xs font-bold border-2 border-primary shadow-md shadow-primary/15 cursor-pointer px-8"
            >
              {isSigningIn && <Loader2 className="size-4 animate-spin mr-1.5 shrink-0" />}
              {user ? "Go to Dashboard" : "Get Started"}
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="space-y-8 scroll-mt-20">
          <div className="text-center space-y-2">
            <h2 className="text-lg md:text-2xl font-bold tracking-tight">Features</h2>
            <p className="text-muted-foreground text-xs md:text-sm max-w-md mx-auto">
              Simplified modpack building from a unified interface.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
            <div className="group rounded-2xl border border-border/60 bg-background/50 p-5 space-y-2 transition-all hover:border-primary/40">
              <Layers className="size-5 text-primary" />
              <h3 className="text-sm font-bold">Dependency Checking</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Resolves nested requirements instantly.
              </p>
            </div>

            <div className="group rounded-2xl border border-border/60 bg-background/50 p-5 space-y-2 transition-all hover:border-primary/40">
              <Users className="size-5 text-primary" />
              <h3 className="text-sm font-bold">Real-time Collaboration</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Invite friends to build modpacks together.
              </p>
            </div>

            <div className="group rounded-2xl border border-border/60 bg-background/50 p-5 space-y-2 transition-all hover:border-primary/40">
              <Code className="size-5 text-primary" />
              <h3 className="text-sm font-bold">Conflict Detection</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Detect incompatibilities before loading the game.
              </p>
            </div>
          </div>
        </section>

      </div>
    </AppShell>
  );
}
