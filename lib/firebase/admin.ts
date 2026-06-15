import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";

// Dynamic imports are used for ALL firebase-admin sub-packages to prevent
// Turbopack/Webpack from bundling them at build time. Static top-level imports
// cause ERR_REQUIRE_ESM because firebase-admin uses jose v5 (ESM-only) via
// jwks-rsa. Dynamic import() runs at Node.js request time, not build time.

async function buildAdminApp(): Promise<App> {
  const { getApps, getApp, initializeApp, cert } = await import("firebase-admin/app");
  if (getApps().length) return getApp();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Stored with literal "\n" sequences in .env; restore real newlines.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing firebase-admin credentials: check FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in Vercel env vars."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Lazy singleton promise — reset on failure so the next request retries.
let appPromise: Promise<App> | null = null;
function app(): Promise<App> {
  if (!appPromise) {
    appPromise = buildAdminApp().catch((err) => {
      appPromise = null; // reset so next request retries
      throw err;
    });
  }
  return appPromise;
}

export async function adminAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await app());
}

export async function adminDb(): Promise<Firestore> {
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(await app());
}

export async function adminStorage(): Promise<Storage> {
  const { getStorage } = await import("firebase-admin/storage");
  return getStorage(await app());
}
