"use client";

import type { UpsertCompanyBrowserOptions } from "@/lib/localCompanyDocMirror";
import { shouldCommitOnHostBridge, invokeHostBridgeCompanyDocUpsert } from "@/lib/hostBridgeWrite";
import {
  shouldRoutePlServerAuthoritativeWrite,
  invokePlServerAuthoritativeDocUpsert,
  PlServerAuthoritativeWriteError,
} from "@/lib/plServerClientAuthoritativeWrite";
import {
  enqueuePendingAuthoritativeCompanyDocWrite,
  classifyAuthoritativeWriteFailure,
  isAuthoritativeWriteFailureRetryable,
} from "@/lib/plServerAuthoritativePendingQueue";
import { schedulePlServerAuthoritativeReplayDrain } from "@/lib/plServerAuthoritativeReplay";

export type CompanyDocBrowserWriteRoute =
  | { kind: "host_bridge" }
  | { kind: "authoritative_http" }
  | { kind: "pending_enqueue" }
  | { kind: "local_commit" };

export type CompanyDocBrowserWriteDispatchRoute = Exclude<
  CompanyDocBrowserWriteRoute,
  { kind: "local_commit" }
>;

/** Runtime verify: one-shot Host bridge bypass for LAN client simulation. */
export function consumeVerifySkipHostBridgeFlag(): boolean {
  if (typeof window === "undefined") return false;
  const key = "__plPhase1bVerifySkipHostBridgeForNextUpsert" as const;
  const win = window as unknown as { [key]?: boolean };
  if (!win[key]) return false;
  delete win[key];
  return true;
}

/**
 * Single routing decision for user-origin company doc writes.
 * Host bridge → authoritative HTTP → pending queue → local SQLite fallback.
 */
export async function resolveCompanyDocBrowserWriteRoute(
  companyId: string,
  options?: UpsertCompanyBrowserOptions,
  ctx?: { simulateLanClient?: boolean }
): Promise<CompanyDocBrowserWriteRoute> {
  const simulateLanClient = ctx?.simulateLanClient === true;

  if (!simulateLanClient && (await shouldCommitOnHostBridge(companyId, options))) {
    return { kind: "host_bridge" };
  }

  if (
    await shouldRoutePlServerAuthoritativeWrite(companyId, options, {
      simulateLanClient,
    })
  ) {
    return { kind: "authoritative_http" };
  }

  const { isAuthoritativeLanClientWriteEligible } = await import("@/lib/plServerAuthoritativePendingQueue");
  if (await isAuthoritativeLanClientWriteEligible(companyId, options, { simulateLanClient })) {
    return { kind: "pending_enqueue" };
  }

  return { kind: "local_commit" };
}

/** Dispatch a resolved route — local_commit stays in the upsert orchestrator. */
export async function executeCompanyDocBrowserWriteRoute(
  route: CompanyDocBrowserWriteDispatchRoute,
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: UpsertCompanyBrowserOptions
): Promise<void> {
  switch (route.kind) {
    case "host_bridge":
      await invokeHostBridgeCompanyDocUpsert(companyId, collectionName, docId, data, options);
      return;
    case "authoritative_http":
      try {
        await invokePlServerAuthoritativeDocUpsert(companyId, collectionName, docId, data, options);
      } catch (e) {
        if (isAuthoritativeWriteFailureRetryable(classifyAuthoritativeWriteFailure(e))) {
          await enqueuePendingAuthoritativeCompanyDocWrite(
            companyId,
            collectionName,
            docId,
            data,
            options
          );
          schedulePlServerAuthoritativeReplayDrain("authoritative_http_retryable_failure");
          return;
        }
        throw e;
      }
      return;
    case "pending_enqueue":
      await enqueuePendingAuthoritativeCompanyDocWrite(companyId, collectionName, docId, data, options);
      schedulePlServerAuthoritativeReplayDrain("pending_enqueue");
      return;
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

/** Resolve route then execute (except local_commit). */
export async function orchestrateCompanyDocBrowserWrite(
  companyId: string,
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  options?: UpsertCompanyBrowserOptions
): Promise<CompanyDocBrowserWriteRoute> {
  const simulateLanClient = consumeVerifySkipHostBridgeFlag();
  const route = await resolveCompanyDocBrowserWriteRoute(companyId, options, { simulateLanClient });
  if (route.kind !== "local_commit") {
    await executeCompanyDocBrowserWriteRoute(route, companyId, collectionName, docId, data, options);
  }
  return route;
}

export { PlServerAuthoritativeWriteError };
