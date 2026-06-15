const dotenv = require("dotenv");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing credentials");
  process.exit(1);
}

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();

async function clearCollection(collectionPath) {
  const ref = db.collection(collectionPath);
  const snap = await ref.get();
  if (snap.empty) {
    console.log(`Collection ${collectionPath} is already empty.`);
    return;
  }
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Cleared ${snap.size} entries from ${collectionPath}`);
}

async function run() {
  // Clear old nested entries (if any)
  await clearCollection("cache/detail/entries");
  await clearCollection("cache/search/entries");
  // Clear new flat cache entries
  await clearCollection("cache");
  console.log("Cache cleared successfully!");
  process.exit(0);
}

run().catch(console.error);
