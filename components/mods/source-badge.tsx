import type { ModView } from "@/lib/api/types";

// Shows which platforms a mod is available on (Modrinth and/or CurseForge), as
// outbound links. A mod with only a CurseForge source is flagged for the P6 manual
// flow elsewhere; here we just render whatever sources exist.
export function SourceBadges({ sources }: { sources: ModView["sources"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sources.modrinth && (
        <a
          href={sources.modrinth.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded bg-[#1bd96a]/15 px-2 py-0.5 text-xs font-medium text-[#0c8a3f] hover:underline dark:text-[#3ee87f]"
          onClick={(e) => e.stopPropagation()}
        >
          Modrinth
        </a>
      )}
      {sources.curseforge && (
        <a
          href={sources.curseforge.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded bg-[#f16436]/15 px-2 py-0.5 text-xs font-medium text-[#c4471f] hover:underline dark:text-[#ff8a5c]"
          onClick={(e) => e.stopPropagation()}
        >
          CurseForge
        </a>
      )}
    </div>
  );
}
