"use client";

import { auth } from "@/lib/firebase/client";

// Wraps fetch with the current user's Firebase ID token in the Authorization header.
// Every /api/* route is gated by the proxy + verifyRequest, so all client calls to
// our backend must go through this. Throws if no user is signed in.
export async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser;
  const headers = new Headers(init.headers);
  if (user) {
    const token = await user.getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

// Convenience JSON wrapper: throws on non-2xx, parses the body as T.
export async function authedFetchJson<T>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await authedFetch(input, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body; keep default message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
