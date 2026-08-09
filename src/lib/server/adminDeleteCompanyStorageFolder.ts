import "server-only";

import admin from "firebase-admin";
import { buildCompanyStorageWipePrefixes } from "@/lib/companyStorageWipePrefixes";
import { getAdminApp } from "@/lib/firebaseAdmin";

/** Admin SDK — company hard delete par saare Storage prefixes wipe. */
export async function adminDeleteCompanyFirebaseStorageFolder(input: {
  companyId: string;
  companyName?: string;
}): Promise<{ deleted: number; prefixes: string[] }> {
  const prefixes = buildCompanyStorageWipePrefixes(input);
  const bucket = admin.storage(getAdminApp()).bucket();
  let deleted = 0;

  for (const prefix of prefixes) {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
    try {
      const [files] = await bucket.getFiles({ prefix: normalized });
      await Promise.all(
        files.map(async (file) => {
          try {
            await file.delete();
            deleted += 1;
          } catch {
            /* already gone */
          }
        })
      );
    } catch (e) {
      console.warn("[adminDeleteCompanyStorage] prefix skipped", prefix, e);
    }
  }

  return { deleted, prefixes };
}
