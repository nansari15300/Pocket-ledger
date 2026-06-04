import { spawn } from "node:child_process";
import path from "node:path";
import {
  createAccessToken,
  getDevStatus,
  listAccessTokens,
  loadDevConfig,
  revokeAccessToken,
  saveDevConfig,
} from "@/lib/devPlLocalServer/store";

export function isDevPlLocalServerEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

async function runDevPlCli(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const scriptPath = path.join(process.cwd(), "scripts", "dev-pl-local-server-cli.mjs");
  const payloadJson = JSON.stringify(payload);

  const electronModules = path.join(process.cwd(), "electron", "node_modules");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, action, payloadJson], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_PATH: [electronModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `dev-pl-local-server-cli exited ${code}`));
        return;
      }
      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : {});
      } catch (e) {
        reject(new Error(`Invalid CLI output: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

export { resolvePlAccessContextFromHeaders } from "@/lib/devPlLocalServer/store";

export async function devPlLocalServerHandle(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<unknown> {
  if (!isDevPlLocalServerEnabled()) {
    throw new Error("DEV_PL_LOCAL_SERVER_DISABLED");
  }

  switch (action) {
    case "getStatus":
      return getDevStatus();
    case "getConfig":
      return loadDevConfig();
    case "setConfig": {
      const partial = (payload.partial as Record<string, unknown>) || {};
      return saveDevConfig(partial as Parameters<typeof saveDevConfig>[0]);
    }
    case "start":
    case "stop":
    case "restart":
      return runDevPlCli(action, payload);
    case "listAccessTokens":
      return listAccessTokens();
    case "createAccessToken":
      return createAccessToken((payload.input as Parameters<typeof createAccessToken>[0]) || {});
    case "revokeAccessToken": {
      const id = String(payload.id || "");
      const ok = revokeAccessToken(id);
      return { ok };
    }
    default:
      throw new Error(`UNKNOWN_ACTION:${action}`);
  }
}
