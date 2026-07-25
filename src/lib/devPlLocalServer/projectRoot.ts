import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function hasProjectMarker(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "package.json")) &&
    fs.existsSync(path.join(dir, "electron", "localAppServer.js"))
  );
}

function findProjectRootFrom(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    if (hasProjectMarker(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Repo root — CLI + Next API dono `.data/pl-dev-server-userdata` par likhe/padhein.
 * Turbopack bundle me `import.meta.url` galat ho sakta hai; pehle `cwd` / `PL_PROJECT_ROOT`.
 */
export function resolvePlDevProjectRoot(): string {
  const fromEnv = String(process.env.PL_PROJECT_ROOT || "").trim();
  if (fromEnv && hasProjectMarker(fromEnv)) return path.resolve(fromEnv);

  const fromCwd = findProjectRootFrom(process.cwd());
  if (fromCwd) return fromCwd;

  try {
    const fromModule = findProjectRootFrom(path.dirname(fileURLToPath(import.meta.url)));
    if (fromModule) return fromModule;
  } catch {
    /* ignore */
  }

  return process.cwd();
}
