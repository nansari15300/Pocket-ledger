"use client";

import { upsertLocalCompany, removeLocalCompanyById, getLocalCompanyById, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { flushPendingBrowserDbSave } from "@/lib/localSqlite";
import { DEMO_FORK_META } from "@/lib/demoCompany/constants";
import {
  demoForkCompanyIdForUser,
  markDemoCompanyCommitted,
  markDemoCompanyDisabled,
  markDemoCompanyEnabled,
  readDemoCompanyPrefs,
} from "@/lib/demoCompany/demoCompanyPrefs";
import { getDemoCompanyTemplateSeed, remapDemoSeedForUserFork } from "@/lib/demoCompany/demoCompanySeedBuilder";
import { yieldToMain } from "@/lib/yieldToMain";

const INSTALL_BATCH = 40;

let demoInstallInProgress = false;

export function isDemoCompanyInstallInProgress(): boolean {
  return demoInstallInProgress;
}

export function isDemoCompanyForkId(companyId: string | null | undefined): boolean {
  const cid = String(companyId || "").trim();
  return cid.startsWith("demo_fork_");
}

export async function readDemoCompanyForkRow(
  userId: string
): Promise<LocalCompanyDoc | null> {
  const forkId = demoForkCompanyIdForUser(userId);
  const row = await getLocalCompanyById(forkId);
  if (!row) return null;
  if ((row as Record<string, unknown>)[DEMO_FORK_META.fork] !== true) return null;
  return row;
}

export function isDemoCompanyForkRow(row: LocalCompanyDoc | null | undefined): boolean {
  if (!row) return false;
  return (row as Record<string, unknown>)[DEMO_FORK_META.fork] === true;
}

export function isDemoCompanyForkCommitted(row: LocalCompanyDoc | null | undefined): boolean {
  if (!row) return false;
  return (row as Record<string, unknown>)[DEMO_FORK_META.committed] === true;
}

/** Copy code-bound template into user's local SQLite fork. */
export async function installDemoCompanyForkForUser(params: {
  userId: string;
  userEmail?: string | null;
  forceRefresh?: boolean;
}): Promise<{ forkCompanyId: string }> {
  const { userId, userEmail, forceRefresh } = params;
  const forkCompanyId = demoForkCompanyIdForUser(userId);

  if (forceRefresh) {
    await removeLocalCompanyById(forkCompanyId);
  } else {
    const existing = await readDemoCompanyForkRow(userId);
    if (existing) {
      markDemoCompanyEnabled(userId, forkCompanyId);
      return { forkCompanyId };
    }
  }

  demoInstallInProgress = true;
  try {
    const template = getDemoCompanyTemplateSeed();
    const forkBundle = remapDemoSeedForUserFork(template, forkCompanyId, userId, userEmail);

    await upsertLocalCompany(forkBundle.companyRoot as LocalCompanyDoc);

    const writeOpts = {
      notify: false as const,
      skipPlanMutationGate: true,
      skipCloudSyncEnqueue: true,
      skipDriveAttachmentSideEffects: true,
      force: true,
    };

    for (let i = 0; i < forkBundle.docs.length; i++) {
      const d = forkBundle.docs[i]!;
      await upsertCompanyDocInBrowserDb(forkCompanyId, d.collection, d.id, d.data, writeOpts);
      if (i > 0 && i % INSTALL_BATCH === 0) {
        await yieldToMain();
      }
    }

    await flushPendingBrowserDbSave().catch(() => undefined);
    markDemoCompanyEnabled(userId, forkCompanyId);
    return { forkCompanyId };
  } finally {
    demoInstallInProgress = false;
  }
}

/** Untick before first save — remove fork + hide from list. */
export async function disableDemoCompanyForUser(userId: string): Promise<void> {
  const prefs = readDemoCompanyPrefs(userId);
  if (prefs?.committed) return;
  const forkId = prefs?.forkCompanyId ?? demoForkCompanyIdForUser(userId);
  await removeLocalCompanyById(forkId);
  markDemoCompanyDisabled(userId);
}

/** Lock demo fork after first user edit save. */
export async function commitDemoCompanyFork(userId: string, forkCompanyId: string): Promise<void> {
  const row = await getLocalCompanyById(forkCompanyId, { includeDeleted: true });
  if (!row || !isDemoCompanyForkRow(row)) return;
  if (isDemoCompanyForkCommitted(row)) {
    markDemoCompanyCommitted(userId);
    return;
  }
  const patched: LocalCompanyDoc = {
    ...row,
    [DEMO_FORK_META.committed]: true,
  };
  await upsertLocalCompany(patched);
  markDemoCompanyCommitted(userId);
}
