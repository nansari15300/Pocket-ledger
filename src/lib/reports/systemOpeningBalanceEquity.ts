import { OPENING_BALANCE_SYSTEM_LEDGER_ID } from "@/lib/reports/openingBalanceLedgerAccounts";

export const OPENING_BALANCE_MASTER_COLLECTIONS = [
  "parties",
  "bank_accounts",
  "staff",
  "taxes",
  "expense_accounts",
] as const;

export type OpeningBalanceMasterCollection = (typeof OPENING_BALANCE_MASTER_COLLECTIONS)[number];

export type MasterOpeningBalanceEntity = {
  id?: string;
  openingBalance?: number;
  isDeleted?: boolean;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Alive masters only — same population as `computeMasterOpeningBalanceAudit()`. */
export function collectMasterOpeningBalanceEntities(input: {
  processedParties?: MasterOpeningBalanceEntity[];
  processedAccounts?: MasterOpeningBalanceEntity[];
  processedStaff?: MasterOpeningBalanceEntity[];
  processedTaxes?: MasterOpeningBalanceEntity[];
  processedExpenseAccounts?: MasterOpeningBalanceEntity[];
}): Array<{ openingBalance?: number }> {
  const out: Array<{ openingBalance?: number }> = [];

  const pushAlive = (
    rows: MasterOpeningBalanceEntity[] | undefined,
    opts?: { excludeSystemParty?: boolean }
  ) => {
    for (const row of rows ?? []) {
      if (row.isDeleted === true) continue;
      if (opts?.excludeSystemParty && String(row.id) === OPENING_BALANCE_SYSTEM_LEDGER_ID) continue;
      out.push({ openingBalance: row.openingBalance });
    }
  };

  pushAlive(input.processedParties, { excludeSystemParty: true });
  pushAlive(input.processedAccounts);
  pushAlive(input.processedStaff);
  pushAlive(input.processedTaxes);
  pushAlive(input.processedExpenseAccounts);

  return out;
}

/**
 * Authoritative System Opening Balance (Equity) from CURRENT master opening balances.
 * expected = − Σ(master openingBalance)
 */
export function computeExpectedSystemOpeningBalance(
  entities: Array<{ openingBalance?: number }>
): number {
  let sum = 0;
  for (const entity of entities) {
    sum += Number(entity.openingBalance) || 0;
  }
  return round2(-sum);
}

export function systemOpeningBalanceLedgerFields(openingBalance: number): {
  openingBalance: number;
  balance: number;
  debit: number;
  credit: number;
} {
  const ob = round2(openingBalance);
  return {
    openingBalance: ob,
    balance: ob,
    debit: ob > 0 ? ob : 0,
    credit: ob < 0 ? Math.abs(ob) : 0,
  };
}

export type SystemOpeningBalanceDiagnosis = {
  storedOpeningBalance: number;
  expectedOpeningBalance: number;
  difference: number;
  isReconciled: boolean;
  masterTotalDebit: number;
  masterTotalCredit: number;
  masterNetSigned: number;
};

export function diagnoseSystemOpeningBalance(input: {
  masterEntities: Array<{ openingBalance?: number }>;
  storedSystemOpeningBalance: number;
}): SystemOpeningBalanceDiagnosis {
  const expectedOpeningBalance = computeExpectedSystemOpeningBalance(input.masterEntities);
  const storedOpeningBalance = round2(input.storedSystemOpeningBalance);

  let masterTotalDebit = 0;
  let masterTotalCredit = 0;
  for (const entity of input.masterEntities) {
    const ob = Number(entity.openingBalance) || 0;
    if (ob > 0) masterTotalDebit += ob;
    else if (ob < 0) masterTotalCredit += Math.abs(ob);
  }

  masterTotalDebit = round2(masterTotalDebit);
  masterTotalCredit = round2(masterTotalCredit);
  const masterNetSigned = round2(masterTotalDebit - masterTotalCredit);
  const difference = round2(storedOpeningBalance - expectedOpeningBalance);

  return {
    storedOpeningBalance,
    expectedOpeningBalance,
    difference,
    isReconciled: Math.abs(difference) < 0.02,
    masterTotalDebit,
    masterTotalCredit,
    masterNetSigned,
  };
}

export function diagnoseSystemOpeningBalanceFromProcessed(input: {
  processedParties?: MasterOpeningBalanceEntity[];
  processedAccounts?: MasterOpeningBalanceEntity[];
  processedStaff?: MasterOpeningBalanceEntity[];
  processedTaxes?: MasterOpeningBalanceEntity[];
  processedExpenseAccounts?: MasterOpeningBalanceEntity[];
  storedSystemOpeningBalance: number;
}): SystemOpeningBalanceDiagnosis {
  const masterEntities = collectMasterOpeningBalanceEntities(input);
  return diagnoseSystemOpeningBalance({
    masterEntities,
    storedSystemOpeningBalance: input.storedSystemOpeningBalance,
  });
}

/** Self-check for deterministic formula — safe to run in dev/CI. */
export function runSystemOpeningBalanceEquitySelfChecks(): void {
  const assert = (label: string, actual: number, expected: number) => {
    if (Math.abs(actual - expected) >= 0.005) {
      throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  assert(
    "mixed masters",
    computeExpectedSystemOpeningBalance([
      { openingBalance: 1_000_000 },
      { openingBalance: 500_000 },
      { openingBalance: -788_047.62 },
    ]),
    -711_952.38
  );

  assert(
    "net credit masters",
    computeExpectedSystemOpeningBalance([
      { openingBalance: 1_828_116.18 },
      { openingBalance: -2_109_094.14 },
    ]),
    280_977.96
  );

  assert("empty masters", computeExpectedSystemOpeningBalance([]), 0);

  const diagnosis = diagnoseSystemOpeningBalance({
    masterEntities: [{ openingBalance: 100 }, { openingBalance: -250 }],
    storedSystemOpeningBalance: 150,
  });
  assert("diagnosis expected", diagnosis.expectedOpeningBalance, 150);
  assert("diagnosis reconciled", diagnosis.isReconciled ? 1 : 0, 1);
}
