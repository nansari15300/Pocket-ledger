"use client";

import { getBillingApiUrl } from "@/lib/billingApiOrigin";

export type AdminPermanentDeleteCompanyResult =
    | { ok: true }
    | { ok: false; error: string; tryClientFallback?: boolean };

/**
 * Admin panel: Bearer ID token + server Admin SDK se company hard delete.
 * `503` / static `404` = client `deleteCompanyComplete` try kar sakta hai.
 */
export async function adminPermanentDeleteCompanyOnServer(options: {
    companyId: string;
    getIdToken: () => Promise<string>;
}): Promise<AdminPermanentDeleteCompanyResult> {
    const companyId = String(options.companyId || "").trim();
    if (!companyId) return { ok: false, error: "Invalid company id" };

    try {
        const token = await options.getIdToken();
        const res = await fetch(getBillingApiUrl("/api/admin/recycle-bin/delete-company"), {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ companyId }),
        });

        if (res.status === 503 || res.status === 404) {
            return {
                ok: false,
                error:
                    res.status === 503
                        ? "Firebase Admin not configured on server"
                        : "admin delete API unavailable",
                tryClientFallback: true,
            };
        }

        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
            return {
                ok: false,
                error: data.error || res.statusText || "delete_failed",
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
