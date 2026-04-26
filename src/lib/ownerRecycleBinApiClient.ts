"use client";

export type OwnerRecycleBinFinalizeResult =
    | { ok: true }
    | { ok: false; error: string; tryClientFallback?: boolean };

export async function ownerFinalizeRecycleBinCompanyOnServer(options: {
    companyId: string;
    getIdToken: () => Promise<string>;
}): Promise<OwnerRecycleBinFinalizeResult> {
    const companyId = String(options.companyId || "").trim();
    if (!companyId) return { ok: false, error: "Invalid company id" };

    try {
        const token = await options.getIdToken();
        const res = await fetch("/api/company/recycle-bin-finalize", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ companyId }),
        });

        if (res.status === 503) {
            return { ok: false, error: "Firebase Admin not configured on server", tryClientFallback: true };
        }

        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
            return { ok: false, error: data.error || res.statusText || "finalize_failed" };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "network_error" };
    }
}
