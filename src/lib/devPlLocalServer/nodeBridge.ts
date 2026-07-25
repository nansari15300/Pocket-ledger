import { spawn } from "node:child_process";
import path from "node:path";
import type { LocalAppServerConfig } from "@/lib/electronLocalServer";
import { resolvePlDevProjectRoot } from "@/lib/devPlLocalServer/projectRoot";
import {
  createAccessToken,
  getAccessTokenSecret,
  getDevStatus,
  listAccessTokens,
  loadDevConfig,
  loadDevShareableCompaniesSnapshot,
  revokeAccessToken,
  rotateAccessToken,
  saveDevConfig,
  saveDevShareableCompaniesSnapshot,
  updateAccessToken,
} from "@/lib/devPlLocalServer/store";

export function isDevPlLocalServerEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_PL_DEV_LOCAL_SERVER === "1"
  );
}

function isLoopbackHostHeader(hostRaw: string | null | undefined): boolean {
  const host = String(hostRaw || "")
    .split(":")[0]
    .toLowerCase()
    .trim();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** `next start` on localhost + browser web dev — static side-server ke bina bhi API chalu. */
export function isDevPlLocalServerEnabledForRequest(req?: Request): boolean {
  if (isDevPlLocalServerEnabled()) return true;
  if (!req) return false;
  const host = req.headers.get("host");
  const fwd = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim();
  return isLoopbackHostHeader(host) || isLoopbackHostHeader(fwd);
}

const PL_DEV_CLI_RESULT_MARKER = "__PL_DEV_CLI_RESULT__";

/** CLI stdout may include trace lines — extract first complete JSON object. */
function parseDevPlCliStdout(text: string): unknown | null {
  const markerIdx = text.indexOf(PL_DEV_CLI_RESULT_MARKER);
  const scanFrom = markerIdx >= 0 ? markerIdx + PL_DEV_CLI_RESULT_MARKER.length : 0;
  const start = text.indexOf("{", scanFrom);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function runDevPlCli(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const root = resolvePlDevProjectRoot();
  const scriptPath = path.join(root, "scripts", "dev-pl-local-server-cli.mjs");
  const payloadJson = JSON.stringify(payload);
  /** start/restart daemon process exit nahi karta — stdout JSON par resolve karo, close ka wait mat karo. */
  const longRunningDaemon = action === "start" || action === "restart";

  const electronModules = path.join(root, "electron", "node_modules");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, action, payloadJson], {
      cwd: root,
      env: {
        ...process.env,
        NODE_PATH: [electronModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finishOk = (value: unknown) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const tryResolveFromStdout = () => {
      const parsed = parseDevPlCliStdout(stdout);
      if (parsed == null) return;
      if (longRunningDaemon) child.unref();
      finishOk(parsed);
    };

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (longRunningDaemon) tryResolveFromStdout();
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => finishErr(err instanceof Error ? err : new Error(String(err))));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finishErr(new Error(stderr.trim() || `dev-pl-local-server-cli exited ${code}`));
        return;
      }
      const parsed = stdout.trim() ? parseDevPlCliStdout(stdout) : {};
      if (parsed == null) {
        finishErr(new Error(`Invalid CLI output: ${stdout.slice(0, 200)}`));
        return;
      }
      finishOk(parsed);
    });
  });
}

export { resolvePlAccessContextFromHeaders } from "@/lib/devPlLocalServer/store";

export async function devPlLocalServerHandle(
  action: string,
  payload: Record<string, unknown> = {},
  opts: { requestAllowed?: boolean } = {}
): Promise<unknown> {
  if (!opts.requestAllowed && !isDevPlLocalServerEnabled()) {
    throw new Error("DEV_PL_LOCAL_SERVER_DISABLED");
  }
  // Note: route handler gates with isDevPlLocalServerEnabledForRequest (loopback `next start`).

  switch (action) {
    case "getConfig": {
      /** Dev web me Settings page ka saved JSON hi source of truth rahe. */
      return loadDevConfig();
    }
    case "getStatus":
      return getDevStatus();
    case "getShareableCompaniesSnapshot":
      return loadDevShareableCompaniesSnapshot();
    case "saveShareableCompaniesSnapshot":
      return saveDevShareableCompaniesSnapshot(payload.companies);
    case "setConfig": {
      const partial = (payload.partial as Record<string, unknown>) || {};
      const saved = saveDevConfig(partial as Parameters<typeof saveDevConfig>[0]);
      /** Host file = CLI path — refresh par wahi load ho. */
      try {
        await runDevPlCli("setConfig", { partial: saved });
      } catch {
        /* saveDevConfig already wrote disk */
      }
      return saved;
    }
    case "start":
      saveDevConfig({ userWantsRunning: true });
      return runDevPlCli(action, payload);
    case "stop":
      saveDevConfig({ userWantsRunning: false });
      return runDevPlCli(action, payload);
    case "restart": {
      const partial = (payload.partial as Partial<LocalAppServerConfig>) ?? {};
      const saved =
        partial && typeof partial === "object" && Object.keys(partial).length > 0
          ? saveDevConfig(partial)
          : loadDevConfig();
      return runDevPlCli(action, { partial: saved });
    }
    case "listAccessTokens":
      return listAccessTokens();
    case "createAccessToken":
      return createAccessToken((payload.input as Parameters<typeof createAccessToken>[0]) || {});
    case "updateAccessToken": {
      const id = String(payload.id || "");
      const token = updateAccessToken(id, (payload.input as Parameters<typeof updateAccessToken>[1]) || {});
      if (!token) return { ok: false };
      return { ok: true, token };
    }
    case "revokeAccessToken": {
      const id = String(payload.id || "");
      const ok = revokeAccessToken(id);
      return { ok };
    }
    case "getAccessTokenSecret": {
      const id = String(payload.id || "");
      const secret = getAccessTokenSecret(id);
      if (!secret) return { ok: false };
      return { ok: true, ...secret };
    }
    case "rotateAccessToken": {
      const id = String(payload.id || "");
      const rotated = rotateAccessToken(id, (payload.input as Parameters<typeof rotateAccessToken>[1]) || {});
      if (!rotated) return { ok: false };
      return { ok: true, ...rotated };
    }
    default:
      throw new Error(`UNKNOWN_ACTION:${action}`);
  }
}
