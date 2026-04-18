/**
 * Staff master: `staffId` + add_salary journal credit lines (narration filter) — sidebar aur list same set.
 */
export function collectStaffIdsTouchedByUnapprovedVoucher(v: any, staffIdSet: Set<string>): Set<string> {
  const out = new Set<string>();
  if (!v || v.isApproved === true) return out;
  const add = (id: unknown) => {
    const s = id != null && id !== "" ? String(id) : "";
    if (s && staffIdSet.has(s)) out.add(s);
  };
  add(v.staffId);
  const isAddSalaryVoucher =
    (v.type === "journal" && v.subType === "add_salary") || v.type === "add_salary";
  if (isAddSalaryVoucher && Array.isArray(v.entries)) {
    v.entries.forEach((e: any) => {
      const accountId = e?.accountId;
      if (!accountId || !staffIdSet.has(accountId)) return;
      if (Number(e?.credit || 0) <= 0) return;
      if (String(e?.narration || "").includes("(Staff ID:")) return;
      out.add(accountId);
    });
  }
  return out;
}
