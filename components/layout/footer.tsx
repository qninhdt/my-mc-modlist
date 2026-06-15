"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/20 py-6">
      <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-muted-foreground">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <Image src="/logo.png" alt="MMCM Logo" width={20} height={20} className="rounded-sm shrink-0" />
            <span>My MC Modlist © {new Date().getFullYear()}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/80 font-normal flex items-center justify-center sm:justify-start gap-1">
            Built with <Heart className="size-3 text-red-500 fill-current shrink-0" /> by qninhdt and Gemini 3.5 Flash
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link href="/search" className="hover:text-foreground transition-colors">
            Discover
          </Link>
          <Link href="/packs" className="hover:text-foreground transition-colors">
            Packs
          </Link>
          <Link href="/profile" className="hover:text-foreground transition-colors">
            Profile
          </Link>
          <a
            href="https://github.com/qninhdt/my-mc-modlist"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors p-1.5"
            title="GitHub Repository"
          >
            <svg viewBox="0 0 24 24" className="size-4 fill-current" strokeWidth="2.5" stroke="currentColor" fill="none">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
