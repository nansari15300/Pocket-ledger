/** Dev/runtime verify only — no-op unless `window.__plPhase1bVerifyCapture` is installed. */
export function plPhase1bVerifyHook(
  field:
    | "onCompanyDocUpsert"
    | "onFlush"
    | "onCloudEnqueue"
    | "onMirrorQueue"
    | "onHostPublishQueue"
    | "onHostPublishSuccess"
): void {
  if (typeof window === "undefined") return;
  try {
    const cap = (window as unknown as { __plPhase1bVerifyCapture?: Record<string, () => void> })
      .__plPhase1bVerifyCapture;
    cap?.[field]?.();
  } catch {
    /* ignore */
  }
}
