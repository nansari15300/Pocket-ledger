import type { DaybookWedgeSnapshot } from "@wedge/daybook/types/daybookWedgeRow";
import { Wedge } from "@wedge/shared/bridge/WedgePlugin";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

let lastPayload = "";
let lastCompanyId = "";

/** Clear dedup cache so the next push always reaches the widget (e.g. company switch). */
export function invalidateDaybookWedgePushCache(): void {
  lastPayload = "";
  lastCompanyId = "";
}

export async function pushDaybookWedgeSnapshot(
  snapshot: DaybookWedgeSnapshot,
  opts?: { force?: boolean }
): Promise<void> {
  if (!isCapacitorNativeApp()) return;
  const payload = JSON.stringify(snapshot);
  const companyChanged = snapshot.companyId !== lastCompanyId;
  if (!opts?.force && !companyChanged && payload === lastPayload) return;
  lastCompanyId = snapshot.companyId;
  lastPayload = payload;
  try {
    await Wedge.pushDaybookSnapshot({ payload });
  } catch (e) {
    console.warn("[wedge/daybook] push failed", e);
    lastPayload = "";
    lastCompanyId = "";
  }
}
