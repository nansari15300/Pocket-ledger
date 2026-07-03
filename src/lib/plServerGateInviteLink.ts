"use client";

import { appNavHref } from "@/lib/appNavHref";
import { POCKET_LEDGER_HOSTED_API_ORIGIN } from "@/lib/billingApiOrigin";
import { normalizeServerUrl } from "@/lib/gates/gateStore";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

export const PL_GATE_SERVER_PARAM = "pl_gate_server";
export const PL_GATE_TOKEN_PARAM = "pl_gate_token";
export const PL_GATE_LABEL_PARAM = "pl_gate_label";

export type PlGatePrefillPayload = {
  serverUrl: string;
  accessToken: string;
  gateLabel?: string;
};

/** Invite link opens recipient app Gate page with server + token prefilled. */
export function buildPlServerGateInviteLink(input: {
  serverUrl: string;
  accessToken: string;
  gateLabel?: string;
  appOrigin?: string;
}): string {
  const serverUrl = normalizeServerUrl(input.serverUrl);
  const token = String(input.accessToken || "").trim();
  if (!serverUrl || !token) return "";

  const origin =
    input.appOrigin?.trim() ||
    (typeof window !== "undefined" && !isStaticAppBuild() ? window.location.origin : "") ||
    POCKET_LEDGER_HOSTED_API_ORIGIN;

  const path = appNavHref("/gate");
  const u = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
  u.searchParams.set(PL_GATE_SERVER_PARAM, serverUrl);
  u.searchParams.set(PL_GATE_TOKEN_PARAM, token);
  const label = String(input.gateLabel || "").trim();
  if (label) u.searchParams.set(PL_GATE_LABEL_PARAM, label);
  return u.toString();
}

export function readPlGatePrefillFromLocation(): PlGatePrefillPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const serverUrl = normalizeServerUrl(u.searchParams.get(PL_GATE_SERVER_PARAM) || "");
    const accessToken = String(u.searchParams.get(PL_GATE_TOKEN_PARAM) || "").trim();
    if (!serverUrl || !accessToken) return null;
    const gateLabel = String(u.searchParams.get(PL_GATE_LABEL_PARAM) || "").trim();
    return { serverUrl, accessToken, gateLabel: gateLabel || undefined };
  } catch {
    return null;
  }
}

/** One-time read — strip sensitive params from address bar after prefill. */
export function readAndStripPlGatePrefillFromLocation(): PlGatePrefillPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const serverUrl = normalizeServerUrl(u.searchParams.get(PL_GATE_SERVER_PARAM) || "");
    const accessToken = String(u.searchParams.get(PL_GATE_TOKEN_PARAM) || "").trim();
    if (!serverUrl || !accessToken) return null;
    const gateLabel = String(u.searchParams.get(PL_GATE_LABEL_PARAM) || "").trim();
    u.searchParams.delete(PL_GATE_SERVER_PARAM);
    u.searchParams.delete(PL_GATE_TOKEN_PARAM);
    u.searchParams.delete(PL_GATE_LABEL_PARAM);
    const clean = `${u.pathname}${u.search}${u.hash}`;
    window.history.replaceState(window.history.state, "", clean);
    return { serverUrl, accessToken, gateLabel: gateLabel || undefined };
  } catch {
    return null;
  }
}

/** Pick sensible default server URL from status list (prefer public/LAN over loopback). */
export function pickDefaultPlServerShareUrl(urls: string[]): string {
  const norm = urls.map((u) => normalizeServerUrl(u)).filter(Boolean);
  if (!norm.length) return "";
  const nonLoopback = norm.filter((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(u));
  return (nonLoopback[0] || norm[0])!;
}
