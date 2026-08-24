export const MASTER_ACCOUNT_FREEZE_TOGGLE_LABEL = "Freez This Account";
export const MASTER_ACCOUNT_FREEZE_UNFREEZE_TOGGLE_LABEL = "unfreez This Account";

export function masterAccountFreezeToggleLabel(isFrozen: boolean): string {
  return isFrozen
    ? MASTER_ACCOUNT_FREEZE_UNFREEZE_TOGGLE_LABEL
    : MASTER_ACCOUNT_FREEZE_TOGGLE_LABEL;
}
export const MASTER_ACCOUNT_FREEZE_LIST_LABEL = "Freezed Account";
export const MASTER_ACCOUNT_FREEZE_BANNER_TITLE = "This account has been freezed";
export const MASTER_ACCOUNT_FREEZE_MESSAGE_PLACEHOLDER = "Optional message (owner only)";
