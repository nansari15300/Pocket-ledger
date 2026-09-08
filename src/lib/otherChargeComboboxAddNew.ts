import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";

export type OtherChargeAddNewType = "party" | "staff" | "expense";

export const OTHER_CHARGE_ADD_NEW_LABELS: { value: string; label: string }[] = [
  { value: "add-new-party", label: "+ Add New Party" },
  { value: "add-new-staff", label: `+ Add New ${STAFF_ENTITY_LABEL}` },
  { value: "add-new-expense", label: "+ Add New Expense Account" },
];

export const OTHER_CHARGE_ADD_NEW_VALUE_TO_TYPE: Record<string, OtherChargeAddNewType> = {
  "add-new-party": "party",
  "add-new-staff": "staff",
  "add-new-expense": "expense",
};

export function resolveOtherChargeAddNewType(val: string): OtherChargeAddNewType | null {
  return OTHER_CHARGE_ADD_NEW_VALUE_TO_TYPE[val] ?? null;
}

export function dispatchOtherChargeAddNewPrefill(type: OtherChargeAddNewType, newName?: string) {
  const nm = String(newName || "").trim();
  if (!nm) return;
  const eventByType: Record<OtherChargeAddNewType, string> = {
    party: "prefill-create-party-name",
    staff: "prefill-create-staff-name",
    expense: "prefill-create-expense-account-name",
  };
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent(eventByType[type], { detail: nm }));
  }, 100);
}
