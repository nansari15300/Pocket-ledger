import { stripSpendWiseSyntheticOpeningMaster } from "@/lib/ledgerPagePrint";
import { applySpendWiseStatementRunningBalances } from "@/lib/spendWiseStatementRunningBalance";
import { getOpeningBalanceBaseAmount, getOpeningBalanceVoucherLabel, SPEND_WISE_OPENING_BALANCE_ID } from "@/lib/spendWiseOpeningBalance";
import {
  buildSpendWiseAddedInflowVoucherIds,
  filterSpendWiseRowsByDateRange,
} from "@/lib/spendWiseDateRangeGroups";
import { reorderSpendWiseRowsByDate } from "@/lib/spendWisePagination";

/**
 * Bank/Cash AccountDetails jaisa spend-wise row order — report page reuse ke liye (single account only).
 * `baseTransactions` = poori ledger; optional `dateRange` sirf rows hide karta hai.
 */
export function buildBankAccountSpendWiseRows(options: {
  accountId: string;
  openingBalanceForPeriod: number;
  booksOpeningBalance?: number;
  baseTransactions: any[];
  vouchers: any[];
  dateRange?: { from?: Date | null; to?: Date | null };
}): any[] {
  const { accountId, openingBalanceForPeriod, booksOpeningBalance, baseTransactions, vouchers, dateRange } = options;
  if (!vouchers?.length) return baseTransactions;

  const buildBase = baseTransactions;
  const byId = new Map(buildBase.map((t: any) => [t.id, t]));

  const getDateMs = (v: any) => {
    const d = v.date?.toDate ? v.date.toDate() : new Date(v.date);
    return d.getTime();
  };

  const isInVoucher = (v: any) =>
    (v.type === "payment_in" && v.accountId === accountId) ||
    (v.type === "direct_income" && v.accountId === accountId) ||
    (v.type === "contra" && v.toAccountId === accountId);

  const linkedOutFilter = (v: any, inId: string) => {
    const hasAccount =
      (v.type === "payment_out" && v.accountId === accountId) ||
      (v.type === "direct_expense" && v.accountId === accountId) ||
      (v.type === "contra" && v.fromAccountId === accountId);
    return hasAccount && Array.isArray(v.linkedPaymentInIds) && v.linkedPaymentInIds.includes(inId);
  };

  const isOpeningLinkedIn = (v: any) =>
    (v.linkedOpeningBalanceAccountId ?? "") === accountId &&
    (Number(v.linkedOpeningBalanceAmount) || 0) > 0;
  const openingLinkedInIds = new Set(
    vouchers
      .filter((v: any) => !v.isDeleted && isInVoucher(v) && isOpeningLinkedIn(v))
      .map((v: any) => v.id)
  );
  const openingLinkedOutIds = new Set(
    vouchers
      .filter((v: any) => !v.isDeleted && linkedOutFilter(v, SPEND_WISE_OPENING_BALANCE_ID))
      .map((v: any) => v.id)
  );

  const inVouchers = vouchers
    .filter((v: any) => !v.isDeleted && isInVoucher(v))
    .sort((a: any, b: any) => getDateMs(a) - getDateMs(b));

  const voucherToInRow = (v: any) => {
    const existing = byId.get(v.id);
    if (existing) return existing;
    const amount = Number(v.amount ?? v.total ?? 0) || 0;
    const voucherNo = v.type === "contra" && accountId === v.toAccountId ? (v.voucherNumberIn ?? v.voucherNumber) : v.voucherNumber;
    return { id: v.id, date: v.date, type: v.type, voucherNumber: voucherNo, debit: amount, credit: 0, userId: v.userId, narration: v.narration, accountId: v.accountId, ...v };
  };

  const voucherToOutRow = (v: any) => {
    const existing = byId.get(v.id);
    if (existing) return existing;
    const amount = Number(v.total ?? v.amount ?? 0) || 0;
    const voucherNo = v.type === "contra" && accountId === v.fromAccountId ? (v.voucherNumberOut ?? v.voucherNumber) : v.voucherNumber;
    return {
      id: v.id,
      date: v.date,
      type: v.type,
      voucherNumber: voucherNo,
      debit: 0,
      credit: amount,
      userId: v.userId,
      narration: v.narration,
      accountId: v.accountId,
      ...v,
    };
  };

  const rows: any[] = [];
  let groupColorIndex = 0;
  let rowKeySeed = 0;
  const nextColor = () => (groupColorIndex++) % 4;
  const nextRowKey = () => `r-${rowKeySeed++}`;
  const linkedAmountByOutId = new Map<string, number>();
  const linkedAmountByInId = new Map<string, number>();

  inVouchers.forEach((pi: any) => {
    const t = voucherToInRow(pi);
    const spendWiseGroupId = `sw-group-in-${pi.id}`;
    const linkedOuts = vouchers
      .filter((v: any) => !v.isDeleted && linkedOutFilter(v, pi.id))
      .sort((a: any, b: any) => getDateMs(a) - getDateMs(b));
    const hasLinkedGroup = linkedOuts.length > 0;
    const colorIdx = nextColor();
    const groupRunning = (t.debit || 0) - (t.credit || 0);
    if (hasLinkedGroup) {
      rows.push({
        ...t,
        _rowKey: nextRowKey(),
        _spendWiseGroupId: spendWiseGroupId,
        _spendWiseGroupFirst: true,
        _spendWiseGroupLast: false,
        _spendWiseRunningBalance: groupRunning,
        _spendWiseGroupColorIndex: colorIdx,
      });
    } else {
      rows.push({
        ...t,
        _rowKey: nextRowKey(),
        _spendWiseGroupId: spendWiseGroupId,
        _spendWiseGroupFirst: true,
        _spendWiseGroupLast: true,
        _spendWiseRunningBalance: groupRunning,
        _spendWiseGroupColorIndex: colorIdx,
      });
      rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-pi-${pi.id}`, _rowKey: nextRowKey() });
    }
    linkedOuts.forEach((po: any, idx: number) => {
      const outRow = voucherToOutRow(po);
      const prevRunning = rows.length > 0 ? (rows[rows.length - 1] as any)._spendWiseRunningBalance : 0;
      const fullAmount = Number(po.total ?? po.amount ?? 0) || Math.abs((outRow.debit || 0) - (outRow.credit || 0)) || 0;
      const linkedAmounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
      const linkedAmount = linkedAmounts?.[pi.id] != null ? Number(linkedAmounts[pi.id]) : fullAmount / (po.linkedPaymentInIds?.length || 1);
      linkedAmountByOutId.set(po.id, (linkedAmountByOutId.get(po.id) ?? 0) + linkedAmount);
      const amountDelta = (outRow.credit || 0) > (outRow.debit || 0) ? -linkedAmount : linkedAmount;
      const nextRunning = typeof prevRunning === "number" ? prevRunning + amountDelta : prevRunning;
      rows.push({
        ...outRow,
        id: `${po.id}-in-${pi.id}`,
        _baseVoucherId: po.id,
        _rowKey: nextRowKey(),
        _spendWiseGroupId: spendWiseGroupId,
        _spendWiseChild: true,
        _spendWiseGroupFirst: false,
        _spendWiseGroupLast: idx === linkedOuts.length - 1,
        _spendWiseRunningBalance: nextRunning,
        _spendWiseGroupColorIndex: colorIdx,
        _spendWiseLinkedAmount: linkedAmount,
      });
    });
    if (hasLinkedGroup) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-in-${pi.id}`, _rowKey: nextRowKey() });
  });

  const masterBooksOb = Number(booksOpeningBalance ?? 0) || openingBalanceForPeriod;
  const openingSide = masterBooksOb >= 0 ? "dr" : "cr";
  const openingBase = getOpeningBalanceBaseAmount(masterBooksOb, openingSide);
  if (openingBase > 0 && ((openingSide === "cr" && openingLinkedInIds.size > 0) || (openingSide === "dr" && openingLinkedOutIds.size > 0))) {
    const colorIdx = nextColor();
    const spendWiseGroupId = "sw-group-opening-balance";
    const openingIsCr = openingSide === "cr";
    let openingRunning = openingIsCr ? -openingBase : openingBase;
    rows.push({
      id: "__opening_balance_group__",
      _rowKey: nextRowKey(),
      _spendWiseGroupId: spendWiseGroupId,
      type: "opening_balance",
      voucherNumber: getOpeningBalanceVoucherLabel(openingSide),
      date: undefined,
      debit: openingIsCr ? 0 : openingBase,
      credit: openingIsCr ? openingBase : 0,
      narration: "",
      _spendWiseGroupFirst: true,
      _spendWiseGroupLast: false,
      _spendWiseRunningBalance: openingRunning,
      _spendWiseGroupColorIndex: colorIdx,
    });
    const openingLinkedRows = vouchers
      .filter((v: any) => (openingIsCr ? openingLinkedInIds.has(v.id) : openingLinkedOutIds.has(v.id)))
      .sort((a: any, b: any) => {
        const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const db = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return da.getTime() - db.getTime();
      });
    openingLinkedRows.forEach((v: any, idx: number) => {
      const rowSource = openingIsCr ? voucherToInRow(v) : voucherToOutRow(v);
      const baseAmount = Math.abs((rowSource.debit || 0) - (rowSource.credit || 0));
      const linkedAmount = openingIsCr
        ? Math.max(0, Math.min(baseAmount, Number(v.linkedOpeningBalanceAmount) || 0))
        : Math.max(
            0,
            Math.min(
              baseAmount,
              Number(
                v.linkedPaymentInAmounts && typeof v.linkedPaymentInAmounts === "object"
                  ? v.linkedPaymentInAmounts[SPEND_WISE_OPENING_BALANCE_ID]
                  : 0
              ) || baseAmount / (v.linkedPaymentInIds?.length || 1)
            )
          );
      if (openingIsCr) linkedAmountByInId.set(v.id, linkedAmount);
      else linkedAmountByOutId.set(v.id, (linkedAmountByOutId.get(v.id) ?? 0) + linkedAmount);
      openingRunning = openingIsCr ? openingRunning + linkedAmount : openingRunning - linkedAmount;
      rows.push({
        ...rowSource,
        id: `${v.id}-ob-link`,
        debit: openingIsCr ? linkedAmount : 0,
        credit: openingIsCr ? 0 : linkedAmount,
        _rowKey: nextRowKey(),
        _spendWiseGroupId: spendWiseGroupId,
        _spendWiseChild: true,
        _spendWiseGroupFirst: false,
        _spendWiseGroupLast: idx === openingLinkedRows.length - 1,
        _spendWiseRunningBalance: openingRunning,
        _spendWiseGroupColorIndex: colorIdx,
        _spendWiseLinkedAmount: linkedAmount,
      });
    });
    rows.push({ _spendWiseSpacer: true, id: "spend-wise-spacer-opening", _rowKey: nextRowKey() });
  }

  const openingStart = rows.findIndex((r: any) => r.id === "__opening_balance_group__");
  if (openingStart > 0) {
    let openingEnd = openingStart + 1;
    while (openingEnd < rows.length) {
      const cur = rows[openingEnd] as any;
      if (cur?._spendWiseGroupLast === true) {
        openingEnd++;
        if (openingEnd < rows.length && (rows[openingEnd] as any)?._spendWiseSpacer) openingEnd++;
        break;
      }
      openingEnd++;
    }
    const openingChunk = rows.splice(openingStart, openingEnd - openingStart);
    rows.unshift(...openingChunk);
  }

  const addedInflowIds = buildSpendWiseAddedInflowVoucherIds(rows);
  const unlinked = buildBase.filter((t: any) => !addedInflowIds.has(t.id));
  unlinked.forEach((t: any, idx: number) => {
    const fullAmount = Math.abs((t.debit || 0) - (t.credit || 0));
    const alreadyShown = (linkedAmountByOutId.get(t.id) ?? 0) + (linkedAmountByInId.get(t.id) ?? 0);
    const remainder = fullAmount - alreadyShown;
    if (remainder <= 0) return;
    const colorIdx = nextColor();
    const isOutflow = (t.credit || 0) > (t.debit || 0);
    const remainderRow = {
      ...voucherToOutRow(t),
      id: t.id,
      _rowKey: nextRowKey(),
      _spendWiseGroupId: `sw-group-unlinked-${t.id}`,
      debit: isOutflow ? 0 : remainder,
      credit: isOutflow ? remainder : 0,
      _spendWiseGroupFirst: true,
      _spendWiseGroupLast: true,
      _spendWiseRunningBalance: isOutflow ? -remainder : remainder,
      _spendWiseGroupColorIndex: colorIdx,
    };
    rows.push(remainderRow);
    if (idx < unlinked.length - 1) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-unlinked-${t.id}`, _rowKey: nextRowKey() });
  });

  const ordered = rows.length ? reorderSpendWiseRowsByDate(rows) : buildBase;
  const filtered = filterSpendWiseRowsByDateRange(ordered, dateRange);
  const stripped = rows.length ? stripSpendWiseSyntheticOpeningMaster(filtered) : buildBase;
  return rows.length
    ? applySpendWiseStatementRunningBalances(stripped, openingBalanceForPeriod)
    : buildBase;
}
