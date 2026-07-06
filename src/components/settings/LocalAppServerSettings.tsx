"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useLivePlans } from "@/hooks/useLivePlans";
import { getPlan, type PlanId } from "@/config/plans";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { resolveLocalAppServerAllowed } from "@/lib/localAppServerEntitlement";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import {
  getElectronLocalServerApi,
  isElectronLocalServerApiAvailable,
  type LocalAppServerAccessTokenSummary,
  type LocalAppServerConfig,
  type LocalAppServerRole,
  type LocalAppServerStatus,
} from "@/lib/electronLocalServer";
import { isLocalAppServerDevPreview } from "@/lib/localAppServerDevPreview";
import { getEmbeddedLockShellKind } from "@/lib/embeddedDeviceLock";
import { persistDevClientAccessToken, readDevClientAccessToken } from "@/lib/plServerAccessContext";
import { Copy, Info, Loader2, Plus, Server, Trash2, Wifi } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PL_SELECTED_TOKEN_ID_KEY = "pl_server_settings_selected_token_id";
const APK_REMOTE_SERVER_URL_KEY = "pl_apk_client_remote_server_url";

const TOKEN_LABEL_FIELD_HELP =
  "This box is a display name for you only — it is not the access token. " +
  "Use it to remember who this token is for (for example: Branch staff or Nabiullah – accounts). " +
  "The real token to give remote users is shown in the selected row above, next to the label, with a copy button. " +
  "Save changes updates this name and the ticked companies. " +
  "New token creates a new secret and stops the old one from working.";

export function LocalAppServerSettings() {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { allCompanies, allCompaniesRegistry } = useCompany();
  const livePlansRecord = useLivePlans();
  const [status, setStatus] = useState<LocalAppServerStatus | null>(null);
  const [draft, setDraft] = useState<LocalAppServerConfig | null>(null);
  const [accessTokens, setAccessTokens] = useState<LocalAppServerAccessTokenSummary[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [tokenCompanyPick, setTokenCompanyPick] = useState<Record<string, boolean>>({});
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTokenSecret, setSelectedTokenSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsTab, setSettingsTab] = useState<"server" | "client">("server");

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

  const selectedTokenCompanyIds = useMemo(
    () =>
      Object.entries(tokenCompanyPick)
        .filter(([, on]) => on)
        .map(([id]) => id),
    [tokenCompanyPick]
  );

  /** Server tokens: independent of active gate — local-only companies from full registry. */
  const shareableLocalCompanies = useMemo(
    () => allCompaniesRegistry.filter((c) => isLocalServerShareableCompany(c)),
    [allCompaniesRegistry]
  );

  const resolveCompanyNames = useCallback(
    (ids: string[]) => {
      const names = ids.map(
        (id) =>
          shareableLocalCompanies.find((c) => c.id === id)?.name ||
          allCompaniesRegistry.find((c) => c.id === id)?.name ||
          id
      );
      return names.join(", ");
    },
    [allCompaniesRegistry, shareableLocalCompanies]
  );

  const buildCompanyPickFromToken = useCallback(
    (token: LocalAppServerAccessTokenSummary) => {
      const pick: Record<string, boolean> = {};
      const ids = token.allowedCompanyIds || [];
      const pool = shareableLocalCompanies;
      if (ids.length === 0) {
        for (const c of pool) {
          const id = String(c.id || "");
          if (id) pick[id] = true;
        }
      } else {
        for (const id of ids) {
          if (pool.some((c) => c.id === id)) pick[id] = true;
        }
      }
      return pick;
    },
    [shareableLocalCompanies]
  );

  const fetchTokenSecret = useCallback(async (id: string) => {
    const api = getElectronLocalServerApi();
    if (!api?.getAccessTokenSecret) {
      setSelectedTokenSecret(null);
      return;
    }
    try {
      const res = await api.getAccessTokenSecret(id);
      if (res?.ok && res.token) setSelectedTokenSecret(res.token);
      else setSelectedTokenSecret(null);
    } catch {
      setSelectedTokenSecret(null);
    }
  }, []);

  const selectTokenForEdit = useCallback(
    (token: LocalAppServerAccessTokenSummary) => {
      setSelectedTokenId(token.id);
      try {
        sessionStorage.setItem(PL_SELECTED_TOKEN_ID_KEY, token.id);
      } catch {
        /* ignore */
      }
      setNewTokenLabel(token.label);
      setTokenCompanyPick(buildCompanyPickFromToken(token));
      void fetchTokenSecret(token.id);
    },
    [buildCompanyPickFromToken, fetchTokenSecret]
  );

  const startNewToken = useCallback(() => {
    setSelectedTokenId(null);
    setSelectedTokenSecret(null);
    setNewTokenLabel("");
    setTokenCompanyPick({});
    try {
      sessionStorage.removeItem(PL_SELECTED_TOKEN_ID_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const selectedToken = useMemo(
    () => accessTokens.find((t) => t.id === selectedTokenId) ?? null,
    [accessTokens, selectedTokenId]
  );

  const editingExistingToken = selectedTokenId != null;

  const refresh = useCallback(async () => {
    const api = getElectronLocalServerApi();
    if (!api) {
      setLoading(false);
      return;
    }
    try {
      const [st, cfg, tokens] = await Promise.all([
        api.getStatus(),
        api.getConfig(),
        api.listAccessTokens(),
      ]);
      setStatus(st);
      setDraft(cfg);
      setAccessTokens(tokens);
      let restoreId: string | null = null;
      try {
        restoreId = sessionStorage.getItem(PL_SELECTED_TOKEN_ID_KEY);
      } catch {
        /* ignore */
      }
      const pick = tokens.find((t) => t.id === restoreId) ?? tokens[0] ?? null;
      if (pick) {
        setSelectedTokenId(pick.id);
        setNewTokenLabel(pick.label);
        setTokenCompanyPick(buildCompanyPickFromToken(pick));
        if (api.getAccessTokenSecret) {
          const sec = await api.getAccessTokenSecret(pick.id);
          if (sec?.ok && sec.token) setSelectedTokenSecret(sec.token);
          else setSelectedTokenSecret(null);
        }
      } else {
        setSelectedTokenId(null);
        setSelectedTokenSecret(null);
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not read server settings",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [buildCompanyPickFromToken, toast]);

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

  const handleNewTokenClick = () => {
    if (selectedTokenId && accessTokens.some((t) => t.id === selectedTokenId)) {
      if (selectedTokenCompanyIds.length === 0) {
        toast({
          variant: "destructive",
          title: "Select companies",
          description: "Pick at least one company before replacing the token.",
        });
        return;
      }
      void run(async () => {
        const api = getElectronLocalServerApi();
        if (!api?.rotateAccessToken) return;
        const res = await api.rotateAccessToken(selectedTokenId, {
          label: newTokenLabel.trim() || selectedToken?.label || "Shared user",
          allowedCompanyIds: selectedTokenCompanyIds,
        });
        if (!res.ok || !res.token) {
          toast({
            variant: "destructive",
            title: "Could not replace token",
            description: "Token may have been revoked.",
          });
          return;
        }
        setSelectedTokenSecret(res.token);
        toast({
          title: "Token replaced",
          description: "The old token no longer works. Copy the new one for remote users.",
        });
      });
      return;
    }
    startNewToken();
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
                Enter the server address and access token from the PC owner, then open Gate to pick a company.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pl-apk-remote-url">Server address (IP or hostname)</Label>
                <Input
                  id="pl-apk-remote-url"
                  placeholder="http://192.168.1.10:37123"
                  value={draft.remoteServerUrl}
                  onChange={(e) => setDraft((d) => (d ? { ...d, remoteServerUrl: e.target.value } : d))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-apk-client-token">Access token (from server owner)</Label>
                <Input
                  id="pl-apk-client-token"
                  type="password"
                  autoComplete="off"
                  placeholder="Paste token from server Settings → Access tokens"
                  value={draft.clientAccessToken}
                  onChange={(e) => setDraft((d) => (d ? { ...d, clientAccessToken: e.target.value } : d))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={saveApkClientConnect}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/gate">Open Gate — pick remote company</Link>
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
      await api.restart({
        port: draft.port,
        bindMode: draft.bindMode,
        appOnlyAccess: draft.appOnlyAccess,
        autoStartOnBoot: draft.autoStartOnBoot,
        appRole: draft.appRole,
        remoteServerUrl: draft.remoteServerUrl,
        clientAccessToken: draft.clientAccessToken,
        publicHost: draft.publicHost,
        requireRemoteAccessToken: draft.requireRemoteAccessToken,
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
            <strong>Server settings</strong> — host this app on your PC for LAN/internet sharing.{" "}
            <strong>Client connect</strong> — open companies from another PC&apos;s server with an access token.
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
                    <Label htmlFor="pl-public-host">Public hostname or IP (port forward)</Label>
                    <Input
                      id="pl-public-host"
                      placeholder="e.g. 203.0.113.10 or myoffice.ddns.net"
                      value={draft.publicHost}
                      onChange={(e) => setDraft((d) => (d ? { ...d, publicHost: e.target.value } : d))}
                    />
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
                    </div>
                    <Switch
                      id="pl-auto-start"
                      checked={draft.autoStartOnBoot}
                      onCheckedChange={(v) => setDraft((d) => (d ? { ...d, autoStartOnBoot: v } : d))}
                    />
                  </div>

                  {status?.urls && status.urls.length > 0 ? (
                    <div className="space-y-1 text-xs">
                      <p className="font-medium text-foreground">Share these URLs + an access token</p>
                      <ul className="list-inside list-disc text-muted-foreground">
                        {status.urls.map((u) => (
                          <li key={u} className="break-all font-mono">
                            {u}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="ml-1 inline h-6 w-6"
                              onClick={() => void copyText(u, "URL")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="space-y-3 border-t pt-4">
                    <p className="text-sm font-medium">Access tokens (share with users)</p>
                    <p className="text-xs text-muted-foreground">
                      Only <strong>local device companies</strong> — online/Firebase shared companies are not listed here
                      (they use Firebase sharing). Remote users will see the selected companies on this P2P server via
                      their token.
                    </p>

                    {accessTokens.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground">Existing tokens — click to view companies</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleNewTokenClick}
                            title={
                              selectedTokenId
                                ? "Generate a new secret (replaces the current token)"
                                : "Create a new access token"
                            }
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            New token
                          </Button>
                        </div>
                        <ul className="space-y-2 text-sm">
                          {accessTokens.map((t) => {
                            const selected = selectedTokenId === t.id;
                            const rowToken = selected ? selectedTokenSecret : null;
                            return (
                              <li key={t.id}>
                                <div
                                  className={cn(
                                    "flex items-start gap-2 rounded-md border px-3 py-2 transition-colors",
                                    selected ? "border-primary bg-secondary/40 ring-1 ring-primary/30" : "hover:bg-muted/40"
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left"
                                    onClick={() => selectTokenForEdit(t)}
                                  >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="shrink-0 font-medium">{t.label}</span>
                                      {rowToken ? (
                                        <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                                          {rowToken}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">({t.tokenPreview})</span>
                                      )}
                                    </div>
                                    {t.allowedCompanyIds?.length ? (
                                      <span className="mt-1 block text-xs text-muted-foreground">
                                        {t.allowedCompanyIds.length} companies:{" "}
                                        {resolveCompanyNames(t.allowedCompanyIds)}
                                      </span>
                                    ) : (
                                      <span className="mt-1 block text-xs text-amber-700">
                                        All companies (legacy token)
                                      </span>
                                    )}
                                  </button>
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    {rowToken ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        title="Copy access token"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void copyText(rowToken, "Access token");
                                        }}
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={busy}
                                      className="h-8 w-8"
                                      title="Revoke token"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void run(async () => {
                                          const api = getElectronLocalServerApi();
                                          if (!api) return;
                                          await api.revokeAccessToken(t.id);
                                          if (selectedTokenId === t.id) {
                                            setSelectedTokenSecret(null);
                                            startNewToken();
                                          }
                                          toast({ title: "Token revoked" });
                                        });
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No active tokens yet.</p>
                    )}

                    {shareableLocalCompanies.length > 0 ? (
                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                        <p className="text-xs font-medium text-foreground">
                          {editingExistingToken
                            ? `Local companies for “${selectedToken?.label || "token"}”`
                            : "Local companies for new token"}
                        </p>
                        {shareableLocalCompanies.map((c) => {
                          const id = String(c.id || "");
                          if (!id) return null;
                          const checked = !!tokenCompanyPick[id];
                          return (
                            <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setTokenCompanyPick((prev) => ({ ...prev, [id]: !prev[id] }))
                                }
                              />
                              <span className="truncate">{c.name || id}</span>
                              {c.isOwned === false ? (
                                <span className="text-xs text-muted-foreground">(shared)</span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-700">
                        No local-only companies on this PC. Online companies use Firebase sharing — not local server tokens.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="max-w-xs"
                        placeholder="Label (e.g. Nabiullah – accounts)"
                        value={newTokenLabel}
                        onChange={(e) => setNewTokenLabel(e.target.value)}
                        aria-label="Token label"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="About token label"
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="max-w-sm text-sm" align="start" side="top">
                          <p className="text-muted-foreground">{TOKEN_LABEL_FIELD_HELP}</p>
                        </PopoverContent>
                      </Popover>
                      {editingExistingToken ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            if (selectedTokenCompanyIds.length === 0) {
                              toast({
                                variant: "destructive",
                                title: "Select companies",
                                description: "Pick at least one company for this access token.",
                              });
                              return;
                            }
                            void run(async () => {
                              const api = getElectronLocalServerApi();
                              if (!api || !selectedTokenId) return;
                              const res = await api.updateAccessToken(selectedTokenId, {
                                label: newTokenLabel.trim() || selectedToken?.label || "Shared user",
                                allowedCompanyIds: selectedTokenCompanyIds,
                              });
                              if (!res.ok || !res.token) {
                                toast({
                                  variant: "destructive",
                                  title: "Could not save token",
                                  description: "Token may have been revoked.",
                                });
                                return;
                              }
                              selectTokenForEdit(res.token);
                              toast({
                                title: "Token updated",
                                description: `${selectedTokenCompanyIds.length} companies saved.`,
                              });
                            });
                          }}
                        >
                          Save changes
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            if (selectedTokenCompanyIds.length === 0) {
                              toast({
                                variant: "destructive",
                                title: "Select companies",
                                description: "Pick at least one company for this access token.",
                              });
                              return;
                            }
                            void run(async () => {
                              const api = getElectronLocalServerApi();
                              if (!api) return;
                            const created = await api.createAccessToken({
                              label: newTokenLabel.trim() || "Shared user",
                              allowedCompanyIds: selectedTokenCompanyIds,
                            });
                            setSelectedTokenSecret(created.token);
                            setSelectedTokenId(created.id);
                            try {
                              sessionStorage.setItem(PL_SELECTED_TOKEN_ID_KEY, created.id);
                            } catch {
                              /* ignore */
                            }
                            setNewTokenLabel(created.label);
                            setTokenCompanyPick(
                              Object.fromEntries(created.allowedCompanyIds.map((id) => [id, true]))
                            );
                              toast({
                                title: "Token created",
                                description: `${selectedTokenCompanyIds.length} companies — copy token now.`,
                              });
                            });
                          }}
                        >
                          Create token
                        </Button>
                      )}
                    </div>
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
                      Use this tab when this PC should open companies from another machine&apos;s Pocket Ledger server.
                      Saving sets this app to client mode (or server+client if you also host on the Server tab).
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="pl-remote-url">Server address (IP or hostname)</Label>
                      <Input
                        id="pl-remote-url"
                        placeholder="http://203.0.113.10:3000 or http://office.example.com:37123"
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
                      <p className="text-xs text-muted-foreground">
                        Use the URL from the server owner (LAN IP or public IP after port forward).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pl-client-token">Access token (from server owner)</Label>
                      <Input
                        id="pl-client-token"
                        type="password"
                        autoComplete="off"
                        placeholder="Paste token from server Settings → Access tokens"
                        value={draft.clientAccessToken}
                        onChange={(e) => setDraft((d) => (d ? { ...d, clientAccessToken: e.target.value } : d))}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link href="/gate">Open Gate — pick remote company</Link>
                    </Button>
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
