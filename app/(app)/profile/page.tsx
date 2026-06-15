"use client";

import Link from "next/link";
import { User, Mail, Shield, Calendar, Layers, Package, ChevronRight, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { useModpacks } from "@/lib/modpacks/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { user } = useAuth();
  const { data: packs, isLoading: loadingPacks } = useModpacks();

  if (!user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading profile...</p>
      </div>
    );
  }

  // Format creation time if available
  const creationTime = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "N/A";

  const lastSignInTime = user.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString()
    : "N/A";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back to packs link */}
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/packs" className="flex items-center gap-1">
            <ArrowLeft className="size-4" />
            Back to Packs
          </Link>
        </Button>
      </div>

      {/* Hero Header Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card/85 via-card/50 to-background p-6 md:p-8 shadow-sm flex flex-col md:flex-row items-center gap-6">
        {/* Subtle Tech grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt={user.displayName ?? "User Avatar"}
            className="size-24 rounded-full border border-border shadow-md object-cover relative z-10"
          />
        ) : (
          <div className="size-24 rounded-full bg-secondary border border-border flex items-center justify-center shadow-md relative z-10">
            <User className="size-12 text-muted-foreground" />
          </div>
        )}

        <div className="text-center md:text-left space-y-2 relative z-10">
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            {user.displayName || "Modder"}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center justify-center md:justify-start gap-1.5 font-medium">
            <Mail className="size-4 text-muted-foreground/80" />
            {user.email}
          </p>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/10">
              <Shield className="size-3" />
              Verified Account
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground border border-border/40">
              <Layers className="size-3" />
              {packs?.length ?? 0} {packs?.length === 1 ? "Modpack" : "Modpacks"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Account Details */}
        <Card className="md:col-span-1 shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Account Info</CardTitle>
            <CardDescription>System metadata and provider stats.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs font-semibold text-foreground/80">
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Account Created</span>
              <div className="flex items-center gap-1.5 bg-muted/40 p-2 rounded-lg border border-border/40">
                <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                <span>{creationTime}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Last Login</span>
              <div className="flex items-center gap-1.5 bg-muted/40 p-2 rounded-lg border border-border/40">
                <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                <span>{lastSignInTime}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium block">Auth Provider</span>
              <div className="flex items-center gap-1.5 bg-muted/40 p-2 rounded-lg border border-border/40 capitalize">
                <Shield className="size-3.5 text-muted-foreground shrink-0" />
                <span>{user.providerData[0]?.providerId || "google.com"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Modpacks List */}
        <Card className="md:col-span-2 shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold">My Modpacks</CardTitle>
              <CardDescription>Modpacks you own or collaborate on.</CardDescription>
            </div>
            <Button asChild size="sm" className="font-semibold cursor-pointer">
              <Link href="/packs/new">New Pack</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingPacks ? (
              <p className="text-sm text-muted-foreground animate-pulse">Loading modpacks...</p>
            ) : !packs || packs.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/5">
                No modpacks found. Create your first pack to get started!
              </div>
            ) : (
              <ul className="divide-y border border-border/40 rounded-xl overflow-hidden bg-muted/5">
                {packs.map((pack) => (
                  <li key={pack.id} className="relative group">
                    <Link
                      href={`/packs/${pack.id}`}
                      className="flex items-center justify-between p-3.5 hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <Package className="size-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate text-foreground group-hover:text-primary transition-colors">
                            {pack.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate pt-0.5">
                            MC {pack.mcVersion} · {pack.loader.toUpperCase()} · {pack.modCount} {pack.modCount === 1 ? "mod" : "mods"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-all duration-200 group-hover:translate-x-0.5 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
