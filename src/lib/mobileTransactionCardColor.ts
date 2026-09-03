export type MobileTransactionCardColor =
  | "default"
  | "blue"
  | "pink"
  | "amber"
  | "violet";

export const MOBILE_TRANSACTION_CARD_COLOR_KEY =
  "pocket-ledger:mobile-transaction-card-color:v1";
export const MOBILE_TRANSACTION_CARD_COLOR_CHANGED_EVENT =
  "pl-mobile-transaction-card-color-changed";

export function parseMobileTransactionCardColor(
  raw: unknown
): MobileTransactionCardColor {
  if (
    raw === "blue" ||
    raw === "pink" ||
    raw === "amber" ||
    raw === "violet" ||
    raw === "default"
  ) {
    return raw;
  }
  return "default";
}

export function readMobileTransactionCardColor(): MobileTransactionCardColor {
  if (typeof window === "undefined") return "default";
  try {
    const stored = window.localStorage.getItem(MOBILE_TRANSACTION_CARD_COLOR_KEY);
    // An empty browser preference starts in the visual Default tab, not Green.
    const color =
      stored === null ? "violet" : parseMobileTransactionCardColor(stored);
    document.documentElement.dataset.plMobileCardColor = color;
    return color;
  } catch {
    return "violet";
  }
}

export type MobileTransactionCardTone = "green" | "pink" | "blue";

function mobileCardSurfaceColors(
  color: MobileTransactionCardColor,
  tone: MobileTransactionCardTone
): { backgroundColor: string; borderColor: string } {
  const unapproved = tone === "pink";
  if (color === "violet") {
    return unapproved
      ? { backgroundColor: "#a6a5a0", borderColor: "#a6a5a0" }
      : { backgroundColor: "#ffffff", borderColor: "#ffffff" };
  }
  if (color === "blue") {
    return unapproved
      ? { backgroundColor: "#e5e7eb", borderColor: "#6b7280" }
      : { backgroundColor: "#dbeafe", borderColor: "#93c5fd" };
  }
  if (color === "pink") {
    return unapproved
      ? { backgroundColor: "#fef3c7", borderColor: "#fbbf24" }
      : { backgroundColor: "#fce7f3", borderColor: "#f9a8d4" };
  }
  if (color === "amber") {
    return unapproved
      ? { backgroundColor: "#ffa500", borderColor: "#ffa500" }
      : { backgroundColor: "#fef3c7", borderColor: "#fcd34d" };
  }
  return unapproved
    ? { backgroundColor: "#fce7f3", borderColor: "#be185d" }
    : { backgroundColor: "#ecfdf5", borderColor: "#34d399" };
}

/**
 * Amount / balance chips: same fill as THIS card, same border color as THIS card
 * (2px so the chip edge reads a bit bolder than the card).
 */
export function mobileCardInnerPillClass(
  color: MobileTransactionCardColor,
  tone: MobileTransactionCardTone = "green"
): string {
  const unapproved = tone === "pink";
  if (color === "violet") {
    return unapproved
      ? "!border-2 !border-[#a6a5a0] !bg-[#a6a5a0]"
      : "!border-2 !border-white !bg-white";
  }
  if (color === "blue") {
    return unapproved
      ? "!border-2 !border-gray-500 !bg-gray-200"
      : "!border-2 !border-blue-300 !bg-blue-100";
  }
  if (color === "pink") {
    return unapproved
      ? "!border-2 !border-amber-400 !bg-amber-100"
      : "!border-2 !border-pink-300 !bg-pink-100";
  }
  if (color === "amber") {
    return unapproved
      ? "!border-2 !border-[#ffa500] !bg-[#ffa500]"
      : "!border-2 !border-amber-300 !bg-amber-100";
  }
  return unapproved
    ? "!border-2 !border-pink-700 !bg-pink-100"
    : "!border-2 !border-emerald-400 !bg-emerald-50";
}

/** Inline chrome for the color picker dialog (portaled; Tailwind !important can lose to Dialog CSS). */
export function mobileCardInnerPillStyle(
  color: MobileTransactionCardColor,
  tone: MobileTransactionCardTone = "green"
): { backgroundColor: string; borderColor: string; borderWidth: number; borderStyle: "solid" } {
  const surface = mobileCardSurfaceColors(color, tone);
  return {
    backgroundColor: surface.backgroundColor,
    borderColor: surface.borderColor,
    borderWidth: 2,
    borderStyle: "solid",
  };
}

/** @deprecated Pills now follow the card surface via mobileCardInnerPillClass(color, tone). */
export function mobileCardUnapprovedPillClass(
  color: MobileTransactionCardColor,
  tone: MobileTransactionCardTone
): string {
  return mobileCardInnerPillClass(color, tone);
}

export function writeMobileTransactionCardColor(
  color: MobileTransactionCardColor
): void {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.plMobileCardColor = color;
  try {
    window.localStorage.setItem(MOBILE_TRANSACTION_CARD_COLOR_KEY, color);
    window.dispatchEvent(
      new CustomEvent(MOBILE_TRANSACTION_CARD_COLOR_CHANGED_EVENT, {
        detail: { color },
      })
    );
  } catch {
    /* Ignore quota/private-mode failures; the current page still keeps its state. */
  }
}
