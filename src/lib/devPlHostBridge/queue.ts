import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { devHostBridgeQueueDir } from "@/lib/devPlHostBridge/readDevWebPort";

export type DevHostBridgeJobType =
  | "validate_login"
  | "export_mirror_collection"
  | "export_mirror_bundle"
  | "list_shareable_companies"
  | "mirror_health";

export type DevHostBridgeJob = {
  id: string;
  type: DevHostBridgeJobType;
  payload: Record<string, unknown>;
  createdAt: number;
};

function ensureQueueDir(): string {
  const dir = devHostBridgeQueueDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jobPath(id: string): string {
  return path.join(ensureQueueDir(), `job-${id}.json`);
}

function resultPath(id: string): string {
  return path.join(ensureQueueDir(), `result-${id}.json`);
}

export function enqueueDevHostBridgeJob(
  type: DevHostBridgeJobType,
  payload: Record<string, unknown>
): DevHostBridgeJob {
  const id = crypto.randomBytes(8).toString("hex");
  const job: DevHostBridgeJob = { id, type, payload, createdAt: Date.now() };
  fs.writeFileSync(jobPath(id), JSON.stringify(job), "utf8");
  return job;
}

export function claimNextDevHostBridgeJob(): DevHostBridgeJob | null {
  const dir = ensureQueueDir();
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith("job-") && f.endsWith(".json"));
  } catch {
    return null;
  }
  files.sort();
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const job = JSON.parse(fs.readFileSync(full, "utf8")) as DevHostBridgeJob;
      if (job?.id) return job;
    } catch {
      try {
        fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export function completeDevHostBridgeJob(id: string, result: unknown): void {
  fs.writeFileSync(resultPath(id), JSON.stringify({ id, result, completedAt: Date.now() }), "utf8");
  try {
    fs.unlinkSync(jobPath(id));
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDevHostBridgeResult<T>(
  jobId: string,
  timeoutMs = 35000
): Promise<T | null> {
  const started = Date.now();
  const resultFile = resultPath(jobId);
  while (Date.now() - started < timeoutMs) {
    try {
      if (fs.existsSync(resultFile)) {
        const parsed = JSON.parse(fs.readFileSync(resultFile, "utf8")) as { result?: T };
        try {
          fs.unlinkSync(resultFile);
        } catch {
          /* ignore */
        }
        return (parsed.result ?? null) as T | null;
      }
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  try {
    fs.unlinkSync(jobPath(jobId));
  } catch {
    /* ignore */
  }
  return null;
}

export async function invokeDevHostBridgeJob<T>(
  type: DevHostBridgeJobType,
  payload: Record<string, unknown>,
  timeoutMs = 35000
): Promise<T | null> {
  const job = enqueueDevHostBridgeJob(type, payload);
  return waitForDevHostBridgeResult<T>(job.id, timeoutMs);
}
