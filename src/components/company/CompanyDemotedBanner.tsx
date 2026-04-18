"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCompany } from "@/hooks/useCompany";
import Link from "next/link";

const IGNORE_STORAGE_PREFIX = "companyDemotedBannerIgnored_v1";

function readBannerIgnored(companyId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${IGNORE_STORAGE_PREFIX}_${companyId}`) === "1";
  } catch {
    return false;
  }
}

/** After Firestore doc missing / demotion: explain status + link to upload in settings. */
export function CompanyDemotedBanner() {
  const { company } = useCompany();
  const [open, setOpen] = useState(false);
  /** User ne "Ignore" dabaya — is company ke liye banner dubara mat dikhao (localStorage). */
  const [ignored, setIgnored] = useState(false);

  const show =
    !!company &&
    String(company.storageOption || "local").toLowerCase() === "local" &&
    (!!company.demoteReason || typeof company.demotedFromOnlineAt === "number");

  useEffect(() => {
    const id = company?.id;
    if (!id || !show) return;
    setIgnored(readBannerIgnored(id));
  }, [company?.id, show]);

  const handleIgnoreForever = () => {
    const id = company?.id;
    if (!id) return;
    try {
      localStorage.setItem(`${IGNORE_STORAGE_PREFIX}_${id}`, "1");
    } catch {
      /* private mode / quota */
    }
    setIgnored(true);
  };

  if (!show || ignored) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
      <span className="min-w-0 flex-1">
        This company is now in <strong>local (offline)</strong> mode — the server link is missing or an admin may have removed it.
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 gap-1 text-amber-900 hover:bg-amber-500/20 dark:text-amber-50"
        onClick={handleIgnoreForever}
        title="Hide this message for this company on this browser"
      >
        <X className="h-4 w-4" />
        Ignore
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1 border-amber-600/50 bg-background/80">
            <Info className="h-4 w-4" />
            Details
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Local company — what happened?</AlertDialogTitle>
            {/* `AlertDialogDescription` default tag is <p> — nested <p> invalid; asChild + div avoids hydration error */}
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-foreground">
                <p>
                  This company is either <strong>not eligible to stay online</strong>, or for <strong>technical / server-side</strong> reasons it is
                  now running on this <strong>local device</strong>.
                </p>
                <p>
                  If you believe the company was <strong>approved for online</strong>, open Settings → Company Profile and try{" "}
                  <strong>&quot;Upload this company to cloud&quot;</strong> (subject to your plan&apos;s online slots).
                </p>
                <p className="text-muted-foreground text-xs">
                  Vouchers and data can still be saved on this device; cloud sync resumes after you upload to the cloud manually.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                handleIgnoreForever();
                setOpen(false);
              }}
            >
              Don&apos;t show again
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button asChild>
              <Link href="/settings?view=company">Company settings</Link>
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
