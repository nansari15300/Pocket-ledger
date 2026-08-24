"use client";

import { useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { DaybookWedgePreview } from "@wedge/daybook/preview/DaybookWedgePreview";
import type { DaybookWedgeSnapshot } from "@wedge/daybook/types/daybookWedgeRow";
import { useDaybookWedgeSnapshot } from "@wedge/daybook/sync/useDaybookWedgeSnapshot";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const WEDGE_SAVED_DAY_KEY = "pl_wedge_daybook_selected_day_iso";

function isDayIsoInSnapshot(snapshot: DaybookWedgeSnapshot | null, iso: string): boolean {
  if (!snapshot) return false;
  if (snapshot.days?.some((d) => d.dayIso === iso)) return true;
  return snapshot.defaultDayIso === iso || snapshot.selectedDayIso === iso;
}

export default function DevDaybookWedgePreviewPage() {
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [previewDateSystem, setPreviewDateSystem] = useState<"AD" | "BS" | "Both">("Both");
  const { company, companyId, setCompanyId } = useCompany();
  const { formatDate, formatDateBS, setDateSystem } = useDate();

  const snapshot = useDaybookWedgeSnapshot({ dateSystemOverride: previewDateSystem });
  const activeDayIso = selectedDayIso || snapshot?.defaultDayIso || null;

  /** Other browser tab me company change → is tab ka preview bhi sync (localStorage + focus). */
  useEffect(() => {
    const syncCompany = (nextId: string) => {
      const id = nextId.trim();
      if (id && id !== companyId) setCompanyId(id);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === "companyId" && e.newValue) syncCompany(e.newValue);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const global = localStorage.getItem("companyId")?.trim();
        if (global) syncCompany(global);
      } catch (_) {}
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [companyId, setCompanyId]);

  const persistSelectedDay = (iso: string) => {
    setSelectedDayIso(iso);
    try {
      localStorage.setItem(WEDGE_SAVED_DAY_KEY, iso);
    } catch (_) {}
  };

  useEffect(() => {
    if (!snapshot?.defaultDayIso) return;
    if (selectedDayIso && isDayIsoInSnapshot(snapshot, selectedDayIso)) return;

    try {
      const saved = localStorage.getItem(WEDGE_SAVED_DAY_KEY);
      if (saved && isDayIsoInSnapshot(snapshot, saved)) {
        setSelectedDayIso(saved);
        return;
      }
    } catch (_) {}

    persistSelectedDay(snapshot.defaultDayIso);
  }, [snapshot, selectedDayIso]);

  if (process.env.NODE_ENV === "production") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Dev wedge preview is not available in production builds.
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const liveLabel = company?.name || companyId || "—";

  return (
    <div className="min-h-screen bg-neutral-200 p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-xl font-bold">Daybook wedge — dev preview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live widget mirror — same snapshot as the Android home-screen wedge. Change company in the app header to test.
          </p>
          <p className="mt-2 text-xs font-medium text-teal-800">
            Widget company: {company?.name ?? snapshot?.companyName ?? liveLabel}
            {!company && !snapshot ? " (loading…)" : ""}
          </p>
        </div>

        <div
          className="relative mx-auto flex flex-col rounded-[2rem] border-8 border-neutral-800 p-3"
          style={{ width: 380, height: 720, background: "#F8FAFC" }}
        >
          <div className="mb-1 shrink-0 text-center text-[10px] text-neutral-600">Home screen (mock)</div>
          <div className="min-h-0 flex-1">
            <DaybookWedgePreview
              key={companyId ?? snapshot?.companyId ?? "live"}
              fillScreen
              snapshot={snapshot}
              selectedDayIso={activeDayIso}
              onSelectDayIso={persistSelectedDay}
              dateSystem={previewDateSystem}
              onDateSystemChange={
                snapshot?.isNepalCalendar !== false
                  ? (v) => {
                      setPreviewDateSystem(v);
                      setDateSystem(v);
                    }
                  : undefined
              }
              formatDate={formatDate}
              formatDateBS={formatDateBS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
