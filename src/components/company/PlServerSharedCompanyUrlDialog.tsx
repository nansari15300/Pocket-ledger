"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Server } from "lucide-react";
import { toast } from "sonner";
import { getActiveGate, listGates, normalizeServerUrl, updateLocalServerGate } from "@/lib/gates/gateStore";
import { refreshActiveLocalServerGateContext, dispatchGateChanged } from "@/lib/gates/gateRuntime";
import { applyPlServerAccessContextPayload } from "@/lib/plServerAccessContext";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import type { Company } from "@/hooks/useCompany";
import { tryPlServerUrlsUntilConnected } from "@/lib/plServerShareInviteFlow";

type Props = {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Client-side: change bound server IP for a shared local (plServer) company. */
export function PlServerSharedCompanyUrlDialog({ company, open, onOpenChange }: Props) {
  const gate = useMemo(() => {
    if (!company || !isServerGateCompany(company)) return null;
    const active = getActiveGate();
    if (active.type === "local_server") return active;
    return listGates().find((g) => g.type === "local_server") ?? null;
  }, [company, open]);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next && gate?.serverUrl) setUrl(gate.serverUrl);
    onOpenChange(next);
  };

  const save = async () => {
    if (!gate) {
      toast.error("No local server gate found");
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Enter a server address");
      return;
    }
    setBusy(true);
    try {
      const accessToken = (gate.accessToken || "").trim();
      let targetUrl = normalizeServerUrl(trimmed);
      if (accessToken) {
        const hit = await tryPlServerUrlsUntilConnected([targetUrl], accessToken);
        if (!hit) {
          toast.error("Could not reach server at this address");
          return;
        }
        targetUrl = hit.serverUrl;
      }
      const updated = updateLocalServerGate(gate.id, {
        label: gate.label,
        serverUrl: targetUrl,
        accessToken: gate.accessToken,
      });
      const ctx = await refreshActiveLocalServerGateContext(updated);
      if (ctx.error) {
        toast.error(ctx.error);
        return;
      }
      applyPlServerAccessContextPayload(
        {
          unrestricted: ctx.unrestricted,
          allowedCompanyIds: ctx.allowedCompanyIds,
          label: ctx.label ?? undefined,
          companies: ctx.companies ?? undefined,
        },
        updated.id
      );
      dispatchGateChanged();
      toast.success("Server address saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!company || !isServerGateCompany(company)) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Server address — {company.name}
          </DialogTitle>
          <DialogDescription>
            This company is on a shared local server. Change the IP if LAN or public address changed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label htmlFor="pl-shared-server-url">Server URL</Label>
          <Input
            id="pl-shared-server-url"
            placeholder="http://110.34.23.84:3001"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {gate?.serverUrl ? (
            <p className="text-xs text-muted-foreground break-all">Current: {gate.serverUrl}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
