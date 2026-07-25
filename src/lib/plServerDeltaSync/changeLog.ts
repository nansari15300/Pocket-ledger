"use client";

export type PlServerDeltaChangeLogEntry = {
  companyId: string;
  collection: string;
  docId: string;
  changedAt: number;
};

export function buildPlServerDeltaChangeLogEntry(input: {
  companyId: string;
  collection: string;
  docId: string;
  changedAt?: number;
}): PlServerDeltaChangeLogEntry {
  return {
    companyId: String(input.companyId || "").trim(),
    collection: String(input.collection || "").trim(),
    docId: String(input.docId || "").trim(),
    changedAt: typeof input.changedAt === "number" ? input.changedAt : Date.now(),
  };
}

