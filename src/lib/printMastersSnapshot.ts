import type { MastersPrintSnapshot } from "@/lib/printMastersTypes";

let snapshot: MastersPrintSnapshot | null = null;

export function setMastersPrintSnapshot(data: MastersPrintSnapshot | null): void {
  snapshot = data;
}

export function getMastersPrintSnapshot(): MastersPrintSnapshot | null {
  return snapshot;
}
