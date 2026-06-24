"use client";

import type { PlElectronLocalServerApi } from "@/lib/electronLocalServer";

async function devPlCall<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/dev-pl-local-server", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `dev-pl-local-server ${res.status}`);
  }
  return data;
}

export function createDevPlLocalServerClientApi(): PlElectronLocalServerApi {
  return {
    getStatus: () => devPlCall("getStatus"),
    getConfig: () => devPlCall("getConfig"),
    setConfig: (partial) => devPlCall("setConfig", { partial }),
    start: () => devPlCall("start"),
    stop: () => devPlCall("stop"),
    restart: (partial) => devPlCall("restart", { partial }),
    listAccessTokens: () => devPlCall("listAccessTokens"),
    createAccessToken: (input) => devPlCall("createAccessToken", { input }),
    updateAccessToken: (id, input) => devPlCall("updateAccessToken", { id, input }),
    getAccessTokenSecret: (id) => devPlCall("getAccessTokenSecret", { id }),
    rotateAccessToken: (id, input) => devPlCall("rotateAccessToken", { id, input }),
    revokeAccessToken: (id) => devPlCall("revokeAccessToken", { id }),
  };
}
