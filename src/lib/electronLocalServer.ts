"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { getEmbeddedLockShellKind } from "@/lib/embeddedDeviceLock";
import { isBrowserLoopbackDevHost, isLocalhostDevPreview } from "@/lib/localAppServerDevPreview";
import { createDevPlLocalServerClientApi } from "@/lib/devPlLocalServer/clientApi";

export type LocalServerBindMode = "localhost" | "lan" | "internet";
export type LocalAppServerRole = "server" | "client" | "both";

export type LocalAppServerConfig = {
  port: number;
  bindMode: LocalServerBindMode;
  autoStartOnBoot: boolean;
  userWantsRunning: boolean;
  appRole: LocalAppServerRole;
  remoteServerUrl: string;
  clientAccessToken: string;
  publicHost: string;
  requireRemoteAccessToken: boolean;
  /** Normalized listing URLs to include in Messages share invites (empty = all available). */
  selectedInviteUrls?: string[];
  /** Host: tick + save ki hui local companies — remote gate clients ko yahi dikhengi. */
  sharedLocalCompanyIds?: string[] | null;
  /** Show the server sharing start/stop switch in the desktop app header. */
  showServerSwitchInHeader?: boolean;
};

export type LocalAppServerAccessTokenSummary = {
  id: string;
  label: string;
  email: string | null;
  uid: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  tokenPreview: string;
  allowedCompanyIds: string[];
  invitedEmails?: string[];
};

export type LocalAppServerStatus = {
  running: boolean;
  /** Packaged EXE: HTTP server up for this app's UI (even when remote sharing is off). */
  appUiServing?: boolean;
  sharingActive?: boolean;
  port: number | null;
  appUiPort?: number | null;
  sharingPort?: number | null;
  configuredPort: number;
  bindMode: LocalServerBindMode;
  autoStartOnBoot: boolean;
  userWantsRunning: boolean;
  appRole: LocalAppServerRole;
  remoteServerUrl: string;
  publicHost: string;
  requireRemoteAccessToken: boolean;
  urls: string[];
  clientHeader: string;
  accessHeader: string;
  electronMarkerHeader: string;
  portForwardHint: string | null;
  clients?: LocalAppServerClientStats[];
};

export type LocalAppServerClientStats = {
  key: string;
  email: string | null;
  user: string | null;
  ip: string | null;
  device?: string | null;
  companyKey?: string | null;
  companyIds?: string[];
  companyNames?: string[];
  pingMs?: number | null;
  downloadBytes: number;
  uploadBytes: number;
  requestCount: number;
  lastSeenAtMs: number;
};

export type PlElectronLocalServerApi = {
  getStatus: () => Promise<LocalAppServerStatus>;
  getConfig: () => Promise<LocalAppServerConfig>;
  setConfig: (partial: Partial<LocalAppServerConfig>) => Promise<LocalAppServerConfig>;
  start: () => Promise<{ ok: boolean; port?: number; status?: LocalAppServerStatus }>;
  stop: () => Promise<{ ok: boolean; status?: LocalAppServerStatus }>;
  restart: (
    partial?: Partial<LocalAppServerConfig>
  ) => Promise<{ ok: boolean; port?: number; status?: LocalAppServerStatus }>;
  saveShareableCompaniesSnapshot?: (
    companies: Array<Record<string, unknown>>
  ) => Promise<{ ok?: boolean; count?: number }>;
  listAccessTokens: () => Promise<LocalAppServerAccessTokenSummary[]>;
  createAccessToken: (input: {
    label?: string;
    email?: string | null;
    uid?: string | null;
    allowedCompanyIds?: string[];
  }) => Promise<{
    id: string;
    token: string;
    label: string;
    email: string | null;
    uid: string | null;
    allowedCompanyIds: string[];
  }>;
  updateAccessToken: (
    id: string,
    input: { label?: string; allowedCompanyIds?: string[]; invitedEmails?: string[] }
  ) => Promise<{ ok: boolean; token?: LocalAppServerAccessTokenSummary }>;
  getAccessTokenSecret: (id: string) => Promise<{
    ok: boolean;
    id?: string;
    token?: string;
    label?: string;
    allowedCompanyIds?: string[];
  }>;
  rotateAccessToken: (
    id: string,
    input?: { label?: string; allowedCompanyIds?: string[] }
  ) => Promise<{
    ok: boolean;
    id?: string;
    token?: string;
    label?: string;
    allowedCompanyIds?: string[];
  }>;
  revokeAccessToken: (id: string) => Promise<{ ok: boolean }>;
};

function getElectronApiFromWindow(): PlElectronLocalServerApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { plElectronLocalServer?: PlElectronLocalServerApi }).plElectronLocalServer;
  return api ?? null;
}

export function isElectronLocalServerApiAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const electron = getElectronApiFromWindow();
  if (electron) return true;
  if (getEmbeddedLockShellKind() === "exe") return true;
  if (isCapacitorNativeApp()) return false;
  if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_PL_DEV_LOCAL_SERVER === "1") {
    return true;
  }
  return isBrowserLoopbackDevHost();
}

export function getElectronLocalServerApi(): PlElectronLocalServerApi | null {
  const electron = getElectronApiFromWindow();
  if (electron) return electron;
  if (isLocalhostDevPreview()) return createDevPlLocalServerClientApi();
  return null;
}

/** Settings UI + share invites: Electron `sharingActive`, dev bridge `running` fallback. */
export function isLocalAppServerSharingActive(status: LocalAppServerStatus | null | undefined): boolean {
  if (!status) return false;
  return status.sharingActive === true || status.running === true;
}

export function resolveLocalAppServerSharingPort(
  status: LocalAppServerStatus | null | undefined
): number | null {
  if (!isLocalAppServerSharingActive(status)) return null;
  const port = status?.sharingPort ?? status?.port;
  return port && port > 0 ? port : null;
}
