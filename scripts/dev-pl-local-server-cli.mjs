/**
 * Dev-only: start/stop Electron static server (not bundled by Next/Turbopack).
 * Usage: node scripts/dev-pl-local-server-cli.mjs <action> '<json payload>'
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localAppServer = require(path.join(root, "electron", "localAppServer.js"));

const DEV_USER_DATA = path.join(root, ".data", "pl-dev-server-userdata");
const RUNTIME_FILE = path.join(DEV_USER_DATA, "pl-dev-server-runtime.json");

function userDataPath() {
  fs.mkdirSync(DEV_USER_DATA, { recursive: true });
  return DEV_USER_DATA;
}

function writeRuntime(running, port) {
  fs.mkdirSync(DEV_USER_DATA, { recursive: true });
  fs.writeFileSync(
    RUNTIME_FILE,
    JSON.stringify({ running, port: port ?? null, pid: running ? process.pid : null }),
    "utf8"
  );
}

function readRuntimeFile() {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, "utf8"));
  } catch {
    return {};
  }
}

/** Previous CLI daemon (start/restart) — alag process me sharing server chalta hai. */
async function killExistingServerProcess() {
  const rt = readRuntimeFile();
  const pid = Number(rt.pid);
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return;
  try {
    process.kill(pid);
  } catch (e) {
    if (!e || e.code !== "ESRCH") {
      /* already gone */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

function readDevWebPort() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, ".pl-dev-web-port.json"), "utf8"));
    const port = Number(raw.port);
    if (Number.isFinite(port) && port > 0 && port < 65536) return port;
  } catch {
    /* ignore */
  }
  const envPort = Number(process.env.PORT || process.env.NEXT_DEV_PORT || "");
  if (Number.isFinite(envPort) && envPort > 0 && envPort < 65536) return envPort;
  return 3000;
}

async function invokeDevHostBridge(type, payload = {}) {
  const port = readDevWebPort();
  const res = await fetch(`http://127.0.0.1:${port}/api/dev-pl-host-bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "invoke", type, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      `host_bridge_http_${res.status}`;
    throw new Error(msg);
  }
  return data.result;
}

function registerDevHostBridgeProviders() {
  localAppServer.setShareableCompaniesProvider(async () => {
    try {
      const rows = await invokeDevHostBridge("list_shareable_companies", {});
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  });

  localAppServer.setLocalCompanyAuthProvider(async (companyId, username, password) => {
    try {
      const result = await invokeDevHostBridge("validate_login", { companyId, username, password });
      if (result && typeof result === "object") return result;
      return { ok: false, error: "Host bridge login failed" };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Host browser bridge unavailable — keep npm run dev tab open on the server PC.",
      };
    }
  });

  localAppServer.setCompanyMirrorExportProvider(async (companyId) => {
    try {
      return await invokeDevHostBridge("export_mirror_bundle", { companyId });
    } catch {
      return null;
    }
  });

  localAppServer.setCompanyMirrorCollectionExportProvider(async (companyId, collection) => {
    try {
      return await invokeDevHostBridge("export_mirror_collection", { companyId, collection });
    } catch {
      return null;
    }
  });

  localAppServer.setMirrorHealthProvider(async (companyId) => {
    try {
      return await invokeDevHostBridge("mirror_health", { companyId });
    } catch {
      return { ok: false, error: "mirror_health_unavailable" };
    }
  });
}

function ensureDeps() {
  const outDir = path.join(root, "out");
  const staticPublicDir = fs.existsSync(outDir) ? outDir : path.join(root, "public");
  localAppServer.setServerDeps({
    staticPublicDir,
    isPackaged: false,
    rewriteReconciliationDocumentUrl: (requestUrl) => {
      const pathname = (requestUrl.pathname || "/").replace(/\/+$/, "") || "/";
      if (pathname.includes("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) return null;
      if (pathname === "/reconciliation") return `/reconciliation/index.html${requestUrl.search || ""}`;
      const legacy = pathname.match(/^\/reconciliation\/([^/]+)$/);
      if (legacy && legacy[1] !== "__placeholder__") {
        return `/reconciliation/index.html${requestUrl.search || ""}`;
      }
      return null;
    },
    isAllowedFirebaseProxyTarget: (targetUrl) => {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
        const host = parsed.hostname.toLowerCase();
        return (
          host.includes("firebasestorage.googleapis.com") ||
          host.includes("firebasestorage.app") ||
          host.includes("storage.googleapis.com")
        );
      } catch {
        return false;
      }
    },
  });
  registerDevHostBridgeProviders();
}

async function main() {
  const action = process.argv[2] || "";
  const payloadRaw = process.argv[3] || "{}";
  let payload = {};
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    payload = {};
  }

  ensureDeps();
  const ud = userDataPath();

  let result;
  switch (action) {
    case "start": {
      await killExistingServerProcess();
      localAppServer.saveConfig(ud, { userWantsRunning: true });
      const port = await localAppServer.startStaticServer(ud);
      writeRuntime(true, port);
      result = { ok: true, port, status: localAppServer.getStatus(ud) };
      break;
    }
    case "stop": {
      await killExistingServerProcess();
      localAppServer.saveConfig(ud, { userWantsRunning: false });
      await localAppServer.stopStaticServer();
      writeRuntime(false, null);
      result = { ok: true, status: localAppServer.getStatus(ud) };
      break;
    }
    case "restart": {
      const partial = payload.partial;
      if (partial && typeof partial === "object") {
        localAppServer.saveConfig(ud, partial);
      }
      await killExistingServerProcess();
      await localAppServer.stopStaticServer();
      const cfg = localAppServer.loadConfig(ud);
      if (!localAppServer.shouldHostLocalServer(cfg)) {
        writeRuntime(false, null);
        result = { ok: true, port: null, status: localAppServer.getStatus(ud) };
        break;
      }
      localAppServer.saveConfig(ud, { userWantsRunning: true });
      const port = await localAppServer.startStaticServer(ud);
      writeRuntime(true, port);
      result = { ok: true, port, status: localAppServer.getStatus(ud) };
      break;
    }
    default:
      throw new Error(`UNKNOWN_ACTION:${action}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch((e) => {
  process.stderr.write(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
