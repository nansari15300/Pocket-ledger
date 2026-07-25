/**
 * Dev-only: start/stop Electron static server (not bundled by Next/Turbopack).
 * Usage: node scripts/dev-pl-local-server-cli.mjs <action> '<json payload>'
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Parent spawn parses stdout JSON — trace/human logs stderr par bhejo. */
console.log = (...args) => console.error(...args);

export const PL_DEV_CLI_RESULT_MARKER = "__PL_DEV_CLI_RESULT__";

function resolveLocalAppServerModule(projectRoot) {
  const candidates = [
    path.join(projectRoot, "electron", "localAppServer.js"),
    path.join(projectRoot, "localAppServer.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  throw new Error(
    `Cannot find localAppServer.js (checked: ${candidates.join(", ")})`
  );
}

const localAppServer = resolveLocalAppServerModule(root);

const DEV_USER_DATA = path.join(root, ".data", "pl-dev-server-userdata");
const RUNTIME_FILE = path.join(DEV_USER_DATA, "pl-dev-server-runtime.json");
const SHAREABLE_COMPANIES_FILE = path.join(DEV_USER_DATA, "pl-dev-shareable-companies.json");

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
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch (e) {
    if (!e || e.code !== "ESRCH") {
      /* already gone */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
}

function readDevWebPortCandidates() {
  const out = [];
  const add = (value) => {
    const port = Number(value || "");
    if (Number.isFinite(port) && port > 0 && port < 65536 && !out.includes(port)) out.push(port);
  };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, ".pl-dev-web-port.json"), "utf8"));
    add(raw.port);
  } catch {
    /* ignore */
  }
  add(process.env.PORT);
  add(process.env.NEXT_DEV_PORT);
  add(3000);
  add(4500);
  return out;
}

async function invokeDevHostBridge(type, payload = {}) {
  const ports = readDevWebPortCandidates();
  let lastError = null;
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/dev-pl-host-bridge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invoke", type, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (port !== ports[0]) {
          try {
            fs.writeFileSync(path.join(root, ".pl-dev-web-port.json"), JSON.stringify({ port }), "utf8");
          } catch {}
        }
        return data.result;
      }
      lastError =
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        `host_bridge_http_${res.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError || "host_bridge_unavailable");
}

function readShareableCompaniesSnapshot() {
  try {
    const raw = JSON.parse(fs.readFileSync(SHAREABLE_COMPANIES_FILE, "utf8"));
    const rows = Array.isArray(raw?.companies) ? raw.companies : [];
    const out = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        ...row,
        id,
        name: String(row.name || id).trim() || id,
        storageOption: "local",
      });
    }
    return out;
  } catch {
    return [];
  }
}

function registerDevHostBridgeProviders() {
  localAppServer.setShareableCompaniesProvider(async () => {
    const snapshot = readShareableCompaniesSnapshot();
    if (snapshot.length > 0) return snapshot;
    try {
      const rows = await invokeDevHostBridge("list_shareable_companies", {});
      if (Array.isArray(rows) && rows.length > 0) return rows;
      return snapshot;
    } catch {
      return snapshot;
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

  localAppServer.setCompanyDeltaExportProvider(async (companyId) => {
    try {
      return await invokeDevHostBridge("export_delta_bundle", { companyId });
    } catch {
      return null;
    }
  });

  localAppServer.setCompanyDeltaCollectionExportProvider(async (companyId, collection) => {
    try {
      return await invokeDevHostBridge("export_delta_collection", { companyId, collection });
    } catch {
      return null;
    }
  });

  localAppServer.setAttachmentBlobProvider(async (companyId, ref) => {
    try {
      const payload = await invokeDevHostBridge("read_attachment", { companyId, ref });
      if (!payload || typeof payload !== "object" || !payload.base64) return null;
      const buffer = Buffer.from(String(payload.base64), "base64");
      if (!buffer.length) return null;
      return {
        buffer,
        contentType: String(payload.contentType || "application/octet-stream"),
      };
    } catch {
      return null;
    }
  });

  localAppServer.setAttachmentBlobWriteProvider(async (companyId, body) => {
    try {
      const result = await invokeDevHostBridge("write_attachment", { companyId, body });
      return result && typeof result === "object" ? result : { ok: false, error: "write_failed" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "write_failed",
      };
    }
  });

  localAppServer.setCompanyDeltaPushProvider(async (companyId, collection, docs, meta) => {
    if (meta?.hostSelfPublish) {
      return {
        ok: true,
        applied: 0,
        skipped: Array.isArray(docs) ? docs.length : 0,
        received: Array.isArray(docs) ? docs.length : 0,
        hostSelfPublish: true,
      };
    }
    try {
      const result = await invokeDevHostBridge("delta_push", { companyId, collection, docs });
      return result && typeof result === "object" ? result : { ok: false, error: "push_failed" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "push_failed",
      };
    }
  });

  localAppServer.setCompanyRegistryPatchProvider(async (companyId, patch) => {
    try {
      const result = await invokeDevHostBridge("patch_company_registry", { companyId, ...patch });
      return result && typeof result === "object" ? result : { ok: false, error: "registry_patch_failed" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "registry_patch_failed",
      };
    }
  });

  localAppServer.setAuthoritativeCompanyDocUpsertProvider(async (payload) => {
    try {
      const result = await invokeDevHostBridge("authoritative_upsert", payload || {});
      return result && typeof result === "object" ? result : { ok: false, error: "bridge_upsert_failed" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "bridge_upsert_failed",
      };
    }
  });

  localAppServer.setDeltaHealthProvider(async (companyId) => {
    try {
      return await invokeDevHostBridge("delta_health", { companyId });
    } catch {
      return { ok: false, error: "delta_health_unavailable" };
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
    case "getConfig":
      result = localAppServer.loadConfig(ud);
      break;
    case "setConfig": {
      const partial =
        payload && typeof payload.partial === "object" && payload.partial ? payload.partial : {};
      result = localAppServer.saveConfig(ud, partial);
      break;
    }
    case "getStatus":
      result = localAppServer.getStatus(ud);
      break;
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
      const partial =
        payload && typeof payload.partial === "object" && payload.partial
          ? payload.partial
          : null;
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
      const port = await localAppServer.restartSharingServer(ud);
      writeRuntime(true, port);
      result = { ok: true, port, status: localAppServer.getStatus(ud) };
      break;
    }
    default:
      throw new Error(`UNKNOWN_ACTION:${action}`);
  }

  process.stdout.write(`${PL_DEV_CLI_RESULT_MARKER}${JSON.stringify(result)}`);
}

main().catch((e) => {
  process.stderr.write(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
