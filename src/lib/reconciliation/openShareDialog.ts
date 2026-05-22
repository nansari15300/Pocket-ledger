/** Chat / alerts se Share for Reconciling dialog kholne ka custom event. */
export const OPEN_RECON_SHARE_DIALOG_EVENT = "open-share-for-reconciliation-dialog";

export type OpenReconShareDialogDetail = {
  tab?: "share" | "list" | "unlinked";
  /** Shared list me is share card par blue border + scroll. */
  highlightShareId?: string;
};

/** Header dialog — Shared list tab + optional card highlight. */
export function openShareForReconciliationDialog(detail: OpenReconShareDialogDetail = {}): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent<OpenReconShareDialogDetail>(OPEN_RECON_SHARE_DIALOG_EVENT, { detail }));
}

/** Chat message — receiver ke liye Shared list deep link label. */
export const RECON_CHAT_SHARED_LIST_LINK_LABEL = "Open Shared list";
