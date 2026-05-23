"use client";

import { useMemo, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { doc, setDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { upsertLocalCompany } from "@/lib/localCompanyStore";
import { canUploadOneMoreOnline } from "@/lib/companyOnlineSlots";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { isLocalOnlyMode } from "@/lib/localMode";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { pushAllLocalCompanyDocsToFirestore } from "@/lib/migrateLocalCompanySubcollectionsToFirestore";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { removeLocalCompanyMirrorFromFolder } from "@/lib/liveDataFolderMirror";
import { assertCompanyAllowsLedgerMutations } from "@/lib/security/offlinePlanWriteGate";
import { companyProfilePinkZone } from "@/lib/companyProfileChrome";
import { estimateCompanyAttachmentBytes } from "@/lib/estimateCompanyAttachmentBytes";
import { checkLocalToOnlineAttachmentMbAllowed } from "@/lib/attachmentBackupUsage";
import { readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";

/** Local → online confirm: company name + ` ok` (case-insensitive). */
function buildLocalToOnlineConfirmPhrase(companyName: string): string {
  return `${String(companyName || "").trim()} ok`;
}

function confirmPhraseMatches(input: string, companyName: string): boolean {
  return input.trim().toLowerCase() === buildLocalToOnlineConfirmPhrase(companyName).toLowerCase();
}

/** Manual push of company root + local SQLite subcollections to Firestore (plan online slots). */
export function UploadCompanyToCloudCard() {
  const { company, companyId, allCompanies, triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const livePlans = useLivePlans();
  const [loading, setLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");

  const isOwner =
    !!company &&
    !!user &&
    (company.ownerId === user.uid ||
      (!!company.ownerEmail && !!user.email && company.ownerEmail.toLowerCase() === user.email.toLowerCase()));

  const isLocal =
    !!company && String(company.storageOption || "local").toLowerCase() === "local";
  // Local + Drive/Dropbox cloud sync: Firestore upload alag path — duplicate/conflict na ho
  const localCloudSyncOn =
    isLocal && readCloudSyncConfigFromCompany(company).cloudSyncEnabled;

  const accountPlanId = resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId);
  const accountPlanLive = getPlanFromPlans(livePlans, accountPlanId);
  const { ok, max, current } = canUploadOneMoreOnline(
    allCompanies,
    accountPlanId,
    companyId || "",
    user?.uid ?? null,
    accountPlanLive
  );

  const companyName = String(company?.name || "").trim();
  const expectedConfirmPhrase = useMemo(() => buildLocalToOnlineConfirmPhrase(companyName), [companyName]);
  const confirmOk = confirmPhraseMatches(confirmInput, companyName);

  /** Sirf local company ko online banate waqt — plan slot + phrase confirm. */
  const planAllowsLocalToOnline = ok && max > 0;

  const runPushLocalDocs = async () => {
    if (!companyId) return;
    setRepairLoading(true);
    try {
      await assertCompanyAllowsLedgerMutations(companyId);
      const { pushed, errors } = await pushAllLocalCompanyDocsToFirestore(companyId);
      reloadLocalCompanyRegistry();
      triggerSync();
      toast({
        title: errors.length ? "Partial sync" : "Documents uploaded",
        description:
          errors.length > 0
            ? `Uploaded ${pushed} document(s). Errors: ${errors.slice(0, 2).join(" · ")}`
            : pushed > 0
              ? `${pushed} document(s) from this browser were saved to the cloud.`
              : "No extra rows in this browser’s cache to upload.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: e instanceof Error ? e.message : "Try again when online.",
      });
    } finally {
      setRepairLoading(false);
    }
  };

  const handleUploadToCloud = async () => {
    if (!user?.uid || !companyId || !company) return;
    if (!ok) {
      toast({
        variant: "destructive",
        title: "Online slots full",
        description: `Your plan allows ${max} online compan${max === 1 ? "y" : "ies"}. Upgrade or make another company local-only.`,
      });
      return;
    }
    setLoading(true);
    try {
      // Plan MB cap: local attachments ka total size cloud upload se pehle check (0 = unlimited).
      const { totalBytes, refCount } = await estimateCompanyAttachmentBytes(companyId);
      const mbGate = checkLocalToOnlineAttachmentMbAllowed(totalBytes, accountPlanId, accountPlanLive);
      if (!mbGate.allowed) {
        toast({
          variant: "destructive",
          title: "Attachment size limit",
          description:
            mbGate.message ||
            `Total ${mbGate.totalMb.toFixed(1)} MB exceeds plan limit of ${mbGate.capMb} MB (${refCount} file ref(s)).`,
        });
        setLoading(false);
        return;
      }

      await assertCompanyAllowsLedgerMutations(companyId);
      await setDoc(
        doc(firestore, "companies", companyId),
        {
          name: company.name,
          address: company.address ?? "",
          phone: company.phone ?? "",
          email: company.email ?? "",
          pan: company.pan ?? "",
          country: company.country ?? "",
          logoUrl: company.logoUrl ?? null,
          ownerId: user.uid,
          ownerEmail: user.email ?? "",
          storageOption: "firebase",
          syncPolicy: "online",
          syncedFromCloud: false,
          demotedFromOnlineAt: deleteField(),
          demoteReason: deleteField(),
          planId: company.planId ?? "basic",
          sharedWith: company.sharedWith ?? [],
          sharedWithEmails: company.sharedWithEmails ?? (user.email ? [user.email] : []),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      const rest = { ...(company as Record<string, unknown>) };
      delete rest.demoteReason;
      delete rest.demotedFromOnlineAt;
      await upsertLocalCompany({
        ...rest,
        id: companyId,
        storageOption: "firebase",
        syncPolicy: "online",
        syncedFromCloud: false,
      } as unknown as Parameters<typeof upsertLocalCompany>[0]);
      const { pushed, errors } = await pushAllLocalCompanyDocsToFirestore(companyId);
      reloadLocalCompanyRegistry();
      triggerSync();
      void removeLocalCompanyMirrorFromFolder(companyId).catch(() => undefined);
      toast({
        title: "Uploaded",
        description:
          errors.length > 0
            ? `Saved ${pushed} document(s) to cloud. Some batches failed: ${errors.slice(0, 2).join(" · ")}`
            : pushed > 0
              ? `Company linked to cloud and ${pushed} local document(s) uploaded.`
              : "Company linked to cloud. No extra local cache rows found (new company or empty cache).",
      });
      setUploadConfirmOpen(false);
      setConfirmInput("");
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Check your network connection and permissions.",
      });
    } finally {
      setLoading(false);
    }
  };

  const openLocalToOnlineConfirm = () => {
    if (!planAllowsLocalToOnline) {
      toast({
        variant: "destructive",
        title: max === 0 ? "Plan does not allow online companies" : "Online slots full",
        description:
          max === 0
            ? "Upgrade your plan to upload a local company to the cloud."
            : `Your plan allows ${max} online slot(s). Free a slot or upgrade first.`,
      });
      return;
    }
    setConfirmInput("");
    setUploadConfirmOpen(true);
  };

  if (!company || !companyId || !isOwner) return null;

  if (localCloudSyncOn) return null;

  // Pehle se online: repair push — seedha click, koi type-confirm nahi
  if (!isLocal) {
    return (
      <Card className={companyProfilePinkZone}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cloud data repair (this device)</CardTitle>
          <CardDescription className="text-xs">
            If vouchers or totals show zero after &quot;Upload to cloud&quot;, push browser-stored ledgers to Firestore once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={repairLoading}
            onClick={() => void runPushLocalDocs()}
          >
            {repairLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            <span className="ml-2">Push local documents to cloud</span>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={companyProfilePinkZone}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CloudUpload className="h-5 w-5" />
            Upload this company to cloud
          </CardTitle>
          <CardDescription>
            Link this local company to Firestore (plan: <strong>{max}</strong> online slot
            {max === 1 ? "" : "s"}, currently using <strong>{current}</strong>
            {isLocalOnlyMode() ? " — in static/local APK builds this still requires an available network." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={loading || !planAllowsLocalToOnline}
            onClick={openLocalToOnlineConfirm}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            <span className="ml-2">Upload now</span>
          </Button>
          {max === 0 && (
            <p className="text-sm text-muted-foreground">
              On Basic, only local companies are included.{" "}
              <Link href="/billing" className="font-medium text-primary underline">
                Plan upgrade
              </Link>
            </p>
          )}
          {max > 0 && !ok && (
            <p className="text-sm text-muted-foreground">
              Online slots are full. <Link href="/billing" className="underline">Upgrade</Link> or set another company to local-only first.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={uploadConfirmOpen}
        onOpenChange={(open) => {
          if (!loading) {
            setUploadConfirmOpen(open);
            if (!open) setConfirmInput("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload local company to cloud?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{companyName}</strong> will use one online plan slot and sync to Firestore. Type{" "}
              <strong className="font-mono text-foreground">{expectedConfirmPhrase}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="local-to-online-confirm">Confirmation</Label>
            <Input
              id="local-to-online-confirm"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={expectedConfirmPhrase}
              autoComplete="off"
              disabled={loading}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={loading || !confirmOk} onClick={() => void handleUploadToCloud()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={loading ? "ml-2" : ""}>Upload to cloud</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
