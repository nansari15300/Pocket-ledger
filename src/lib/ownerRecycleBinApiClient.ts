"use client";

import { getBillingApiUrl } from "@/lib/billingApiOrigin";

export type OwnerRecycleBinFinalizeResult =
    | { ok: true }
    | { ok: false; error: string; tryClientFallback?: boolean };

/**
 * Owner recycle bin: company permanent-delete / empty-bin finalize.
 * Server reads Super Admin `config/recycleBin.quickDelete` (hard wipe vs `movedToAdminRecycleAt`).
 *
 * Static EXE/APK: relative `/api/...` 404 — use hosted billing origin + client fallback.
 */
export async function ownerFinalizeRecycleBinCompanyOnServer(options: {
    companyId: string;
    getIdToken: () => Promise<string>;
}): Promise<OwnerRecycleBinFinalizeResult> {
    const companyId = String(options.companyId || "").trim();
    if (!companyId) return { ok: false, error: "Invalid company id" };

    try {
        const token = await options.getIdToken();
        const res = await fetch(getBillingApiUrl("/api/company/recycle-bin-finalize"), {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ companyId }),
        });

        // 503 = Admin SDK missing; 404 = static/local server has no Next API — client Firestore path.
        if (res.status === 503 || res.status === 404) {
            return {
                ok: false,
                error:
                    res.status === 503
                        ? "Firebase Admin not configured on server"
                        : "finalize API unavailable",
                tryClientFallback: true,
            };
        }

        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
            return {
                ok: false,
                error: data.error || res.statusText || "finalize_failed",
                tryClientFallback: res.status >= 500,
            };
        }
        return { ok: true };
    } catch (e) {
        return {
            ok: false,
            error: e instanceof Error ? e.message : "network_error",
            tryClientFallback: true,
        };
    }
}
