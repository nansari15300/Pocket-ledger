/**
 * Cash flow dialog / print: Party, Staff, Tax, Other pehle; "Income / Expense" block neeche.
 * Category keys `item.type.replace('/', '_').toLowerCase()` se aate hain — e.g. `income_expense`.
 */
export function orderedCashFlowCategories<T>(categorized: Record<string, T>): [string, T][] {
  const entries = Object.entries(categorized);
  const incomeExpenseRank = (key: string) => {
    const k = key.toLowerCase().replace(/\s+/g, "");
    return k === "income_expense" ? 1 : 0;
  };
  return entries.sort(([a], [b]) => {
    const ra = incomeExpenseRank(a);
    const rb = incomeExpenseRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}
