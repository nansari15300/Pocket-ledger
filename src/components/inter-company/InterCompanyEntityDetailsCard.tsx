"use client";

/**
 * Selected party/account — saari fields + avatar (inter-company target/source).
 */
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { INTER_COMPANY_ENTITY_LABELS } from "@/components/inter-company/InterCompanyEntitySide";
import { useDate } from "@/hooks/useDate";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import {
  formatInterCompanyFieldForPartnerView,
  type InterCompanyPartnerPrivacy,
} from "@/lib/interCompany/interCompanyPartnerPrivacy";
import { readInterCompanyAcNoFromDoc } from "@/lib/interCompany/interCompanyAccountNo";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import {
  interCompanyIcAvatarClass,
  interCompanyIcAvatarFallbackClass,
  interCompanyIcReadonlyFieldClass,
  interCompanyViewOnlyAllowCopyClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";

type Props = {
  entity: InterCompanyEntityDetail | null;
  companyAcNo?: string;
  companyMobile?: string;
  companyPan?: string;
  showClosingBalance?: boolean;
  /** Target privacy — partner view mask/visibility */
  partnerViewPrivacy?: InterCompanyPartnerPrivacy | null;
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

function partnerField(
  privacy: InterCompanyPartnerPrivacy | null | undefined,
  field: keyof InterCompanyPartnerPrivacy["viewFields"],
  raw: string | null | undefined
): string | null {
  if (!privacy) return String(raw ?? "").trim() || null;
  return formatInterCompanyFieldForPartnerView(privacy, field, raw);
}

export function InterCompanyEntityDetailsCard({
  entity,
  companyAcNo,
  companyMobile,
  companyPan,
  showClosingBalance = false,
  partnerViewPrivacy = null,
}: Props) {
  if (!entity) return null;

  const { formatCurrency } = useDate();
  const kindLabel = INTER_COMPANY_ENTITY_LABELS[entity.kind];
  const phoneRaw = normalizeInterCompanyPhone(entity.phone) || entity.phone;
  const entityIcAc = readInterCompanyAcNoFromDoc(entity) || entity.interCompanyAccountNo;
  const pocketLedgerRaw =
    entity.kind === "bank" && entity.accountNumber
      ? String(entity.accountNumber)
      : entityIcAc || "";

  const accountName = partnerField(partnerViewPrivacy, "accountName", entity.label) ?? entity.label;
  const mobile = partnerField(partnerViewPrivacy, "mobileNo", phoneRaw);
  const pan = partnerField(partnerViewPrivacy, "panNo", entity.pan);
  const pocketLedger = partnerField(partnerViewPrivacy, "pocketLedgerAcNo", pocketLedgerRaw);
  const showCompanyAc = partnerField(partnerViewPrivacy, "pocketLedgerAcNo", companyAcNo);
  const showCompanyMob = partnerField(partnerViewPrivacy, "mobileNo", companyMobile);
  const showCompanyPan = partnerField(partnerViewPrivacy, "panNo", companyPan);

  const closing =
    showClosingBalance && entity.closingBalance != null && !Number.isNaN(entity.closingBalance)
      ? entity.closingBalance
      : null;

  return (
    <div
      className={cn(
        "ic-entity-details-card rounded-md border border-sky-400/70 bg-sky-50/50 p-3 dark:border-sky-400/50 dark:bg-sky-950/25",
        interCompanyViewOnlyAllowCopyClass
      )}
    >
      <div className="flex gap-3">
        <ResolvedEntityAvatar
          src={entity.fileUrl}
          alt={entity.label}
          fallbackText={entity.label.slice(0, 2).toUpperCase()}
          className={cn("h-14 w-14 shrink-0", interCompanyIcAvatarClass)}
          fallbackClassName={interCompanyIcAvatarFallbackClass}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kindLabel}</p>
            <p className="text-base font-semibold leading-tight">{accountName}</p>
          </div>
          {closing != null ? (
            <div
              className={cn(
                "rounded-md border border-sky-400/80 px-2.5 py-2",
                interCompanyIcReadonlyFieldClass
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-black/70">
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
          {(showCompanyAc || showCompanyMob || showCompanyPan) && (
            <div className={cn("rounded border border-sky-400/60 px-2 py-1.5 text-xs text-black", interCompanyIcReadonlyFieldClass)}>
              <p className="font-medium text-black">Company (Inter Co.)</p>
              {showCompanyAc ? <p className="font-mono tabular-nums">A/c No: {showCompanyAc}</p> : null}
              {showCompanyPan ? <p className="font-mono tabular-nums">PAN: {showCompanyPan}</p> : null}
              {showCompanyMob ? <p>Mob: {showCompanyMob}</p> : null}
            </div>
          )}
          <div className="space-y-1 border-t pt-2">
            {mobile ? <DetailRow label="Mobile" value={mobile} /> : null}
            <DetailRow label="Email" value={entity.email} />
            {pan ? <DetailRow label="PAN" value={pan} /> : null}
            <DetailRow label="Address" value={entity.address} />
            {entity.kind === "bank" ? (
              <>
                <DetailRow label="Bank" value={entity.bankName} />
                {pocketLedger ? <DetailRow label="A/c No." value={pocketLedger} /> : null}
              </>
            ) : pocketLedger ? (
              <DetailRow label="Pocket ledger A/C" value={pocketLedger} />
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
