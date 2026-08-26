/** Shared wedge snapshot envelope (versioned JSON to native). */
export const WEDGE_SNAPSHOT_VERSION = 1;

export type WedgeId = "daybook" | "outstanding";

export type WedgeSnapshotMeta = {
  version: typeof WEDGE_SNAPSHOT_VERSION;
  wedgeId: WedgeId;
  companyId: string;
  companyName: string;
  updatedAt: number;
};
