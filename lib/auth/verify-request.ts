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

  try {
    const token = await (await adminAuth()).verifyIdToken(idToken);
    return { ok: true, uid: token.uid, token };
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
}
