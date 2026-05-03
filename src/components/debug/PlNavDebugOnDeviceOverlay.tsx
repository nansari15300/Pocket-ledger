"use client";

/**
 * APK-only friendly: `[PL-NAV]` traces ko WebView canvas par dikhao — adb / Desktop Chrome zaroorat nahi
 * (`plNavRedirectDebug` + overlay flag ya build env ENABLE).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  PL_NAV_DBG_LOG_EVENT,
  getPlNavDbgRingLines,
  isPlNavDebugOnScreenEnabled,
  shouldRenderPlNavDebugOverlay,
} from "@/lib/plNavRedirectDebug";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlNavDebugOnDeviceOverlay() {
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  const syncFromRing = useCallback(() => {
    setLines([...getPlNavDbgRingLines()]);
  }, []);

  useEffect(() => {
    setVisible(shouldRenderPlNavDebugOverlay());
  }, []);

  useEffect(() => {
    if (!visible) return;
    syncFromRing();
    const onLog = () => syncFromRing();
    window.addEventListener(PL_NAV_DBG_LOG_EVENT as keyof WindowEventMap, onLog as EventListener);
    return () => window.removeEventListener(PL_NAV_DBG_LOG_EVENT as keyof WindowEventMap, onLog as EventListener);
  }, [visible, syncFromRing]);

  /** Storage change: user ne DevTools/alternate tab se flag badla ho to APK session me dikhai de */
  useEffect(() => {
    const check = () => {
      const v = shouldRenderPlNavDebugOverlay();
      setVisible(v);
      if (v) syncFromRing();
    };
    window.addEventListener("storage", check);
    const id = window.setInterval(() => {
      if (isPlNavDebugOnScreenEnabled() !== visible) check();
    }, 800);
    return () => {
      window.removeEventListener("storage", check);
      window.clearInterval(id);
    };
  }, [visible, syncFromRing]);

  const body = useMemo(() => lines.join("\n"), [lines]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed z-[2147483646] max-h-[38vh] w-[min(100vw-12px,420px)]",
        "left-2 bottom-2 flex flex-col gap-1 rounded-md border border-amber-500/70 bg-black/82 p-2 text-[10px] leading-tight shadow-xl",
        "font-mono text-amber-100"
      )}
      role="log"
      aria-label="PL navigation debug"
    >
      <div className="flex items-center justify-between gap-2 border-b border-amber-600/40 pb-1 text-[11px] font-semibold text-amber-400">
        <span>[PL-NAV] on-device</span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[10px]"
            onClick={() => {
              void navigator.clipboard?.writeText(body).catch(() => {});
            }}
          >
            Copy
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-amber-200" onClick={() => setVisible(false)} aria-label="Hide overlay">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-[80px] max-h-[calc(38vh-48px)] overflow-y-auto whitespace-pre-wrap break-all pr-0.5">
        {lines.length === 0 ? <span className="text-muted-foreground">Awaiting traces… voucher save karke dekho.</span> : lines.join("\n")}
      </div>
    </div>
  );
}
