"use client";

export type LedgerBalanceViewMode = "statement" | "bill_wise";

const BALANCE_LEGACY_KEYS: Record<"party" | "staff", string> = {
  party: "balanceMode_party",
  staff: "balanceMode_staff",
};

const BANK_SPEND_WISE_LEGACY_KEYS = ["bank-cash-spendWiseView", "bank-group-spendWiseView"] as const;

function balanceStorageKey(companyId: string, section: "party" | "staff"): string {
  return `pl-ledger-balance-view:${companyId}:${section}`;
}

function bankSpendWiseStorageKey(companyId: string): string {
  return `pl-ledger-bank-spend-wise:${companyId}`;
}

export function resolveLedgerBalanceSection(pathname: string | null | undefined): "party" | "staff" | null {
  const path = String(pathname || "").trim();
  if (!path) return null;
  if (path.startsWith("/party")) return "party";
  if (path.startsWith("/staff")) return "staff";
  return null;
}

export function defaultLedgerBalanceViewMode(section: "party" | "staff"): LedgerBalanceViewMode {
  return "bill_wise";
}

function readLegacyBalanceMode(section: "party" | "staff"): LedgerBalanceViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(BALANCE_LEGACY_KEYS[section]);
    if (v === "bill_wise" || v === "statement") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function readLegacyBankSpendWise(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    for (const key of BANK_SPEND_WISE_LEGACY_KEYS) {
      const v = localStorage.getItem(key);
      if (v === "true") return true;
      if (v === "false") return false;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Party / staff Statement vs Bill wise — refresh + company switch par restore. */
export function readLedgerBalanceViewMode(
  companyId: string | null | undefined,
  section: "party" | "staff"
): LedgerBalanceViewMode {
  const cid = String(companyId || "").trim();
  if (typeof window !== "undefined" && cid) {
    try {
      const stored = localStorage.getItem(balanceStorageKey(cid, section));
      if (stored === "bill_wise" || stored === "statement") return stored;
    } catch {
      /* ignore */
    }
  }

  const legacy = readLegacyBalanceMode(section);
  if (legacy) {
    if (cid) writeLedgerBalanceViewMode(cid, section, legacy);
    return legacy;
  }

  return defaultLedgerBalanceViewMode(section);
}

export function writeLedgerBalanceViewMode(
  companyId: string | null | undefined,
  section: "party" | "staff",
  mode: LedgerBalanceViewMode
): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  try {
    if (cid) {
      localStorage.setItem(balanceStorageKey(cid, section), mode);
    }
    localStorage.setItem(BALANCE_LEGACY_KEYS[section], mode);
  } catch {
    /* ignore quota */
  }
}

/** Bank / cash Statement vs Spend wise — refresh + company switch par restore. */
export function readBankSpendWiseView(companyId: string | null | undefined): boolean {
  const cid = String(companyId || "").trim();
  if (typeof window !== "undefined" && cid) {
    try {
      const stored = localStorage.getItem(bankSpendWiseStorageKey(cid));
      if (stored === "true") return true;
      if (stored === "false") return false;
    } catch {
      /* ignore */
    }
  }

  const legacy = readLegacyBankSpendWise();
  if (legacy != null) {
    if (cid) writeBankSpendWiseView(cid, legacy);
    return legacy;
  }

  return false;
}

export function writeBankSpendWiseView(companyId: string | null | undefined, enabled: boolean): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  const value = enabled ? "true" : "false";
  try {
    if (cid) {
      localStorage.setItem(bankSpendWiseStorageKey(cid), value);
    }
    for (const key of BANK_SPEND_WISE_LEGACY_KEYS) {
      localStorage.setItem(key, value);
    }
  } catch {
    /* ignore quota */
  }
}
