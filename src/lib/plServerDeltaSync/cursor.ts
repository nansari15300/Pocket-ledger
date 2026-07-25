"use client";

const cursorByCompany = new Map<string, number>();

export function getPlServerDeltaCursor(companyId: string): number {
  const id = String(companyId || "").trim();
  if (!id) return 0;
  return cursorByCompany.get(id) ?? 0;
}

export function setPlServerDeltaCursor(companyId: string, cursor: number): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  const next = Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0;
  cursorByCompany.set(id, next);
}

export function clearPlServerDeltaCursor(companyId: string): void {
  const id = String(companyId || "").trim();
  if (!id) return;
  cursorByCompany.delete(id);
}

