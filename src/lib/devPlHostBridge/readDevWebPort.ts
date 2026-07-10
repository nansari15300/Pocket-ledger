import fs from "node:fs";
import path from "node:path";

const DEFAULT_DEV_WEB_PORT = 3000;

/** Next dev port — `.pl-dev-web-port.json` (Electron / dev-stable) ya fallback 3000. */
export function readDevWebPort(): number {
  try {
    const file = path.join(process.cwd(), ".pl-dev-web-port.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { port?: unknown };
    const port = Number(raw.port);
    if (Number.isFinite(port) && port > 0 && port < 65536) return port;
  } catch {
    /* ignore */
  }
  const envPort = Number(process.env.PORT || process.env.NEXT_DEV_PORT || "");
  if (Number.isFinite(envPort) && envPort > 0 && envPort < 65536) return envPort;
  return DEFAULT_DEV_WEB_PORT;
}

export function devHostBridgeQueueDir(): string {
  return path.join(process.cwd(), ".data", "pl-dev-host-bridge");
}
