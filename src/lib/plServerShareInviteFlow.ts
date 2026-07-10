"use client";

import { getDocs, query, collection, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { getElectronLocalServerApi, type LocalAppServerAccessTokenSummary } from "@/lib/electronLocalServer";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import {
  getLocalCompanyUsersRecords,
  parseLocalCompanyUserRows,
  upsertUserInList,
} from "@/lib/localCompanyUsers";
import { normalizeLocalCompanyAppRole } from "@/lib/localCompanyAppRoles";
import { sendLocalServerShareInviteAlert, localServerShareAlertUrlOptions } from "@/lib/plServerShareInvite";
import {
  buildPlServerInviteUrlList,
  dedupePlServerListingUrls,
  normalizePlServerListingUrl,
} from "@/lib/plServerPublicHostUrl";
import { preferPlServerUrlsForClient, orderPlServerUrlsWithPreferred } from "@/lib/plServerClientUrlPick";
import { pickDefaultPlServerShareUrl } from "@/lib/plServerGateInviteLink";
import { normalizeServerUrl, addLocalServerGate, listGates, updateLocalServerGate, getActiveGate, writeActiveGateId } from "@/lib/gates/gateStore";
import { fetchGateServerAccessContext, verifyPlSharingServerCapable } from "@/lib/gates/gateServerFetch";
import { rewritePlServerListingUrlsPort } from "@/lib/plServerPublicHostUrl";
import {
  applyPlServerAccessContextPayload,
  persistDevClientAccessToken,
} from "@/lib/plServerAccessContext";
import { refreshActiveLocalServerGateContext, dispatchGateChanged, applyActiveGateRuntime } from "@/lib/gates/gateRuntime";
import type { GateRecord } from "@/lib/gates/gateTypes";

const PL_SERVER_URL_PROBE_TIMEOUT_MS = 8_000;

export type PlServerShareUserRow = {
  tokenId: string;
  email: string;
  name: string;
  role: string;
  allowedCompanyIds: string[];
  createdAt: string | null;
  lastUsedAt: string | null;
};

const PROCESSED_INVITE_KEY = "pl_local_server_share_processed_v1";

async function resolveRecipientUidByEmail(email: string): Promise<string | null> {
  const em = String(email || "").trim().toLowerCase();
  if (!em.includes("@")) return null;
  const snap = await getDocs(query(collection(firestore, "users"), where("email", "==", em)));
  if (snap.empty) return null;
  const row = snap.docs[0]!.data() as { uid?: string };
  return String(row.uid || snap.docs[0]!.id || "").trim() || null;
}

export function orderPlServerUrlsForProbe(urls: string[], serverPort?: number): string[] {
  const port = Number(serverPort) || 0;
  const list = port > 0 ? rewritePlServerListingUrlsPort(urls, port) : urls;
  const ordered = preferPlServerUrlsForClient(list);
  if (port <= 0) return ordered;
  return [...ordered].sort((a, b) => {
    const portOf = (raw: string) => {
      try {
        return Number(new URL(raw).port) || port;
      } catch {
        return 0;
      }
    };
    const aHit = portOf(a) === port ? 0 : 1;
    const bHit = portOf(b) === port ? 0 : 1;
    return aHit - bHit;
  });
}

export async function tryPlServerUrlsUntilConnected(
  urls: string[],
  accessToken: string,
  preferredUrl?: string,
  serverPort?: number
): Promise<{ serverUrl: string; context: Awaited<ReturnType<typeof fetchGateServerAccessContext>> } | null> {
  const tok = accessToken.trim();
  if (!tok) return null;
  const port = Number(serverPort) || 0;
  const normalizedUrls =
    port > 0 ? rewritePlServerListingUrlsPort(urls, port) : urls.map((u) => normalizeServerUrl(u)).filter(Boolean);
  const preferred =
    preferredUrl && port > 0
      ? rewritePlServerListingUrlsPort([preferredUrl], port)[0] || normalizeServerUrl(preferredUrl)
      : normalizeServerUrl(preferredUrl || "");
  const ordered = preferred
    ? orderPlServerUrlsWithPreferred(preferred, normalizedUrls)
    : orderPlServerUrlsForProbe(normalizedUrls, port);
  for (const url of ordered) {
    const ctx = await fetchGateServerAccessContext(url, tok, {
      timeoutMs: PL_SERVER_URL_PROBE_TIMEOUT_MS,
    });
    if (ctx.error) continue;
    const capable = await verifyPlSharingServerCapable(url, tok, {
      timeoutMs: PL_SERVER_URL_PROBE_TIMEOUT_MS,
    });
    if (!capable) continue;
    return { serverUrl: url, context: ctx };
  }
  return null;
}

function findGateByUrlAndToken(serverUrl: string, accessToken: string): GateRecord | null {
  const norm = normalizeServerUrl(serverUrl);
  const tok = accessToken.trim();
  return (
    listGates().find(
      (g) =>
        g.type === "local_server" &&
        normalizeServerUrl(g.serverUrl || "") === norm &&
        (g.accessToken || "").trim() === tok
    ) ?? null
  );
}

/** Receiver: probe IPs, bind gate, mirror companies — ledger data local server se aata hai. */
export async function autoConnectFromPlServerShareNotification(input: {
  serverUrls: string[];
  accessToken: string;
  gateLabel?: string;
  companyId?: string | null;
  serverPort?: number;
}): Promise<{ gate: GateRecord; serverUrl: string } | null> {
  const accessToken = String(input.accessToken || "").trim();
  if (!accessToken) return null;

  const hit = await tryPlServerUrlsUntilConnected(
    input.serverUrls,
    accessToken,
    undefined,
    input.serverPort
  );
  if (!hit) return null;

  persistDevClientAccessToken(accessToken);

  let gate = findGateByUrlAndToken(hit.serverUrl, accessToken);
  if (!gate) {
    gate = listGates().find(
      (g) =>
        g.type === "local_server" && (g.accessToken || "").trim() === accessToken.trim()
    ) ?? null;
  }
  if (!gate) {
    gate = addLocalServerGate({
      label: input.gateLabel?.trim() || "Shared server",
      serverUrl: hit.serverUrl,
      accessToken,
    });
  } else {
    const prevUrl = normalizeServerUrl(gate.serverUrl || "");
    if (prevUrl !== hit.serverUrl) {
      const { updateLocalServerGate } = await import("@/lib/gates/gateStore");
      gate = updateLocalServerGate(gate.id, {
        label: gate.label,
        serverUrl: hit.serverUrl,
        accessToken,
      });
    }
  }

  const ctx = await refreshActiveLocalServerGateContext(gate);
  if (ctx.error) return null;

  applyPlServerAccessContextPayload(
    {
      unrestricted: ctx.unrestricted,
      allowedCompanyIds: ctx.allowedCompanyIds,
      label: ctx.label ?? undefined,
      companies: ctx.companies ?? undefined,
    },
    gate.id
  );
  writeActiveGateId(gate.id);
  applyActiveGateRuntime(gate);
  dispatchGateChanged();

  const { mirrorPlServerSharedCompaniesToLocalSqlite } = await import("@/lib/plServerClientCompanyMirror");
  await mirrorPlServerSharedCompaniesToLocalSqlite({ pullFullLedger: false }).catch(() => undefined);

  const companyId = String(input.companyId || "").trim();
  if (companyId) {
    const { mirrorPlServerSharedCompanyById } = await import("@/lib/plServerClientCompanyMirror");
    await mirrorPlServerSharedCompanyById(companyId, { pullFullLedger: true }).catch(() => undefined);
  }

  return { gate, serverUrl: hit.serverUrl };
}

export function readProcessedPlServerShareInviteIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PROCESSED_INVITE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function markPlServerShareInviteProcessed(id: string): void {
  if (typeof window === "undefined" || !id) return;
  const set = readProcessedPlServerShareInviteIds();
  set.add(id);
  const trimmed = [...set].slice(-200);
  try {
    localStorage.setItem(PROCESSED_INVITE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function tokenRowsForCompany(
  tokens: LocalAppServerAccessTokenSummary[],
  companyId?: string | null
): PlServerShareUserRow[] {
  const cid = String(companyId || "").trim();
  return tokens
    .filter((t) => {
      if (!t.email) return false;
      if (!cid) return true;
      const ids = t.allowedCompanyIds || [];
      return ids.length === 0 || ids.includes(cid);
    })
    .map((t) => ({
      tokenId: t.id,
      email: String(t.email || "").trim().toLowerCase(),
      name: t.label || t.email || "User",
      role: "manager",
      allowedCompanyIds: t.allowedCompanyIds || [],
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
    }));
}

async function ensureLocalLoginUserOnCompanies(input: {
  companyIds: string[];
  loginUsername: string;
  displayName: string;
  password: string;
  role: string;
  shareEmail: string;
  recipientUid?: string | null;
}): Promise<void> {
  const role = normalizeLocalCompanyAppRole(input.role);
  for (const companyId of input.companyIds) {
    const cid = String(companyId || "").trim();
    if (!cid) continue;
    try {
      const doc = await getLocalCompanyById(cid, { includeDeleted: true });
      if (!doc) continue;
      const rows = parseLocalCompanyUserRows((doc as { localCompanyUsers?: unknown }).localCompanyUsers);
      const gmail = input.shareEmail.trim().toLowerCase();
      let next = upsertUserInList(rows, {
        username: input.loginUsername.trim(),
        displayName: input.displayName.trim(),
        role,
        password: input.password,
        uid: input.recipientUid ? String(input.recipientUid).trim() : null,
      });
      const gmailIdx = next.findIndex((u) => u.username.toLowerCase() === gmail);
      if (gmailIdx >= 0 && gmail !== input.loginUsername.trim().toLowerCase()) {
        next[gmailIdx] = {
          ...next[gmailIdx],
          role,
          displayName: next[gmailIdx].displayName || input.displayName.trim(),
          uid: input.recipientUid ? String(input.recipientUid).trim() : next[gmailIdx].uid,
        };
      }
      await upsertLocalCompany({
        ...(doc as LocalCompanyDoc),
        id: cid,
        localCompanyUsers: next,
        updatedAt: Date.now(),
      });
    } catch (e) {
      throw e;
    }
  }
}

export type InviteUserToPlServerShareInput = {
  recipientEmail: string;
  displayName: string;
  loginUsername: string;
  password: string;
  role: string;
  allowedCompanyIds: string[];
  senderUserId: string;
  senderEmail?: string | null;
  senderName?: string | null;
  serverUrls: string[];
  publicHost?: string;
  serverPort?: number;
  gateLabel?: string;
  companyNames?: string;
};

export async function inviteUserToPlServerShare(
  input: InviteUserToPlServerShareInput
): Promise<{ ok: true; tokenId: string } | { ok: false; reason: string }> {
  const api = getElectronLocalServerApi();
  if (!api?.createAccessToken) {
    return { ok: false, reason: "Local server is not available on this device." };
  }

  const email = input.recipientEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, reason: "Enter a valid Gmail address." };
  }

  const companyIds = input.allowedCompanyIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (!companyIds.length) {
    return { ok: false, reason: "Select at least one local company to share." };
  }

  const loginUsername = input.loginUsername.trim();
  const password = input.password.trim();
  if (!loginUsername || !password) {
    return { ok: false, reason: "Login username and password are required for remote users." };
  }

  const recipientUid = await resolveRecipientUidByEmail(email);
  if (!recipientUid) {
    return {
      ok: false,
      reason: `${email} is not on Pocket Ledger yet. They must sign up with this Gmail first.`,
    };
  }

  await ensureLocalLoginUserOnCompanies({
    companyIds,
    loginUsername,
    displayName: input.displayName.trim() || email,
    password,
    role: input.role,
    shareEmail: email,
    recipientUid,
  });

  const existing = (await api.listAccessTokens()).find(
    (t) => String(t.email || "").trim().toLowerCase() === email
  );

  let tokenId: string;
  let accessToken: string;

  if (existing) {
    const mergedIds = [...new Set([...(existing.allowedCompanyIds || []), ...companyIds])];
    const rotated = await api.rotateAccessToken(existing.id, {
      label: input.displayName.trim() || email,
      allowedCompanyIds: mergedIds,
    });
    if (!rotated.ok || !rotated.token) {
      return { ok: false, reason: "Could not update existing share for this user." };
    }
    tokenId = existing.id;
    accessToken = rotated.token;
    await api.updateAccessToken(existing.id, { label: input.displayName.trim() || email });
  } else {
    const created = await api.createAccessToken({
      label: input.displayName.trim() || email,
      email,
      uid: recipientUid,
      allowedCompanyIds: companyIds,
    });
    tokenId = created.id;
    accessToken = created.token;
  }

  const urls = buildPlServerInviteUrlList({
    urls: input.serverUrls,
    publicHost: input.publicHost,
    port: input.serverPort,
  });
  const primary = pickDefaultPlServerShareUrl(urls) || urls[0] || "";
  if (!primary) {
    return { ok: false, reason: "Server is not running — start sharing first, then invite users." };
  }

  const invite = await sendLocalServerShareInviteAlert({
    recipientEmail: email,
    senderUserId: input.senderUserId,
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    serverUrl: primary,
    serverUrls: urls.length ? urls : [primary],
    serverPort: input.serverPort,
    accessToken,
    gateLabel: input.gateLabel || "Shared Pocket Ledger server",
    tokenLabel: input.displayName.trim() || email,
    companyNames: input.companyNames,
    companyId: companyIds.length === 1 ? companyIds[0]! : null,
    loginUsername,
  });

  if (invite.ok === false) {
    return { ok: false, reason: invite.reason };
  }

  return { ok: true, tokenId };
}

async function resolveLoginUsernameForShareEmail(
  companyIds: string[],
  email: string
): Promise<string | null> {
  const em = email.trim().toLowerCase();
  if (!em) return null;
  for (const cid of companyIds) {
    const rows = await getLocalCompanyUsersRecords(cid);
    const match = rows.find(
      (r) =>
        r.username.toLowerCase() === em ||
        r.displayName.toLowerCase() === em ||
        r.username.toLowerCase() === em.split("@")[0]
    );
    if (match?.username) return match.username;
  }
  const localPart = em.split("@")[0];
  return localPart || null;
}

/** Fresh token + new Firebase invite — existing shared user ko dubara bhejo. */
export async function resendPlServerShareInvite(input: {
  tokenId: string;
  recipientEmail: string;
  displayName: string;
  allowedCompanyIds: string[];
  senderUserId: string;
  senderEmail?: string | null;
  senderName?: string | null;
  serverUrls: string[];
  publicHost?: string;
  serverPort?: number;
  gateLabel?: string;
  companyNames?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const api = getElectronLocalServerApi();
  if (!api?.rotateAccessToken) {
    return { ok: false, reason: "Local server is not available on this device." };
  }

  const email = input.recipientEmail.trim().toLowerCase();
  const companyIds = input.allowedCompanyIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (!email.includes("@")) {
    return { ok: false, reason: "Invalid user email." };
  }
  if (!companyIds.length) {
    return { ok: false, reason: "No companies on this share." };
  }

  const recipientUid = await resolveRecipientUidByEmail(email);
  if (!recipientUid) {
    return {
      ok: false,
      reason: `${email} is not on Pocket Ledger yet. They must sign up with this Gmail first.`,
    };
  }

  const rotated = await api.rotateAccessToken(input.tokenId, {
    label: input.displayName.trim() || email,
    allowedCompanyIds: companyIds,
  });
  if (!rotated.ok || !rotated.token) {
    return { ok: false, reason: "Could not refresh share token for this user." };
  }

  const urls = buildPlServerInviteUrlList({
    urls: input.serverUrls,
    publicHost: input.publicHost,
    port: input.serverPort,
  });
  const primary = pickDefaultPlServerShareUrl(urls) || urls[0] || "";
  if (!primary) {
    return { ok: false, reason: "Server is not running — start sharing first, then resend." };
  }

  const loginUsername = (await resolveLoginUsernameForShareEmail(companyIds, email)) || email.split("@")[0] || "";

  const invite = await sendLocalServerShareInviteAlert({
    recipientEmail: email,
    senderUserId: input.senderUserId,
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    serverUrl: primary,
    serverUrls: urls.length ? urls : [primary],
    serverPort: input.serverPort,
    accessToken: rotated.token,
    gateLabel: input.gateLabel || "Shared Pocket Ledger server",
    tokenLabel: input.displayName.trim() || email,
    companyNames: input.companyNames,
    companyId: companyIds.length === 1 ? companyIds[0]! : null,
    loginUsername,
  });

  if (invite.ok === false) {
    return { ok: false, reason: invite.reason };
  }

  return { ok: true };
}

export function notificationToShareConnectInput(n: Record<string, unknown>): {
  serverUrls: string[];
  accessToken: string;
  gateLabel?: string;
  companyId?: string | null;
  serverPort?: number;
} | null {
  const accessToken = String(n.accessToken || "").trim();
  if (!accessToken) return null;
  const opts = localServerShareAlertUrlOptions(n);
  const serverUrls = opts.map((o) => o.url);
  if (!serverUrls.length) return null;
  const serverPort = Number(n.serverPort) || 0;
  return {
    serverUrls,
    accessToken,
    gateLabel: String(n.gateLabel || n.tokenLabel || "Shared server").trim() || undefined,
    companyId: String(n.companyId || "").trim() || null,
    serverPort: serverPort > 0 ? serverPort : undefined,
  };
}

/** Invite dropdown se URL pick hote hi stale gate (galat port) update karo. */
export function syncPlServerGateUrlForInvite(input: {
  serverUrl: string;
  accessToken: string;
  gateLabel?: string;
  serverPort?: number;
}): GateRecord | null {
  const tok = String(input.accessToken || "").trim();
  if (!tok) return null;
  const port = Number(input.serverPort) || 0;
  let url = normalizeServerUrl(input.serverUrl);
  if (!url) return null;
  if (port > 0) {
    url = rewritePlServerListingUrlsPort([url], port)[0] || url;
  }
  let gate =
    findGateByUrlAndToken(url, tok) ??
    listGates().find((g) => g.type === "local_server" && (g.accessToken || "").trim() === tok) ??
    null;
  if (!gate) {
    gate = addLocalServerGate({
      label: input.gateLabel?.trim() || "Shared server",
      serverUrl: url,
      accessToken: tok,
    });
  } else {
    const prevUrl = normalizeServerUrl(gate.serverUrl || "");
    if (prevUrl !== url || (gate.accessToken || "").trim() !== tok) {
      gate = updateLocalServerGate(gate.id, {
        label: gate.label,
        serverUrl: url,
        accessToken: tok,
      });
    }
  }
  const active = getActiveGate();
  if (
    active.type === "local_server" &&
    (active.accessToken || "").trim() === tok
  ) {
    writeActiveGateId(gate.id);
    applyActiveGateRuntime(gate);
    dispatchGateChanged();
  }
  return gate;
}
