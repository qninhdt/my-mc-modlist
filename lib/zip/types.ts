export type ExportTarget = "client" | "server" | "singleplayer";

export interface FailedMod {
  name: string;
  projectId: string;
  error: string;
}

export interface ExportProgress {
  status: "idle" | "fetching" | "zipping" | "success" | "error";
  total: number;
  current: number;
  currentName: string;
  failedMods: FailedMod[];
  error?: string;
}
