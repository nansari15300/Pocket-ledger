import { registerPlugin } from "@capacitor/core";

export interface WedgePlugin {
  /** Daybook list + summary JSON → native cache + widget refresh. */
  pushDaybookSnapshot(options: { payload: string }): Promise<{ ok: boolean }>;
  requestDaybookWidgetRefresh(): Promise<{ ok: boolean }>;
}

export const Wedge = registerPlugin<WedgePlugin>("Wedge");
