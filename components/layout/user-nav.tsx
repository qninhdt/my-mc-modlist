"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, User, Sun, Moon, Laptop } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function UserNav() {
  const { user, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close dropdown on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 focus:outline-none cursor-pointer rounded-full p-0.5 hover:ring-2 hover:ring-primary/30 transition-all"
        aria-expanded={isOpen}
        aria-label="User menu"
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt={user.displayName ?? "User"}
            className="h-8 w-8 rounded-full border border-border shadow-sm object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-primary/10 border border-border shadow-sm flex items-center justify-center font-bold text-primary text-sm">
            {(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-64 origin-top-right rounded-xl border bg-card p-1.5 shadow-xl z-50 focus:outline-none animate-in fade-in-50 slide-in-from-top-2 duration-200">
          {/* User Info Header */}
          <div className="px-2.5 py-2 border-b border-border/40">
            <p className="font-semibold text-sm truncate text-foreground leading-none">
              {user.displayName || "Modder"}
            </p>
            <p className="text-xs text-muted-foreground truncate pt-1 leading-none font-medium">
              {user.email}
            </p>
          </div>

          <div className="py-1 space-y-0.5">
            {/* Account Profile Page Link */}
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors cursor-pointer",
                pathname === "/profile"
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <User className="size-4 shrink-0 text-muted-foreground" />
              <span>Profile</span>
            </Link>

            {/* Theme settings controller inline */}
            <div className="flex items-center justify-between px-2.5 py-2 text-sm font-semibold text-foreground">
              <span className="flex items-center gap-2">
                {resolvedTheme === "dark" ? (
                  <Moon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Sun className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span>Theme</span>
              </span>
              <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5 border border-border/30">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "p-1 rounded-md cursor-pointer transition-all",
                    theme === "light"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Light mode"
                >
                  <Sun className="size-3.5" />
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "p-1 rounded-md cursor-pointer transition-all",
                    theme === "dark"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Dark mode"
                >
                  <Moon className="size-3.5" />
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={cn(
                    "p-1 rounded-md cursor-pointer transition-all",
                    theme === "system"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="System mode"
                >
                  <Laptop className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 my-1" />

          {/* Logout Button */}
          <div className="p-0.5">
            <button
              onClick={() => logout()}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left"
            >
              <LogOut className="size-4 shrink-0" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
