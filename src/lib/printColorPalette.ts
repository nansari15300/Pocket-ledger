/** PDF print: color (green/red) vs black & white — Print options dialog se aata hai. */
export type PrintColorMode = "color" | "bw";

export type PrintColorPalette = {
  debit: string;
  credit: string;
  balanceSigned: (amount: number) => string;
  link: string;
  labelBlue: string;
  partitionText: string;
  partitionFill: string;
  muted: string;
  overdue: string;
  paid: string;
  unpaid: string;
  billWiseVoucher: (index: number) => string;
  spendWiseBorder: (colorIndex: number) => string;
};

const BILLWISE_COLOR = ["#2563eb", "#db2777", "#16a34a"] as const;
const BILLWISE_BW = ["#000000", "#333333", "#555555"] as const;

export function getPrintColorPalette(mode?: PrintColorMode): PrintColorPalette {
  const bw = mode === "bw";
  const ink = "#000000";
  const dim = "#444444";
  const cycle = bw ? BILLWISE_BW : BILLWISE_COLOR;

  return {
    debit: bw ? ink : "green",
    credit: bw ? ink : "red",
    balanceSigned: (n) => (bw ? ink : n >= 0 ? "green" : "red"),
    link: bw ? ink : "#1d4ed8",
    labelBlue: bw ? dim : "blue",
    partitionText: bw ? ink : "#1e3a8a",
    partitionFill: bw ? "#f3f4f6" : "#dbeafe",
    muted: "#555555",
    overdue: bw ? dim : "red",
    paid: bw ? ink : "green",
    unpaid: bw ? dim : "red",
    billWiseVoucher: (i) => cycle[i % 3],
    spendWiseBorder: (idx) => {
      if (bw) return cycle[idx === 1 ? 1 : idx === 2 ? 2 : 0];
      if (idx === 1) return "#16a34a";
      if (idx === 2) return "#db2777";
      return "#2563eb";
    },
  };
}
