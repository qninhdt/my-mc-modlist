"use client";

import { useState, useRef, useEffect } from "react";
import { FileWarning, CheckCircle, MoreVertical, Download, Upload, Trash2 } from "lucide-react";

interface ManualBadgeProps {
  uploaded: boolean;
  fileName?: string | null;
  sha1?: string | null;
  uploadedByUid?: string | null;
  onUploadClick?: () => void;
  onRemoveClick?: () => void;
  canEdit?: boolean;
  downloadUrl?: string | null;
  modName?: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function ManualBadge({
  uploaded,
  fileName,
  sha1,
  uploadedByUid,
  onUploadClick,
  onRemoveClick,
  canEdit,
  downloadUrl,
  modName,
  isOpen,
  setIsOpen,
}: ManualBadgeProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const fallbackUrl = downloadUrl || (modName 
    ? `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(modName)}`
    : "https://www.curseforge.com/minecraft/mc-mods");

  const cfUrl = fallbackUrl.includes("/files/") 
    ? fallbackUrl.replace("/files/", "/download/") 
    : fallbackUrl;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Badge Button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition cursor-pointer select-none ${
          uploaded
            ? "bg-emerald-50 text-emerald-800 border-emerald-200/50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/30 dark:hover:bg-emerald-950/40"
            : "bg-amber-50 text-amber-800 border-amber-200/50 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/30 dark:hover:bg-amber-950/40 animate-pulse"
        }`}
      >
        {uploaded ? (
          <CheckCircle className="size-3 text-emerald-500" />
        ) : (
          <FileWarning className="size-3 text-amber-500" />
        )}
        <span>Manual</span>
        <MoreVertical className="size-3 text-muted-foreground ml-0.5 shrink-0" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Invisible backdrop to prevent background item clicking while dropdown is open */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          
          <div className="absolute left-0 mt-1 w-48 origin-top-left rounded-lg border bg-card p-1 shadow-lg z-50 focus:outline-none">
            <div className="py-0.5 space-y-0.5">
              <a
                href={cfUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted transition cursor-pointer"
              >
                <Download className="size-3.5 text-muted-foreground shrink-0" />
                <span>Download</span>
              </a>

              {canEdit && onUploadClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                    onUploadClick();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted transition cursor-pointer"
                >
                  <Upload className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{uploaded ? "Replace File" : "Upload File"}</span>
                </button>
              )}

              {canEdit && uploaded && onRemoveClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                    onRemoveClick();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer border-t pt-1.5 mt-1.5"
                >
                  <Trash2 className="size-3.5 shrink-0" />
                  <span>Remove File</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
