import { type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";

export type AuthResult =
  | { ok: true; uid: string; token: DecodedIdToken }
  | { ok: false; status: number; error: string };

// Verifies the Firebase ID token on an incoming API request. Route handlers call
// this first; middleware only checks header presence (Edge can't run admin SDK).
export async function verifyRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    return { ok: false, status: 401, error: "Empty bearer token" };
  }

  let auth;
  try {
    auth = await adminAuth();
  } catch (err) {
    // SDK init failed — likely missing env vars on Vercel. Log full error server-side.
    console.error("[verifyRequest] Firebase Admin SDK init failed:", err);
    return {
      ok: false,
      status: 500,
      error: "Auth service unavailable — check server configuration",
    };
  }

  try {
    const token = await auth.verifyIdToken(idToken);
    return { ok: true, uid: token.uid, token };
  } catch (err) {
    // Token itself is invalid or expired — normal auth failure.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[verifyRequest] Token verification failed:", msg);
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
}
