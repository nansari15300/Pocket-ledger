"use client";

import { addLocalServerGate, listGates, normalizeServerUrl } from "@/lib/gates/gateStore";
import { refreshActiveLocalServerGateContext } from "@/lib/gates/gateRuntime";
import { applyPlServerAccessContextPayload } from "@/lib/plServerAccessContext";
import { persistDevClientAccessToken } from "@/lib/plServerAccessContext";
import { plServerRemoteCompanyLogin } from "@/lib/plServerRemoteCompanyLogin";
import { setLocalAuthToken } from "@/lib/writeGateway/legacy/localApiClient";
import { appNavHref } from "@/lib/appNavHref";
import type { GateRecord } from "@/lib/gates/gateTypes";
import { writeActiveGateId } from "@/lib/gates/gateStore";

export type ConnectFromShareAlertInput = {
  serverUrl: string;
  accessToken: string;
  gateLabel?: string;
  companyId?: string | null;
  username: string;
  password: string;
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

/** Messages invite: pick IP → credentials → gate + company selector ready. */
export async function connectFromLocalServerShareAlert(
  input: ConnectFromShareAlertInput
): Promise<ConnectFromShareAlertResult> {
  const serverUrl = normalizeServerUrl(input.serverUrl);
  const accessToken = String(input.accessToken || "").trim();
  const username = String(input.username || "").trim();
  const password = String(input.password || "").trim();
  if (!serverUrl || !accessToken) {
    throw new Error("Invite link is incomplete — ask the server owner to resend.");
  }
  if (!username || !password) {
    throw new Error("Enter login username and password from the server owner.");
  }

  persistDevClientAccessToken(accessToken);

  let gate = findMatchingGate(serverUrl, accessToken);
  if (!gate) {
    gate = addLocalServerGate({
      label: input.gateLabel?.trim() || "Shared server",
      serverUrl,
      accessToken,
    });
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

  const companyId = String(input.companyId || "").trim();
  const allowedIds = ctx.allowedCompanyIds;
  const pickCompanyId =
    companyId && (allowedIds === null || (allowedIds || []).includes(companyId))
      ? companyId
      : (ctx.companies || [])[0]?.id || "";

  if (pickCompanyId) {
    const login = await plServerRemoteCompanyLogin(pickCompanyId, username, password, { gate });
    setLocalAuthToken(pickCompanyId, login.token, login.user);
    return {
      gate,
      companyId: pickCompanyId,
      navigateTo: appNavHref("/gate"),
    };
  }

  return {
    gate,
    navigateTo: appNavHref("/gate"),
  };
}
