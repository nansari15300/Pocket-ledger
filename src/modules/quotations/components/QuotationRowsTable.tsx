"use client";

import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { resolveQuotationLinkedSaleVoucher } from "../convertToSale";
import { useIsMobile } from "@/hooks/use-mobile";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import { highlightQueryInText } from "@/lib/highlightQueryInText";
import { stripHtml } from "../html";
import type { QuotationDoc, QuotationLineItem } from "../types";

function quotationItemsLabel(lineItems: QuotationLineItem[] | undefined): string {
  const names = (lineItems || []).map((row) => String(row.itemName || "").trim()).filter(Boolean);
  const unique = [...new Set(names)];
  if (unique.length === 0) return "—";
  if (unique.length === 1) return unique[0];
  return "Mixed Items";
}

export function QuotationRowsTable({
  quotations,
  onEdit,
  searchTerm,
  showAccountName,
}: {
  quotations: QuotationDoc[];
  onEdit: (row: QuotationDoc) => void;
  searchTerm: string;
  showAccountName?: boolean;
}) {
  const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
  const showBothDates = dateSystem === "Both";
  const { vouchers } = useVouchers();
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const highlightQ = searchTerm.trim();
  const hl = (text: string) => (highlightQ ? highlightQueryInText(text, searchTerm) : text);

  const rows = useMemo(() => {
    if (!searchTerm.trim()) return quotations;
    return quotations.filter((row) => {
      const d = row.dateIso ? new Date(row.dateIso) : null;
      const dateBs = d ? formatDateBS(d) : "";
      const dateAd = d ? formatDate(d) : "";
      const items = (row.lineItems || []).map((item) => item.itemName).join(" ");
      const linkedSale = resolveQuotationLinkedSaleVoucher(row, vouchers);
      const amountLabel = row.amount ? formatCurrency(row.amount, { noSuffix: true }) : "";
      const haystack = [
        row.quotationNumber,
        items,
        stripHtml(row.subject),
        stripHtml(row.recipientName),
        row.accountName,
        dateBs,
        dateAd,
        amountLabel,
        linkedSale?.voucherNumber || "",
      ].join(" ");
      return masterEntityTextMatchesSearch(haystack, searchTerm);
    });
  }, [quotations, searchTerm, formatDate, formatDateBS, formatCurrency, vouchers]);

  if (rows.length === 0) {
    return (
      <div className="pl-ledger-detail-table-shell flex min-h-0 flex-1 flex-col">
        <div className="pl-ledger-detail-empty-fill flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          No quotations for this account.
        </div>
      </div>
    );
  }

  return (
    <div className="pl-ledger-detail-table-shell flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        data-theme-table="transactions"
        data-pl-txn-table-tone="default"
        className="w-full min-w-full overflow-auto pl-ledger-txn-scroll-native border-b-2 border-border"
      >
        <Table>
          <TableHeader>
            <TableRow>
              {showBothDates ? (
                <>
                  <TableHead className="w-[100px] whitespace-nowrap">Date (BS)</TableHead>
                  <TableHead className="w-[112px] whitespace-nowrap">Date (AD)</TableHead>
                </>
              ) : (
                <TableHead className="w-[120px]">Date</TableHead>
              )}
              <TableHead className="w-[120px]">No.</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="w-[140px] text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const d = row.dateIso ? new Date(row.dateIso) : null;
              const dateBs = d ? formatDateBS(d) : "—";
              const dateAd = d ? formatDate(d) : "—";
              const itemsLabel = quotationItemsLabel(row.lineItems);
              const selected = selectedId === row.id;
              const linkedSale = resolveQuotationLinkedSaleVoucher(row, vouchers);
              const amountLabel = row.amount ? formatCurrency(row.amount, { noSuffix: true }) : "—";
              const saleLabel = linkedSale?.voucherNumber ? `Sale ${linkedSale.voucherNumber}` : "";
              return (
                <TableRow
                  key={row.id}
                  className="transaction-main-row cursor-pointer"
                  data-txn-stripe={index % 2}
                  data-pl-txn-selected={selected ? "true" : undefined}
                  onClick={() => {
                    setSelectedId(row.id);
                    if (isMobile) onEdit(row);
                  }}
                  onDoubleClick={() => onEdit(row)}
                >
                  {showBothDates ? (
                    <>
                      <TableCell className="whitespace-nowrap text-xs">{hl(dateBs)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{hl(dateAd)}</TableCell>
                    </>
                  ) : (
                    <TableCell className="whitespace-nowrap text-xs">
                      {d ? hl(dateSystem === "AD" ? dateAd : dateBs) : "—"}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-xs font-medium">{hl(row.quotationNumber)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="truncate font-medium">{hl(itemsLabel)}</div>
                    {showAccountName ? (
                      <div className="truncate text-muted-foreground">{hl(row.accountName || "—")}</div>
                    ) : null}
                    {saleLabel ? (
                      <div className="truncate text-muted-foreground">{hl(saleLabel)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {highlightQ && row.amount
                      ? highlightQueryInText(String(row.amount), searchTerm)
                      : amountLabel}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="pl-ledger-detail-empty-fill min-h-0 flex-1" aria-hidden />
    </div>
  );
}
