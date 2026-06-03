"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileImage, Link2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useVouchers } from "@/hooks/useVouchers";
import {
  buildCompanyAttachmentCatalogFromVouchers,
  COMPANY_ATTACHMENT_CATALOG_MAX,
  matchesCompanyAttachmentCatalogSearch,
} from "@/lib/companyAttachmentCatalog";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { tryGetStoragePathFromFirebaseDownloadUrl } from "@/lib/firebaseStorageDownloadUrl";
import { linkCloudAttachmentRefs } from "@/lib/companyAttachmentRegistry";
import { isDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Thumbnail sirf row screen par aane par load — 400+ files par dialog open pe Storage burst nahi. */
function ReuseAttachmentLazyThumb({
  url,
  storagePath,
}: {
  url: string;
  storagePath?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || showPreview) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShowPreview(true);
          io.disconnect();
        }
      },
      { rootMargin: "80px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [showPreview]);

  return (
    <div
      ref={rootRef}
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-emerald-600/35 bg-white/80"
    >
      {showPreview ? (
        <FilePreview
          file={url}
          storagePath={storagePath}
          size={44}
          previewBox={{ width: 44, height: 44 }}
          className="h-11 w-11"
          disabled
          allowPreviewWhenDisabled
          enableHoverFullPreview={false}
          showFormatBadge={false}
          holdAttachmentClipboard={false}
          objectFit="cover"
        />
      ) : (
        <FileImage className="h-4 w-4 text-emerald-700/50" aria-hidden />
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUrls: string[];
  maxFiles: number;
  onAddUrls: (urls: string[]) => void;
};

export function CompanyAttachmentReuseDialog({
  open,
  onOpenChange,
  currentUrls,
  maxFiles,
  onAddUrls,
}: Props) {
  const { vouchers } = useVouchers();
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const exclude = useMemo(() => new Set(currentUrls.filter((u) => typeof u === "string")), [currentUrls]);
  const remaining = Math.max(0, maxFiles - currentUrls.length);

  const catalog = useMemo(
    () => buildCompanyAttachmentCatalogFromVouchers(vouchers, { excludeUrls: exclude }),
    [vouchers, exclude]
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return catalog;
    return catalog.filter((e) => matchesCompanyAttachmentCatalogSearch(e, q));
  }, [catalog, search]);

  const catalogCapped = catalog.length >= COMPANY_ATTACHMENT_CATALOG_MAX;

  const pick = async (url: string) => {
    if (remaining <= 0) {
      toast({ variant: "destructive", title: "Attachment limit reached" });
      return;
    }
    setLinking(url);
    try {
      if (companyId) await linkCloudAttachmentRefs(companyId, [url]);
      onAddUrls([url]);
      const kind = isDriveFileRef(url) ? "cloud file" : "file";
      toast({ title: "Attachment linked", description: `Reused existing ${kind} — no new upload.` });
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not link attachment",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLinking(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[90vh] max-h-[90vh] min-h-0 w-[min(100vw-0.75rem,42rem)] max-w-2xl flex-col gap-2 overflow-hidden sm:gap-3",
          "border-2 border-emerald-500/75 pl-dashboard-ribbon-emerald bg-emerald-50/90 sm:gap-4"
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Reuse company attachment</DialogTitle>
          <DialogDescription>
            Pick a file already saved on another voucher — links the same storage URL (no duplicate upload).
          </DialogDescription>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file or voucher no."
            className={cn(
              "border-emerald-500/60 bg-white/85 pl-9 focus-visible:ring-emerald-500/40",
              search.trim() ? "pr-9" : "pr-3"
            )}
          />
          {search.trim() ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {search.trim() ? (
            <>
              <span className="font-medium text-foreground">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "match" : "matches"} of{" "}
              <span className="font-medium text-foreground">{catalog.length}</span> file
              {catalog.length !== 1 ? "s" : ""}
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{catalog.length}</span> reusable file
              {catalog.length !== 1 ? "s" : ""}
            </>
          )}
          {catalogCapped ? ` (first ${COMPANY_ATTACHMENT_CATALOG_MAX} shown)` : null}
          <span className="block text-[10px] opacity-80">From vouchers already loaded in this app — no extra list fetch.</span>
        </p>
        <ScrollArea
          listChrome
          className="min-h-0 flex-1 rounded-md border-2 border-emerald-600/50 bg-emerald-50/50"
        >
          {catalog.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No reusable attachments found.</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No files match your search.</p>
          ) : (
            <ul className="space-y-1.5 p-1.5 sm:p-2">
              {filtered.map((entry) => {
                const usedOnFull = entry.voucherNumbers.join(", ");
                const usedOn =
                  entry.voucherNumbers.slice(0, 3).join(", ") +
                  (entry.voucherNumbers.length > 3 ? ` +${entry.voucherNumbers.length - 3}` : "");
                const storagePath = tryGetStoragePathFromFirebaseDownloadUrl(entry.url) ?? undefined;
                return (
                  <li
                    key={entry.url}
                    className={cn(
                      "grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border-2 px-2 py-1.5 sm:gap-2.5",
                      "border-emerald-600/55 pl-dashboard-ribbon-emerald shadow-sm",
                      remaining <= 0 && "opacity-60",
                      linking === entry.url && "opacity-80"
                    )}
                  >
                    <ReuseAttachmentLazyThumb url={entry.url} storagePath={storagePath} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-snug" title={entry.label}>
                        {entry.label}
                      </p>
                      <p
                        className="truncate text-[11px] leading-snug text-muted-foreground sm:text-xs"
                        title={`Used on: ${usedOnFull}`}
                      >
                        Used on: {usedOn}
                        {entry.voucherCount > 1 ? (
                          <span className="text-foreground/70"> · {entry.voucherCount}</span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 shrink-0 px-2.5 text-[11px] sm:text-xs"
                      disabled={remaining <= 0 || linking === entry.url}
                      onClick={() => void pick(entry.url)}
                    >
                      {linking === entry.url ? "…" : "Use"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

type ButtonProps = {
  currentFiles: Array<File | string>;
  maxFiles: number;
  onAddUrls: (urls: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function CompanyAttachmentReuseButton({
  currentFiles,
  maxFiles,
  onAddUrls,
  disabled,
  className,
}: ButtonProps) {
  const [open, setOpen] = useState(false);
  const currentUrls = currentFiles.filter((f): f is string => typeof f === "string");
  const canAdd = !disabled && currentFiles.length < maxFiles;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        disabled={!canAdd}
        onClick={() => setOpen(true)}
      >
        <Link2 className="mr-1.5 h-3.5 w-3.5" />
        Reuse file
      </Button>
      <CompanyAttachmentReuseDialog
        open={open}
        onOpenChange={setOpen}
        currentUrls={currentUrls}
        maxFiles={maxFiles}
        onAddUrls={onAddUrls}
      />
    </>
  );
}
