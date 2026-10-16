"use client";

import {
  getClientHealthExportText,
  isBenignResizeObserverMessage,
} from "@/lib/clientHealthMonitor";

const OVERLAY_ID = "pl-ui-health-emergency-overlay";
const DEFAULT_MIN_VISIBLE_MS = 5000;

let overlayVisibleSince = 0;
let overlayMinVisibleMs = DEFAULT_MIN_VISIBLE_MS;

export function canDismissClientHealthEmergencyOverlay(): boolean {
  if (!overlayVisibleSince) return true;
  return Date.now() - overlayVisibleSince >= overlayMinVisibleMs;
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {
    /* fallback below */
  });
}

/** Lightweight full-screen layer — no Radix/React; opens fast after main thread unblocks. */
export function showClientHealthEmergencyOverlay(
  reason: string,
  onResume: () => void,
  opts?: { minVisibleMs?: number }
): void {
  if (typeof document === "undefined") return;
  if (isBenignResizeObserverMessage(reason)) return;
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    overlayMinVisibleMs = opts?.minVisibleMs ?? overlayMinVisibleMs;
    return;
  }
  overlayMinVisibleMs = opts?.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS;
  overlayVisibleSince = Date.now();

  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.setAttribute("data-pl-ui-health-emergency", "1");
  root.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.92);font-family:system-ui,sans-serif;";

  const card = document.createElement("div");
  card.style.cssText =
    "width:min(100%,520px);height:80vh;max-height:80vh;display:flex;flex-direction:column;gap:10px;border-radius:10px;border:1px solid #fbbf24;background:#fffbeb;padding:14px;box-shadow:0 20px 50px rgba(0,0,0,.45);";

  const title = document.createElement("h2");
  title.textContent = "UI paused — diagnostics";
  title.style.cssText = "margin:0;font-size:16px;font-weight:700;color:#92400e;";

  const desc = document.createElement("p");
  desc.textContent =
    "Heavy work was stopped so you can copy this log. Tap Resume when done. (Browser “Page Unresponsive” may still appear on very long freezes — use Wait, then Copy here.)";
  desc.style.cssText = "margin:0;font-size:12px;line-height:1.45;color:#78350f;";

  const reasonEl = document.createElement("p");
  reasonEl.textContent = reason;
  reasonEl.style.cssText = "margin:0;font-size:12px;font-weight:600;color:#b45309;";

  const ta = document.createElement("textarea");
  ta.readOnly = true;
  ta.value = getClientHealthExportText();
  ta.style.cssText =
    "width:100%;min-height:220px;flex:1;resize:vertical;font:11px/1.4 ui-monospace,monospace;border:1px solid #fcd34d;border-radius:6px;padding:8px;color:#1e293b;background:#fff;";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy all";
  copyBtn.style.cssText =
    "cursor:pointer;border:1px solid #cbd5e1;border-radius:999px;padding:8px 14px;font-size:13px;background:#f8fafc;";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.textContent = "Refresh log";
  refreshBtn.style.cssText = copyBtn.style.cssText;

  const resumeBtn = document.createElement("button");
  resumeBtn.type = "button";
  resumeBtn.textContent = "Resume app";
  resumeBtn.style.cssText =
    "cursor:pointer;border:0;border-radius:999px;padding:8px 16px;font-size:13px;font-weight:600;background:#2563eb;color:#fff;";

  copyBtn.onclick = () => {
    ta.select();
    copyText(ta.value);
    copyBtn.textContent = "Copied";
    window.setTimeout(() => {
      copyBtn.textContent = "Copy all";
    }, 1500);
  };
  refreshBtn.onclick = () => {
    ta.value = getClientHealthExportText();
  };
  const syncResumeButton = () => {
    const left = overlayMinVisibleMs - (Date.now() - overlayVisibleSince);
    if (left <= 0) {
      resumeBtn.disabled = false;
      resumeBtn.style.opacity = "1";
      resumeBtn.style.cursor = "pointer";
      resumeBtn.textContent = "Resume app";
      return;
    }
    resumeBtn.disabled = true;
    resumeBtn.style.opacity = "0.55";
    resumeBtn.style.cursor = "not-allowed";
    resumeBtn.textContent = `Resume (${Math.ceil(left / 1000)}s)`;
    window.setTimeout(syncResumeButton, 250);
  };

  resumeBtn.onclick = () => {
    if (!canDismissClientHealthEmergencyOverlay()) return;
    hideClientHealthEmergencyOverlay();
    onResume();
  };
  syncResumeButton();

  row.append(refreshBtn, copyBtn, resumeBtn);
  card.append(title, desc, reasonEl, ta, row);
  root.append(card);
  document.body.append(root);
  root.addEventListener(
    "click",
    (ev) => {
      if (ev.target === root) ev.stopPropagation();
    },
    true
  );
}

export function hideClientHealthEmergencyOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
  overlayVisibleSince = 0;
}

export function refreshClientHealthEmergencyOverlayLog(): void {
  const ta = document.querySelector(
    `#${OVERLAY_ID} textarea`
  ) as HTMLTextAreaElement | null;
  if (ta) ta.value = getClientHealthExportText();
}
