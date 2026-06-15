import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

// POST /api/invites/accept
// Called on login or dashboard load. Searches for pending invites matching the
// authenticated user's verified email address, claims them, and updates modpack ACLs.
export async function POST(request: NextRequest) {
  // 1. Authenticate user request
  const auth = await verifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { uid, token } = auth;
  const email = token.email?.toLowerCase().trim();
  const emailVerified = token.email_verified;

  if (!email) {
    return NextResponse.json(
      { error: "No email address associated with your account" },
      { status: 400 }
    );
  }

  // Supply chain guard: require email to be verified before granting invite rights
  if (!emailVerified) {
    return NextResponse.json(
      { error: "Please verify your email address to claim modpack invitations" },
      { status: 403 }
    );
  }

  try {
    // Try to parse the body for inviteId
    let inviteId: string | undefined = undefined;
    try {
      const body = await request.json();
      inviteId = body.inviteId;
    } catch (e) {
      // Body is optional or empty
    }

    // 2. Query pending invite(s) for this email
    const invitesRef = adminDb().collection("invites");
    let pendingDocs: FirebaseFirestore.DocumentSnapshot[] = [];

    if (inviteId) {
      const inviteSnap = await invitesRef.doc(inviteId).get();
      if (!inviteSnap.exists) {
        return NextResponse.json(
          { error: "Invitation not found" },
          { status: 404 }
        );
      }
      const data = inviteSnap.data();
      if (data?.status !== "pending" || data?.email !== email) {
        return NextResponse.json(
          { error: "Invalid invitation or unauthorized" },
          { status: 400 }
        );
      }
      pendingDocs = [inviteSnap];
    } else {
      const pendingInvites = await invitesRef
        .where("email", "==", email)
        .where("status", "==", "pending")
        .get();
      pendingDocs = pendingInvites.docs;
    }

    if (pendingDocs.length === 0) {
      return NextResponse.json({ acceptedCount: 0 });
    }

    const db = adminDb();
    const batch = db.batch();

    // 3. Process each invite and update the pack document
    for (const inviteDoc of pendingDocs) {
      const inviteData = inviteDoc.data();
      if (!inviteData) continue;
      const packId = inviteData.packId;
      const role = inviteData.role;

      // Update invite status to accepted
      batch.update(inviteDoc.ref, {
        status: "accepted",
        acceptedByUid: uid,
        acceptedAt: FieldValue.serverTimestamp(),
      });

      // Update pack ACLs
      const packRef = db.collection("modpacks").doc(packId);
      batch.update(packRef, {
        [`members.${uid}`]: role,
        memberUids: FieldValue.arrayUnion(uid),
        memberEmails: FieldValue.arrayUnion(email),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Log member_joined activity
      const activityRef = db.collection("modpacks").doc(packId).collection("activity").doc();
      batch.set(activityRef, {
        type: "member_joined",
        actor: {
          uid,
          displayName: token.name || token.email || "Anonymous",
          photoURL: token.picture || null,
        },
        payload: {
          role,
          memberEmail: email,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    return NextResponse.json({ acceptedCount: pendingDocs.length });
  } catch (err: any) {
    console.error("Error claiming invites:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
