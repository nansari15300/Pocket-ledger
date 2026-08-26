"use client";

import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDate } from "@/hooks/useDate";
import { applyPaymentBillWiseLinkAllocations } from "@/lib/voucherActionsClient";
import {
  applyBillWiseAutoLinkPromptChoice,
  isBillWiseAutoLinkPromptSuppressed,
  type BillWiseAutoLinkSnoozeChoice,
} from "@/lib/billWiseAutoLinkPromptPrefs";
import {
  buildPartyBillWiseAutoLinkProposal,
  groupSelectedAutoLinkAllocations,
  voucherTouchesLedger,
  type BillWiseAutoLinkProposal,
  type BillWiseAutoLinkProposalRow,
} from "@/lib/billWiseSettledUnlinkedDetector";

function formatAmt(n: number): string {
  return (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function toJsDate(value: unknown): Date | null {
  const raw = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  const date = raw ? new Date(raw as string | number | Date) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function linkTouchesPair(row: BillWiseAutoLinkProposalRow, a: string, b: string): boolean {
  return (
    (row.sourceVoucherId === a && row.targetVoucherId === b) ||
    (row.sourceVoucherId === b && row.targetVoucherId === a)
  );
}

/** Soft backgrounds so each linked DR/CR cluster shares one color. */
const LINK_GROUP_BG = [
  "bg-sky-50",
  "bg-violet-50",
  "bg-emerald-50",
  "bg-rose-50",
  "bg-amber-50",
  "bg-cyan-50",
  "bg-fuchsia-50",
  "bg-lime-50",
  "bg-orange-50",
  "bg-indigo-50",
];

/** Tick colors match the link group (visible without click). */
const LINK_GROUP_TICK = [
  "border-sky-600 data-[state=checked]:bg-sky-600 data-[state=checked]:border-sky-600 data-[state=checked]:text-white",
  "border-violet-600 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600 data-[state=checked]:text-white",
  "border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 data-[state=checked]:text-white",
  "border-rose-600 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600 data-[state=checked]:text-white",
  "border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 data-[state=checked]:text-white",
  "border-cyan-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600 data-[state=checked]:text-white",
  "border-fuchsia-600 data-[state=checked]:bg-fuchsia-600 data-[state=checked]:border-fuchsia-600 data-[state=checked]:text-white",
  "border-lime-600 data-[state=checked]:bg-lime-600 data-[state=checked]:border-lime-600 data-[state=checked]:text-white",
  "border-orange-600 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600 data-[state=checked]:text-white",
  "border-indigo-600 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white",
];

/**
 * Group color key: each DR is its own group; each CR joins the DR it links to most.
 * That keeps Sale-025 cluster and Sale-026 cluster visually separate even when
 * a receipt is split across both.
 */
function buildLinkGroupMapFromLedger(
  rows: BillWiseAutoLinkProposalRow[],
  ledgerRows: Array<{ voucherId: string; side: "dr" | "cr" }>
): Map<string, number> {
  const sideById = new Map(ledgerRows.map((r) => [r.voucherId, r.side]));
  const linkToDr = new Map<string, Map<string, number>>();

  const add = (crId: string, drId: string, amount: number) => {
    const map = linkToDr.get(crId) ?? new Map<string, number>();
    map.set(drId, (map.get(drId) ?? 0) + amount);
    linkToDr.set(crId, map);
  };

  for (const row of rows) {
    const sourceSide = sideById.get(row.sourceVoucherId);
    const targetSide = sideById.get(row.targetVoucherId);
    if (sourceSide === "cr" && targetSide === "dr") {
      add(row.sourceVoucherId, row.targetVoucherId, row.amount);
    } else if (sourceSide === "dr" && targetSide === "cr") {
      add(row.targetVoucherId, row.sourceVoucherId, row.amount);
    }
  }

  const groupKeyByVoucher = new Map<string, string>();
  for (const row of ledgerRows) {
    if (row.side === "dr") {
      groupKeyByVoucher.set(row.voucherId, row.voucherId);
      continue;
    }
    const drLinks = linkToDr.get(row.voucherId);
    if (!drLinks || drLinks.size === 0) {
      groupKeyByVoucher.set(row.voucherId, row.voucherId);
      continue;
    }
    let bestDr = "";
    let bestAmt = -1;
    for (const [drId, amt] of drLinks) {
      if (amt > bestAmt) {
        bestAmt = amt;
        bestDr = drId;
      }
    }
    groupKeyByVoucher.set(row.voucherId, bestDr || row.voucherId);
  }

  const keyToIndex = new Map<string, number>();
  const out = new Map<string, number>();
  let next = 0;
  for (const row of ledgerRows) {
    const key = groupKeyByVoucher.get(row.voucherId) ?? row.voucherId;
    if (!keyToIndex.has(key)) keyToIndex.set(key, next++);
    out.set(row.voucherId, keyToIndex.get(key)!);
  }
  return out;
}

export function BillWiseAutoLinkPromptDialog({
  open,
  onOpenChange,
  proposal,
  companyId,
  userId,
  vouchers,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: BillWiseAutoLinkProposal | null;
  companyId: string;
  userId: string;
  vouchers: any[];
  onApplied?: () => void;
}) {
  const { formatDateBySystem } = useDate();
  const renderRowDate = React.useCallback(
    (value: unknown): string => {
      const d = toJsDate(value);
      return d ? formatDateBySystem(d) : "—";
    },
    [formatDateBySystem]
  );
  const [rows, setRows] = React.useState<BillWiseAutoLinkProposalRow[]>([]);
  const [askAgain, setAskAgain] = React.useState<BillWiseAutoLinkSnoozeChoice>("later");
  const [saving, setSaving] = React.useState(false);
  const [activeVoucherId, setActiveVoucherId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && proposal) {
      setRows(proposal.rows.map((r) => ({ ...r, selected: true })));
      setAskAgain("later");
      setSaving(false);
      setActiveVoucherId(null);
    }
  }, [open, proposal]);

  if (!proposal) return null;

  const selectedCount = rows.filter((r) => r.selected).length;
  const selectedTotal = rows.filter((r) => r.selected).reduce((s, r) => s + r.amount, 0);
  const activeLinks = activeVoucherId
    ? rows.filter(
        (row) =>
          row.sourceVoucherId === activeVoucherId || row.targetVoucherId === activeVoucherId
      )
    : [];
  const connectedVoucherIds = new Set(
    activeLinks.flatMap((row) => [row.sourceVoucherId, row.targetVoucherId])
  );
  const linkGroupByVoucher = buildLinkGroupMapFromLedger(rows, proposal.ledgerRows);

  const linkedAmountToActive = (voucherId: string): number => {
    if (!activeVoucherId || voucherId === activeVoucherId) return 0;
    return rows
      .filter((row) => row.selected && linkTouchesPair(row, activeVoucherId, voucherId))
      .reduce((sum, row) => sum + row.amount, 0);
  };

  const rememberChoice = (choice: BillWiseAutoLinkSnoozeChoice) => {
    applyBillWiseAutoLinkPromptChoice({
      companyId,
      userId,
      ledgerId: proposal.ledgerId,
      fingerprint: proposal.fingerprint,
      choice,
    });
  };

  const handleDismiss = (choice: BillWiseAutoLinkSnoozeChoice = askAgain) => {
    rememberChoice(choice);
    onOpenChange(false);
  };

  const handleLater = () => {
    handleDismiss(askAgain);
  };

  const handleYes = () => {
    const selected = rows.filter((r) => r.selected);
    if (!selected.length) {
      toast.error("Select at least one proposed link.");
      return;
    }
    setSaving(true);
    // Close immediately; link writes can continue in the background without
    // making the review dialog look frozen.
    rememberChoice(askAgain === "later" ? "later" : askAgain);
    onOpenChange(false);

    void (async () => {
      try {
        const batches = groupSelectedAutoLinkAllocations(selected, vouchers);
        for (const batch of batches) {
          await applyPaymentBillWiseLinkAllocations(companyId, batch.source, batch.allocations);
        }
        toast.success(
          `Linked ${selected.length} bill-wise allocation${selected.length === 1 ? "" : "s"}.`
        );
        onApplied?.();
      } catch (e: any) {
        toast.error(e?.message || "Failed to save auto links.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const toggleAll = (selected: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected })));
  };

  const linksForVoucher = (voucherId: string) =>
    rows.filter(
      (row) => row.sourceVoucherId === voucherId || row.targetVoucherId === voucherId
    );

  const isVoucherTickSelected = (voucherId: string) => {
    const links = linksForVoucher(voucherId);
    return links.length > 0 && links.every((row) => row.selected);
  };

  const toggleLinksForVoucher = (voucherId: string, selected: boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.sourceVoucherId === voucherId || row.targetVoucherId === voucherId
          ? { ...row, selected }
          : row
      )
    );
  };

  const toggleLinksWithActive = (otherVoucherId: string, selected: boolean) => {
    if (!activeVoucherId || otherVoucherId === activeVoucherId) return;
    setRows((prev) =>
      prev.map((row) =>
        linkTouchesPair(row, activeVoucherId, otherVoucherId) ? { ...row, selected } : row
      )
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        if (!o) handleDismiss(askAgain);
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-3 rounded-lg pt-3 px-[3px]">
        <DialogHeader className="flex-shrink-0 space-y-0.5 text-center sm:text-center">
          <p className="text-xs text-muted-foreground leading-tight">
            Link for bill wise ({selectedCount})
          </p>
          <DialogTitle className="text-xl leading-tight">Auto Link DR and CR Transactions</DialogTitle>
          <DialogDescription className="text-sm">
            <span className="font-semibold text-foreground">{proposal.ledgerName}</span> · all
            transactions mixed by date. Same tick color = linked DR/CR group. Click a row for
            ledger-hover highlight on related rows.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-center gap-4 text-sm shrink-0">
          <span className="text-muted-foreground">
            Unlinked DR: <strong className="text-foreground">Rs. {formatAmt(proposal.drOpenTotal)}</strong>
          </span>
          <span className="text-muted-foreground">
            Unlinked CR: <strong className="text-foreground">Rs. {formatAmt(proposal.crOpenTotal)}</strong>
          </span>
          <span className="text-muted-foreground">
            Auto link: <strong className="text-foreground">Rs. {formatAmt(selectedTotal)}</strong>
          </span>
          <span className="text-muted-foreground">
            Balance:{" "}
            <strong className="text-foreground">
              Rs. {formatAmt(Math.abs(proposal.closingBalance))}{" "}
              {proposal.closingBalance >= 0 ? "Dr" : "Cr"}
            </strong>
          </span>
        </div>

        <div className="flex items-center justify-between text-xs shrink-0">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={selectedCount > 0 && selectedCount === rows.length}
              onCheckedChange={(v) => toggleAll(!!v)}
            />
            Select all proposed links ({selectedCount}/{rows.length})
          </label>
          {activeVoucherId ? (
            <span className="text-muted-foreground">
              Click highlight: related rows like ledger hover ({activeLinks.length})
            </span>
          ) : (
            <span className="text-muted-foreground">
              {rows.length
                ? "Same tick color = linked DR/CR group · click for hover highlight"
                : "No new system link suggested — review existing rows here."}
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 border rounded-md overflow-auto scrollbar-slim-dim">
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 w-10 whitespace-nowrap"></th>
                <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                <th className="text-left p-2 font-medium whitespace-nowrap">Type</th>
                <th className="text-right p-2 font-medium whitespace-nowrap">Dr</th>
                <th className="text-right p-2 font-medium whitespace-nowrap">Cr</th>
                <th className="text-right p-2 font-medium whitespace-nowrap">Linked</th>
                <th className="text-right p-2 font-medium whitespace-nowrap">Auto Link</th>
                <th className="text-right p-2 font-medium whitespace-nowrap">Balance</th>
              </tr>
            </thead>
            <tbody>
              {proposal.ledgerRows.map((row) => {
                const isActive = activeVoucherId === row.voucherId;
                const isPartner =
                  !!activeVoucherId && connectedVoucherIds.has(row.voucherId) && !isActive;
                const partnerLinkAmount = linkedAmountToActive(row.voucherId);
                const hasProposed = row.proposedLinked > 0 || linksForVoucher(row.voucherId).length > 0;
                const rowTickSelected = isPartner
                  ? partnerLinkAmount > 0
                  : isVoucherTickSelected(row.voucherId);
                const sideSuffix = row.side === "dr" ? "Dr" : "Cr";
                const drAmt = row.side === "dr" ? row.amount : 0;
                const crAmt = row.side === "cr" ? row.amount : 0;
                const groupIdx = linkGroupByVoucher.get(row.voucherId) ?? 0;
                const groupBg = LINK_GROUP_BG[groupIdx % LINK_GROUP_BG.length];
                // Click: ledger-hover style full-row highlight for selected + related.
                // No click: each linked DR/CR cluster keeps its own soft group color.
                const rowBg = isActive || isPartner
                  ? "bg-blue-100 hover:bg-blue-100"
                  : groupBg;
                return (
                  <tr
                    key={row.voucherId}
                    onClick={() =>
                      setActiveVoucherId((current) =>
                        current === row.voucherId ? null : row.voucherId
                      )
                    }
                    className={`border-b last:border-b-0 cursor-pointer transition-colors ${rowBg} ${
                      activeVoucherId && !isActive && !isPartner ? "opacity-55" : ""
                    }`}
                    title={
                      isActive
                        ? "Selected voucher"
                        : isPartner
                          ? "Linked to selected voucher"
                          : "Same color = same linked DR/CR group · click to highlight related"
                    }
                  >
                    <td className="p-2 w-10 whitespace-nowrap align-middle">
                      {hasProposed ? (
                        <Checkbox
                          checked={rowTickSelected}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) => {
                            if (isPartner) toggleLinksWithActive(row.voucherId, !!checked);
                            else toggleLinksForVoucher(row.voucherId, !!checked);
                          }}
                          className={LINK_GROUP_TICK[groupIdx % LINK_GROUP_TICK.length]}
                          title={
                            rowTickSelected
                              ? "Included in proposed links (group color)"
                              : "Include this voucher's proposed links"
                          }
                        />
                      ) : (
                        <span className="inline-block h-4 w-4" />
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap align-middle">
                      {renderRowDate(row.date)}
                    </td>
                    <td className="p-2 font-medium whitespace-nowrap align-middle">{row.voucherNumber}</td>
                    <td className="p-2 whitespace-nowrap align-middle">{row.typeLabel}</td>
                    <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap align-middle tabular-nums">
                      {drAmt > 0 ? `Rs. ${formatAmt(drAmt)}` : "—"}
                    </td>
                    <td className="p-2 text-right font-medium text-red-600 whitespace-nowrap align-middle tabular-nums">
                      {crAmt > 0 ? `Rs. ${formatAmt(crAmt)}` : "—"}
                    </td>
                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap align-middle tabular-nums">
                      Rs. {formatAmt(row.linked)}
                    </td>
                    <td className="p-2 text-right font-medium text-blue-700 whitespace-nowrap align-middle tabular-nums">
                      Rs.{" "}
                      {formatAmt(
                        isPartner ? partnerLinkAmount || row.proposedLinked : row.proposedLinked
                      )}
                    </td>
                    <td className="p-2 text-right font-medium whitespace-nowrap align-middle tabular-nums">
                      Rs. {formatAmt(row.balance)} {sideSuffix}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5 shrink-0">
          <div className="text-xs font-medium">Ask me again</div>
          <Select
            value={askAgain}
            onValueChange={(v) => setAskAgain(v as BillWiseAutoLinkSnoozeChoice)}
            disabled={saving}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="later">Later (close only)</SelectItem>
              <SelectItem value="next_visit">Ask me next visit</SelectItem>
              <SelectItem value="next_day">Ask me next day</SelectItem>
              <SelectItem value="next_week">Ask me next week</SelectItem>
              <SelectItem value="never_ledger">Never ask for this ledger</SelectItem>
              <SelectItem value="never_company">Never ask for this company</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 border-t pt-2">
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={handleLater}>
            Later
          </Button>
          <Button type="button" size="sm" disabled={saving || selectedCount === 0} onClick={() => void handleYes()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Yes, auto link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function usePartyBillWiseAutoLinkPrompt(opts: {
  enabled: boolean;
  companyId?: string | null;
  userId?: string | null;
  ledgerId?: string | null;
  ledgerName?: string | null;
  ledgerKind?: "party" | "staff";
  vouchers: any[];
}) {
  const { enabled, companyId, userId, ledgerId, ledgerName, vouchers, ledgerKind = "party" } = opts;
  const [open, setOpen] = React.useState(false);
  const [proposal, setProposal] = React.useState<BillWiseAutoLinkProposal | null>(null);
  const promptedFpRef = React.useRef<string | null>(null);
  const voucherSig = React.useMemo(() => {
    if (!ledgerId || !Array.isArray(vouchers)) return "";
    return vouchers
      .filter((v) => voucherTouchesLedger(v, ledgerId, ledgerKind))
      .map((v) => {
        const alloc = Array.isArray(v.allocations)
          ? v.allocations
              .map((a: any) => `${a?.voucherId}:${a?.amount}:${a?.linkedAccountId ?? ""}`)
              .join(",")
          : "";
        return `${v.id}:${v.type}:${v.amount ?? v.total}:${alloc}`;
      })
      .join("|");
  }, [vouchers, ledgerId, ledgerKind]);

  React.useEffect(() => {
    if (!enabled || !companyId || !userId || !ledgerId || ledgerId === "all") {
      setOpen(false);
      setProposal(null);
      return;
    }

    const built = buildPartyBillWiseAutoLinkProposal({
      ledgerId,
      ledgerName: ledgerName || (ledgerKind === "staff" ? STAFF_ENTITY_LABEL : "Party"),
      ledgerKind,
      vouchers,
    });
    if (!built) {
      setProposal(null);
      setOpen(false);
      promptedFpRef.current = null;
      return;
    }

    // The toolbar still opens this full ledger review when every row is already
    // linked / no new pair is suggested. Only automatic prompting needs rows.
    if (!built.rows.length) {
      setProposal(built);
      setOpen(false);
      return;
    }

    if (
      isBillWiseAutoLinkPromptSuppressed({
        companyId,
        userId,
        ledgerId,
        fingerprint: built.fingerprint,
      })
    ) {
      setProposal(built);
      setOpen(false);
      return;
    }

    setProposal(built);
    if (promptedFpRef.current === built.fingerprint) return;
    promptedFpRef.current = built.fingerprint;
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [enabled, companyId, userId, ledgerId, ledgerName, ledgerKind, voucherSig, vouchers]);

  return { open, setOpen, proposal };
}
