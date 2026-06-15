import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { adminDb } from "../lib/firebase/admin";

async function main() {
  console.log("Connecting to Firestore to clear cache...");
  const db = adminDb();
  const snapshot = await db.collection("cache").get();
  console.log(`Found ${snapshot.size} documents in cache collection.`);
  if (snapshot.size === 0) {
    console.log("Nothing to clear.");
    process.exit(0);
  }
  
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log("Firestore cache cleared successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to clear cache:", err);
  process.exit(1);
});
