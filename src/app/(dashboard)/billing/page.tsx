"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { toast } from "@/hooks/use-toast";
import {
  DEFAULT_PLANS,
  PlanId,
  Plan,
  formatPrice,
  EntitlementKey,
} from "@/config/plans";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import KhaltiCheckout from "khalti-checkout-web";
import { Badge } from "@/components/ui/badge";
import { Check, Download, Loader2, X } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter } from "@/components/ui/table";
import { format as formatDateFns } from "date-fns";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useRouter } from "next/navigation";
import { useDate } from "@/hooks/useDate";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBsFromAD } from "@/lib/bs-date";
import {
  BILLING_TERM_OPTIONS,
  classifyPlanChange,
  grossPriceNpr,
  quoteDowngradeNewExpiry,
  quotePaidPlanPurchase,
  daysLeftRounded,
  type SubscriptionTermKey,
} from "@/lib/subscriptionPlanMath";
import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { mergeAppSettingsPlansDoc } from "@/lib/mergeAppSettingsPlans";
import {
  defaultPlansListFallback,
  readCachedPlansList,
  writeCachedPlansList,
} from "@/lib/plansCatalogCache";

/** Per-column price line using the same gross math as server `/api/payments/initiate` + proration quotes. */
function formatTermPriceFromKey(plan: Plan, termKey: SubscriptionTermKey): string {
  if (plan.isFree) {
    if (termKey === "monthly") return formatPrice(plan, "monthly", true);
    return "Free";
  }
  const total = grossPriceNpr(termKey, plan.price.monthly, plan.price.yearly);
  const suffix = plan.currency === "NPR" ? "रु" : plan.currency;
  const label = BILLING_TERM_OPTIONS.find((o) => o.value === termKey)?.label ?? termKey;
  return `${suffix} ${total.toLocaleString("en-IN")} (${label})`;
}

function checkoutAmountNpr(plan: Plan, termKey: SubscriptionTermKey, donationAmount: number): number {
  if (plan.isFree) return donationAmount;
  return grossPriceNpr(termKey, plan.price.monthly, plan.price.yearly);
}

/** Safe Date extractor for Firestore Timestamp / Date / millis / ISO values. */
function toSafeDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw != null && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Shared feature order for table, mobile cards, and PDF export. */
const BILLING_FEATURES: { key: EntitlementKey; label: string }[] = [
  { key: "maxUsers", label: "Max Users (online)" },
  { key: "maxUsersLocal", label: "Max Users (local)" },
  { key: "maxCompanies", label: "Max Companies (online)" },
  { key: "maxCompaniesLocal", label: "Max Companies (local)" },
  { key: "dailyVoucherLimit", label: "Daily Vouchers (online)" },
  { key: "dailyVoucherLimitLocal", label: "Daily Vouchers (local)" },
  { key: "monthlyVoucherLimit", label: "Monthly Vouchers (online)" },
  { key: "monthlyVoucherLimitLocal", label: "Monthly Vouchers (local)" },
  { key: "maxAttachmentsGB", label: "Attachments GB (online)" },
  { key: "maxAttachmentsGBLocal", label: "Attachments GB (local)" },
  { key: "maxStorageGB", label: "Storage GB (online)" },
  { key: "maxStorageGBLocal", label: "Storage GB (local)" },
  { key: "hasMultiDeviceSync", label: "Multi-device sync" },
  { key: "hasRoleBasedAccess", label: "Role-based access" },
  { key: "hasAuditLogs", label: "Audit logs" },
  { key: "hasPrioritySupport", label: "Priority support" },
];

/** Khalti success_url may already include `?pendingId=` — append token/amount with `&` when needed. */
function withKhaltiProrationReturnParams(returnUrl: string, token: string, amount: number): string {
  const sep = returnUrl.includes("?") ? "&" : "?";
  return `${returnUrl}${sep}token=${encodeURIComponent(token)}&amount=${encodeURIComponent(String(amount))}`;
}

type CheckoutFormProps = {
  plan: Plan;
  termKey: SubscriptionTermKey;
  userId: string;
  companyId: string;
  billingIntent: "donation" | "subscribe";
};

function CheckoutForm({ plan, termKey, userId, companyId, billingIntent }: CheckoutFormProps) {
  const [gateway, setGateway] = useState<"stripe" | "khalti" | "esewa">("stripe");
  const [isLoading, setIsLoading] = useState(false);
  const [donationAmount, setDonationAmount] = useState(100);

  const isFreePlan = plan.isFree;
  const amountNpr = checkoutAmountNpr(plan, termKey, donationAmount);
  const amountInPaisa = Math.round(amountNpr * 100);

  async function handleCheckout() {
    if (amountNpr <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount to proceed.",
      });
      return;
    }

    if (!userId.trim()) {
      toast({ variant: "destructive", title: "Sign in required", description: "Please log in to complete payment." });
      return;
    }
    if (!companyId.trim()) {
      toast({
        variant: "destructive",
        title: "Select a company",
        description: "Choose a company from the sidebar before paying so your plan attaches to the right account.",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Online-only: server route JSON; optional NEXT_PUBLIC_BILLING_API_ORIGIN for static shell → hosted API
      const res = await fetch(getBillingApiUrl("/api/payments/initiate"), {
        method: "POST",
        body: JSON.stringify({
          planId: plan.id,
          gateway,
          amount: amountInPaisa,
          currency: plan.currency,
          userId: userId.trim(),
          companyId: companyId.trim(),
          billingCycle: termKey === "monthly" ? "monthly" : "yearly",
          periodYears: (() => {
            const m = /^year_(\d+)$/.exec(termKey);
            return m != null ? Math.min(10, Math.max(1, parseInt(m[1], 10))) : 1;
          })(),
          subscriptionTermKey: termKey,
          billingIntent,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate payment.");
      }

      if (gateway === "stripe" && data.url) {
        window.location.assign(data.url);
      } else if (gateway === "khalti") {
        const khaltiConfig = {
          publicKey: data.publicKey,
          productIdentity: data.product_identity,
          productName: data.product_name,
          productUrl: window.location.href,
          amount: data.amount,
          eventHandler: {
            onSuccess(payload: any) {
              window.location.assign(`${data.returnUrl}?token=${payload.token}&amount=${payload.amount}`);
            },
            onError(error: any) {
              console.error(error);
              toast({ variant: "destructive", title: "Khalti Error", description: "Payment failed. Please try again." });
            },
            onClose() {
              console.log("Khalti widget closed.");
            },
          },
        };
        const checkout = new (KhaltiCheckout as any)(khaltiConfig);
        checkout.show({ amount: data.amount });
      } else if (gateway === "esewa") {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.url;

        const fields: Record<string, string> = {
          amount: data.amount,
          failure_url: data.failUrl,
          product_delivery_charge: "0",
          product_service_charge: "0",
          product_code: data.merchantCode,
          signature: data.signature,
          signed_field_names: data.signedFieldNames,
          success_url: data.successUrl,
          tax_amount: "0",
          total_amount: data.amount,
          transaction_uuid: data.oid,
        };

        for (const key of Object.keys(fields)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = fields[key];
          form.appendChild(input);
        }

        document.body.appendChild(form);
        form.submit();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Checkout failed";
      toast({ variant: "destructive", title: "Checkout Error", description: msg });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-8 border-t pt-8">
      {isFreePlan ? (
        <h3 className="text-xl font-semibold mb-4">Support Us with a Donation (Optional)</h3>
      ) : (
        <h3 className="text-xl font-semibold mb-4">Select Payment Method</h3>
      )}
      {isFreePlan && (
        <div className="mb-6 max-w-sm">
          <Label htmlFor="donation-amount">Donation Amount (NPR)</Label>
          <Input
            id="donation-amount"
            type="number"
            value={donationAmount}
            onChange={(e) => setDonationAmount(Number(e.target.value))}
            placeholder="e.g., 100"
          />
        </div>
      )}
      <RadioGroup value={gateway} onValueChange={(val) => setGateway(val as "stripe" | "khalti" | "esewa")} className="flex flex-wrap items-center gap-4 mb-6">
        <Label
          htmlFor="stripe"
          className={cn("flex items-center gap-2 border rounded-lg p-3 cursor-pointer", gateway === "stripe" && "border-primary")}
        >
          <RadioGroupItem value="stripe" id="stripe" />
          Stripe (Cards)
        </Label>
        <Label
          htmlFor="khalti"
          className={cn("flex items-center gap-2 border rounded-lg p-3 cursor-pointer", gateway === "khalti" && "border-primary")}
        >
          <RadioGroupItem value="khalti" id="khalti" />
          Khalti
        </Label>
        <Label
          htmlFor="esewa"
          className={cn("flex items-center gap-2 border rounded-lg p-3 cursor-pointer", gateway === "esewa" && "border-primary")}
        >
          <RadioGroupItem value="esewa" id="esewa" />
          eSewa
        </Label>
      </RadioGroup>
      <Button onClick={handleCheckout} disabled={isLoading} className="w-full max-w-sm">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : isFreePlan ? (
          `Donate ${formatPrice({ ...plan, price: { monthly: donationAmount, yearly: donationAmount } } as Plan, "monthly", true)}`
        ) : (
          `Pay with ${gateway.toUpperCase()}`
        )}
      </Button>
    </div>
  );
}

export default function BillingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { companyId, company, loading: companyLoading, allCompanies } = useCompany();
  // dateFormatBS: BS display key — formatBsFromAD mirrors NepaliDate.format + datex-bs for long AD expiries.
  const { dateSystem, formatDate, formatDateBS, dateFormatBS } = useDate();
  const [plans, setPlans] = useState<Plan[]>(() => readCachedPlansList() ?? defaultPlansListFallback());
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>("basic");
  /** Each plan column’s term (monthly … 10 yr) for Basic checkout + proration quotes. */
  const [colTerms, setColTerms] = useState<Record<PlanId, SubscriptionTermKey>>(() => {
    const o = {} as Record<PlanId, SubscriptionTermKey>;
    for (const id of ["basic", "advance", "pro", "pro-plus"] as PlanId[]) o[id] = "year_1";
    return o;
  });
  const [prorationLoading, setProrationLoading] = useState<string | null>(null);
  const [downgradeLoading, setDowngradeLoading] = useState<string | null>(null);
  const isMobile = useIsMobile();
  /** Mobile plan carousel: one visible plan column at a time. */
  const [mobilePlanIndex, setMobilePlanIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  /** Gateway for paid-plan renew (proration): matches Basic checkout — admin/history get separate rows per gateway. */
  const [prorationGateway, setProrationGateway] = useState<"stripe" | "khalti" | "esewa">("stripe");

  const formatBillingDate = useCallback(
    (dDate: Date | null | undefined) => {
      if (!dDate || isNaN(dDate.getTime())) return "N/A";
      if (dateSystem === "AD") return formatDate(dDate) || "N/A";
      if (dateSystem === "BS") return formatDateBS(dDate) || "N/A";
      // Both: only pair BS + AD when extended conversion succeeds — else single AD line (no duplicate).
      const ad = formatDate(dDate) || "N/A";
      const bs = formatBsFromAD(dDate, dateFormatBS);
      return bs ? `${bs} (${ad})` : ad;
    },
    [dateSystem, formatDate, formatDateBS, dateFormatBS]
  );

  /**
   * Plan expiry can land past nepali-date-converter BS 2090 — datex-bs extends to ~2200; beyond that, "(AD)" label.
   */
  const formatBillingExpiry = useCallback(
    (dDate: Date | null | undefined) => {
      if (!dDate || isNaN(dDate.getTime())) return "N/A";
      const ad = formatDate(dDate) || "N/A";
      if (dateSystem === "AD") return ad;
      const bs = formatBsFromAD(dDate, dateFormatBS);
      if (dateSystem === "BS") return bs || `${ad} (AD)`;
      return bs ? `${bs} (${ad})` : ad;
    },
    [dateSystem, formatDate, dateFormatBS]
  );

  // Shared users must not open billing (plan purchase applies to owner account only).
  useEffect(() => {
    if (companyLoading) return;
    if (company && company.isOwned === false) {
      router.replace("/dashboard");
      toast({
        variant: "destructive",
        title: "Billing unavailable",
        description: "Only the company owner can manage plans and payments.",
      });
    }
  }, [company, companyLoading, router]);

  /** Account plan (all owned companies) so billing UI matches avatar/header after Stripe on another local row. */
  const currentPlanId = useMemo(
    (): PlanId => resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId),
    [allCompanies, user?.uid, company?.planId]
  );

  useEffect(() => {
    if (["basic", "advance", "pro", "pro-plus"].includes(currentPlanId)) {
      setSelectedPlanId(currentPlanId);
    }
  }, [currentPlanId]);

  /** Admin DB se list prices (Firebase Admin) — client persistence cache se zyada trustworthy. */
  const fetchServerPlanCatalog = useCallback(async () => {
    try {
      const res = await fetch(getBillingApiUrl("/api/payments/plan-catalog"), { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { plans?: Plan[] };
      if (Array.isArray(data.plans) && data.plans.length > 0) {
        setPlans(data.plans);
        writeCachedPlansList(data.plans);
      }
    } catch {
      /* offline: onSnapshot / defaults */
    }
  }, []);

  // Mount + tab focus: server catalog (same amounts as `/api/payments/initiate`).
  useEffect(() => {
    void fetchServerPlanCatalog();
  }, [fetchServerPlanCatalog]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchServerPlanCatalog();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchServerPlanCatalog]);

  // Realtime: Firestore listener — agar data cache se ho to dubara server se align karo.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(firestore, "app_settings", "plans"),
      (docSnap) => {
        if (docSnap.exists()) {
          const mergedPlans = mergeAppSettingsPlansDoc(docSnap.data() as Record<string, unknown>);
          setPlans(mergedPlans);
          writeCachedPlansList(mergedPlans);
          if (docSnap.metadata.fromCache) void fetchServerPlanCatalog();
        } else {
          setPlans(readCachedPlansList() ?? defaultPlansListFallback());
        }
        setLoading(false);
      },
      () => {
        const cached = readCachedPlansList();
        if (cached) setPlans(cached);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [fetchServerPlanCatalog]);

  const selectedPlanDetails = plans.find((p) => p.id === selectedPlanId);

  /** Resolved display name for the company’s active SKU (merged Firestore plan names). */
  const currentSubscribedPlanLabel = useMemo(() => {
    const row = plans.find((p) => p.id === currentPlanId);
    if (row?.name) return row.name;
    if (currentPlanId === "pro-plus") return "Pro Plus";
    return currentPlanId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }, [plans, currentPlanId]);

  const joinedDate = useMemo(() => {
    // Show a meaningful join date even when planUpgradedAt is absent on older/static rows.
    return (
      toSafeDate(company?.planUpgradedAt) ??
      toSafeDate((company as Record<string, unknown> | undefined)?.planJoinedAt) ??
      toSafeDate((company as Record<string, unknown> | undefined)?.createdAt) ??
      toSafeDate((company as Record<string, unknown> | undefined)?.createdOn) ??
      null
    );
  }, [company]);

  const expiryDate = useMemo(() => {
    // Expiry fallback keeps display stable across web/static migrations.
    return (
      toSafeDate(company?.planExpiry) ??
      toSafeDate((company as Record<string, unknown> | undefined)?.expiryDate) ??
      toSafeDate((company as Record<string, unknown> | undefined)?.planExpiresAt) ??
      null
    );
  }, [company]);

  useEffect(() => {
    if (mobilePlanIndex >= plans.length) {
      setMobilePlanIndex(Math.max(0, plans.length - 1));
    }
  }, [mobilePlanIndex, plans.length]);

  const handleDownloadPlansPdf = useCallback(async () => {
    try {
      const jsPdfModule = await import("jspdf");
      const doc = new jsPdfModule.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      // One-page PC-style matrix: feature rows + 4 plan columns with line borders.
      const orderedPlanIds: PlanId[] = ["basic", "advance", "pro", "pro-plus"];
      const exportPlans = orderedPlanIds
        .map((id) => plans.find((p) => p.id === id))
        .filter((p): p is Plan => p != null);
      if (exportPlans.length === 0) {
        throw new Error("No plan data available.");
      }

      const pageW = doc.internal.pageSize.getWidth();
      const left = 26;
      const right = pageW - 26;
      const tableW = right - left;
      const featureColW = 185;
      const planColW = (tableW - featureColW) / exportPlans.length;
      const top = 76;
      const rowH = 20;
      const headerH = 40;

      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("Pocket Ledger - Billing Plans", left, 34);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleString()}`, left, 50);

      // Outer border.
      const totalRows = BILLING_FEATURES.length + 1; // + price row
      const tableH = headerH + totalRows * rowH;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.rect(left, top, tableW, tableH);

      // Vertical lines: feature + plan columns.
      doc.line(left + featureColW, top, left + featureColW, top + tableH);
      for (let i = 1; i < exportPlans.length; i++) {
        const x = left + featureColW + i * planColW;
        doc.line(x, top, x, top + tableH);
      }

      // Header separator.
      doc.line(left, top + headerH, left + tableW, top + headerH);

      // Column headers.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Features", left + 6, top + 24);
      exportPlans.forEach((p, idx) => {
        const x = left + featureColW + idx * planColW + 6;
        doc.text(p.name, x, top + 16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        const priceLine = p.isFree ? "Free" : formatTermPriceFromKey(p, colTerms[p.id]);
        const wrapped = doc.splitTextToSize(priceLine, planColW - 12) as string[];
        doc.text(wrapped.slice(0, 2), x, top + 30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
      });

      // Row 1: Tagline
      let y = top + headerH + rowH - 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Tagline", left + 6, y);
      exportPlans.forEach((p, idx) => {
        const x = left + featureColW + idx * planColW + 6;
        const wrapped = doc.splitTextToSize(String(p.tagline || "-"), planColW - 12) as string[];
        doc.text(wrapped[0] || "-", x, y);
      });
      doc.line(left, top + headerH + rowH, left + tableW, top + headerH + rowH);

      // Feature rows with horizontal grid lines.
      BILLING_FEATURES.forEach((feature, featureIdx) => {
        const rowTop = top + headerH + rowH + featureIdx * rowH;
        const rowTextY = rowTop + rowH - 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(feature.label, left + 6, rowTextY);
        exportPlans.forEach((p, idx) => {
          const { text } = getFeatureValue(p, feature.key);
          const x = left + featureColW + idx * planColW + 6;
          const wrapped = doc.splitTextToSize(String(text), planColW - 12) as string[];
          doc.text(wrapped[0] || "-", x, rowTextY);
        });
        doc.line(left, rowTop + rowH, left + tableW, rowTop + rowH);
      });

      doc.save("pocket-ledger-plans.pdf");
      toast({ title: "Downloaded", description: "Plan chart PDF downloaded." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "PDF download failed",
        description: e instanceof Error ? e.message : "Try again.",
      });
    }
  }, [colTerms, plans]);

  const expiryMs = expiryDate != null && !Number.isNaN(expiryDate.getTime()) ? expiryDate.getTime() : null;

  /** Calendar days until plan expiry — shown beside expiry; null when no expiry timestamp. */
  const daysLeftOnPlan = useMemo(
    () => (expiryMs != null ? daysLeftRounded(Date.now(), expiryMs) : null),
    [expiryMs]
  );
  /** True when expiry is in the past (not "0 days" due to same-day rounding). */
  const planExpiredByClock = expiryMs != null && expiryMs <= Date.now();

  /** Prorated renew: Stripe redirect, Khalti widget, or eSewa form — server stores pending intent for NP gateways. */
  async function handleProratedPay(targetPlanId: PlanId) {
    if (!user || !companyId) return;
    const term = colTerms[targetPlanId];
    const loadKey = `pay:${targetPlanId}`;
    setProrationLoading(loadKey);
    try {
      const token = await user.getIdToken();
      const res = await fetch(getBillingApiUrl("/api/payments/plan-change-checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, targetPlanId, term, gateway: prorationGateway }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.applied && data.ok) {
        toast({
          title: "Plan updated",
          description: "No payment was charged — unused time covered this change.",
        });
        return;
      }
      if (prorationGateway === "stripe" && typeof data.url === "string") {
        window.location.assign(data.url);
        return;
      }
      if (prorationGateway === "khalti" && data.gateway === "khalti") {
        const khaltiConfig = {
          publicKey: data.publicKey,
          productIdentity: data.product_identity,
          productName: data.product_name,
          productUrl: typeof window !== "undefined" ? window.location.href : "",
          amount: data.amount,
          eventHandler: {
            onSuccess(payload: { token: string; amount: number }) {
              window.location.assign(withKhaltiProrationReturnParams(data.returnUrl, payload.token, payload.amount));
            },
            onError() {
              toast({ variant: "destructive", title: "Khalti error", description: "Payment did not complete." });
            },
            onClose() {
              /* user closed widget */
            },
          },
        };
        const checkout = new (KhaltiCheckout as any)(khaltiConfig);
        checkout.show({ amount: data.amount });
        return;
      }
      if (prorationGateway === "esewa" && data.gateway === "esewa") {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.url;
        const fields: Record<string, string> = {
          amount: String(data.amount),
          failure_url: data.failUrl,
          product_delivery_charge: "0",
          product_service_charge: "0",
          product_code: data.merchantCode,
          signature: data.signature,
          signed_field_names: data.signedFieldNames,
          success_url: data.successUrl,
          tax_amount: "0",
          total_amount: String(data.amount),
          transaction_uuid: data.oid,
        };
        for (const key of Object.keys(fields)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = fields[key];
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }
      throw new Error("Unexpected response from payment server.");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not start checkout",
        description: e instanceof Error ? e.message : "Error",
      });
    } finally {
      setProrationLoading(null);
    }
  }

  /** Lower tier: remap remaining value into days on the cheaper yearly rate (Firestore only). */
  async function handleDowngrade(targetPlanId: PlanId) {
    if (!user || !companyId) return;
    const loadKey = `down:${targetPlanId}`;
    setDowngradeLoading(loadKey);
    try {
      const token = await user.getIdToken();
      const res = await fetch(getBillingApiUrl("/api/company/downgrade-plan"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId, targetPlanId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Downgrade failed");
      toast({ title: "Plan updated", description: "Your subscription tier was updated." });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not downgrade",
        description: e instanceof Error ? e.message : "Error",
      });
    } finally {
      setDowngradeLoading(null);
    }
  }

  const allFeaturesConfig = BILLING_FEATURES;

  const getFeatureValue = (plan: Plan, key: EntitlementKey): { text: string; enabled: boolean } => {
    const value = plan.entitlements[key];

    // Online + Local column dono me `0` = Unlimited (billing table — admin PlanDetails placeholders ke saath align).
    if (
      key === "dailyVoucherLimit" ||
      key === "monthlyVoucherLimit" ||
      key === "dailyVoucherLimitLocal" ||
      key === "monthlyVoucherLimitLocal"
    ) {
      const enabled = value !== 0;
      const text = value === 0 ? "Unlimited" : String(value);
      return { text, enabled: true };
    }

    if (typeof value === "boolean") {
      return { text: value ? "Yes" : "No", enabled: value };
    }

    if (typeof value === "number") {
      const enabled = value > 0;
      return { text: String(value), enabled };
    }

    return { text: "No", enabled: false };
  };

  const isPaidCompany = currentPlanId !== "basic";
  /** Paid accounts: plan changes only via table (no donation / free checkout block below). */
  const showStandardCheckout =
    !isPaidCompany && (!selectedPlanDetails.isFree || selectedPlanId === "basic");
  const selectedMobilePlan = plans[mobilePlanIndex] ?? selectedPlanDetails;
  /** Mobile basic users: checkout card must follow selected tab so paid plans can subscribe from phone too. */
  const showMobileCheckoutSection = isMobile && !isPaidCompany;

  if (loading || !selectedPlanDetails) {
    return (
      // Billing page: mobile true full-width vs viewport (2px side gap), ignores parent content padding.
      <div className="relative left-1/2 w-[calc(100vw-4px)] max-w-[calc(100vw-4px)] -translate-x-1/2 box-border py-4 sm:left-auto sm:w-[calc(100%-10px)] sm:max-w-[calc(100vw-10px)] sm:translate-x-0 sm:mx-[5px] sm:py-6">
        <Card className="w-full max-w-none border shadow-sm">
          <CardHeader>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="flex justify-center items-center gap-2 my-6">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-40" />
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
              <Skeleton className="h-96" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative left-1/2 w-[calc(100vw-4px)] max-w-[calc(100vw-4px)] -translate-x-1/2 box-border py-4 sm:left-auto sm:w-[calc(100%-10px)] sm:max-w-[calc(100vw-10px)] sm:translate-x-0 sm:mx-[5px] sm:py-6">
      <Card className="w-full max-w-none border shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
            <CardTitle className="text-3xl font-bold">Billing & Plans</CardTitle>
            <CardDescription>Choose a plan that fits your needs.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownloadPlansPdf()}>
              {/* User asked for downloadable plan PDF on web/static. */}
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {company && (
            <div className="rounded-lg border bg-muted/30 p-4 mb-6 text-sm space-y-3">
              <div>
                <span className="text-muted-foreground">Subscribed plan — current: </span>
                <strong>{currentSubscribedPlanLabel}</strong>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-6">
                <div>
                  <span className="text-muted-foreground">Joined date: </span>
                  <strong className={cn("font-semibold", dateSystem === "Both" ? "whitespace-nowrap" : "")}>
                    {formatBillingDate(joinedDate)}
                  </strong>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-muted-foreground">Expiry date: </span>
                  <span className={cn(dateSystem === "Both" && "whitespace-nowrap")}>
                    <strong className="font-semibold">{formatBillingExpiry(expiryDate)}</strong>
                    {daysLeftOnPlan != null ? (
                      <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                        {planExpiredByClock ? (
                          "(Expired)"
                        ) : (
                          <>
                            ({daysLeftOnPlan} {daysLeftOnPlan === 1 ? "day" : "days"} left)
                          </>
                        )}
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
            </div>
          )}

          {isMobile ? (
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {plans.map((p, idx) => (
                  <Button
                    key={`mobile-tab-${p.id}`}
                    type="button"
                    size="sm"
                    variant={idx === mobilePlanIndex ? "default" : "outline"}
                    onClick={() => setMobilePlanIndex(idx)}
                    className="shrink-0"
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
              <div
                className="border rounded-lg overflow-hidden"
                onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
                onTouchEnd={(e) => {
                  // Swipe navigation: one column per screen.
                  const endX = e.changedTouches[0]?.clientX;
                  if (touchStartX == null || endX == null) return;
                  const delta = endX - touchStartX;
                  if (Math.abs(delta) < 40) return;
                  setMobilePlanIndex((prev) => {
                    if (delta < 0) return Math.min(plans.length - 1, prev + 1);
                    return Math.max(0, prev - 1);
                  });
                }}
              >
                {(() => {
                  const p = plans[mobilePlanIndex] ?? plans[0];
                  if (!p) return null;
                  const isSelected = p.id === selectedPlanId;
                  return (
                    <div className={cn("p-3", isSelected && "bg-muted/30")}>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">{p.name}</h3>
                        {p.highlight ? <Badge>Most Popular</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{p.tagline}</p>
                      <p className="text-lg font-semibold mt-2">{p.isFree ? "Free" : formatTermPriceFromKey(p, colTerms[p.id])}</p>
                      <div className="mt-3 space-y-2">
                        {allFeaturesConfig.map((feature) => {
                          const { text } = getFeatureValue(p, feature.key);
                          return (
                            <div key={`${p.id}-${feature.key}-mobile`} className="flex items-start justify-between gap-3 border-b pb-1 text-sm">
                              <span className="text-muted-foreground">{feature.label}</span>
                              <span className="font-medium text-right">{text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                {/* Mobile action panel: parity with desktop "Term & action" row. */}
                <p className="text-sm font-medium">Term &amp; action</p>
                {(() => {
                  const p = selectedMobilePlan;
                  const change = classifyPlanChange(currentPlanId, p.id);
                  const loadPay = prorationLoading === `pay:${p.id}`;
                  const loadDown = downgradeLoading === `down:${p.id}`;

                  if (p.id === currentPlanId) {
                    if (!isPaidCompany) {
                      return <p className="text-xs text-muted-foreground">Current plan. You can donate below if you want.</p>;
                    }
                    return (
                      <div className="space-y-2">
                        <Select
                          value={colTerms[p.id]}
                          onValueChange={(v) => setColTerms((prev) => ({ ...prev, [p.id]: v as SubscriptionTermKey }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Term" />
                          </SelectTrigger>
                          <SelectContent>
                            {BILLING_TERM_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" className="w-full" disabled={loadPay || !companyId} onClick={() => handleProratedPay(p.id)}>
                          {loadPay ? <Loader2 className="h-4 w-4 animate-spin" /> : `Continue — pay with ${prorationGateway}`}
                        </Button>
                      </div>
                    );
                  }

                  if (change === "downgrade") {
                    return (
                      <Button type="button" variant="secondary" className="w-full" disabled={loadDown || !companyId} onClick={() => handleDowngrade(p.id)}>
                        {loadDown ? <Loader2 className="h-4 w-4 animate-spin" /> : p.isFree ? "Select this plan" : `Downgrade to ${p.name}`}
                      </Button>
                    );
                  }

                  if (!p.isFree && isPaidCompany) {
                    return (
                      <div className="space-y-2">
                        <Select
                          value={colTerms[p.id]}
                          onValueChange={(v) => setColTerms((prev) => ({ ...prev, [p.id]: v as SubscriptionTermKey }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Term" />
                          </SelectTrigger>
                          <SelectContent>
                            {BILLING_TERM_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" className="w-full" disabled={loadPay || !companyId} onClick={() => handleProratedPay(p.id)}>
                          {loadPay ? <Loader2 className="h-4 w-4 animate-spin" /> : change === "upgrade" ? "Upgrade (prorated)" : "Renew (prorated)"}
                        </Button>
                      </div>
                    );
                  }

                  if (!p.isFree && currentPlanId === "basic") {
                    return (
                      <div className="space-y-2">
                        <Select
                          value={colTerms[p.id]}
                          onValueChange={(v) => setColTerms((prev) => ({ ...prev, [p.id]: v as SubscriptionTermKey }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Term" />
                          </SelectTrigger>
                          <SelectContent>
                            {BILLING_TERM_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" className="w-full" onClick={() => setSelectedPlanId(p.id)}>
                          Subscribe to {p.name} below
                        </Button>
                      </div>
                    );
                  }

                  if (p.isFree && p.id !== currentPlanId) {
                    return (
                      <Button type="button" variant="secondary" className="w-full" disabled={loadDown || !companyId} onClick={() => handleDowngrade(p.id)}>
                        {loadDown ? <Loader2 className="h-4 w-4 animate-spin" /> : "Select this plan"}
                      </Button>
                    );
                  }

                  return <p className="text-xs text-muted-foreground">No action for this plan.</p>;
                })()}
              </div>
              <p className="text-xs text-muted-foreground">Swipe left/right or use tabs to switch plan columns.</p>
            </div>
          ) : (
          /* scrollContainer=false: single horizontal scroll on outer div — avoids clipped first column. table-fixed + break-words keeps text inside each cell. */
          <div className="border rounded-lg overflow-x-auto">
            <Table
              scrollContainer={false}
              className={cn(
                "w-full min-w-0 table-fixed border-collapse",
                "[&_th]:border-r [&_td]:border-r [&_th]:border-border [&_td]:border-border",
                "[&_tr>th:last-child]:border-r-0 [&_tr>td:last-child]:border-r-0"
              )}
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%] min-w-0 max-w-[22%] font-semibold text-base whitespace-normal break-words align-top !whitespace-normal px-2 py-3">
                    Features
                  </TableHead>
                  {plans.map((p) => {
                    const isSelected = p.id === selectedPlanId;
                    const offerDate = p.limitedTimeOfferDate ? (p.limitedTimeOfferDate as { toDate: () => Date }).toDate() : null;
                    const isOfferValid = offerDate && offerDate > new Date();

                    return (
                      <TableHead
                        key={p.id}
                        className={cn(
                          "w-[19.5%] min-w-0 max-w-[19.5%] text-center align-top !whitespace-normal whitespace-normal break-words px-2 py-3",
                          isSelected && "bg-muted"
                        )}
                      >
                        <div className="p-2 min-w-0">
                          <div className="flex flex-wrap items-center justify-center gap-2 min-w-0">
                            <h3 className="text-xl font-bold break-words min-w-0 leading-tight">{p.name}</h3>
                            {p.highlight && <Badge className="shrink-0">Most Popular</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground break-words mt-1">{p.tagline}</p>
                          <div className="mt-4 min-w-0 break-words">
                            {p.isFree ? (
                              <>
                                <p className="text-lg font-bold text-muted-foreground line-through break-words">
                                  {formatPrice(p, colTerms[p.id] === "monthly" ? "monthly" : "yearly", true)}
                                </p>
                                <p className="text-3xl font-bold text-primary">Free</p>
                              </>
                            ) : (
                              <div className="text-base sm:text-2xl font-bold leading-snug break-words">
                                {formatTermPriceFromKey(p, colTerms[p.id])}
                              </div>
                            )}
                          </div>
                          {isOfferValid && (
                            <Badge variant="destructive" className="mt-2 whitespace-normal text-center max-w-full break-words">
                              Offer ends {formatDateFns(offerDate, "MMM do, yyyy")}
                            </Badge>
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allFeaturesConfig.map((feature) => (
                  <TableRow key={feature.key}>
                    <TableCell className="min-w-0 max-w-[22%] font-medium whitespace-normal break-words align-middle !whitespace-normal px-2 py-2">
                      {feature.label}
                    </TableCell>
                    {plans.map((p) => {
                      const { text, enabled } = getFeatureValue(p, feature.key);
                      const isSelected = p.id === selectedPlanId;
                      return (
                        <TableCell
                          key={`${p.id}-${feature.key}`}
                          className={cn(
                            "min-w-0 max-w-[19.5%] text-center whitespace-normal break-words align-middle !whitespace-normal px-2 py-2",
                            isSelected && "bg-muted"
                          )}
                        >
                          {["hasMultiDeviceSync", "hasRoleBasedAccess", "hasAuditLogs", "hasPrioritySupport"].includes(feature.key) ? (
                            enabled ? (
                              <Check className="h-5 w-5 mx-auto text-green-500 shrink-0" />
                            ) : (
                              <X className="h-5 w-5 mx-auto text-red-500 shrink-0" />
                            )
                          ) : (
                            <span
                              className={cn(
                                "inline-block max-w-full break-words",
                                !enabled && text !== "Unlimited" && "text-muted-foreground"
                              )}
                            >
                              {text}
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="align-top text-muted-foreground text-sm min-w-0 max-w-[22%] whitespace-normal break-words !whitespace-normal px-2 py-3">
                    Term &amp; action
                  </TableCell>
                  {plans.map((p) => {
                    const isSelected = p.id === selectedPlanId;
                    const change = classifyPlanChange(currentPlanId, p.id);
                    const curPlanRow = plans.find((x) => x.id === currentPlanId);
                    const loadPay = prorationLoading === `pay:${p.id}`;
                    const loadDown = downgradeLoading === `down:${p.id}`;

                    const prorationHint =
                      isPaidCompany && change !== "downgrade" && !p.isFree && curPlanRow && !curPlanRow.isFree ? (
                        (() => {
                          const q = quotePaidPlanPurchase({
                            nowMs: Date.now(),
                            currentExpiryMs: expiryMs,
                            currentYearly: curPlanRow.price.yearly,
                            targetMonthly: p.price.monthly,
                            targetYearly: p.price.yearly,
                            term: colTerms[p.id],
                          });
                          const daysApprox = daysLeftRounded(Date.now(), q.newExpiryMs);
                          return (
                            <>
                              <p className="text-xs text-muted-foreground leading-snug">
                                With the term selected above, you would have about{" "}
                                <strong className="tabular-nums text-foreground">{daysApprox}</strong> days of{" "}
                                <span className="font-medium">{p.name}</span> access from today (after payment is
                                applied).
                              </p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                Credit ≈ रु {q.creditNpr.toFixed(2)} · Net due रु {q.netNpr.toFixed(2)}
                              </p>
                            </>
                          );
                        })()
                      ) : null;

                    const downgradeHint =
                      change === "downgrade" && currentPlanId !== "basic" && isPaidCompany ? (
                        (() => {
                          if (p.isFree) return null;
                          const tgt = p;
                          const curY = curPlanRow?.price.yearly ?? 0;
                          const q = quoteDowngradeNewExpiry({
                            nowMs: Date.now(),
                            currentExpiryMs: expiryMs,
                            currentYearly: curY,
                            targetYearly: tgt.price.yearly,
                          });
                          return (
                            <p className="text-xs text-muted-foreground leading-snug">
                              If you downgrade, your remaining paid time converts to about{" "}
                              <strong className="tabular-nums text-foreground">{q.extraDays}</strong> days on{" "}
                              <span className="font-medium">{tgt.name}</span> at that plan&apos;s yearly rate.
                            </p>
                          );
                        })()
                      ) : null;

                    let footerInner: ReactNode = null;
                    // Per-column actions: Basic row uses `/api/payments/initiate`; paid rows use proration (`plan-change-checkout`) or `downgrade-plan`.
                    if (p.id === currentPlanId) {
                      footerInner =
                        isPaidCompany ? (
                          <div className="flex flex-col items-stretch gap-2 max-w-[240px] mx-auto">
                            <Select
                              value={colTerms[p.id]}
                              onValueChange={(v) =>
                                setColTerms((prev) => ({ ...prev, [p.id]: v as SubscriptionTermKey }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Term" />
                              </SelectTrigger>
                              <SelectContent>
                                {BILLING_TERM_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {prorationHint}
                            {/* Renew: same gateways as new subscription — each payment row in admin shows gateway separately. */}
                            <RadioGroup
                              value={prorationGateway}
                              onValueChange={(v) => setProrationGateway(v as "stripe" | "khalti" | "esewa")}
                              className="flex flex-col gap-2 text-xs"
                            >
                              <Label
                                className={cn(
                                  "flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer font-normal",
                                  prorationGateway === "stripe" && "border-primary"
                                )}
                              >
                                <RadioGroupItem value="stripe" id="proration-stripe" className="shrink-0" />
                                Stripe (cards)
                              </Label>
                              <Label
                                className={cn(
                                  "flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer font-normal",
                                  prorationGateway === "khalti" && "border-primary"
                                )}
                              >
                                <RadioGroupItem value="khalti" id="proration-khalti" className="shrink-0" />
                                Khalti
                              </Label>
                              <Label
                                className={cn(
                                  "flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer font-normal",
                                  prorationGateway === "esewa" && "border-primary"
                                )}
                              >
                                <RadioGroupItem value="esewa" id="proration-esewa" className="shrink-0" />
                                eSewa
                              </Label>
                            </RadioGroup>
                            <Button
                              type="button"
                              size="sm"
                              className="w-full"
                              disabled={loadPay || !companyId}
                              onClick={() => handleProratedPay(p.id)}
                            >
                              {loadPay ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                `Continue — pay with ${prorationGateway}`
                              )}
                            </Button>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              Prorated renew uses the gateway you choose; Khalti may require a secret key on the server
                              for verification. If you also have a Stripe subscription, it may renew there until you
                              cancel in Stripe.
                            </p>
                          </div>
                        ) : (
                          <Button type="button" variant="outline" disabled className="w-full max-w-[220px]">
                            Current plan
                          </Button>
                        );
                    } else if (change === "downgrade") {
                      footerInner = (
                        <div className="flex flex-col items-stretch gap-2 max-w-[240px] mx-auto">
                          {downgradeHint}
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            disabled={loadDown || !companyId}
                            onClick={() => handleDowngrade(p.id)}
                          >
                            {loadDown ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : p.isFree ? (
                              "Select this plan"
                            ) : (
                              `Downgrade to ${p.name}`
                            )}
                          </Button>
                        </div>
                      );
                    } else if (p.isFree && p.id !== currentPlanId) {
                      footerInner = (
                        <div className="flex flex-col items-stretch gap-2 max-w-[240px] mx-auto">
                          <p className="text-xs text-muted-foreground text-center leading-snug px-1">
                            No payment — your company switches to this plan immediately.
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            disabled={loadDown || !companyId}
                            onClick={() => handleDowngrade(p.id)}
                          >
                            {loadDown ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Select this plan"
                            )}
                          </Button>
                        </div>
                      );
                    } else if (!p.isFree && isPaidCompany) {
                      footerInner = (
                        <div className="flex flex-col items-stretch gap-2 max-w-[240px] mx-auto">
                          <Select
                            value={colTerms[p.id]}
                            onValueChange={(v) =>
                              setColTerms((prev) => ({ ...prev, [p.id]: v as SubscriptionTermKey }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Term" />
                            </SelectTrigger>
                            <SelectContent>
                              {BILLING_TERM_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {prorationHint}
                          <Button
                            type="button"
                            className="w-full"
                            disabled={loadPay || !companyId}
                            onClick={() => {
                              setSelectedPlanId(p.id);
                              handleProratedPay(p.id);
                            }}
                          >
                            {loadPay ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : change === "upgrade" ? (
                              "Upgrade (Stripe, prorated)"
                            ) : (
                              "Renew (Stripe, prorated)"
                            )}
                          </Button>
                        </div>
                      );
                    } else if (!p.isFree && currentPlanId === "basic") {
                      footerInner = (
                        <div className="flex flex-col items-stretch gap-2 max-w-[240px] mx-auto">
                          <Select
                            value={colTerms[p.id]}
                            onValueChange={(v) =>
                              setColTerms((prev) => ({ ...prev, [p.id]: v as SubscriptionTermKey }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Term" />
                            </SelectTrigger>
                            <SelectContent>
                              {BILLING_TERM_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(() => {
                            const basicRow = plans.find((x) => x.id === "basic");
                            const q = quotePaidPlanPurchase({
                              nowMs: Date.now(),
                              currentExpiryMs: expiryMs,
                              currentYearly: basicRow?.price.yearly ?? 0,
                              targetMonthly: p.price.monthly,
                              targetYearly: p.price.yearly,
                              term: colTerms[p.id],
                            });
                            const daysApprox = daysLeftRounded(Date.now(), q.newExpiryMs);
                            return (
                              <p className="text-xs text-muted-foreground text-center leading-snug">
                                On this term, new subscribers get about{" "}
                                <strong className="tabular-nums text-foreground">{daysApprox}</strong> days of{" "}
                                <span className="font-medium">{p.name}</span> access from payment date.
                              </p>
                            );
                          })()}
                          <Button
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            className="w-full"
                            onClick={() => setSelectedPlanId(p.id)}
                          >
                            {isSelected ? "Selected — pay below" : "Choose — pay below"}
                          </Button>
                        </div>
                      );
                    } else {
                      footerInner = (
                        <Button type="button" variant="ghost" disabled className="w-full max-w-[220px]">
                          —
                        </Button>
                      );
                    }

                    return (
                      <TableCell
                        key={`footer-${p.id}`}
                        className={cn(
                          "text-center p-2 sm:p-3 align-top min-w-0 max-w-[19.5%] whitespace-normal break-words !whitespace-normal",
                          isSelected && "bg-muted"
                        )}
                      >
                        {footerInner}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          )}

          {showStandardCheckout && !showMobileCheckoutSection ? (
            <CheckoutForm
              plan={selectedPlanDetails}
              termKey={colTerms[selectedPlanId]}
              userId={user?.uid ?? ""}
              companyId={companyId ?? ""}
              billingIntent={selectedPlanDetails.isFree ? "donation" : "subscribe"}
            />
          ) : !showMobileCheckoutSection ? (
            <p className="mt-8 border-t pt-6 text-sm text-muted-foreground">
              You are on a paid plan — use the term dropdowns and Stripe actions in the table above to renew, upgrade
              (prorated), or downgrade.
            </p>
          ) : null}

          {showMobileCheckoutSection && (
            <CheckoutForm
              // Mobile UX: selected tab plan should be payable/subscribable directly below.
              plan={selectedMobilePlan}
              termKey={colTerms[selectedMobilePlan.id]}
              userId={user?.uid ?? ""}
              companyId={companyId ?? ""}
              billingIntent={selectedMobilePlan.isFree ? "donation" : "subscribe"}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
