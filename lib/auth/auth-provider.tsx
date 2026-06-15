"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithCredential,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth, db } from "@/lib/firebase/client";
import { authedFetchJson } from "@/lib/api/authed-fetch";

// Suppress GSI Logger FedCM errors when user closes/cancels the prompt
if (typeof window !== "undefined") {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const isGsiFedCmError = args.some(arg => 
      typeof arg === "string" && 
      (arg.includes("[GSI_LOGGER]") && arg.includes("FedCM get() rejects"))
    );
    if (isGsiFedCmError) {
      console.warn("Google One Tap prompt was dismissed or cancelled by the user.");
      return;
    }
    originalConsoleError.apply(console, args);
  };

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason?.message || event.reason;
    if (typeof reason === "string" && reason.includes("Error retrieving a token")) {
      event.preventDefault();
    }
  });
}

export type AuthContextValue = {

  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

async function upsertUserDoc(user: User): Promise<void> {
  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email?.toLowerCase() ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Google One Tap Sign-In configuration
  useEffect(() => {
    if (loading || user) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const initOneTap = () => {
      const google = (window as any).google;
      if (!google || !google.accounts || !google.accounts.id) return;

      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            try {
              const credential = GoogleAuthProvider.credential(response.credential);
              await signInWithCredential(auth, credential);
            } catch (err: any) {
              console.error("One Tap Sign-In Error:", err);
            }
          },
          cancel_on_tap_outside: true,
        });

        // Trigger prompt
        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed()) {
            console.log("One Tap not displayed:", notification.getNotDisplayedReason());
          } else if (notification.isSkippedMoment()) {
            console.log("One Tap skipped:", notification.getSkippedReason());
          }
        });
      } catch (error) {
        console.error("Failed to initialize Google One Tap:", error);
      }
    };

    const google = (window as any).google;
    if (google && google.accounts && google.accounts.id) {
      initOneTap();
    } else {
      const interval = setInterval(() => {
        const google = (window as any).google;
        if (google && google.accounts && google.accounts.id) {
          clearInterval(interval);
          initOneTap();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [user, loading]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) {
        try {
          await upsertUserDoc(nextUser);
          if (nextUser.emailVerified) {
            const acceptRes = await authedFetchJson<{ acceptedCount: number }>(
              "/api/invites/accept",
              { method: "POST" }
            );
            if (acceptRes.acceptedCount > 0) {
              console.log(`Successfully claimed ${acceptRes.acceptedCount} pending invites.`);
            }
          }
        } catch (err) {
          console.error("Failed to upsert user or claim invites", err);
        }
      }
    });
  }, []);


  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signInWithGoogle, logout }),
    [user, loading, signInWithGoogle, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
