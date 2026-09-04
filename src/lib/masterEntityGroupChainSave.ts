import type { Company } from "@/hooks/useCompany";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import type { MasterEntityGroupFormPreset } from "@/lib/masterEntityGroupFormPresets";
import {
  masterEntityGroupCreateChainPendingNames,
  trimTrailingEmptyCreateChainSlots,
  type MasterEntityGroupCreateChainSlot,
} from "@/lib/masterEntityGroupTreeForm";
import { createOneMasterEntityGroup } from "@/lib/masterEntityGroupWrite";

export type MasterEntityGroupChainSaveResult =
  | { ok: true; lastCreatedId: string; leafName: string }
  | { ok: false; reason: "no_names" | "invalid_name" | "duplicate" | "failed"; message: string };

export async function saveMasterEntityGroupCreateChain(params: {
  company: Company | null | undefined;
  companyId: string;
  userId: string;
  preset: MasterEntityGroupFormPreset;
  systemBranch: string;
  chainSlots: MasterEntityGroupCreateChainSlot[];
}): Promise<MasterEntityGroupChainSaveResult> {
  const { company, companyId, userId, preset, systemBranch, chainSlots } = params;
  const trimmedChain = trimTrailingEmptyCreateChainSlots(chainSlots);
  const pendingNames = masterEntityGroupCreateChainPendingNames(chainSlots);

  if (pendingNames.length === 0) {
    return {
      ok: false,
      reason: "no_names",
      message: "Group name must be at least 2 characters.",
    };
  }

  for (const name of pendingNames) {
    if (name.length < 2) {
      return {
        ok: false,
        reason: "invalid_name",
        message: "Group name must be at least 2 characters.",
      };
    }
  }

  let parentId: string = systemBranch;
  let lastCreatedId = "";

  for (const slot of trimmedChain) {
    if (slot.groupId) {
      parentId = slot.groupId;
      lastCreatedId = slot.groupId;
      continue;
    }

    const nameTrimmed = String(slot.pendingName || "").trim();
    if (!nameTrimmed) continue;

    const duplicateDecision = await resolveRecycleBinDuplicate({
      companyId,
      collectionName: preset.collection,
      name: nameTrimmed,
      entityLabel: preset.entityLabel,
    });
    if (duplicateDecision.decision === "active_exists") {
      return {
        ok: false,
        reason: "duplicate",
        message: `A group named "${nameTrimmed}" already exists.`,
      };
    }

    const createParentId = parentId;

    if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
      lastCreatedId = duplicateDecision.restoredId;
      parentId = lastCreatedId;
      continue;
    }

    lastCreatedId = await createOneMasterEntityGroup({
      company,
      companyId,
      userId,
      name: nameTrimmed,
      parentId: createParentId,
      collection: preset.collection,
      localIdPrefix: preset.localIdPrefix,
    });
    parentId = lastCreatedId;
  }

  if (!lastCreatedId) {
    return { ok: false, reason: "failed", message: "Group could not be created." };
  }

  return {
    ok: true,
    lastCreatedId,
    leafName: pendingNames[pendingNames.length - 1]!,
  };
}
