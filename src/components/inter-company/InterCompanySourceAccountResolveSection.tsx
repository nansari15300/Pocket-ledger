"use client";

import { useMemo } from "react";
import { InterCompanySectionTitle } from "@/components/inter-company/InterCompanySectionTitle";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InterCompanyAccountLookupSection } from "@/components/inter-company/InterCompanyAccountLookupSection";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { filterInterCompanyEntitiesByName } from "@/lib/interCompany/interCompanyEntityLookup";
import {
  interCompanyInputClass,
  interCompanyReadOnlyCopyInputClass,
  interCompanyVoucherRowAccountClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type Props = {
  suggestedLabel: string;
  entities: InterCompanyEntityDetail[];
  entitiesLoading?: boolean;
  entityKind: InterCompanyEntityKind;
  onEntityKindChange: (k: InterCompanyEntityKind) => void;
  entityId: string;
  onEntityIdChange: (id: string) => void;
  sourceCompanyId: string;
  disabled?: boolean;
  resolvedLabel?: string;
};

/** Target admin — restricted source account map kare approve se pehle. */
export function InterCompanySourceAccountResolveSection({
  suggestedLabel,
  entities,
  entitiesLoading = false,
  entityKind,
  onEntityKindChange,
  entityId,
  onEntityIdChange,
  sourceCompanyId,
  disabled = false,
  resolvedLabel,
}: Props) {
  const optionalEntities = entities.filter((e) => !(e.kind === "bank" && e.isClearing === true));
  const pickerEntities = useMemo(() => {
    const q = String(suggestedLabel || "").trim();
    if (!q) return optionalEntities;
    const hits = filterInterCompanyEntitiesByName(optionalEntities, q);
    return hits.length ? hits : optionalEntities;
  }, [optionalEntities, suggestedLabel]);

  return (
    <div className={cn(interCompanyVoucherRowAccountClass, "rounded-md border border-amber-300/80 bg-amber-50/50 p-3 dark:border-amber-700/50 dark:bg-amber-950/20")}>
      <InterCompanySectionTitle
        title="Map source account (required before approve)"
        infoHint="Source user typed a suggested name — choose the real source account."
        trailingAction={null}
      />
      <div className="mt-2 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Suggested by source user</Label>
          <Input
            readOnly
            value={suggestedLabel || "—"}
            className={cn(interCompanyInputClass, interCompanyReadOnlyCopyInputClass)}
          />
        </div>
        {resolvedLabel && disabled ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mapped account</Label>
            <Input readOnly value={resolvedLabel} className={interCompanyInputClass} />
          </div>
        ) : (
          <InterCompanyAccountLookupSection
            sectionTitle="Choose source account"
            entities={pickerEntities}
            entitiesLoading={entitiesLoading}
            activeCompanyId={sourceCompanyId}
            entityKind={entityKind}
            onEntityKindChange={onEntityKindChange}
            entityId={entityId}
            onEntityIdChange={onEntityIdChange}
            disabled={disabled}
            showDetails
          />
        )}
      </div>
    </div>
  );
}
