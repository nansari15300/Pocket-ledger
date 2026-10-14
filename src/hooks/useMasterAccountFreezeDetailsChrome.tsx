"use client";

import * as React from "react";
import { MasterAccountFreezeOwnerToggle } from "@/components/masterAccountFreeze/MasterAccountFreezeOwnerToggle";
import { MasterAccountFreezeTxnOverlay } from "@/components/masterAccountFreeze/MasterAccountFreezeTxnOverlay";
import { masterAccountFreezePatchFromSave } from "@/lib/masterAccountFreeze/freezeAdapter";
import {
  readMasterAccountFrozen,
  type MasterAccountFreezeCollection,
  type MasterAccountFreezeFields,
} from "@/lib/masterAccountFreeze/types";
import { useMasterAccountFreezeFeature } from "@/hooks/useMasterAccountFreezeFeature";
import { useIsMobile } from "@/hooks/use-mobile";

type UseMasterAccountFreezeDetailsChromeOpts<T extends MasterAccountFreezeFields> = {
  companyId: string | undefined;
  collection: MasterAccountFreezeCollection;
  entityId: string;
  entity: T;
  /** e.g. single account view, not "all" or system row */
  entityEligible: boolean;
  onEntityUpdated: (patch: Partial<T> & MasterAccountFreezeFields) => void;
  adjustBalanceActions: React.ReactNode;
  prependClosingBalanceActions?: React.ReactNode;
};

type MobileClosingBalanceActionsProps = {
  freezeToggle: React.ReactNode;
  prepend: React.ReactNode;
};

/** Phone footer: Freeze + Send Statement (Adjust Balance lives on Closing Balance row). */
function MobileClosingBalanceActions({ freezeToggle, prepend }: MobileClosingBalanceActionsProps) {
  if (!freezeToggle && !prepend) return null;

  return (
    <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-2">
      {freezeToggle}
      {prepend}
    </div>
  );
}

/** Shared freeze toggle, overlay, and footer actions for master account details pages. */
export function useMasterAccountFreezeDetailsChrome<T extends MasterAccountFreezeFields>({
  companyId,
  collection,
  entityId,
  entity,
  entityEligible,
  onEntityUpdated,
  adjustBalanceActions,
  prependClosingBalanceActions,
}: UseMasterAccountFreezeDetailsChromeOpts<T>) {
  const { enabled: freezeFeatureEnabled } = useMasterAccountFreezeFeature();
  const isMobile = useIsMobile();
  const [bannerToggleFits, setBannerToggleFits] = React.useState(true);
  const isFrozen = readMasterAccountFrozen(entity);
  const showAccountFreezeChrome = entityEligible && (freezeFeatureEnabled || isFrozen);
  const blockNewTransactions = showAccountFreezeChrome && isFrozen;

  const handleFreezeSaved = React.useCallback(
    (patch: { isFrozen: boolean; freezeMessage?: string | null }) => {
      onEntityUpdated(
        masterAccountFreezePatchFromSave(patch) as Partial<T> & MasterAccountFreezeFields
      );
    },
    [onEntityUpdated]
  );

  const freezeToggle = React.useMemo(() => {
    if (!showAccountFreezeChrome || !companyId || !freezeFeatureEnabled) return null;
    return (
      <MasterAccountFreezeOwnerToggle
        companyId={companyId}
        collection={collection}
        entityId={entityId}
        isFrozen={isFrozen}
        onSaved={handleFreezeSaved}
      />
    );
  }, [
    showAccountFreezeChrome,
    companyId,
    freezeFeatureEnabled,
    collection,
    entityId,
    isFrozen,
    handleFreezeSaved,
  ]);

  const freezeOverlay = React.useMemo(() => {
    if (!showAccountFreezeChrome || !companyId || !isFrozen) return null;
    return (
      <MasterAccountFreezeTxnOverlay
        companyId={companyId}
        collection={collection}
        entityId={entityId}
        isFrozen={isFrozen}
        freezeMessage={entity.freezeMessage}
        bannerTopActions={freezeToggle}
        onBannerToggleFitsChange={setBannerToggleFits}
        onSaved={(patch) =>
          onEntityUpdated(
            masterAccountFreezePatchFromSave({ isFrozen: true, ...patch }) as Partial<T> &
              MasterAccountFreezeFields
          )
        }
      />
    );
  }, [
    showAccountFreezeChrome,
    companyId,
    isFrozen,
    collection,
    entityId,
    entity.freezeMessage,
    freezeToggle,
    onEntityUpdated,
  ]);

  const closingBalanceRowActions = React.useMemo(
    () => adjustBalanceActions ?? null,
    [adjustBalanceActions]
  );

  const closingBalanceActions = React.useMemo(() => {
    const prepend = prependClosingBalanceActions;
    if (!isFrozen && !freezeToggle && !prepend) return null;
    if (isFrozen) {
      const footerToggle = isMobile && !bannerToggleFits ? freezeToggle : null;
      return isMobile ? (
        <MobileClosingBalanceActions freezeToggle={footerToggle} prepend={prepend} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {footerToggle}
          {prepend}
        </div>
      );
    }
    return isMobile ? (
      <MobileClosingBalanceActions freezeToggle={freezeToggle} prepend={prepend} />
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        {freezeToggle}
        {prepend}
      </div>
    );
  }, [isFrozen, isMobile, bannerToggleFits, freezeToggle, prependClosingBalanceActions]);

  return {
    showAccountFreezeChrome,
    isFrozen,
    blockNewTransactions,
    freezeToggle,
    freezeOverlay,
    closingBalanceRowActions,
    closingBalanceActions,
  };
}
