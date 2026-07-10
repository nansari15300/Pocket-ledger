"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useLivePlans } from "@/hooks/useLivePlans";
import { getPlan, type PlanId } from "@/config/plans";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { resolveLocalAppServerAllowed } from "@/lib/localAppServerEntitlement";
import {
  getElectronLocalServerApi,
  isElectronLocalServerApiAvailable,
  resolveLocalAppServerSharingPort,
  type LocalAppServerConfig,
  type LocalAppServerRole,
  type LocalAppServerStatus,
} from "@/lib/electronLocalServer";
import { LocalPlServerSharePanel } from "@/components/settings/LocalPlServerSharePanel";
import { isLocalAppServerDevPreview } from "@/lib/localAppServerDevPreview";
import {
  buildPlServerInviteUrlList,
  effectiveSelectedInviteUrls,
  isPlServerInviteUrlSelected,
  normalizePlServerListingUrl,
  normalizePublicHostField,
} from "@/lib/plServerPublicHostUrl";
import { fetchPublicIpAddress } from "@/lib/fetchPublicIpAddress";
import { getEmbeddedLockShellKind } from "@/lib/embeddedDeviceLock";
import { persistDevClientAccessToken, readDevClientAccessToken } from "@/lib/plServerAccessContext";
import { Copy, Loader2, RefreshCw, Server, Wifi } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const APK_REMOTE_SERVER_URL_KEY = "pl_apk_client_remote_server_url";

export function LocalAppServerSettings() {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { allCompanies, allCompaniesRegistry } = useCompany();
  const livePlansRecord = useLivePlans();
  const [status, setStatus] = useState<LocalAppServerStatus | null>(null);
  const [draft, setDraft] = useState<LocalAppServerConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsTab, setSettingsTab] = useState<"server" | "client">("server");
  const [publicIpDetecting, setPublicIpDetecting] = useState(false);
  const publicHostUserEditedRef = useRef(false);
  const publicHostDetectGenRef = useRef(0);

  const planId = resolveEffectiveAccountPlanId(allCompanies, user?.uid, null);
  const livePlan = livePlansRecord[planId as PlanId] ?? getPlan(planId);
  const allowed = resolveLocalAppServerAllowed({
    planId,
    livePlan,
    customUser: customUser as Record<string, unknown> | null,
  });
  const devMode = isLocalAppServerDevPreview();
  const [isApkShell, setIsApkShell] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(() => isElectronLocalServerApiAvailable());

  useLayoutEffect(() => {
    setIsApkShell(getEmbeddedLockShellKind() === "apk");
  }, []);

  useEffect(() => {
    if (!isApkShell) return;
    setSettingsTab("client");
    let remoteServerUrl = "";
    try {
      remoteServerUrl = localStorage.getItem(APK_REMOTE_SERVER_URL_KEY) || "";
    } catch {
      /* ignore */
    }
    setDraft({
      port: 37123,
      bindMode: "localhost",
      appOnlyAccess: true,
      autoStartOnBoot: false,
      userWantsRunning: false,
      appRole: "client",
      remoteServerUrl,
      clientAccessToken: readDevClientAccessToken(),
      publicHost: "",
      requireRemoteAccessToken: true,
      selectedInviteUrls: [],
    });
    setLoading(false);
  }, [isApkShell]);

  useEffect(() => {
    if (isApkShell) return;
    if (isElectronLocalServerApiAvailable()) {
      setApiAvailable(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dev-pl-local-server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getStatus" }),
        });
        if (!cancelled && res.ok) setApiAvailable(true);
      } catch {
        /* dev API not running */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isApkShell]);

  const saveApkClientConnect = () => {
    if (!draft) return;
    setBusy(true);
    try {
      persistDevClientAccessToken(draft.clientAccessToken);
      try {
        const url = draft.remoteServerUrl.trim();
        if (url) localStorage.setItem(APK_REMOTE_SERVER_URL_KEY, url);
        else localStorage.removeItem(APK_REMOTE_SERVER_URL_KEY);
      } catch {
        /* ignore */
      }
      toast({
        title: "Saved",
        description: "Open Gate to connect and pick a company from the server.",
      });
    } finally {
      setBusy(false);
    }
  };

  const isServerRole = draft?.appRole === "server" || draft?.appRole === "both";

  const inviteUrlOptions = useMemo(() => {
    if (!status || !draft || !isServerRole) return [] as string[];
    const port = resolveLocalAppServerSharingPort(status);
    if (!port) return [];
    return buildPlServerInviteUrlList({
      urls: status.urls,
      publicHost: draft.publicHost,
      port,
    });
  }, [status, draft, isServerRole]);

  const toggleInviteUrlSelection = useCallback(
    (url: string, checked: boolean) => {
      if (!draft) return;
      const current = effectiveSelectedInviteUrls(inviteUrlOptions, draft.selectedInviteUrls);
      const norm = normalizePlServerListingUrl(url);
      if (!norm) return;
      let next: string[];
      if (checked) {
        next = [...new Set([...current, norm])];
      } else {
        next = current.filter((u) => normalizePlServerListingUrl(u) !== norm);
      }
      if (next.length === 0) {
        toast({
          variant: "destructive",
          title: "At least one address required",
          description: "Share invites ke liye kam se kam ek server address tick hona chahiye.",
        });
        return;
      }
      setDraft((d) => (d ? { ...d, selectedInviteUrls: next } : d));
      const api = getElectronLocalServerApi();
      void api?.setConfig({ selectedInviteUrls: next }).catch(() => undefined);
    },
    [draft, inviteUrlOptions, toast]
  );

  const autoDetectPublicHost = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!draft || !isServerRole) return null;
      if (draft.bindMode === "localhost") return null;
      if (!opts?.force && publicHostUserEditedRef.current) return null;
      if (!opts?.force && draft.publicHost.trim()) return draft.publicHost.trim();
      if (typeof navigator !== "undefined" && !navigator.onLine) return null;

      const gen = ++publicHostDetectGenRef.current;
      setPublicIpDetecting(true);
      try {
        const ip = await fetchPublicIpAddress();
        if (gen !== publicHostDetectGenRef.current) return null;
        if (!ip) return null;
        if (!opts?.force && publicHostUserEditedRef.current) return null;
        setDraft((d) => {
          if (!d || !ip) return d;
          if (!opts?.force && d.publicHost.trim()) return d;
          return { ...d, publicHost: ip };
        });
        return ip;
      } finally {
        if (gen === publicHostDetectGenRef.current) setPublicIpDetecting(false);
      }
    },
    [draft, isServerRole]
  );

  useEffect(() => {
    if (loading || !draft || !isServerRole) return;
    if (draft.bindMode === "localhost") return;
    if (draft.publicHost.trim()) return;
    void autoDetectPublicHost();
  }, [loading, draft?.bindMode, draft?.appRole, draft?.publicHost, isServerRole, autoDetectPublicHost]);

  const refresh = useCallback(async () => {
    const api = getElectronLocalServerApi();
    if (!api) {
      setLoading(false);
      return;
    }
    try {
      const [st, cfg] = await Promise.all([api.getStatus(), api.getConfig()]);
      setStatus(st);
      setDraft(cfg);
      publicHostUserEditedRef.current = Boolean(cfg.publicHost?.trim());
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not read server settings",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isApkShell) return;
    void refresh();
  }, [refresh, isApkShell]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: label });
    } catch {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  };

  if (!apiAvailable && !isApkShell) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server
          </CardTitle>
          <CardDescription>
            Browser dev: run <code className="text-xs">npm run dev</code> (not only the static server on port 3000), then
            refresh. Packaged app: use Pocket Ledger EXE / Linux. If you opened{" "}
            <code className="text-xs">http://localhost:3000</code> from an old side-server, stop it with{" "}
            <code className="text-xs">npm run dev:server:stop</code> and use Next dev instead.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server
          </CardTitle>
          <CardDescription>
            Your plan does not include the local server feature, or an administrator has turned it off for your
            account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/billing">View plans</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isApkShell) {
    if (loading || !draft) {
      return (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Server
            </CardTitle>
            <CardDescription>
              Connect this device to a Pocket Ledger server on your office PC. Hosting a server is available on desktop
              (EXE), not on mobile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Connect to a remote server
              </p>
              <p className="text-xs text-muted-foreground">
                Open Messages when the server owner shares with you — the app connects automatically. Or use Gate to
                pick a company manually.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pl-apk-remote-url">Server address (optional override)</Label>
                <Input
                  id="pl-apk-remote-url"
                  placeholder="Usually filled from Messages invite"
                  value={draft.remoteServerUrl}
                  onChange={(e) => setDraft((d) => (d ? { ...d, remoteServerUrl: e.target.value } : d))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={saveApkClientConnect}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save address
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/messages">Messages</Link>
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/gate">Gate</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const saveAndRestart = () =>
    void run(async () => {
      const api = getElectronLocalServerApi();
      if (!api || !draft) return;
      if (devMode) {
        persistDevClientAccessToken(draft.clientAccessToken);
      }
      let publicHost = normalizePublicHostField(draft.publicHost, draft.port);
      if (!publicHost && draft.bindMode !== "localhost") {
        const detected = await fetchPublicIpAddress();
        if (detected) publicHost = detected;
      }
      await api.restart({
        port: draft.port,
        bindMode: draft.bindMode,
        appOnlyAccess: draft.appOnlyAccess,
        autoStartOnBoot: draft.autoStartOnBoot,
        userWantsRunning: draft.autoStartOnBoot ? true : undefined,
        appRole: draft.appRole,
        remoteServerUrl: draft.remoteServerUrl,
        clientAccessToken: draft.clientAccessToken,
        publicHost,
        requireRemoteAccessToken: draft.requireRemoteAccessToken,
        selectedInviteUrls: draft.selectedInviteUrls,
      });
      toast({
        title: "Saved",
        description:
          draft.appRole === "client"
            ? "Restart the app (close all windows) to connect to the remote server."
            : "Reload tabs if pages do not refresh.",
      });
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server
          </CardTitle>
          <CardDescription>
            <strong>Server settings</strong> — host local companies and share users by Gmail.{" "}
            <strong>Client connect</strong> — open companies from another PC via Messages invite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading || !draft ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <Tabs
                value={settingsTab}
                onValueChange={(v) => setSettingsTab(v as "server" | "client")}
                className="w-full"
              >
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="server" className="gap-1.5">
                    <Server className="h-3.5 w-3.5" />
                    Server settings
                  </TabsTrigger>
                  <TabsTrigger value="client" className="gap-1.5">
                    <Wifi className="h-3.5 w-3.5" />
                    Client connect
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="server" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>This app runs as</Label>
                <select
                  className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={draft.appRole === "client" ? "server" : draft.appRole}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, appRole: e.target.value as LocalAppServerRole } : d
                    )
                  }
                >
                  <option value="server">Server only (host for others)</option>
                  <option value="both">Server + can connect elsewhere</option>
                </select>
              </div>

              {isServerRole ? (
                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        status?.running
                          ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800"
                          : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                      }
                    >
                      {status?.sharingActive ?? status?.running
                        ? `Sharing on — port ${status.port}`
                        : status?.appUiServing
                          ? `This PC only (sharing off) — port ${status.port}`
                          : "Stopped"}
                    </span>
                    {status?.port &&
                    status?.configuredPort &&
                    status.port !== status.configuredPort ? (
                      <span className="text-xs text-amber-800">
                        Running on {status.port} (saved port {status.configuredPort} was busy — Save &amp;
                        restart again after freeing {status.configuredPort})
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || (status?.sharingActive ?? status?.running)}
                      onClick={() =>
                        void run(async () => {
                          const api = getElectronLocalServerApi();
                          if (!api) return;
                          await api.start();
                          toast({ title: "Server started" });
                        })
                      }
                    >
                      Start server
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || !(status?.sharingActive ?? status?.running)}
                      onClick={() =>
                        void run(async () => {
                          const api = getElectronLocalServerApi();
                          if (!api) return;
                          await api.stop();
                          toast({ title: "Server stopped" });
                        })
                      }
                    >
                      Stop sharing
                    </Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pl-server-port">Port</Label>
                      <Input
                        id="pl-server-port"
                        type="number"
                        min={1024}
                        max={65535}
                        value={draft.port}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, port: Math.min(65535, Math.max(1, Number(e.target.value) || 3000)) } : d
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Change here, then <strong>Save settings &amp; restart server</strong> below. Status badge
                        shows the real listening port (use that in Gate / APK).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Listen on</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        value={draft.bindMode}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  bindMode:
                                    e.target.value === "lan"
                                      ? "lan"
                                      : e.target.value === "internet"
                                        ? "internet"
                                        : "localhost",
                                }
                              : d
                          )
                        }
                      >
                        <option value="localhost">This PC only</option>
                        <option value="lan">LAN (same network)</option>
                        <option value="internet">Internet (LAN + port forward)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="pl-public-host">Public hostname or IP (port forward)</Label>
                      {draft.bindMode !== "localhost" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={busy || publicIpDetecting}
                          onClick={() => {
                            publicHostUserEditedRef.current = false;
                            setDraft((d) => (d ? { ...d, publicHost: "" } : d));
                            void autoDetectPublicHost({ force: true });
                          }}
                        >
                          {publicIpDetecting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {publicIpDetecting ? "Detecting…" : "Detect public IP"}
                        </Button>
                      ) : null}
                    </div>
                    <Input
                      id="pl-public-host"
                      placeholder={
                        draft.bindMode === "localhost"
                          ? "Enable LAN or Internet listen mode for auto-detect"
                          : publicIpDetecting
                            ? "Detecting your public IP…"
                            : "Auto-detected when empty — or enter DDNS hostname"
                      }
                      value={draft.publicHost}
                      onChange={(e) => {
                        publicHostUserEditedRef.current = true;
                        setDraft((d) => (d ? { ...d, publicHost: e.target.value } : d));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {draft.bindMode === "localhost"
                        ? "Choose LAN or Internet above to auto-fill your public IP for remote share invites."
                        : publicIpDetecting
                          ? "Looking up your public IPv4 (ipify / AWS checkip)…"
                          : draft.publicHost.trim()
                            ? "Used in share invites. Edit only if you use DDNS instead of raw IP."
                            : "Will auto-detect on save when this field is empty."}
                    </p>
                    {status?.portForwardHint ? (
                      <p className="text-xs text-muted-foreground">{status.portForwardHint}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label htmlFor="pl-require-token">Require access token (remote users)</Label>
                      <p className="text-xs text-muted-foreground">
                        Anyone outside this PC must send a token — unknown IPs cannot open company data. Browser
                        users see a token paste page (or use{" "}
                        <code className="text-[11px]">?pl_access=YOUR_TOKEN</code> in the URL).
                      </p>
                    </div>
                    <Switch
                      id="pl-require-token"
                      checked={draft.requireRemoteAccessToken}
                      onCheckedChange={(v) => setDraft((d) => (d ? { ...d, requireRemoteAccessToken: v } : d))}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label htmlFor="pl-app-only">App-only (block browsers)</Label>
                      <p className="text-xs text-muted-foreground">
                        When on, Chrome / Edge cannot open the server URL. When off, browsers can open the server after
                        entering an access token.
                      </p>
                    </div>
                    <Switch
                      id="pl-app-only"
                      checked={draft.appOnlyAccess}
                      onCheckedChange={(v) => setDraft((d) => (d ? { ...d, appOnlyAccess: v } : d))}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label htmlFor="pl-auto-start">Auto-start when PC restarts</Label>
                      <p className="text-xs text-muted-foreground">
                        App opens at Windows login and the local sharing server starts automatically after each app
                        launch (including after installing a new build). Code and disk caches reset on version update.
                      </p>
                    </div>
                    <Switch
                      id="pl-auto-start"
                      checked={draft.autoStartOnBoot}
                      onCheckedChange={(v) =>
                        setDraft((d) => (d ? { ...d, autoStartOnBoot: v, ...(v ? { userWantsRunning: true } : {}) } : d))
                      }
                    />
                  </div>

                  {inviteUrlOptions.length > 0 ? (
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="font-medium text-foreground">Server addresses (sent in share invites)</p>
                        <p className="text-muted-foreground">
                          Tick the addresses to include in Messages — unticked URLs are not sent.
                        </p>
                      </div>
                      <ul className="space-y-1.5">
                        {inviteUrlOptions.map((u) => (
                          <li key={u} className="flex items-start gap-2 rounded-md border bg-background/60 px-2 py-1.5">
                            <Checkbox
                              id={`pl-invite-url-${u}`}
                              className="mt-0.5"
                              checked={isPlServerInviteUrlSelected(u, inviteUrlOptions, draft?.selectedInviteUrls)}
                              onCheckedChange={(v) => toggleInviteUrlSelection(u, v === true)}
                            />
                            <label
                              htmlFor={`pl-invite-url-${u}`}
                              className="min-w-0 flex-1 cursor-pointer break-all font-mono text-muted-foreground"
                            >
                              {u}
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => void copyText(u, "URL")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="border-t pt-4">
                    <LocalPlServerSharePanel
                      allCompaniesRegistry={allCompaniesRegistry}
                      serverStatus={status}
                      disabled={busy}
                      variant="settings"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose <strong>Server only</strong> or <strong>Server + can connect elsewhere</strong> above to host
                  companies on this PC.
                </p>
              )}
                </TabsContent>

                <TabsContent value="client" className="mt-4 space-y-4">
                  <div className="space-y-4 rounded-lg border border-dashed p-4">
                    <p className="text-sm font-medium">Connect to a remote server</p>
                    <p className="text-xs text-muted-foreground">
                      When another PC shares with your Gmail, open Messages — the app auto-connects. Use this tab only
                      to override the server address manually.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="pl-remote-url">Server address (optional override)</Label>
                      <Input
                        id="pl-remote-url"
                        placeholder="http://203.0.113.10:37123"
                        value={draft.remoteServerUrl}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  remoteServerUrl: e.target.value,
                                  appRole:
                                    d.appRole === "server" && e.target.value.trim()
                                      ? "both"
                                      : e.target.value.trim()
                                        ? "client"
                                        : d.appRole === "both"
                                          ? "server"
                                          : d.appRole,
                                }
                              : d
                          )
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href="/messages">Messages — invites</Link>
                      </Button>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href="/gate">Open Gate</Link>
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <Button type="button" disabled={busy} onClick={saveAndRestart}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save settings
                {settingsTab === "server" && isServerRole ? " & restart server" : ""}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
