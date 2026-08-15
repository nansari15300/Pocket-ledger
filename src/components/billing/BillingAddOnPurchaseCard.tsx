"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import KhaltiCheckout from "khalti-checkout-web";
import {
  DEFAULT_DEVICE_USER_ADDON_OFFER,
  addonKindLabel,
  normalizeAddonKind,
  parsePurchasedPlanAddOns,
  readDeviceUserAddOnOfferFromPlansDoc,
  unitPriceForAddonKind,
  type AddonKind,
  type DeviceUserAddOnOffer,
  type PurchasedPlanAddOns,
} from "@/lib/planAddOns";
import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type GatewayAvailability = { stripe: boolean; khalti: boolean; esewa: boolean };
type PayGateway = "stripe" | "khalti" | "esewa";

type Props = {
  userId: string;
  companyId: string;
  /** Prefill from ?addon=… */
  initialKind?: AddonKind | "device" | "user";
  networkOnline?: boolean;
  gatewayAvailability?: GatewayAvailability | null;
};

type AddonScope = "online" | "local";

function scopeFromKind(kind: AddonKind): AddonScope {
  return kind.endsWith("-local") ? "local" : "online";
}

function clampQty(n: unknown): number {
  return Math.min(20, Math.max(0, Math.floor(Number(n) || 0)));
}

function kindsForScope(scope: AddonScope): { device: AddonKind; user: AddonKind } {
  return scope === "local"
    ? { device: "device-local", user: "user-local" }
    : { device: "device-online", user: "user-online" };
}

function firstAvailableGateway(ga: GatewayAvailability | null, preferred: PayGateway): PayGateway {
  if (ga == null) return preferred;
  if (ga[preferred]) return preferred;
  if (ga.stripe) return "stripe";
  if (ga.khalti) return "khalti";
  if (ga.esewa) return "esewa";
  return preferred;
}

function gatewayPayLabel(gateway: PayGateway): string {
  if (gateway === "khalti") return "Khalti";
  if (gateway === "esewa") return "eSewa";
  return "Stripe";
}

/** Owner buys extra device/user slots (online/local) for the current plan period. */
export function BillingAddOnPurchaseCard({
  userId,
  companyId,
  initialKind = "device-online",
  networkOnline = true,
  gatewayAvailability = null,
}: Props) {
  const [offer, setOffer] = useState<DeviceUserAddOnOffer>(DEFAULT_DEVICE_USER_ADDON_OFFER);
  const [owned, setOwned] = useState<PurchasedPlanAddOns>({
    extraDevicesOnline: 0,
    extraDevicesLocal: 0,
    extraUsersOnline: 0,
    extraUsersLocal: 0,
    expiryMs: null,
  });
  const [scope, setScope] = useState<AddonScope>(() => scopeFromKind(normalizeAddonKind(initialKind)));
  const [deviceQty, setDeviceQty] = useState(0);
  const [userQty, setUserQty] = useState(0);
  const [gateway, setGateway] = useState<PayGateway>("stripe");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = normalizeAddonKind(initialKind);
    setScope(scopeFromKind(next));
    if (next.startsWith("user")) {
      setUserQty(1);
      setDeviceQty(0);
    } else {
      setDeviceQty(1);
      setUserQty(0);
    }
  }, [initialKind]);

  useEffect(() => {
    setGateway((prev) => firstAvailableGateway(gatewayAvailability, prev));
  }, [gatewayAvailability]);

  useEffect(() => {
    const unsub = onSnapshot(doc(firestore, "app_settings", "plans"), (snap) => {
      setOffer(
        readDeviceUserAddOnOfferFromPlansDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : null)
      );
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!userId.trim()) return;
    const unsub = onSnapshot(doc(firestore, "users", userId), (snap) => {
      setOwned(parsePurchasedPlanAddOns(snap.exists() ? (snap.data() as Record<string, unknown>) : null));
    });
    return () => unsub();
  }, [userId]);

  if (!offer.enabled) {
    return (
      <Card id="billing-addons" className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add-on service</CardTitle>
          <CardDescription>
            Extra devices and users are not enabled yet. Ask Super Admin to turn on{" "}
            <strong>Add-on service</strong> under Admin → Plans (below Pro Plus).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const kinds = kindsForScope(scope);
  const deviceUnit = unitPriceForAddonKind(offer, kinds.device);
  const userUnit = unitPriceForAddonKind(offer, kinds.user);
  const deviceLine = deviceUnit * deviceQty;
  const userLine = userUnit * userQty;
  const total = deviceLine + userLine;

  const stripeOk = gatewayAvailability == null || gatewayAvailability.stripe;
  const khaltiOk = gatewayAvailability == null || gatewayAvailability.khalti;
  const esewaOk = gatewayAvailability == null || gatewayAvailability.esewa;
  const gatewayBlocked =
    gatewayAvailability != null &&
    !(gateway === "stripe"
      ? gatewayAvailability.stripe
      : gateway === "khalti"
        ? gatewayAvailability.khalti
        : gatewayAvailability.esewa);

  const buy = async () => {
    if (!networkOnline) {
      toast({ variant: "destructive", title: "Offline", description: "Back online to buy add-ons." });
      return;
    }
    if (!userId.trim() || !companyId.trim()) {
      toast({ variant: "destructive", title: "Select a company", description: "Choose a company first." });
      return;
    }
    if (total <= 0 || (deviceQty <= 0 && userQty <= 0)) {
      toast({
        variant: "destructive",
        title: "Quantity required",
        description: "Enter quantity for device and/or user (at least one).",
      });
      return;
    }
    if (gatewayBlocked) {
      toast({ variant: "destructive", title: "Gateway unavailable", description: "Pick another payment method." });
      return;
    }

    const items: { kind: AddonKind; quantity: number }[] = [];
    if (deviceQty > 0) items.push({ kind: kinds.device, quantity: deviceQty });
    if (userQty > 0) items.push({ kind: kinds.user, quantity: userQty });

    setBusy(true);
    try {
      const res = await fetch(getBillingApiUrl("/api/payments/addon-checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway,
          userId,
          companyId,
          items,
        }),
      });
      const data = (await res.json()) as {
        url?: string;
        error?: string;
        gateway?: string;
        publicKey?: string;
        amount?: number;
        product_identity?: string;
        product_name?: string;
        returnUrl?: string;
        pendingId?: string;
        oid?: string;
        successUrl?: string;
        failUrl?: string;
        merchantCode?: string;
        signature?: string;
        signedFieldNames?: string;
      };
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (gateway === "stripe") {
        if (data.url) window.location.assign(data.url);
        else throw new Error("No checkout URL");
        return;
      }

      if (gateway === "khalti") {
        if (!data.publicKey || data.amount == null || !data.returnUrl) {
          throw new Error("Khalti checkout incomplete");
        }
        const khaltiConfig = {
          publicKey: data.publicKey,
          productIdentity: data.product_identity,
          productName: data.product_name,
          productUrl: window.location.href,
          amount: data.amount,
          eventHandler: {
            onSuccess(payload: { token?: string; amount?: number }) {
              const base = String(data.returnUrl || "");
              const join = base.includes("?") ? "&" : "?";
              window.location.assign(
                `${base}${join}token=${payload.token}&amount=${payload.amount}`
              );
            },
            onError() {
              toast({ variant: "destructive", title: "Khalti Error", description: "Payment failed. Please try again." });
            },
            onClose() {},
          },
        };
        const checkout = new (KhaltiCheckout as any)(khaltiConfig);
        checkout.show({ amount: data.amount });
        return;
      }

      if (gateway === "esewa") {
        if (!data.url || data.amount == null || !data.oid || !data.merchantCode || !data.signature) {
          throw new Error("eSewa checkout incomplete");
        }
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.url;
        const fields: Record<string, string> = {
          amount: String(data.amount),
          failure_url: data.failUrl || `${window.location.origin}/billing?addon=cancel`,
          product_delivery_charge: "0",
          product_service_charge: "0",
          product_code: data.merchantCode,
          signature: data.signature,
          signed_field_names: data.signedFieldNames || "total_amount,transaction_uuid,product_code",
          success_url: data.successUrl || `${window.location.origin}/billing/addon/esewa`,
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
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Add-on checkout",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const payLabelParts: string[] = [];
  if (deviceQty > 0) payLabelParts.push(`${deviceQty} ${addonKindLabel(kinds.device, deviceQty)}`);
  if (userQty > 0) payLabelParts.push(`${userQty} ${addonKindLabel(kinds.user, userQty)}`);
  const paySuffix = payLabelParts.length > 0 ? payLabelParts.join(" + ") : "set quantity";

  return (
    <Card id="billing-addons" className="border-sky-300/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Add-on service</CardTitle>
        <CardDescription>
          Extra online/local devices and users for the rest of your current plan period. Renewing the plan requires
          buying add-ons again for the new period. Set quantities for both in one checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-snug">
          Owned extras: online devices{" "}
          <span className="font-medium text-foreground">{owned.extraDevicesOnline}</span>, local devices{" "}
          <span className="font-medium text-foreground">{owned.extraDevicesLocal}</span>, online users{" "}
          <span className="font-medium text-foreground">{owned.extraUsersOnline}</span>, local users{" "}
          <span className="font-medium text-foreground">{owned.extraUsersLocal}</span>
          {owned.expiryMs != null ? (
            <>
              {" "}
              (until {new Date(owned.expiryMs).toLocaleDateString()})
            </>
          ) : null}
        </p>

        <Tabs value={scope} onValueChange={(v) => setScope(v === "local" ? "local" : "online")}>
          <TabsList className="w-fit">
            <TabsTrigger value="online" className="px-4">
              Online
            </TabsTrigger>
            <TabsTrigger value="local" className="px-4">
              Local
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="w-fit max-w-full overflow-x-auto rounded-md border">
          <table className="w-auto text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium text-right">Unit</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="px-3 py-2 font-medium whitespace-nowrap">
                  {scope === "local" ? "Local device" : "Online device"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">Rs. {deviceUnit}</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    className="h-8 w-16"
                    value={deviceQty}
                    onChange={(e) => setDeviceQty(clampQty(e.target.value))}
                    aria-label={`${scope} device quantity`}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">Rs. {deviceLine}</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-2 font-medium whitespace-nowrap">
                  {scope === "local" ? "Local user" : "Online user"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">Rs. {userUnit}</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    className="h-8 w-16"
                    value={userQty}
                    onChange={(e) => setUserQty(clampQty(e.target.value))}
                    aria-label={`${scope} user quantity`}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">Rs. {userLine}</td>
              </tr>
              <tr className="bg-muted/20">
                <td className="px-3 py-2 font-semibold" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">Rs. {total}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Payment method</p>
          <RadioGroup
            value={gateway}
            onValueChange={(val) => setGateway(val as PayGateway)}
            className="flex flex-wrap items-center gap-3"
          >
            <Label
              htmlFor="addon-stripe"
              className={cn(
                "flex items-center gap-2 border rounded-lg px-3 py-2 text-sm",
                stripeOk ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                gateway === "stripe" && stripeOk && "border-primary"
              )}
            >
              <RadioGroupItem value="stripe" id="addon-stripe" disabled={!stripeOk} />
              Stripe (Cards)
            </Label>
            <Label
              htmlFor="addon-khalti"
              className={cn(
                "flex items-center gap-2 border rounded-lg px-3 py-2 text-sm",
                khaltiOk ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                gateway === "khalti" && khaltiOk && "border-primary"
              )}
            >
              <RadioGroupItem value="khalti" id="addon-khalti" disabled={!khaltiOk} />
              Khalti
            </Label>
            <Label
              htmlFor="addon-esewa"
              className={cn(
                "flex items-center gap-2 border rounded-lg px-3 py-2 text-sm",
                esewaOk ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                gateway === "esewa" && esewaOk && "border-primary"
              )}
            >
              <RadioGroupItem value="esewa" id="addon-esewa" disabled={!esewaOk} />
              eSewa
            </Label>
          </RadioGroup>
        </div>

        <Button
          type="button"
          className="w-fit"
          disabled={busy || total <= 0 || gatewayBlocked || !networkOnline}
          onClick={() => void buy()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {total <= 0
            ? `Pay Rs. 0 with ${gatewayPayLabel(gateway)} — set quantity`
            : `Pay Rs. ${total} with ${gatewayPayLabel(gateway)} — ${paySuffix}`}
        </Button>
      </CardContent>
    </Card>
  );
}
