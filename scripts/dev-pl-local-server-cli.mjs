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
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify({ running, port: port ?? null }), "utf8");
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
      localAppServer.saveConfig(ud, { userWantsRunning: true });
      const port = await localAppServer.startStaticServer(ud);
      writeRuntime(true, port);
      result = { ok: true, port, status: localAppServer.getStatus(ud) };
      break;
    }
    case "stop": {
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
