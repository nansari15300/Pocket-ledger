import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { Company } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { apkEntityWriteUsesLocalSqliteMirror } from "@/lib/apkOnlineFirestoreWritePolicy";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";

function createLocalEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export async function createOneMasterEntityGroup(params: {
  company: Company | null | undefined;
  companyId: string;
  userId: string;
  name: string;
  parentId: string;
  collection: string;
  localIdPrefix: string;
}): Promise<string> {
  const { company, companyId, userId, name, parentId, collection: coll, localIdPrefix } = params;
  if (apkEntityWriteUsesLocalSqliteMirror(company)) {
    const createdId = createLocalEntityId(localIdPrefix);
    const payload = {
      id: createdId,
      name: name.trim(),
      ownerId: userId,
      companyId,
      parentId,
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    await upsertCompanyDocInBrowserDb(companyId, coll, createdId, payload);
    await enqueueCompanyDocOutbox(companyId, coll, "create", createdId, payload);
    return createdId;
  }
  const docRef = await addDoc(collection(firestore, `companies/${companyId}/${coll}`), {
    name: name.trim(),
    ownerId: userId,
    companyId,
    parentId,
    createdAt: serverTimestamp(),
    isDeleted: false,
  });
  return docRef.id;
}
