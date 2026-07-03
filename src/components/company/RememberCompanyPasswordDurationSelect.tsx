"use client";

import { Label } from "@/components/ui/label";
import { OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS } from "@/lib/offlineCompanyUnlockRemember";

/** Offline login + online company password: same "Remember for" options. */
export function RememberCompanyPasswordDurationSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (days: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Remember for</Label>
      <select
        id={id}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={0}>Every time (ask password)</option>
        <option value={1}>1 day</option>
        <option value={7}>7 days</option>
        <option value={14}>14 days</option>
        <option value={30}>30 days</option>
        <option value={90}>90 days</option>
        <option value={180}>180 days</option>
        <option value={OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS}>Never ask again</option>
      </select>
      <p className="text-[11px] text-muted-foreground">
        Don&apos;t ask for the password again on this browser for the selected duration (same device + account).
      </p>
    </div>
  );
}
