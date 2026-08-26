import { getUngroupedGroupId } from "@/lib/ungrouped-groups";

export function buildBankAccountGroupComboboxOptions(
  groups: Array<{ id: string; name: string; isSystemReserved?: boolean; isAutoUngrouped?: boolean }>
) {
  return [
    { value: getUngroupedGroupId("bank"), label: "Ungrouped" },
    ...groups
      .filter((g) => !g.isSystemReserved && g.isAutoUngrouped !== true)
      .map((g) => ({ value: g.id, label: g.name })),
  ];
}

export function buildStaffGroupComboboxOptions(
  groups: Array<{ id: string; name: string; isSystemReserved?: boolean; isAutoUngrouped?: boolean }>
) {
  return [
    { value: getUngroupedGroupId("staff"), label: "Ungrouped" },
    ...groups
      .filter((g) => !g.isSystemReserved && g.isAutoUngrouped !== true)
      .map((g) => ({ value: g.id, label: g.name })),
  ];
}

export function buildExpenseGroupComboboxOptions(
  groups: Array<{ id: string; name: string; parentId?: string; isReportOnly?: boolean; isAutoUngrouped?: boolean }>
) {
  const getParentLabel = (parentId?: string) => {
    if (parentId === "income" || parentId === "direct_income" || parentId === "indirect_income") return "Income";
    if (parentId === "expenses" || parentId === "direct_expense" || parentId === "indirect_expense") return "Expenses";
    return "";
  };
  return [
    { value: getUngroupedGroupId("expense"), label: "Ungrouped" },
    ...groups
      .filter((g) => g.isReportOnly !== true && g.isAutoUngrouped !== true)
      .map((g) => {
        const parent = getParentLabel(g.parentId);
        return { value: g.id, label: parent ? `${parent} / ${g.name}` : g.name };
      }),
  ];
}

export function resolveExpenseGroupComboboxLabel(
  groups: Array<{ id: string; name: string; parentId?: string; isReportOnly?: boolean; isAutoUngrouped?: boolean }>,
  groupId?: string | null,
  fallback = "Ungrouped"
): string {
  const gid = String(groupId || "").trim();
  if (!gid) return fallback;
  const option = buildExpenseGroupComboboxOptions(groups).find((o) => o.value === gid);
  return option?.label || fallback;
}

export function normalizeMasterEntityGroupComboboxValue(
  entity: "bank" | "staff" | "expense",
  groupId?: string | null
): string {
  const ungrouped = getUngroupedGroupId(entity);
  const gid = String(groupId || "").trim();
  if (!gid || gid === ungrouped) return ungrouped;
  return gid;
}
