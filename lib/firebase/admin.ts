import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

function buildAdminApp(): App {
  if (getApps().length) return getApp();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Stored with literal "\n" sequences in .env; restore real newlines.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing firebase-admin credentials (FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY)."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Lazy singletons: the admin app is built on first use at request time, never at
// module load. This keeps `next build` page-data collection from requiring creds.
let appInstance: App | null = null;
function app(): App {
  return (appInstance ??= buildAdminApp());
}

export function adminAuth(): Auth {
  return getAuth(app());
}

export function adminDb(): Firestore {
  return getFirestore(app());
}

export function adminStorage(): Storage {
  return getStorage(app());
}
