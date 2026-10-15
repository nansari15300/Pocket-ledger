"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PL_CLIENT_HEALTH_ALERT_EVENT,
  PL_CLIENT_HEALTH_LOG_EVENT,
  PL_CLIENT_HEALTH_SNAPSHOT_EVENT,
  formatClientHealthEntryLine,
  formatClientHealthSnapshotBlock,
  getClientHealthExportText,
  getClientHealthMonitorSnapshot,
  getClientHealthRing,
  isClientHealthMonitorEnabled,
  startClientHealthMonitor,
  updateClientHealthMonitorSnapshot,
  type ClientHealthAlertDetail,
  type ClientHealthEntry,
  type ClientHealthMonitorSnapshot,
} from "@/lib/clientHealthMonitor";
import { useCompany } from "@/hooks/useCompany";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { toast } from "sonner";

function EntryBlock({ entry }: { entry: ClientHealthEntry }) {
  const line = formatClientHealthEntryLine(entry);
  const tone =
    entry.kind === "error" || entry.kind === "rejection"
      ? "text-red-800"
      : entry.kind === "stall"
        ? "text-amber-900"
        : entry.kind === "click"
          ? "text-slate-700"
          : "text-slate-600";
  return (
    <div className={`border-b border-slate-200 py-1.5 text-[11px] leading-snug ${tone}`}>
      <div className="font-mono">{line}</div>
      {entry.detail ? (
        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-600">
          {entry.detail}
        </pre>
      ) : null}
    </div>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: ClientHealthMonitorSnapshot }) {
  return (
    <pre className="mb-2 rounded-md border border-slate-200 bg-slate-100/80 p-2 text-[10px] leading-snug text-slate-800 whitespace-pre-wrap">
      {formatClientHealthSnapshotBlock(snapshot)}
    </pre>
  );
}

/**
 * Tracks clicks / errors / main-thread stalls; opens a diary dialog on problems or Ctrl+Shift+U.
 */
export function ClientHealthMonitorBootstrap() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly ClientHealthEntry[]>([]);
  const [snapshot, setSnapshot] = useState<ClientHealthMonitorSnapshot>(() => getClientHealthMonitorSnapshot());
  const [alertHint, setAlertHint] = useState<string | null>(null);

  const pathname = usePathname();
  const online = useNavigatorOnline();
  const { companyId, company } = useCompany();

  const syncRing = useCallback(() => {
    setEntries([...getClientHealthRing()]);
    setSnapshot({ ...getClientHealthMonitorSnapshot() });
  }, []);

  // Light fields only — SQLite COUNT is ClientHealthMonitorSnapshotSync (never full voucher parse).
  const pushLightSnapshot = useCallback(() => {
    updateClientHealthMonitorSnapshot({
      companyId: companyId ?? undefined,
      companyName: company?.name ? String(company.name) : undefined,
      route: pathname ?? undefined,
      online,
    });
  }, [company?.name, companyId, online, pathname]);

  useEffect(() => {
    setEnabled(isClientHealthMonitorEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const stop = startClientHealthMonitor();
    syncRing();
    return stop;
  }, [enabled, syncRing]);

  useEffect(() => {
    if (!enabled) return;
    pushLightSnapshot();
  }, [enabled, pushLightSnapshot]);

  useEffect(() => {
    if (!enabled) return;
    const onRing = () => syncRing();
    const onSnapshot = () => setSnapshot({ ...getClientHealthMonitorSnapshot() });
    const onAlert = (ev: Event) => {
      // Do not re-scan SQLite on stall — that made freezes worse.
      syncRing();

      let reason = "UI problem detected";
      let forceOpen = false;
      if (ev instanceof CustomEvent) {
        const d = ev.detail as ClientHealthAlertDetail | string | undefined;
        if (typeof d === "string") reason = d;
        else if (d && typeof d === "object") {
          reason = d.reason || reason;
          const isStallLike = d.source === "stall" || d.source === "recovery";
          forceOpen = Boolean(d.forceOpen && !isStallLike);
          if (isStallLike) {
            // Emergency overlay already has the log — opening diary behind it traps Resume.
            if (d.forceOpen && !document.getElementById("pl-ui-health-emergency-overlay")) {
              setAlertHint(reason);
              setOpen(true);
            }
            return;
          }
        }
      }
      setAlertHint(reason);
      if (forceOpen && !document.getElementById("pl-ui-health-emergency-overlay")) setOpen(true);
    };
    window.addEventListener(PL_CLIENT_HEALTH_LOG_EVENT, onRing);
    window.addEventListener(PL_CLIENT_HEALTH_SNAPSHOT_EVENT, onSnapshot);
    window.addEventListener(PL_CLIENT_HEALTH_ALERT_EVENT, onAlert);
    return () => {
      window.removeEventListener(PL_CLIENT_HEALTH_LOG_EVENT, onRing);
      window.removeEventListener(PL_CLIENT_HEALTH_SNAPSHOT_EVENT, onSnapshot);
      window.removeEventListener(PL_CLIENT_HEALTH_ALERT_EVENT, onAlert);
    };
  }, [enabled, syncRing]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (ev: KeyboardEvent) => {
      if (!ev.ctrlKey || !ev.shiftKey || ev.key.toLowerCase() !== "u") return;
      ev.preventDefault();
      pushLightSnapshot();
      setOpen(true);
      syncRing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, syncRing, pushLightSnapshot]);

  const body = useMemo(() => getClientHealthExportText(), [entries, snapshot]);

  if (!enabled) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>UI health diary</DialogTitle>
          <DialogDescription>
            Recent clicks, JavaScript errors, and main-thread stalls. After &quot;Page Unresponsive&quot; →
            Wait, this diary should open automatically with company and sync context.
          </DialogDescription>
          {alertHint ? (
            <p className="text-sm font-medium text-amber-800">{alertHint}</p>
          ) : null}
        </DialogHeader>
        <SnapshotPanel snapshot={snapshot} />
        <ScrollArea className="h-[min(46vh,300px)] rounded-md border bg-slate-50 px-2">
          {entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No events yet.</p>
          ) : (
            [...entries].reverse().map((e) => <EntryBlock key={e.id} entry={e} />)
          )}
        </ScrollArea>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              pushLightSnapshot();
              syncRing();
              toast.message("Diary refreshed");
            }}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(body).then(
                () => toast.success("Copied diary to clipboard"),
                () => toast.error("Copy failed")
              );
            }}
          >
            Copy all
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
