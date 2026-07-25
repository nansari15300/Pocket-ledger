"use client";

import type { CompanyBackupCollection } from "@/lib/companyBackupCollections";

export type PlServerDeltaAction = "upsert" | "delete";

export type PlServerDeltaOp = {
  opSeq: number;
  collection: string;
  docId: string;
  action: PlServerDeltaAction;
  payload: Record<string, unknown> | null;
  updatedAt: number;
};

export type PlServerDeltaPullResponse = {
  ops: PlServerDeltaOp[];
  latestSeq: number;
  hasMore: boolean;
  seeded?: boolean;
};

export type PlServerDeltaSyncResult = {
  ok: boolean;
  fullPull: boolean;
  changedCollections?: CompanyBackupCollection[];
  applied: number;
  skipped: number;
};
