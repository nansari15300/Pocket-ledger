import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export type UngroupedEntityType = "party" | "staff" | "tax" | "bank" | "expense" | "item";

type UngroupedConfig = {
  collection: string;
  id: string;
  type: string;
  parentId: string | null;
};

const UNGROUPED_CONFIG: Record<UngroupedEntityType, UngroupedConfig> = {
  party: { collection: "groups", id: "ungrouped_party", type: "General", parentId: null },
  staff: { collection: "staff_groups", id: "ungrouped_staff", type: "General", parentId: "loans_liabilities" },
  tax: { collection: "tax_groups", id: "ungrouped_tax", type: "General", parentId: "duties_taxes" },
  bank: { collection: "account_groups", id: "ungrouped_account", type: "General", parentId: "bank_accounts_group" },
  expense: { collection: "expense_groups", id: "ungrouped_expense", type: "General", parentId: null },
  item: { collection: "item_groups", id: "ungrouped_item", type: "General", parentId: null },
};

export function getUngroupedGroupId(type: UngroupedEntityType): string {
  return UNGROUPED_CONFIG[type].id;
}

export async function ensureUngroupedGroup(
  companyId: string,
  ownerId: string,
  type: UngroupedEntityType
): Promise<string> {
  const config = UNGROUPED_CONFIG[type];
  const groupRef = doc(firestore, `companies/${companyId}/${config.collection}`, config.id);
  const snap = await getDoc(groupRef);

  if (!snap.exists()) {
    // Always recreate canonical Ungrouped doc if it is missing.
    await setDoc(groupRef, {
      name: "Ungrouped",
      type: config.type,
      parentId: config.parentId,
      companyId,
      ownerId,
      isDeleted: false,
      isSystemReserved: false,
      isReportOnly: false,
      isAutoUngrouped: true,
      createdAt: serverTimestamp(),
    });
    return config.id;
  }

  const data = snap.data() as any;
  const patch: Record<string, unknown> = {};
  // Keep canonical metadata so Ungrouped can be reliably auto-selected everywhere.
  if (data?.name !== "Ungrouped") patch.name = "Ungrouped";
  if (data?.isDeleted === true) patch.isDeleted = false;
  if (data?.isAutoUngrouped !== true) patch.isAutoUngrouped = true;
  if (data?.isSystemReserved !== false) patch.isSystemReserved = false;
  if (data?.isReportOnly !== false) patch.isReportOnly = false;
  if ((data?.parentId ?? null) !== config.parentId) patch.parentId = config.parentId;
  if ((data?.type ?? null) !== config.type) patch.type = config.type;
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = serverTimestamp();
    await updateDoc(groupRef, patch);
  }
  return config.id;
}
