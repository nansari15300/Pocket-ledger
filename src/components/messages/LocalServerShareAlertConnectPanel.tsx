"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  localServerShareAlertUrlOptions,
  type LocalServerShareUrlOption,
} from "@/lib/plServerShareInvite";
import { connectFromLocalServerShareAlert } from "@/lib/plServerInviteConnectFlow";
import { pickDefaultPlServerShareUrl } from "@/lib/plServerGateInviteLink";
import { syncPlServerGateUrlForInvite } from "@/lib/plServerShareInviteFlow";
import { useGate } from "@/contexts/GateContext";
import { useCompany } from "@/hooks/useCompany";

type Props = {
  notification: Record<string, unknown>;
  onConnected?: () => void;
};

export function LocalServerShareAlertConnectPanel({ notification, onConnected }: Props) {
  const router = useRouter();
  const { setCompanyId, reloadLocalCompanyRegistry } = useCompany();
  const { setSelectedGateIdForDetail, refreshGates } = useGate();
  const urlOptions = useMemo(
    () => localServerShareAlertUrlOptions(notification),
    [notification]
  );
  const defaultUrl = useMemo(
    () => pickDefaultPlServerShareUrl(urlOptions.map((o) => o.url)) || urlOptions[0]?.url || "",
    [urlOptions]
  );
  const [selectedUrl, setSelectedUrl] = useState(defaultUrl);
  const [step, setStep] = useState<"pick" | "credentials">("pick");
  const [username, setUsername] = useState(String(notification.loginUsername || "").trim());
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const accessToken = "";
  const gateLabel = String(notification.gateLabel || notification.tokenLabel || "Shared server").trim();
  const companyId = String(notification.companyId || "").trim() || null;
  const serverPort = Number(notification.serverPort) || 0;

  useEffect(() => {
    const url = selectedUrl.trim();
    if (!url) return;
    syncPlServerGateUrlForInvite({
      serverUrl: url,
      accessToken,
      gateLabel,
      serverPort: serverPort > 0 ? serverPort : undefined,
    });
  }, [selectedUrl, accessToken, gateLabel, serverPort]);

  if (!urlOptions.length) return null;

  const handleConnectClick = () => {
    if (!selectedUrl.trim()) {
      toast.error("Pick a server address");
      return;
    }
    setStep("credentials");
  };

  const handleSubmitCredentials = async () => {
    setBusy(true);
    try {
      const result = await connectFromLocalServerShareAlert({
        serverUrl: selectedUrl,
        serverUrls: urlOptions.map((o) => o.url),
        accessToken,
        gateLabel,
        companyId,
        username,
        password,
        serverPort: serverPort > 0 ? serverPort : undefined,
      });
      refreshGates();
      setSelectedGateIdForDetail(result.gate.id);
      if (result.companyId) {
        setCompanyId(result.companyId);
        await reloadLocalCompanyRegistry();
      }
      toast.success("Connected to server", {
        description: result.companyId
          ? "Opening your company — changes will sync live from the server."
          : "Gate is ready — pick your company on the Gate page.",
      });
      onConnected?.();
      router.push(result.navigateTo);
    } catch (e) {
      toast.error("Could not connect", {
        description: e instanceof Error ? e.message : "Check IP and login details.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-left">
      <p className="text-xs font-medium text-foreground">Connect to local server</p>
      {step === "pick" ? (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Server address</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={selectedUrl}
              onChange={(e) => setSelectedUrl(e.target.value)}
            >
              {urlOptions.map((o: LocalServerShareUrlOption) => (
                <option key={o.url} value={o.url}>
                  {o.label} — {o.url}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" className="w-full" onClick={handleConnectClick}>
            Connect
          </Button>
        </>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground break-all">{selectedUrl}</p>
          <div className="space-y-1">
            <Label className="text-xs">Login username</Label>
            <Input
              className="h-8 text-xs"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                className="h-8 pr-9 text-xs"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmitCredentials();
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-8 w-8"
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setStep("pick")}>
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={busy || !username.trim() || !password.trim()}
              onClick={() => void handleSubmitCredentials()}
            >
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Connect &amp; open Gate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
