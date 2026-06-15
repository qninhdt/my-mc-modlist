import { NextResponse, type NextRequest } from "next/server";

// Firebase client auth stores its session in IndexedDB (not cookies), so this
// proxy cannot verify page-route sessions — page protection is enforced
// client-side in the (app) layout. The proxy's job is the /api/* gate below.
const PROTECTED_API_PREFIX = "/api/";

// Public API routes/prefixes — unauthenticated users can call these freely.
// Use exact strings for fixed paths, or trailing "/" to match all sub-paths.
const PUBLIC_API_PREFIXES: string[] = [
  "/api/search",   // mod search — public browsing
  "/api/mod/",     // mod detail + versions — public read
  "/api/minecraft/", // game version list — public
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) =>
    pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(PROTECTED_API_PREFIX)) {
    if (isPublicRoute(pathname)) {
      return NextResponse.next();
    }

    // Edge runtime cannot run firebase-admin, so we only assert presence of a
    // Bearer token here (cheap DoS guard). Cryptographic verification happens in
    // the route handler via verifyIdToken (Node runtime). Absent token → 401.
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: missing bearer token" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
