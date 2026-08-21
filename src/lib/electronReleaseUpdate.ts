import type { ReleaseUpdateInfo } from "@/lib/releaseUpdateCheck";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

type ElectronUpdateBridge = {
  downloadAndInstall?: (payload: { url: string; version: string }) => Promise<{ ok: boolean; error?: string }>;
  onProgress?: (
    callback: (payload: { received: number; total: number; reused?: boolean }) => void
  ) => () => void;
};

function updateBridge(): ElectronUpdateBridge | null {
  if (typeof window === "undefined" || !isElectronDesktopApp()) return null;
  return (window as Window & { plElectronUpdate?: ElectronUpdateBridge }).plElectronUpdate ?? null;
}

export function canElectronAutoInstallUpdate(): boolean {
  return Boolean(updateBridge()?.downloadAndInstall);
}

export async function electronDownloadAndInstallUpdate(
  update: ReleaseUpdateInfo
): Promise<{ ok: boolean; error?: string }> {
  const bridge = updateBridge();
  if (!bridge?.downloadAndInstall) {
    return { ok: false, error: "Auto-install is only available in the Windows app." };
  }
  return bridge.downloadAndInstall({ url: update.url, version: update.version });
}

export function subscribeElectronUpdateDownloadProgress(
  callback: (payload: { received: number; total: number; reused?: boolean }) => void
): () => void {
  const bridge = updateBridge();
  if (!bridge?.onProgress) return () => {};
  return bridge.onProgress(callback);
}

export function formatUpdateDownloadProgress(received: number, total: number): string {
  if (!total || total <= 0) return "Downloading…";
  const pct = Math.min(100, Math.round((received / total) * 100));
  return `Downloading… ${pct}%`;
}
