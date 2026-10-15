/**
 * Company Settings → Link allocation.
 * Controls which payment/opposite sources may settle a multi-account voucher leg.
 * Default (all false extras): same-entity only — current product behavior.
 */

export type LinkAllocationAddSalaryPrefs = {
  /**
   * When true, After-tax / staff amount tab may also pick tax-entity payments
   * (same ADD-SAL voucher’s tax accounts). Default false = staff sources only.
   */
  allowTaxEntityOnStaffAmount?: boolean;
};

export type LinkAllocationSalePurchasePrefs = {
  /**
   * When true, party / taxable amount tab may also pick tax-account payments
   * for tax accounts on this sale/purchase. Default false = party sources only.
   */
  allowTaxOnPartyAmount?: boolean;
  /**
   * When true, party / taxable amount tab may also pick TDS-account payments
   * for TDS accounts on this sale/purchase. Default false.
   */
  allowTdsOnPartyAmount?: boolean;
};

export type LinkAllocationSettings = {
  addSalary?: LinkAllocationAddSalaryPrefs;
  sale?: LinkAllocationSalePurchasePrefs;
  purchase?: LinkAllocationSalePurchasePrefs;
};

export const DEFAULT_LINK_ALLOCATION: Required<LinkAllocationSettings> = {
  addSalary: { allowTaxEntityOnStaffAmount: false },
  sale: { allowTaxOnPartyAmount: false, allowTdsOnPartyAmount: false },
  purchase: { allowTaxOnPartyAmount: false, allowTdsOnPartyAmount: false },
};

function asBool(v: unknown): boolean {
  return v === true;
}

/** Normalize company.root.linkAllocation (missing → defaults / same-entity only). */
export function resolveLinkAllocationSettings(
  raw: LinkAllocationSettings | null | undefined
): Required<LinkAllocationSettings> {
  return {
    addSalary: {
      allowTaxEntityOnStaffAmount: asBool(raw?.addSalary?.allowTaxEntityOnStaffAmount),
    },
    sale: {
      allowTaxOnPartyAmount: asBool(raw?.sale?.allowTaxOnPartyAmount),
      allowTdsOnPartyAmount: asBool(raw?.sale?.allowTdsOnPartyAmount),
    },
    purchase: {
      allowTaxOnPartyAmount: asBool(raw?.purchase?.allowTaxOnPartyAmount),
      allowTdsOnPartyAmount: asBool(raw?.purchase?.allowTdsOnPartyAmount),
    },
  };
}

export function getSalePurchaseLinkAllocation(
  company: { linkAllocation?: LinkAllocationSettings } | null | undefined,
  mode: "sale" | "purchase"
): Required<LinkAllocationSalePurchasePrefs> {
  const resolved = resolveLinkAllocationSettings(company?.linkAllocation);
  return mode === "sale" ? resolved.sale : resolved.purchase;
}

export function getAddSalaryLinkAllocation(
  company: { linkAllocation?: LinkAllocationSettings } | null | undefined
): Required<LinkAllocationAddSalaryPrefs> {
  return resolveLinkAllocationSettings(company?.linkAllocation).addSalary;
}

/** Tax / TDS account ids from sale/purchase line items (expense excluded). */
export function collectSalePurchaseTaxAndTdsAccountIds(lineItems: unknown): {
  taxAccountIds: string[];
  tdsAccountIds: string[];
} {
  const tax = new Set<string>();
  const tds = new Set<string>();
  for (const li of (Array.isArray(lineItems) ? lineItems : []) as any[]) {
    const taxId = String(li?.taxAccountId || "").trim();
    const taxAmt = Number(li?.taxAmount) || 0;
    if (taxId && taxAmt > 0) tax.add(taxId);
    const tdsId = String(li?.tdsAccountId || "").trim();
    const tdsAmt = Number(li?.tdsAmount) || 0;
    if (tdsId && tdsAmt > 0) tds.add(tdsId);
  }
  return { taxAccountIds: [...tax], tdsAccountIds: [...tds] };
}
