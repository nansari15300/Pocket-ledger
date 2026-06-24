"use client";

import {
  executeCompanyBackup,
  type CompanyBackupProgress,
  type ExecuteCompanyBackupResult,
} from "@/lib/companyBackupCore";
import type { Company } from "@/hooks/useCompany";

const SESSION_KEY = "pl_company_backup_run_v1";

export type CompanyBackupRunStatus = "idle" | "running" | "completed" | "interrupted" | "failed";

export type CompanyBackupRunState = {
  status: CompanyBackupRunStatus;
  companyId: string | null;
  companyName: string | null;
  includeAttachments: boolean;
  startedAt: number | null;
  updatedAt: number | null;
  progress: CompanyBackupProgress | null;
  resultWhere: string | null;
  error: string | null;
};

type Listener = (state: CompanyBackupRunState) => void;

const IDLE: CompanyBackupRunState = {
  status: "idle",
  companyId: null,
  companyName: null,
  includeAttachments: false,
  startedAt: null,
  updatedAt: null,
  progress: null,
  resultWhere: null,
  error: null,
};

let state: CompanyBackupRunState = { ...IDLE };
const listeners = new Set<Listener>();
let activeAbort: AbortController | null = null;
let beforeUnloadBound = false;

function notify() {
  for (const l of listeners) l(state);
}

function persistSession() {
  if (typeof window === "undefined") return;
  try {
    if (state.status === "idle") {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

function bindBeforeUnload() {
  if (typeof window === "undefined" || beforeUnloadBound) return;
  beforeUnloadBound = true;
  window.addEventListener("beforeunload", (e) => {
    if (state.status !== "running") return;
    e.preventDefault();
    e.returnValue = "Backup is still running. Leaving now will stop it.";
  });
}

function setState(patch: Partial<CompanyBackupRunState>) {
  state = { ...state, ...patch, updatedAt: Date.now() };
  persistSession();
  notify();
}

/** Page refresh/close ke baad — running flag ko interrupted mark karo. */
function recoverInterruptedSession() {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CompanyBackupRunState;
    if (parsed.status === "running") {
      state = {
        ...IDLE,
        status: "interrupted",
        companyId: parsed.companyId,
        companyName: parsed.companyName,
        includeAttachments: parsed.includeAttachments,
        startedAt: parsed.startedAt,
        updatedAt: Date.now(),
        progress: {
          phase: "Interrupted",
          detail: "Backup stopped because the page was refreshed or closed. Stay on this screen next time — do not refresh.",
        },
        error: "Refresh or close interrupted the backup.",
      };
      persistSession();
      notify();
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

if (typeof window !== "undefined") {
  recoverInterruptedSession();
  bindBeforeUnload();
}

export function subscribeCompanyBackupRun(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getCompanyBackupRunState(): CompanyBackupRunState {
  return state;
}

export function clearCompanyBackupRunNotice(): void {
  if (state.status === "completed" || state.status === "interrupted" || state.status === "failed") {
    state = { ...IDLE };
    persistSession();
    notify();
  }
}

export function isCompanyBackupRunning(): boolean {
  return state.status === "running";
}

/** User Cancel — AbortController se chal raha backup roko (attachment loop bhi check karega). */
export function cancelCompanyBackupRun(): boolean {
  if (state.status !== "running" || !activeAbort) return false;
  activeAbort.abort();
  return true;
}

export type StartCompanyBackupRunInput = {
  company: Company;
  companyId: string;
  ownerUid: string;
  accountPlanId: string;
  includeAttachments: boolean;
  backupSourceMode?: import("@/lib/companyBackupCore").CompanyBackupSourceMode;
};

export async function startCompanyBackupRun(input: StartCompanyBackupRunInput): Promise<ExecuteCompanyBackupResult> {
  if (state.status === "running") {
    return { ok: false, error: "A backup is already running. Wait for it to finish." };
  }

  activeAbort?.abort();
  activeAbort = new AbortController();

  setState({
    status: "running",
    companyId: input.companyId,
    companyName: String(input.company.name || "").trim() || input.companyId,
    includeAttachments: input.includeAttachments,
    startedAt: Date.now(),
    progress: { phase: "Starting", detail: "Preparing backup…" },
    resultWhere: null,
    error: null,
  });

  const result = await executeCompanyBackup({
    ...input,
    signal: activeAbort.signal,
    onProgress: (progress) => {
      setState({ progress });
    },
  });

  activeAbort = null;

  if (result.ok === true) {
    setState({
      status: "completed",
      progress: { phase: "Complete", detail: `Saved: ${result.where}` },
      resultWhere: result.where,
      error: null,
    });
  } else {
    if (result.cancelled) {
      setState({
        status: "failed",
        progress: { phase: "Cancelled", detail: result.error },
        error: result.error,
      });
    } else {
      setState({
        status: "failed",
        progress: { phase: "Failed", detail: result.error },
        error: result.error,
      });
    }
  }

  return result;
}

export function dismissCompanyBackupRunLater(ms = 8000): void {
  window.setTimeout(() => {
    if (state.status === "completed") clearCompanyBackupRunNotice();
  }, ms);
}
