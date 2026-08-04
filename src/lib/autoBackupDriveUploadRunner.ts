"use client";

import type { AutoBackupDriveUploadProgress } from "@/lib/autoBackupDriveUpload";

export type AutoBackupDriveUploadRunStatus = "idle" | "running" | "completed" | "failed";

export type AutoBackupDriveUploadRunState = {
  status: AutoBackupDriveUploadRunStatus;
  companyName: string | null;
  startedAt: number | null;
  updatedAt: number | null;
  progress: AutoBackupDriveUploadProgress | null;
  error: string | null;
};

type Listener = (state: AutoBackupDriveUploadRunState) => void;

const IDLE: AutoBackupDriveUploadRunState = {
  status: "idle",
  companyName: null,
  startedAt: null,
  updatedAt: null,
  progress: null,
  error: null,
};

let state: AutoBackupDriveUploadRunState = { ...IDLE };
const listeners = new Set<Listener>();
let dismissTimer: number | null = null;

function notify() {
  for (const l of listeners) l(state);
}

function clearDismissTimer() {
  if (dismissTimer != null) {
    window.clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function setState(patch: Partial<AutoBackupDriveUploadRunState>) {
  state = { ...state, ...patch, updatedAt: Date.now() };
  notify();
}

export function subscribeAutoBackupDriveUploadRun(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getAutoBackupDriveUploadRunState(): AutoBackupDriveUploadRunState {
  return state;
}

export function isAutoBackupDriveUploadRunning(): boolean {
  return state.status === "running";
}

export function clearAutoBackupDriveUploadRunNotice(): void {
  clearDismissTimer();
  if (state.status === "completed" || state.status === "failed") {
    state = { ...IDLE };
    notify();
  }
}

function scheduleDismiss(ms = 6000): void {
  clearDismissTimer();
  dismissTimer = window.setTimeout(() => {
    if (state.status === "completed" || state.status === "failed") {
      state = { ...IDLE };
      notify();
    }
    dismissTimer = null;
  }, ms);
}

export async function runAutoBackupDriveUploadWithRunner(input: {
  companyName: string;
  run: (onProgress: (p: AutoBackupDriveUploadProgress) => void) => Promise<AutoBackupDriveUploadProgress>;
}): Promise<AutoBackupDriveUploadProgress> {
  if (state.status === "running") {
    return {
      phase: "error",
      total: 0,
      done: 0,
      uploaded: 0,
      skipped: 0,
      pruned: 0,
      error: "Drive upload already running.",
    };
  }

  clearDismissTimer();
  setState({
    status: "running",
    companyName: input.companyName,
    startedAt: Date.now(),
    progress: { phase: "listing", total: 0, done: 0, uploaded: 0, skipped: 0, pruned: 0 },
    error: null,
  });

  try {
    const result = await input.run((progress) => {
      setState({ progress });
    });
    if (result.phase === "error") {
      setState({ status: "failed", progress: result, error: result.error ?? "Drive upload failed" });
      scheduleDismiss(10_000);
    } else {
      setState({ status: "completed", progress: result, error: null });
      scheduleDismiss(8000);
    }
    return result;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const failed: AutoBackupDriveUploadProgress = {
      phase: "error",
      total: 0,
      done: 0,
      uploaded: 0,
      skipped: 0,
      pruned: 0,
      error: err,
    };
    setState({ status: "failed", progress: failed, error: err });
    scheduleDismiss(10_000);
    return failed;
  }
}
