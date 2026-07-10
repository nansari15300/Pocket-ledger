"use client";

import { addLocalServerGate, listGates, normalizeServerUrl } from "@/lib/gates/gateStore";
import { refreshActiveLocalServerGateContext, applyActiveGateRuntime } from "@/lib/gates/gateRuntime";
import { applyPlServerAccessContextPayload } from "@/lib/plServerAccessContext";
import { persistDevClientAccessToken } from "@/lib/plServerAccessContext";
import { plServerRemoteCompanyLogin } from "@/lib/plServerRemoteCompanyLogin";
import { verifyPlServerCompanyMirrorReady } from "@/lib/gates/gateServerFetch";
import { setLocalAuthToken } from "@/lib/writeGateway/legacy/localApiClient";
import { appNavHref } from "@/lib/appNavHref";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { writeActiveGateId } from "@/lib/gates/gateStore";
import { tryPlServerUrlsUntilConnected } from "@/lib/plServerShareInviteFlow";
import { grantOpenLocalCompanySession } from "@/lib/companyUnlockGate";
import { saveOfflineUnlockSession } from "@/lib/offlineCompanyUnlockRemember";
import { writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";

export type ConnectFromShareAlertInput = {
  serverUrl: string;
  serverUrls?: string[];
  accessToken: string;
  gateLabel?: string;
  companyId?: string | null;
  username: string;
  password: string;
  serverPort?: number;
};

export type ConnectFromShareAlertResult = {
  gate: GateRecord;
  companyId?: string;
  navigateTo: string;
};

function findMatchingGate(serverUrl: string, accessToken: string): GateRecord | null {
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

/** Same invite token — user ne dropdown se naya IP choose kiya ho to purana gate mil jaye. */
function findGateByAccessToken(accessToken: string): GateRecord | null {
  const tok = accessToken.trim();
  if (!tok) return null;
  return (
    listGates().find((g) => g.type === "local_server" && (g.accessToken || "").trim() === tok) ?? null
  );
}

/** Messages invite: pick IP → credentials → gate + company open (single login). */
export async function connectFromLocalServerShareAlert(
  input: ConnectFromShareAlertInput
): Promise<ConnectFromShareAlertResult> {
  const accessToken = String(input.accessToken || "").trim();
  const username = String(input.username || "").trim();
  const password = String(input.password || "").trim();
  if (!accessToken) {
    throw new Error("Invite link is incomplete — ask the server owner to resend.");
  }
  if (!username || !password) {
    throw new Error("Enter login username and password from the server owner.");
  }

  persistDevClientAccessToken(accessToken);

  const preferredUrl = normalizeServerUrl(input.serverUrl);
  const allUrls =
    (input.serverUrls || []).map((u) => normalizeServerUrl(u)).filter(Boolean).length > 0
      ? (input.serverUrls || []).map((u) => normalizeServerUrl(u)).filter(Boolean)
      : preferredUrl
        ? [preferredUrl]
        : [];
  if (!allUrls.length) {
    throw new Error("Pick a server address from the list.");
  }

  const hit = await tryPlServerUrlsUntilConnected(
    allUrls,
    accessToken,
    preferredUrl || undefined,
    input.serverPort
  );
  if (!hit) {
    const tried = preferredUrl || allUrls[0] || "server";
    throw new Error(
      `Cannot reach host at ${tried}. On dev/LAN pick "This PC" or "LAN" — Public IP often times out on the same network.`
    );
  }
  const serverUrl = hit.serverUrl;

  let gate = findMatchingGate(serverUrl, accessToken) ?? findGateByAccessToken(accessToken);
  if (!gate) {
    gate = addLocalServerGate({
      label: input.gateLabel?.trim() || "Shared server",
      serverUrl,
      accessToken,
    });
  } else {
    const { updateLocalServerGate } = await import("@/lib/gates/gateStore");
    const prevUrl = normalizeServerUrl(gate.serverUrl || "");
    if (prevUrl !== serverUrl || (gate.accessToken || "").trim() !== accessToken) {
      gate = updateLocalServerGate(gate.id, {
        label: gate.label,
        serverUrl,
        accessToken,
      });
    }
  }

  const ctx = await refreshActiveLocalServerGateContext(gate);
  if (ctx.error) {
    throw new Error(ctx.error);
  }
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

  const companyId = String(input.companyId || "").trim();
  const allowedIds = ctx.allowedCompanyIds;
  const pickCompanyId =
    companyId && (allowedIds === null || (allowedIds || []).includes(companyId))
      ? companyId
      : (ctx.companies || [])[0]?.id || "";

  if (pickCompanyId) {
    const login = await plServerRemoteCompanyLogin(pickCompanyId, username, password, { gate });
    setLocalAuthToken(pickCompanyId, login.token, login.user);
    grantOpenLocalCompanySession(pickCompanyId, {
      role: login.user.role === "owner" ? "owner" : "viewer",
    });
    saveOfflineUnlockSession(undefined, pickCompanyId, 7, login.token, login.user);
    writeSelectedCompanyId(pickCompanyId);

    const mirrorReady = await verifyPlServerCompanyMirrorReady(serverUrl, accessToken, pickCompanyId);
    if (!mirrorReady.ok) {
      throw new Error(
        mirrorReady.error ||
          "Host cannot serve company ledger yet — check sharing and that the company is open on the server PC."
      );
    }

    const { ensurePlServerStaffCompanyShell } = await import("@/lib/plServerStaffCompanyConnect");
    await ensurePlServerStaffCompanyShell(pickCompanyId);

    const { isPlServerThinStaffClient } = await import("@/lib/plServerThinStaffClient");
    const { preparePlServerStaffCompanyConnect } = await import("@/lib/plServerStaffCompanyConnect");
    if (isPlServerThinStaffClient()) {
      void preparePlServerStaffCompanyConnect(pickCompanyId, {
        pullFullLedger: true,
        background: true,
      });
    }
    return {
      gate,
      companyId: pickCompanyId,
      navigateTo: appNavHref("/dashboard"),
    };
  }

  return {
    gate,
    navigateTo: appNavHref("/gate"),
  };
}
