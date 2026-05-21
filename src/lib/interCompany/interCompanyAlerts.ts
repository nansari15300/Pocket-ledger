/** IC system join / alerts UI refresh — sidebar, Join tab inbox */
export const IC_ALERTS_CHANGED = "pl-ic-alerts-changed";

export function notifyInterCompanyAlertsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(IC_ALERTS_CHANGED));
}
