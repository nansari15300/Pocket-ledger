"use client";

import { useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useVouchers } from "@/hooks/useVouchers";
import { buildCompanyAttachmentCatalogFromVouchers } from "@/lib/companyAttachmentCatalog";
import { linkFirebaseAttachmentRefs } from "@/lib/companyAttachmentRegistry";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";

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

  const exclude = useMemo(() => new Set(currentUrls.filter((u) => typeof u === "string")), [currentUrls]);
  const remaining = Math.max(0, maxFiles - currentUrls.length);

  const catalog = useMemo(
    () => buildCompanyAttachmentCatalogFromVouchers(vouchers, { excludeUrls: exclude }),
    [vouchers, exclude]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.voucherNumbers.some((n) => n.toLowerCase().includes(q))
    );
  }, [catalog, search]);

  const pick = async (url: string) => {
    if (remaining <= 0) {
      toast({ variant: "destructive", title: "Attachment limit reached" });
      return;
    }
    setLinking(url);
    try {
      if (companyId) await linkFirebaseAttachmentRefs(companyId, [url]);
      onAddUrls([url]);
      toast({ title: "Attachment linked", description: "Reused existing file — no new upload." });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reuse company attachment</DialogTitle>
          <DialogDescription>
            Pick a file already saved on another voucher — links the same storage URL (no duplicate upload).
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file or voucher no."
            className="pl-9"
          />
        </div>
        <ScrollArea className="h-72 rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No reusable attachments found.</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((entry) => (
                <li key={entry.url} className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.label}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Used on: {entry.voucherNumbers.slice(0, 3).join(", ")}
                      {entry.voucherNumbers.length > 3 ? ` +${entry.voucherNumbers.length - 3}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {entry.voucherCount}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={remaining <= 0 || linking === entry.url}
                    onClick={() => void pick(entry.url)}
                  >
                    {linking === entry.url ? "…" : "Use"}
                  </Button>
                </li>
              ))}
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
