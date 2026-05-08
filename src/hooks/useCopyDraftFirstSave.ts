import { useCallback, useEffect, useRef } from "react";

/**
 * Save & Copy To / "Copied Draft" mode: header company se `copySaveTargetCompanyId` pass hota hai.
 * Pehli save **hamesha naya voucher** banaye — stale `savedVoucherId` (purane edit session se reh gaya)
 * kabhi source doc par **update** na trigger kare (same company copy par zyada dikhta hai).
 * Pehli successful save ke baad hi naye doc id se normal **edit** path chale.
 */
export function useCopyDraftFirstSave(copySaveTargetCompanyId: string | undefined) {
  const copiedDraftPersistedRef = useRef(false);

  useEffect(() => {
    if (!copySaveTargetCompanyId) copiedDraftPersistedRef.current = false;
  }, [copySaveTargetCompanyId]);

  const resolveVoucherIdForSave = useCallback(
    (opts: { savedVoucherId: string | null; originalVoucherIdToDelete: string | null }) => {
      if (opts.originalVoucherIdToDelete) return null;
      if (copySaveTargetCompanyId && !copiedDraftPersistedRef.current) return null;
      return opts.savedVoucherId;
    },
    [copySaveTargetCompanyId]
  );

  /** Permission gate: copy draft ki pehli save par `create_records`, na ki edit ownership. */
  const isPermissionEdit = useCallback(
    (hasVoucherIdFromProps: boolean, savedVoucherId: string | null) => {
      if (copySaveTargetCompanyId && !copiedDraftPersistedRef.current) return false;
      return Boolean(hasVoucherIdFromProps || savedVoucherId);
    },
    [copySaveTargetCompanyId]
  );

  /** Successful write ke baad — dubara save par naye id se update. */
  const markCopiedDraftPersisted = useCallback(() => {
    if (copySaveTargetCompanyId) copiedDraftPersistedRef.current = true;
  }, [copySaveTargetCompanyId]);

  const isCopiedDraftFirstInsert = Boolean(copySaveTargetCompanyId && !copiedDraftPersistedRef.current);

  return {
    resolveVoucherIdForSave,
    isPermissionEdit,
    markCopiedDraftPersisted,
    /** Link/duplicate helpers: abhi tak persist nahi hua copy draft = koi saved "current" row nahi. */
    isCopiedDraftFirstInsert,
  };
}
