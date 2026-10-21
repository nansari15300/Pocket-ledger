"use client";
/** Add Voucher header: OCR Enabled/Disabled + Auto Post + Overwrite edited (device-local). Hidden when plan disallows. */
import React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { setOcrPrefs, useOcrPrefs } from "./prefs";
import { useOcrPlanAllowed } from "./gate";

function Pill({ id, label, checked, onChange, title }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; title: string }) {
  return (
    <label htmlFor={id} title={title} className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-400/50 bg-white/70 px-2 text-xs font-medium text-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
      <span className="whitespace-nowrap">{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="scale-75" />
    </label>
  );
}

export function VoucherOcrHeaderToggles({ className }: { className?: string }) {
  const allowed = useOcrPlanAllowed();
  const p = useOcrPrefs();
  if (!allowed) return null;
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)} data-pl-ocr-header-toggles="">
      <Pill
        id="pl-ocr-enabled"
        label={p.enabled ? "OCR" : "OCR Off"}
        checked={p.enabled}
        onChange={(v) => setOcrPrefs({ enabled: v })}
        title={p.enabled ? "OCR Enabled - bill is read when the first file is attached" : "OCR Disabled"}
      />
      {p.enabled ? (
        <>
          <Pill id="pl-ocr-autopost" label="Auto Post" checked={p.autoPost} onChange={(v) => setOcrPrefs({ autoPost: v })} title="Save automatically after OCR (always UNAPPROVED)" />
          <Pill id="pl-ocr-overwrite" label="Overwrite edited" checked={p.overwriteEdited} onChange={(v) => setOcrPrefs({ overwriteEdited: v })} title="Refresh re-fills fields you edited by hand too" />
        </>
      ) : null}
    </div>
  );
}
