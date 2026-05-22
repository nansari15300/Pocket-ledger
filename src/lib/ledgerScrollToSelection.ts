/** Ledger / recon — Space se selected row scroll; manual scroll + refresh par auto jump na ho */

/** Party/account txn table — orange selected row (data-pl-txn-selected) */
export function scrollTransactionSelectedRowIntoView(
  tableRoot: HTMLElement | null,
  behavior: ScrollBehavior = "smooth"
) {
  if (!tableRoot) return;
  const row = tableRoot.querySelector<HTMLElement>(
    "tr.transaction-main-row[data-pl-txn-selected]"
  );
  row?.scrollIntoView({ block: "nearest", behavior });
}

/** Reconciliation pair grid — selectedRowKey = `left:3` / `right:5` */
export function scrollReconciliationSelectedRowIntoView(
  scrollHost: HTMLElement | null,
  selectedRowKey: string | null,
  behavior: ScrollBehavior = "smooth"
) {
  if (!scrollHost || !selectedRowKey) return;
  const sep = selectedRowKey.indexOf(":");
  if (sep < 0) return;
  const side = selectedRowKey.slice(0, sep);
  const idx = selectedRowKey.slice(sep + 1);
  const row = scrollHost.querySelector<HTMLElement>(`#recon-${side}-main-${idx}`);
  row?.scrollIntoView({ block: "nearest", behavior });
}
