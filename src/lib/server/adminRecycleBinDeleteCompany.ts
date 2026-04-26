import "server-only";

import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";

const BATCH = 400;

async function deleteDocumentRecursive(docRef: admin.firestore.DocumentReference): Promise<void> {
    const subcollections = await docRef.listCollections();
    for (const colRef of subcollections) {
        await drainCollectionRecursive(colRef);
    }
    await docRef.delete();
}

async function drainCollectionRecursive(colRef: admin.firestore.CollectionReference): Promise<void> {
    const snap = await colRef.orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH).get();
    if (snap.empty) return;
    for (const d of snap.docs) {
        await deleteDocumentRecursive(d.ref);
    }
    await drainCollectionRecursive(colRef);
}

/**
 * Super-admin recycle bin: company root + saari nested subcollections hatao (Admin SDK — client rules / offline race se alag).
 */
export async function adminServerHardDeleteDeletedCompany(companyId: string): Promise<void> {
    const cid = String(companyId || "").trim();
    if (!cid) throw new Error("Invalid company id");

    const db = getAdminDb();
    const ref = db.collection("companies").doc(cid);
    const snap = await ref.get();
    if (!snap.exists) return;

    const data = snap.data() || {};
    if (data.isDeleted !== true) {
        throw new Error("Company is not soft-deleted; hard delete refused.");
    }

    await deleteDocumentRecursive(ref);
}
