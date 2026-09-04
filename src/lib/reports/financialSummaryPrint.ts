import type { Content } from "pdfmake/interfaces";
import type { FinancialSummary } from "@/lib/reports/financialSummary";

function fmtAmount(n: number): string {
  if (Math.abs(n) <= 0.005) return "-";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

function line(label: string, amount: number, bold = false): Content {
  return {
    columns: [
      { text: label, bold, fontSize: bold ? 10 : 9 },
      { text: fmtAmount(amount), alignment: "right", bold, fontSize: bold ? 10 : 9 },
    ],
    margin: [0, 1, 0, 1],
  };
}

export function buildFinancialSummaryPrintContent(
  summary: FinancialSummary,
  periodLabel: string
): Content[] {
  return [
    { text: "Financial Summary", style: "header", margin: [0, 0, 0, 4] },
    { text: `Period: ${periodLabel}`, fontSize: 9, margin: [0, 0, 0, 8] },
    { text: "Key Figures", bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
    line("Revenue", summary.revenue.total),
    line("Gross Profit", summary.grossProfit.total),
    line("Net Profit", summary.netProfit.total, true),
    line("Cash + Bank", summary.cashAndBank.total),
    line("Receivable", summary.receivable.total),
    line("Payable", summary.payable.total),
    { text: "Profit & Loss", bold: true, fontSize: 10, margin: [0, 8, 0, 4] },
    line("Revenue", summary.revenue.total),
    line("Direct Cost / COGS", summary.directCost.total),
    line("Gross Profit", summary.grossProfit.total, true),
    line("Operating Expenses", summary.operatingExpenses.total),
    line("Finance Cost", summary.financeCost.total),
    line("Net Profit", summary.netProfit.total, true),
    { text: "Balance Sheet Snapshot", bold: true, fontSize: 10, margin: [0, 8, 0, 4] },
    line("Cash & Bank", summary.assets.cashAndBank),
    line("Receivables", summary.assets.receivables),
    line("Inventory", summary.assets.inventory),
    line("Total Assets", summary.assets.total, true),
    line("Payables", summary.liabilities.payables),
    line("Loans", summary.liabilities.loans),
    line("Capital", summary.equity.capital),
    line("Current Profit", summary.equity.currentProfit),
    line("Total Liabilities + Equity", summary.liabilities.total + summary.equity.total, true),
    {
      text: summary.isBalanced
        ? "Balanced: Assets = Liabilities + Equity"
        : `Difference: ${fmtAmount(Math.abs(summary.balanceDifference))}`,
      fontSize: 9,
      margin: [0, 4, 0, 0],
      color: summary.isBalanced ? "#166534" : "#b45309",
    },
    { text: "Working Capital", bold: true, fontSize: 10, margin: [0, 8, 0, 4] },
    line("Net Working Capital", summary.workingCapital.net, true),
  ];
}
