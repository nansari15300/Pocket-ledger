"use client";

import * as React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { RecurringVoucherTemplate } from "@/lib/recurringVouchers";
import { resolveRecurringTemplateProgress } from "@/lib/recurringVouchers";
import {
  computeTemplateAccruedAmount,
  companyFlowFaceFromBody,
  journalEntryDrCrTotals,
  journalLineDrCr,
  recurringAccrualBucketForBody,
  recurringJournalLineDetailSide,
  type CompanyFlowDrCrContext,
  type RecurringDashboardLine,
  type RecurringDashboardTemplateRow,
} from "@/lib/dashboardRecurringAccrual";

function accountLabelForEntry(
  e: Record<string, unknown>,
  journalAccountNames: Record<string, string>,
  partyNameById: Map<string, string>,
  staffNameById: Map<string, string>,
): string {
  const pid = String(e.partyId || "").trim();
  if (pid) return partyNameById.get(pid) || `Party ${pid.slice(0, 6)}…`;
  const sid = String(e.staffId || "").trim();
  if (sid) return staffNameById.get(sid) || `Staff ${sid.slice(0, 6)}…`;
  const aid = String(e.accountId || "").trim();
  if (aid) return journalAccountNames[aid] || `Account ${aid.slice(0, 6)}…`;
  return "Line";
}

/** Popup Account column: journal line jisme Dr ya Cr amount hai usi khate ka naam. */
function journalEntrySideAccountLabel(
  body: Record<string, unknown>,
  side: "debit" | "credit",
  journalAccountNames: Record<string, string>,
  partyNameById: Map<string, string>,
  staffNameById: Map<string, string>,
): string {
  const entries = body.entries;
  if (!Array.isArray(entries)) return "";
  let best = "";
  let bestMag = 0;
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const { dr, cr } = journalLineDrCr(e);
    const mag = side === "debit" ? dr : cr;
    if (mag <= 0) continue;
    if (mag >= bestMag) {
      bestMag = mag;
      best = accountLabelForEntry(e, journalAccountNames, partyNameById, staffNameById);
    }
  }
  return best;
}

type UseArgs = {
  companyId: string | undefined;
  /** Company setting OFF par Firestore mat suno */
  recurringCompanyEnabled: boolean;
  vouchers: Record<string, unknown>[];
  journalAccountNames: Record<string, string>;
  partyNameById: Map<string, string>;
  staffNameById: Map<string, string>;
  /** Party/staff/tax/expense/bank se journal `accountId` classify — company in vs out accrued split */
  companyFlowCtx: CompanyFlowDrCrContext;
};

/**
 * Dashboard card: enabled `recurring_voucher_templates` + in-memory vouchers se accrued + Dr/Cr lines.
 */
export function useDashboardRecurringAccrual({
  companyId,
  recurringCompanyEnabled,
  vouchers,
  journalAccountNames,
  partyNameById,
  staffNameById,
  companyFlowCtx,
}: UseArgs): {
  loading: boolean;
  templateRows: RecurringDashboardTemplateRow[];
  detailDebitLines: RecurringDashboardLine[];
  detailCreditLines: RecurringDashboardLine[];
  /** Accrued: company out (Cr row) / company in (Dr row) — `companyFlowCtx` se weights */
  totalAccruedCr: number;
  totalAccruedDr: number;
  totalAccruedAll: number;
  /** Face totals clone body se */
  faceDr: number;
  faceCr: number;
  /** Popup footer: Dr column (inflow) − Cr column (outflow), same rounding as rows */
  detailNetCompanyDrMinusCr: number;
  /** Firestore `enabled==true` templates count — body list me na mile tab bhi UI dikhane ke liye */
  firestoreEnabledCount: number;
} {
  const [templates, setTemplates] = React.useState<Array<{ id: string; tpl: RecurringVoucherTemplate }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!companyId?.trim() || !recurringCompanyEnabled) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const col = collection(firestore, `companies/${companyId}/recurring_voucher_templates`);
    const q = query(col, where("enabled", "==", true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Array<{ id: string; tpl: RecurringVoucherTemplate }> = [];
        snap.forEach((d) => {
          rows.push({ id: d.id, tpl: d.data() as RecurringVoucherTemplate });
        });
        setTemplates(rows);
        setLoading(false);
      },
      () => {
        setTemplates([]);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [companyId, recurringCompanyEnabled]);

  const voucherById = React.useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const v of vouchers) {
      const id = String((v as { id?: string }).id || "").trim();
      if (id) m.set(id, v as Record<string, unknown>);
    }
    return m;
  }, [vouchers]);

  void tick;

  return React.useMemo(() => {
    const round2 = (x: number) => Math.round(x * 100) / 100;
    const nowMs = Date.now();
    const templateRows: RecurringDashboardTemplateRow[] = [];
    const detailDebitLines: RecurringDashboardLine[] = [];
    const detailCreditLines: RecurringDashboardLine[] = [];
    let totalAccruedCr = 0;
    let totalAccruedDr = 0;
    let faceDr = 0;
    let faceCr = 0;

    for (const { id: templateDocId, tpl } of templates) {
      const bodyId = String(tpl.cloneSourceVoucherId || "").trim() || String(tpl.sourceVoucherId || "").trim();
      if (!bodyId) continue;
      const body = voucherById.get(bodyId);
      if (!body) continue;
      // Dashboard recurring sirf journal body — sale/purchase etc. ke purane templates aggregate se hatao
      const vtype = String(body.type || tpl.sourceVoucherType || "").trim();
      if (vtype !== "journal") continue;
      const lastVid = String(tpl.lastGeneratedVoucherId || "").trim();
      const lastGen = lastVid ? voucherById.get(lastVid) : undefined;
      // Delete/recycle last auto: stale `lastGeneratedPeriodKey` se next-due skip + accrued 0 na ho
      const progress = resolveRecurringTemplateProgress(tpl, lastGen);
      const accrued = computeTemplateAccruedAmount(
        tpl,
        body,
        progress.lastGeneratedAtMs,
        nowMs,
        progress.lastGeneratedPeriodKey,
      );
      const { dr, cr } = journalEntryDrCrTotals(body);
      // Sirf journal body yahan tak — sale/purchase face rule pehle `continue` se hata chuke
      const drTotal = dr;
      const crTotal = cr;
      faceDr += drTotal;
      faceCr += crTotal;
      const { inDr: flowIn, outCr: flowOut } = companyFlowFaceFromBody(body, companyFlowCtx);
      const flowSum = flowIn + flowOut;
      const bucket: "dr" | "cr" = flowOut > flowIn ? "cr" : "dr";
      if (accrued != null && accrued > 0) {
        if (flowSum > 0) {
          totalAccruedDr += accrued * (flowIn / flowSum);
          totalAccruedCr += accrued * (flowOut / flowSum);
        } else {
          const lit = drTotal + crTotal;
          if (lit > 0) {
            totalAccruedDr += accrued * (drTotal / lit);
            totalAccruedCr += accrued * (crTotal / lit);
          } else {
            const legacy = recurringAccrualBucketForBody(body);
            if (legacy === "cr") totalAccruedCr += accrued;
            else totalAccruedDr += accrued;
          }
        }
      }
      templateRows.push({
        templateDocId,
        bodyVoucherId: bodyId,
        voucherNumber: String(body.voucherNumber || "").trim() || bodyId,
        narration: String(body.narration || "").trim(),
        voucherType: vtype,
        drTotal,
        crTotal,
        accrued,
        bucket,
      });

      // Popup journal: ek voucher = ek row; Dr column = debit wali line ka account, Cr = credit wali line ka account
      if (Array.isArray(body.entries)) {
        const debitKhataLabel = journalEntrySideAccountLabel(
          body,
          "debit",
          journalAccountNames,
          partyNameById,
          staffNameById,
        );
        const creditKhataLabel = journalEntrySideAccountLabel(
          body,
          "credit",
          journalAccountNames,
          partyNameById,
          staffNameById,
        );
        let scoreDr = 0;
        let scoreCr = 0;
        let labelDr = "";
        let labelCr = "";
        for (const raw of body.entries) {
          if (!raw || typeof raw !== "object") continue;
          const e = raw as Record<string, unknown>;
          const side = recurringJournalLineDetailSide(e, companyFlowCtx);
          if (!side) continue;
          const { dr: jd, cr: jc } = journalLineDrCr(e);
          const mag = jc > 0 ? jc : jd;
          if (mag <= 0) continue;
          const accountLabel = accountLabelForEntry(e, journalAccountNames, partyNameById, staffNameById);
          if (side === "dr") {
            scoreDr += mag;
            if (!labelDr) labelDr = accountLabel;
          } else {
            scoreCr += mag;
            if (!labelCr) labelCr = accountLabel;
          }
        }
        const narrShort = String(body.narration || "").trim().slice(0, 80);
        const baseLine: Omit<RecurringDashboardLine, "accountLabel" | "debit" | "credit"> = {
          templateDocId,
          bodyVoucherId: bodyId,
          voucherNumber: String(body.voucherNumber || "").trim(),
          narration: narrShort,
          voucherType: vtype,
        };
        if (accrued != null && accrued > 0) {
          const amt = round2(accrued);
          if (scoreDr > scoreCr || (scoreDr === scoreCr && scoreDr > 0)) {
            detailDebitLines.push({
              ...baseLine,
              accountLabel: debitKhataLabel || labelDr || narrShort.slice(0, 48) || "Journal",
              debit: amt,
              credit: 0,
            });
          } else if (scoreCr > 0) {
            detailCreditLines.push({
              ...baseLine,
              accountLabel: creditKhataLabel || labelCr || narrShort.slice(0, 48) || "Journal",
              debit: 0,
              credit: amt,
            });
          } else if (flowSum > 0) {
            const drAmt = round2(accrued * (flowIn / flowSum));
            const crAmt = round2(accrued * (flowOut / flowSum));
            if (drAmt >= crAmt && drAmt > 0) {
              detailDebitLines.push({ ...baseLine, accountLabel: "Journal", debit: drAmt, credit: 0 });
            } else if (crAmt > 0) {
              detailCreditLines.push({
                ...baseLine,
                accountLabel: creditKhataLabel || labelCr || "Journal",
                debit: 0,
                credit: crAmt,
              });
            }
          }
        } else {
          if (scoreDr > scoreCr && scoreDr > 0) {
            detailDebitLines.push({
              ...baseLine,
              accountLabel: debitKhataLabel || labelDr || "Journal",
              debit: round2(flowIn),
              credit: 0,
            });
          } else if (scoreCr > 0) {
            detailCreditLines.push({
              ...baseLine,
              accountLabel: creditKhataLabel || labelCr || "Journal",
              debit: 0,
              credit: round2(flowOut),
            });
          } else if (flowIn > 0 || flowOut > 0) {
            if (flowIn >= flowOut && flowIn > 0) {
              detailDebitLines.push({ ...baseLine, accountLabel: "Journal", debit: round2(flowIn), credit: 0 });
            } else if (flowOut > 0) {
              detailCreditLines.push({
                ...baseLine,
                accountLabel: creditKhataLabel || labelCr || "Journal",
                debit: 0,
                credit: round2(flowOut),
              });
            }
          }
        }
      } else if (drTotal > 0 || crTotal > 0) {
        // `entries` na ho / khaali — journal face totals se ek fallback row (vtype hamesha journal)
        const label = "Journal";
        const fl = companyFlowFaceFromBody(body, companyFlowCtx);
        let drCol = 0;
        let crCol = 0;
        if (accrued != null && accrued > 0 && flowSum > 0) {
          drCol = accrued * (fl.inDr / flowSum);
          crCol = accrued * (fl.outCr / flowSum);
        } else {
          drCol = fl.inDr;
          crCol = fl.outCr;
        }
        const rDr = round2(drCol);
        const rCr = round2(crCol);
        const base = {
          templateDocId,
          bodyVoucherId: bodyId,
          voucherNumber: String(body.voucherNumber || "").trim(),
          narration: String(body.narration || "").trim().slice(0, 80),
          voucherType: vtype,
          accountLabel: label,
          debit: 0,
          credit: 0,
        };
        // Non-journal: bhi ek hi row (dono face > 0 edge)
        if (rDr > 0 && rCr > 0) {
          const one = accrued != null && accrued > 0 ? round2(accrued) : round2(Math.max(rDr, rCr));
          if (rDr >= rCr) detailDebitLines.push({ ...base, debit: one, credit: 0 });
          else detailCreditLines.push({ ...base, debit: 0, credit: one });
        } else if (rDr > 0) {
          detailDebitLines.push({ ...base, debit: rDr, credit: 0 });
        } else if (rCr > 0) {
          detailCreditLines.push({ ...base, debit: 0, credit: rCr });
        }
      }
    }

    const totalAccruedAll = totalAccruedCr + totalAccruedDr;
    // Card shell / “waiting for vouchers”: sirf journal recurring templates ginna (non-journal legacy ignore)
    const firestoreEnabledCount = templates.filter(({ tpl: t }) => {
      const bid = String(t.cloneSourceVoucherId || "").trim() || String(t.sourceVoucherId || "").trim();
      const b = bid ? voucherById.get(bid) : undefined;
      const vt = b ? String(b.type || t.sourceVoucherType || "").trim() : String(t.sourceVoucherType || "").trim();
      return vt === "journal";
    }).length;
    const sumDrCol = detailDebitLines.reduce((s, r) => s + r.debit, 0);
    const sumCrCol = detailCreditLines.reduce((s, r) => s + r.credit, 0);
    const detailNetCompanyDrMinusCr = round2(sumDrCol - sumCrCol);

    return {
      loading,
      templateRows,
      detailDebitLines,
      detailCreditLines,
      totalAccruedCr: round2(totalAccruedCr),
      totalAccruedDr: round2(totalAccruedDr),
      totalAccruedAll: round2(totalAccruedAll),
      faceDr,
      faceCr,
      detailNetCompanyDrMinusCr,
      firestoreEnabledCount,
    };
  }, [templates, voucherById, journalAccountNames, partyNameById, staffNameById, companyFlowCtx, loading, tick]);
}
