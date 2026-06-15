"use client";

import Link from "next/link";
import {
  Download,
  Plus,
  Heart,
  Clock,
  Monitor,
  Server,
  Globe,
  Zap,
  Library,
  Paintbrush,
  Layers,
  Hammer,
  Flame,
  Sparkles,
  Tag,
} from "lucide-react";
import type { ModView, SideSupport } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SideBadges } from "./side-badge";
import { SourceBadges } from "./source-badge";
import { cn } from "@/lib/utils";

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "Just now";
    
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin === 1) return "1 minute ago";
    if (diffMin < 60) return `${diffMin} minutes ago`;
    if (diffHour === 1) return "1 hour ago";
    if (diffHour < 24) return `${diffHour} hours ago`;
    if (diffDay === 1) return "1 day ago";
    if (diffDay < 30) return `${diffDay} days ago`;
    
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth === 1) return "1 month ago";
    if (diffMonth < 12) return `${diffMonth} months ago`;
    
    const diffYear = Math.floor(diffMonth / 12);
    if (diffYear === 1) return "1 year ago";
    return `${diffYear} years ago`;
  } catch {
    return "";
  }
}

function getSideBadgeInfo(client: SideSupport, server: SideSupport) {
  if (client === "required" && server === "required") {
    return { label: "Client or server", icon: "globe" };
  }
  if (client === "required" && server === "unsupported") {
    return { label: "Client", icon: "monitor" };
  }
  if (client === "unsupported" && server === "required") {
    return { label: "Server", icon: "server" };
  }
  if (client === "optional" || server === "optional") {
    return { label: "Client or server", icon: "globe" };
  }
  return null;
}

export function ModCard({
  mod,
  onAddAction,
  adding,
  added,
  viewMode = "list",
}: {
  mod: ModView;
  onAddAction?: (mod: ModView) => void;
  adding?: boolean;
  added?: boolean;
  viewMode?: "list" | "grid";
}) {
  const isGrid = viewMode === "grid";

  // Generates a stable background gradient class based on mod ID string
  const getGradient = (id: string) => {
    const hash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      "from-orange-600/20 via-orange-500/10 to-transparent",
      "from-emerald-600/20 via-emerald-500/10 to-transparent",
      "from-blue-600/20 via-blue-500/10 to-transparent",
      "from-purple-600/20 via-purple-500/10 to-transparent",
      "from-amber-600/20 via-amber-500/10 to-transparent",
      "from-teal-600/20 via-teal-500/10 to-transparent",
    ];
    return colors[hash % colors.length];
  };

  const gradientClass = getGradient(mod.id);

  const renderCardBadges = () => {
    const badgeElements: React.JSX.Element[] = [];

    // 1. Unified Side Support Badge
    const sideInfo = getSideBadgeInfo(mod.clientSide, mod.serverSide);
    if (sideInfo) {
      let SideIcon = Globe;
      if (sideInfo.icon === "monitor") SideIcon = Monitor;
      if (sideInfo.icon === "server") SideIcon = Server;

      badgeElements.push(
        <span
          key="side-badge"
          className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground/90 whitespace-nowrap"
        >
          <SideIcon className="size-3 shrink-0 text-muted-foreground/70" />
          {sideInfo.label}
        </span>
      );
    }

    // Define loader styles
    const loaderStyles: Record<string, { bg: string; text: string; border: string; icon: typeof Layers }> = {
      fabric: {
        bg: "bg-[#f08a5d]/10",
        text: "text-[#f08a5d] dark:text-[#ff9d73]",
        border: "border-[#f08a5d]/20",
        icon: Layers,
      },
      forge: {
        bg: "bg-[#3f72af]/10",
        text: "text-[#3f72af] dark:text-[#6fa3e5]",
        border: "border-[#3f72af]/20",
        icon: Hammer,
      },
      neoforge: {
        bg: "bg-[#ff9a3c]/10",
        text: "text-[#ff9a3c] dark:text-[#ffb26b]",
        border: "border-[#ff9a3c]/20",
        icon: Flame,
      },
      quilt: {
        bg: "bg-[#c3aed6]/10",
        text: "text-[#a07cbe] dark:text-[#c4a9dc]",
        border: "border-[#a07cbe]/20",
        icon: Sparkles,
      },
    };

    // Define category styles
    const categoryStyles: Record<string, { bg: string; text: string; border: string; icon: typeof Zap }> = {
      optimization: {
        bg: "bg-emerald-500/10",
        text: "text-emerald-500 dark:text-emerald-400",
        border: "border-emerald-500/20",
        icon: Zap,
      },
      library: {
        bg: "bg-muted/50",
        text: "text-muted-foreground/90",
        border: "border-border/60",
        icon: Library,
      },
      utility: {
        bg: "bg-muted/50",
        text: "text-muted-foreground/90",
        border: "border-border/60",
        icon: Library,
      },
      decoration: {
        bg: "bg-pink-500/10",
        text: "text-pink-500 dark:text-pink-400",
        border: "border-pink-500/20",
        icon: Paintbrush,
      },
    };

    // 2. Add category & loader badges from mod tags
    mod.tags.forEach((tag, idx) => {
      const lowerTag = tag.toLowerCase();
      
      // Check if it's a loader
      if (lowerTag in loaderStyles) {
        const style = loaderStyles[lowerTag];
        const LoaderIcon = style.icon;
        badgeElements.push(
          <span
            key={`loader-${tag}-${idx}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize whitespace-nowrap",
              style.bg,
              style.text,
              style.border
            )}
          >
            <LoaderIcon className="size-3 shrink-0" />
            {tag}
          </span>
        );
      } 
      // Check if it's a stylized category
      else if (lowerTag in categoryStyles) {
        const style = categoryStyles[lowerTag];
        const CatIcon = style.icon;
        badgeElements.push(
          <span
            key={`cat-${tag}-${idx}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold capitalize whitespace-nowrap",
              style.bg,
              style.text,
              style.border
            )}
          >
            <CatIcon className="size-3 shrink-0" />
            {tag}
          </span>
        );
      }
      // Fallback tag
      else {
        badgeElements.push(
          <span
            key={`tag-${tag}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground/85 capitalize whitespace-nowrap animate-in fade-in-50"
          >
            <Tag className="size-3 shrink-0 text-muted-foreground/60" />
            {tag}
          </span>
        );
      }
    });

    return badgeElements;
  };

  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-border/50 bg-card hover:border-border",
      isGrid ? "flex flex-col h-[340px] w-full" : "h-auto w-full"
    )}>
      <Link
        href={`/mods/${encodeURIComponent(mod.id)}`}
        className="absolute inset-0 z-0"
        aria-label={`View details for ${mod.name}`}
      />
      
      {isGrid ? (
        // REDESIGNED GRID CARD VIEW (Vertical Steam/Modrinth card style)
        <div className="relative flex flex-col h-full w-full pointer-events-none">
          {/* 1. Decorative Header Banner */}
          <div className="relative w-full h-[120px] bg-muted/30 shrink-0 overflow-hidden border-b border-border/10">
            {/* Banner Image / Gallery Backdrop */}
            {mod.featuredGalleryUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mod.featuredGalleryUrl}
                alt=""
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              // Fallback: Gradient with Blurred Icon and Tech grid pattern
              <div className={cn("absolute inset-0 bg-gradient-to-br transition-all duration-500", gradientClass)}>
                {mod.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mod.iconUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-30 pointer-events-none"
                  />
                )}
                {/* Tech pattern overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:12px_12px]" />
              </div>
            )}
            {/* Dark overlay at bottom to transition to the card body */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-black/10" />
            
            {/* Floating Add/Added Button in Top Right */}
            {onAddAction && (
              <div className="absolute top-3 right-3 pointer-events-auto z-10">
                <Button
                  type="button"
                  size="sm"
                  variant={added ? "secondary" : "default"}
                  disabled={adding || added}
                  onClick={() => onAddAction(mod)}
                  className={cn(
                    "h-8 text-xs font-semibold px-3 py-1 cursor-pointer transition-all shadow-sm border border-transparent",
                    added 
                      ? "bg-secondary/90 hover:bg-secondary border-border" 
                      : "bg-primary hover:bg-primary/95 text-primary-foreground"
                  )}
                >
                  <Plus className="size-3.5 mr-1" />
                  {added ? "Added" : adding ? "Adding…" : "Add"}
                </Button>
              </div>
            )}
          </div>

          {/* Overlapping Icon */}
          <div className="absolute left-4 top-[92px] z-10">
            {mod.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mod.iconUrl}
                alt=""
                className="size-14 rounded-xl object-cover bg-card border-2 border-background shadow-md transition-transform duration-350 group-hover:scale-[1.03]"
                loading="lazy"
              />
            ) : (
              <div className="size-14 rounded-xl bg-secondary border-2 border-background shadow-md flex items-center justify-center font-bold text-muted-foreground/80 text-sm">
                {mod.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* 2. Card Content Body */}
          <div className="flex-1 p-4 pt-3 flex flex-col justify-between min-h-0">
            {/* Top Half: Title, Description, and Tags */}
            <div className="space-y-3.5 min-h-0">
              {/* Title & Author (shifted right to clear overlapping icon) */}
              <div className="pl-[68px] min-h-[36px] flex flex-col justify-center">
                <div className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
                  <h3 className="font-bold text-sm text-foreground leading-tight truncate max-w-[170px]" title={mod.name}>
                    {mod.name}
                  </h3>
                  {mod.author && (
                    <span className="text-[10px] text-muted-foreground/75 font-medium truncate max-w-[90px]">
                      by {mod.author}
                    </span>
                  )}
                </div>
              </div>

              {/* Summary Description */}
              <p className="line-clamp-2 text-xs text-muted-foreground/90 leading-relaxed">
                {mod.summary}
              </p>

              {/* Badges Row */}
              <div className="flex flex-wrap gap-1.5 overflow-hidden max-h-[48px] pointer-events-auto">
                {renderCardBadges()}
                <SourceBadges sources={mod.sources} />
              </div>
            </div>

            {/* Bottom Half: Separator & Stats Footer */}
            <div className="border-t border-border/40 pt-3 flex items-center justify-between text-[11px] text-muted-foreground/85">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 font-medium" title={`${mod.downloads.toLocaleString()} downloads`}>
                  <Download className="size-3.5 text-muted-foreground/70" />
                  {formatDownloads(mod.downloads)}
                </span>
                
                {mod.follows !== undefined && (
                  <span className="inline-flex items-center gap-1 font-medium" title={`${mod.follows.toLocaleString()} followers`}>
                    <Heart className="size-3.5 text-muted-foreground/70" />
                    {formatDownloads(mod.follows)}
                  </span>
                )}
              </div>
              
              {mod.updated && (
                <span className="inline-flex items-center gap-1 font-medium" title={`Last updated: ${new Date(mod.updated).toLocaleString()}`}>
                  <Clock className="size-3.5 text-muted-foreground/70" />
                  {formatRelativeTime(mod.updated)}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        // STYLISH LIST CARD VIEW (Horizontal layout)
        <CardContent className="relative z-10 pointer-events-none flex p-4 h-full w-full items-start gap-3">
          {mod.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mod.iconUrl}
              alt=""
              className="size-12 shrink-0 rounded-md object-cover"
              loading="lazy"
            />
          ) : (
            <div className="size-12 shrink-0 rounded-md bg-secondary" />
          )}
          
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Top Row: Title and Add button */}
            <div className="flex items-start justify-between gap-4 w-full">
              <h3 className="truncate font-semibold text-base text-foreground leading-tight">{mod.name}</h3>
              
              {onAddAction && (
                <div className="pointer-events-auto shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={added ? "secondary" : "default"}
                    disabled={adding || added}
                    onClick={() => onAddAction(mod)}
                    className="cursor-pointer h-8 px-3 text-xs"
                  >
                    <Plus className="size-3.5 mr-1" />
                    {added ? "Added" : adding ? "Adding…" : "Add"}
                  </Button>
                </div>
              )}
            </div>
            
            <p className="line-clamp-2 text-sm text-muted-foreground leading-snug">
              {mod.summary}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 w-full">
              <div className="flex flex-wrap items-center gap-1.5">
                <SideBadges clientSide={mod.clientSide} serverSide={mod.serverSide} />
                {mod.tags.slice(0, 2).map((tag) => (
                  <span 
                    key={tag}
                    className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground capitalize"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 pointer-events-auto shrink-0">
                <SourceBadges sources={mod.sources} />
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Download className="size-3 text-muted-foreground/80" />
                  {formatDownloads(mod.downloads)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
