"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { LoanScheduleRow } from "../types/loanScheduleTypes";
import { LoanStatusBadge } from "./LoanStatusBadge";
import { remainingDue } from "../utils/loanStatus";
import { isEmiPayableNow } from "../utils/staffPayEmiState";
import { payEmiButtonClassName, payEmiButtonVariant } from "../utils/payEmiButtonStyle";
import { useDate } from "@/hooks/useDate";
import { LoanTableDateCell, LoanTableDateHead } from "./LoanSystemDateField";

export function LoanScheduleTable({
  rows,
  onPay,
}: {
  rows: LoanScheduleRow[];
  onPay?: (row: LoanScheduleRow) => void;
}) {
  const { formatCurrencyForPrint } = useDate();
  const money = (n: number) => formatCurrencyForPrint(n, { noAnimation: true, noSuffix: true, showDrCr: false });
  const pageRows = rows.slice(0, 240);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          Print schedule
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <LoanTableDateHead label="Due Date" />
            <LoanTableDateHead label="Payment Date" />
            <TableHead className="text-right">Opening</TableHead>
            <TableHead className="text-right">Principal</TableHead>
            <TableHead className="text-right">Interest</TableHead>
            <TableHead className="text-right">EMI</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Closing</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.installmentNumber}</TableCell>
              <LoanTableDateCell iso={row.dueDate} />
              <LoanTableDateCell iso={row.paymentDate} />
              <TableCell className="text-right tabular-nums">{money(row.openingPrincipal)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.principalDue)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.interestDue)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.totalDue)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.totalPaid)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.closingPrincipal)}</TableCell>
              <TableCell>
                <LoanStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                {onPay && remainingDue(row) > 0 && !row.isHistorical ? (
                  <Button
                    type="button"
                    variant={payEmiButtonVariant(isEmiPayableNow(row.status))}
                    size="sm"
                    className={payEmiButtonClassName(isEmiPayableNow(row.status))}
                    onClick={() => onPay(row)}
                  >
                    Pay EMI
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function LoanSchedule({ rows, onPay }: { rows: LoanScheduleRow[]; onPay?: (row: LoanScheduleRow) => void }) {
  return <LoanScheduleTable rows={rows} onPay={onPay} />;
}
