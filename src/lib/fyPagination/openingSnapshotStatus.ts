export type LedgerOpeningHydrateStatus = "ready" | "unavailable";

export type LedgerOpeningHydrateResult = {
  balances: Record<string, number>;
  status: LedgerOpeningHydrateStatus;
};

export type FyPartitionOpeningStatus = "loading" | "ready" | "unavailable";

export type FyPartitionOpeningLoadResult = {
  openingsByBoundaryMs: Map<number, number>;
  status: FyPartitionOpeningStatus;
};

export function readyOpeningHydrateResult(
  balances: Record<string, number>
): LedgerOpeningHydrateResult {
  return { balances, status: "ready" };
}

export function unavailableOpeningHydrateResult(): LedgerOpeningHydrateResult {
  return { balances: {}, status: "unavailable" };
}
