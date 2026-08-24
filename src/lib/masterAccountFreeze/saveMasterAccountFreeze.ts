"use client";

import { writeEntity } from "@/lib/writeGateway/writeEntity";
import { serverTimestamp } from "@/lib/writeGateway/firestoreMutationsInternal";
import type { MasterAccountFreezeCollection } from "@/lib/masterAccountFreeze/types";

export type SaveMasterAccountFreezeInput = {
  companyId: string;
  collection: MasterAccountFreezeCollection;
  entityId: string;
  isFrozen: boolean;
  freezeMessage?: string | null;
};

export async function saveMasterAccountFreeze(
  input: SaveMasterAccountFreezeInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyId = String(input.companyId || "").trim();
  const entityId = String(input.entityId || "").trim();
  if (!companyId || !entityId) {
    return { ok: false, error: "Missing company or account." };
  }

  const patch: Record<string, unknown> = {
    isFrozen: input.isFrozen,
    updatedAt: serverTimestamp(),
  };

  if (input.isFrozen) {
    if (input.freezeMessage !== undefined) {
      const raw = String(input.freezeMessage ?? "");
      patch.freezeMessage = raw.length > 0 ? raw : null;
    }
  }
  // Unfreeze: keep stored freezeMessage — only clear when owner deletes text while frozen.

  const result = await writeEntity({
    companyId,
    collectionName: input.collection,
    docId: entityId,
    operation: "update",
    data: patch,
  });

  if (result.ok === false) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
