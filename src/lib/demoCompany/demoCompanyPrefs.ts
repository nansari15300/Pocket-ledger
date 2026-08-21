"use client";

import { DEMO_COMPANY_PREFS_KEY } from "@/lib/demoCompany/constants";

export type DemoCompanyPrefs = {
  enabled?: boolean;
  committed?: boolean;
  forkCompanyId?: string;
};

function prefsStorageKey(userId: string): string {
  return `${DEMO_COMPANY_PREFS_KEY}:${String(userId || "").trim()}`;
}

export function demoForkCompanyIdForUser(userId: string): string {
  const safe = String(userId || "anon")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
  return `demo_fork_${safe || "anon"}`;
}

export function readDemoCompanyPrefs(userId: string): DemoCompanyPrefs | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(prefsStorageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as DemoCompanyPrefs;
  } catch {
    return null;
  }
}

function writeDemoCompanyPrefs(userId: string, prefs: DemoCompanyPrefs | null): void {
  if (typeof localStorage === "undefined") return;
  const key = prefsStorageKey(userId);
  if (!prefs) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(prefs));
}

export function markDemoCompanyEnabled(userId: string, forkCompanyId: string): void {
  const prev = readDemoCompanyPrefs(userId);
  writeDemoCompanyPrefs(userId, {
    ...prev,
    enabled: true,
    forkCompanyId,
    committed: prev?.committed === true,
  });
}

export function markDemoCompanyDisabled(userId: string): void {
  const prev = readDemoCompanyPrefs(userId);
  writeDemoCompanyPrefs(userId, {
    ...prev,
    enabled: false,
  });
}

export function markDemoCompanyCommitted(userId: string): void {
  const prev = readDemoCompanyPrefs(userId);
  writeDemoCompanyPrefs(userId, {
    ...prev,
    committed: true,
  });
}
