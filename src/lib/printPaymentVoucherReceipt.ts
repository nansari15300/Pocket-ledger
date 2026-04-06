import { openPrintDirect, type PrintPayload } from "@/lib/printDirect";

/**
 * Payment In/Out Save & Print: pdfmake receipt + openPrintDirect(..., true).
 * Same preview path as reports — mobile/static = in-app PDF.js overlay (window.open receipt route avoid).
 */
export async function printPaymentVoucherReceipt(opts: {
  company: PrintPayload["company"];
  dateSystem: PrintPayload["dateSystem"];
  formatDate: (d: Date) => string;
  formatDateBS: (d: Date) => string;
  formatCurrencyForPrint: (n: number, o?: { noSuffix?: boolean; noAnimation?: boolean }) => string;
  voucherId: string;
  voucherType: string;
  date: Date;
  voucherNumber: string;
  amount: number;
  narration?: string;
  payeeLabel: string;
  accountLabel: string;
}): Promise<void> {
  const isOut = opts.voucherType === "payment_out" || opts.voucherType === "direct_expense";
  const titleSuffix = isOut ? "Payment voucher" : "Receipt voucher";
  const dateRangeText =
    opts.dateSystem === "BS"
      ? opts.formatDateBS(opts.date)
      : opts.dateSystem === "AD"
        ? opts.formatDate(opts.date)
        : `${opts.formatDateBS(opts.date)} (${opts.formatDate(opts.date)})`;

  const amountText = opts.formatCurrencyForPrint(opts.amount, { noSuffix: true, noAnimation: true });

  const tableRows: (Record<string, unknown> | string)[][] = [
    [{ text: "Voucher No.", bold: true }, opts.voucherNumber],
    [{ text: "Date (BS)", bold: true }, opts.formatDateBS(opts.date)],
  ];
  if (opts.dateSystem !== "BS") {
    tableRows.push([{ text: "Date (AD)", bold: true }, opts.formatDate(opts.date)]);
  }
  tableRows.push(
    [{ text: isOut ? "Paid to" : "Received from", bold: true }, opts.payeeLabel],
    [{ text: "Bank / Cash", bold: true }, opts.accountLabel],
    [{ text: "Amount", bold: true }, amountText]
  );
  if (opts.narration?.trim()) {
    tableRows.push([{ text: "Narration", bold: true }, opts.narration.trim()]);
  }

  await openPrintDirect(
    {
      company: {
        ...opts.company,
        decimalPlaces: opts.company.decimalPlaces,
        showDrCr: opts.company.showDrCr,
        showCurrencySymbol: opts.company.showCurrencySymbol,
      },
      title: `${titleSuffix}: ${opts.voucherNumber}`,
      context: "daybook",
      dateSystem: opts.dateSystem,
      dateRangeText,
      vouchersCount: 1,
      openingBalance: 0,
      transactions: [
        {
          id: opts.voucherId,
          type: opts.voucherType,
          date: opts.date,
          voucherNumber: opts.voucherNumber,
          narration: opts.narration ?? "",
          amount: opts.amount,
          total: opts.amount,
          debit: isOut ? 0 : opts.amount,
          credit: isOut ? opts.amount : 0,
        },
      ],
      showNarration: true,
      customContent: [
        {
          stack: [
            { text: titleSuffix.toUpperCase(), style: "subheader", alignment: "center", margin: [0, 0, 0, 12] },
            {
              table: { widths: ["35%", "*"], body: tableRows as any },
              layout: "lightHorizontalLines",
            },
          ],
        },
      ],
    },
    true
  );
}
