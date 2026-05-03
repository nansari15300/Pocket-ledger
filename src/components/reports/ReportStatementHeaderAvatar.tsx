"use client";

import { FileDigit, Crown, Landmark } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { reportEntityInitials } from "@/lib/reportEntityInitials";
import { cn } from "@/lib/utils";

/** Party / Bank / Staff / Tax / In-Exp / Item / Group — ek hi header avatar pattern (entity reports). */
const ringCls = "h-9 w-9 text-xs font-semibold ring-2 ring-background shadow-sm";

export type ReportStatementAvatarKind =
  | "party"
  | "staff"
  | "tax"
  | "expense"
  | "item"
  | "bank"
  | "group";

export type ReportStatementHeaderAvatarProps = {
  kind: ReportStatementAvatarKind;
  displayName: string;
  fileUrl?: string | null | undefined;
  /** Party: Opening Balance / system ledger — FileDigit fallback (PartyDetails). */
  isSystemEntity?: boolean;
  /** Bank: special account → Crown, warna Landmark (AccountDetails). */
  bankIsSpecial?: boolean;
};

export function ReportStatementHeaderAvatar({
  kind,
  displayName,
  fileUrl,
  isSystemEntity,
  bankIsSpecial,
}: ReportStatementHeaderAvatarProps) {
  const initials = reportEntityInitials(displayName || "NA");

  if (kind === "group") {
    return (
      <Avatar className={cn(ringCls)} title={displayName}>
        <AvatarFallback className="bg-muted font-semibold text-[10px]">{initials}</AvatarFallback>
      </Avatar>
    );
  }

  if (kind === "bank") {
    return (
      <ResolvedEntityAvatar
        className={ringCls}
        src={fileUrl}
        alt={displayName}
        fallbackSlot={
          bankIsSpecial ? (
            <Crown className="h-4 w-4 text-amber-500" aria-hidden />
          ) : (
            <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden />
          )
        }
      />
    );
  }

  if (kind === "party" && isSystemEntity) {
    return (
      <Avatar className={ringCls}>
        <AvatarImage src={fileUrl ?? undefined} alt={displayName} />
        <AvatarFallback className="bg-muted p-0 text-muted-foreground">
          <FileDigit className="h-4 w-4" aria-hidden />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <ResolvedEntityAvatar className={ringCls} src={fileUrl} alt={displayName} fallbackText={initials} />
  );
}
