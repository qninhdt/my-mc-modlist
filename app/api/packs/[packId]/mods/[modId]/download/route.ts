import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { adminDb, adminStorage } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ packId: string; modId: string }> }
) {
  const { packId, modId } = await props.params;
  
  // 1. Authenticate user
  const auth = await verifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { uid } = auth;

  try {
    // 2. Verify pack membership
    const packRef = adminDb().collection("modpacks").doc(packId);
    const packSnap = await packRef.get();
    
    if (!packSnap.exists) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }

    const packData = packSnap.data();
    const memberUids: string[] = packData?.memberUids || [];
    
    if (!memberUids.includes(uid)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 3. Get mod details
    const modRef = packRef.collection("mods").doc(modId);
    const modSnap = await modRef.get();
    
    if (!modSnap.exists) {
      return NextResponse.json({ error: "Mod not found" }, { status: 404 });
    }

    const modData = modSnap.data();
    
    if (!modData?.curseforgeManual) {
      return NextResponse.json(
        { error: "Only CurseForge manual mods use this endpoint" },
        { status: 400 }
      );
    }

    const storagePath = modData?.storagePath;
    if (!storagePath) {
      return NextResponse.json(
        { error: "No jar file has been uploaded for this mod" },
        { status: 404 }
      );
    }

    // 4. Check if file exists in Storage and mint a signed URL
    const bucket = adminStorage().bucket();
    const file = bucket.file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: "Jar file does not exist in Storage" },
        { status: 404 }
      );
    }

    // Mint a signed URL valid for 15 minutes
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000, // 15 mins
    });

    return NextResponse.json({ url: signedUrl });
  } catch (err: any) {
    console.error("Error in download signed URL route:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
