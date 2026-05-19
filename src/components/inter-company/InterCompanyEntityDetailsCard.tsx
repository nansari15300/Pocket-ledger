"use client";

/**
 * Selected party/account — saari fields + avatar (inter-company target/source).
 */
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { INTER_COMPANY_ENTITY_LABELS, type InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { useDate } from "@/hooks/useDate";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import { cn } from "@/lib/utils";

type Props = {
  entity: InterCompanyEntityDetail | null;
  /** Company-level Inter Co. A/c No — voucher strip ke saath */
  companyAcNo?: string;
  companyMobile?: string;
  /** Sirf source account — closing balance (target par false) */
  showClosingBalance?: boolean;
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return (
    <div className="grid grid-cols-[minmax(5.5rem,7rem)_1fr] gap-x-2 gap-y-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium">{v}</span>
    </div>
  );
}

export function InterCompanyEntityDetailsCard({
  entity,
  companyAcNo,
  companyMobile,
  showClosingBalance = false,
}: Props) {
  if (!entity) return null;

  const { formatCurrency } = useDate();
  const kindLabel = INTER_COMPANY_ENTITY_LABELS[entity.kind];
  const phone = normalizeInterCompanyPhone(entity.phone);
  const closing =
    showClosingBalance && entity.closingBalance != null && !Number.isNaN(entity.closingBalance)
      ? entity.closingBalance
      : null;

  return (
    <div className="rounded-md border border-emerald-200/70 bg-white/80 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
      <div className="flex gap-3">
        <ResolvedEntityAvatar
          src={entity.fileUrl}
          alt={entity.label}
          fallbackText={entity.label.slice(0, 2).toUpperCase()}
          className="h-14 w-14 shrink-0 rounded-full border"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kindLabel}</p>
            <p className="text-base font-semibold leading-tight">{entity.label}</p>
          </div>
          {closing != null ? (
            <div className="rounded-md border border-emerald-200/80 bg-emerald-50/70 px-2.5 py-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800/80 dark:text-emerald-200/80">
                Closing balance
              </p>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  closing >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                )}
              >
                {formatCurrency(closing, { showDrCr: true })}
              </p>
            </div>
          ) : null}
          {(companyAcNo || companyMobile) && (
            <div className="rounded bg-emerald-50/80 px-2 py-1.5 text-xs dark:bg-emerald-950/40">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">Company (Inter Co.)</p>
              {companyAcNo ? <p className="font-mono tabular-nums">A/c No: {companyAcNo}</p> : null}
              {companyMobile ? <p>Mob: {companyMobile}</p> : null}
            </div>
          )}
          <div className="space-y-1 border-t pt-2">
            <DetailRow label="Mobile" value={phone || entity.phone} />
            <DetailRow label="Email" value={entity.email} />
            <DetailRow label="PAN" value={entity.pan} />
            <DetailRow label="Address" value={entity.address} />
            {entity.kind === "bank" ? (
              <>
                <DetailRow label="Bank" value={entity.bankName} />
                <DetailRow label="A/c No." value={entity.accountNumber} />
              </>
            ) : null}
            {entity.openingBalance != null && !Number.isNaN(entity.openingBalance) ? (
              <DetailRow label="Op. balance" value={String(entity.openingBalance)} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
