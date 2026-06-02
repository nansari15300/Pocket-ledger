"use client";

/**
 * Voucher par hamesha company + account A/c No / mobile dikhao.
 */
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { INTER_COMPANY_ENTITY_LABELS } from "@/components/inter-company/InterCompanyEntitySide";
import {
  interCompanyIcReadonlyFieldClass,
  interCompanyViewOnlyAllowCopyClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type Side = {
  title: string;
  companyName?: string;
  companyAcNo?: string;
  companyCode?: string;
  companyMobile?: string;
  entity?: InterCompanyEntityDetail | null;
  /** Party/staff account skip — bank-to-bank only */
  bankToBank?: boolean;
};

type Props = {
  source: Side;
  target: Side;
};

function SideBlock({ side }: { side: Side }) {
  const ent = side.entity;
  const accountMobile = ent?.phone?.trim() || "";
  const accountAc =
    ent?.kind === "bank" && ent.accountNumber ? ent.accountNumber : accountMobile ? `Mob ${accountMobile}` : "";

  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-md border border-sky-400/70 px-2.5 py-2 text-xs text-black",
        interCompanyIcReadonlyFieldClass,
        interCompanyViewOnlyAllowCopyClass
      )}
    >
      <p className="mb-1 font-semibold text-muted-foreground">{side.title}</p>
      {side.companyName ? <p className="truncate font-medium">{side.companyName}</p> : null}
      <p className="font-mono text-[11px] uppercase tabular-nums">
        {side.companyCode ? `Code ${side.companyCode}` : "—"}
        {side.companyMobile ? ` · Mob ${side.companyMobile}` : ""}
      </p>
      {ent ? (
        <p className="mt-1 border-t pt-1 text-[11px]">
          <span className="text-muted-foreground">{INTER_COMPANY_ENTITY_LABELS[ent.kind]}:</span>{" "}
          <span className="font-medium">{ent.label}</span>
          {accountAc ? <span className="ml-1 font-mono">· {accountAc}</span> : null}
        </p>
      ) : side.bankToBank ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Bank-to-bank — no party account</p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">Account not selected (optional)</p>
      )}
    </div>
  );
}

export function InterCompanyVoucherIdentityStrip({ source, target }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SideBlock side={source} />
      <SideBlock side={target} />
    </div>
  );
}
