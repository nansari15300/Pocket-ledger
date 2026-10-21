"use client";
/** Unmatched entity helper: identifier-based search over ALL accounts + coverage hints + learning. */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
/* Same stacking as Add New master from a voucher: above AddVoucherDialog (overlay z-80 / content z-81). */
import { NESTED_VOUCHER_MASTER_CREATE_CONTENT_CN, NESTED_VOUCHER_MASTER_CREATE_OVERLAY_CN } from "@/lib/dialogShellChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreatePartyDialog } from "@/components/party/CreatePartyDialog";
import { findPartiesByIdentifiers, identifierCoverage, type OcrIdentifiers } from "./identifiers";
import { normalizeName } from "./normalize";
import { nameScore, namesOf } from "./fuzzy";
import { skeletonQueryMatches } from "./translit";
import type { OcrPartyLike } from "./types";

export function OcrFindAccountDialog({
  open,
  onOpenChange,
  identifiers,
  billPartyName,
  parties,
  onPick,
  onCreateNew,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  identifiers: OcrIdentifiers;
  billPartyName?: string;
  parties: readonly OcrPartyLike[];
  onPick: (partyId: string) => void;
  /** Opens the app's Create Party dialog prefilled (user confirms Save). */
  onCreateNew?: (prefill: Record<string, string>) => void;
}) {
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const hits = useMemo(() => findPartiesByIdentifiers(identifiers, parties), [identifiers, parties]);
  const cov = useMemo(() => identifierCoverage(parties), [parties]);
  const nameSuggestions = useMemo(() => {
    const query = normalizeName(q || billPartyName || "");
    if (!query) return [];
    return parties
      .filter((p) => !p.isDeleted && !["sales_account", "purchase_account", "owners_capital", "opening_balance_ledger"].includes(p.id))
      // name OR Alias Name: fuzzy score, plus partial typing (substring) and Roman<->Devanagari sound match
      .map((p) => ({
        p,
        s: Math.max(
          ...namesOf(p).map((x) => {
            const n = normalizeName(x);
            if (query.length >= 2 && n.includes(query)) return 0.95;
            if (skeletonQueryMatches(query, x)) return 0.85;
            return nameScore(query, n);
          })
        ),
      }))
      .filter((x) => x.s >= 0.6)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6);
  }, [q, billPartyName, parties]);

  const idRows: [string, string | undefined][] = [
    ["Name on bill", billPartyName],
    ["PAN / VAT", identifiers.pan],
    ["Phone", identifiers.phones.join(", ") || undefined],
    ["Email", identifiers.emails.join(", ") || undefined],
    ["Address", identifiers.address],
    ["Bank A/c", identifiers.bankAccountNos.join(", ") || undefined],
    ["Reg. No", identifiers.regNo],
    ["Contact", identifiers.contactPerson],
  ];
  const coverageRows: [string, OcrPartyLike[]][] = [
    ["PAN no.", cov.noPan],
    ["phone no.", cov.noPhone],
    ["email", cov.noEmail as OcrPartyLike[]],
    ["address", cov.noAddress as OcrPartyLike[]],
  ];

  const row = (p: OcrPartyLike, tag: string) => (
    <button
      key={`${tag}-${p.id}`}
      type="button"
      onClick={() => onPick(p.id)}
      disabled={!!p.isFrozen}
      className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
    >
      <span className="min-w-0 truncate font-medium">{p.name}</span>
      <span className="shrink-0 rounded-full bg-fuchsia-100 px-2 text-[11px] text-fuchsia-800 dark:bg-fuchsia-500/30 dark:text-fuchsia-100">{tag}</span>
    </button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
            overlayClassName={NESTED_VOUCHER_MASTER_CREATE_OVERLAY_CN}
            className={`${NESTED_VOUCHER_MASTER_CREATE_CONTENT_CN} max-h-[90vh] max-w-lg overflow-y-auto`}
            onFocusOutside={(e) => e.preventDefault()}
          >
          <DialogHeader>
            <DialogTitle>OCR: Find account</DialogTitle>
            <DialogDescription>The bill&apos;s party did not match any account exactly. Pick one; OCR will remember it.</DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            {idRows.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 py-0.5">
                <span className="w-24 shrink-0 text-muted-foreground">{k}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{v || "—"}</span>
                {v ? (
                  <button type="button" className="text-muted-foreground hover:text-foreground" title="Copy" onClick={() => void navigator.clipboard?.writeText(v)}>
                    <Copy className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold">Matches by identifier</p>
            {hits.length ? hits.map((h) => row(h.party, `${h.kind}: ${h.value}`)) : <p className="text-xs text-muted-foreground">No account has these identifiers.</p>}
          </div>

          <div className="space-y-1">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={billPartyName || "Search by name…"} className="h-9 pl-7" />
            </div>
            {nameSuggestions.map((x) => row(x.p, `${Math.round(x.s * 100)}%`))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onCreateNew
                ? onCreateNew({
                    name: (q || billPartyName || "").trim(),
                    pan: identifiers.pan ?? "",
                    phone: identifiers.phones[0] ?? "",
                    email: identifiers.emails[0] ?? "",
                    address: identifiers.address ?? "",
                    extra: [identifiers.contactPerson && `Contact: ${identifiers.contactPerson}`, identifiers.bankAccountNos[0] && `Bank A/c: ${identifiers.bankAccountNos[0]}`, identifiers.regNo && `Reg No: ${identifiers.regNo}`].filter(Boolean).join(" | "),
                  })
                : setCreateOpen(true)
            }
          >
            + Create account (prefilled from bill)
          </Button>

          <div className="rounded-md border border-amber-300/70 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
            <p className="mb-1 font-semibold">Improve OCR matching ({cov.total} accounts)</p>
            {coverageRows.map(([label, list]) =>
              list.length ? (
                <details key={label} className="py-0.5">
                  <summary className="cursor-pointer">{list.length} accounts have no {label} — add it for better OCR matching</summary>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {list.slice(0, 30).map((p) => (
                      <Link key={p.id} href={`/party?selected=${encodeURIComponent(p.id)}`} target="_blank" className="rounded border bg-background px-1.5 py-0.5 hover:underline">
                        {p.name}
                      </Link>
                    ))}
                    {list.length > 30 ? <span className="text-muted-foreground">+{list.length - 30} more</span> : null}
                  </div>
                </details>
              ) : null
            )}
          </div>
        </DialogContent>
      </Dialog>
      {createOpen ? (
        <CreatePartyDialog
          isOpen={createOpen}
          onOpenChange={setCreateOpen}
          onPartyCreated={(id) => {
            setCreateOpen(false);
            onPick(id);
          }}
        />
      ) : null}
    </>
  );
}
