"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CreditCard, Landmark, Loader2, ReceiptText, UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";

type AdminCompanyState = {
  exists: boolean;
  tenantId: string;
  company: { name?: string; status?: string } | null;
};

const EMPTY_COUNTS = [
  { label: "Subscribers", value: "0", icon: UsersRound },
  { label: "Subscription sales", value: "Rs. 0", icon: ReceiptText },
  { label: "Gateway / bank", value: "Rs. 0", icon: Landmark },
  { label: "Agent payable", value: "Rs. 0", icon: CreditCard },
] as const;

async function adminCompanyRequest(method: "GET" | "POST"): Promise<AdminCompanyState> {
  const token = await getAdminPanelCompanyIdToken();
  const res = await fetch(adminPanelCompanyApiUrl("/api/admin/company"), {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await res.text();
  let data: AdminCompanyState & { error?: string };
  try {
    data = JSON.parse(raw) as AdminCompanyState & { error?: string };
  } catch {
    throw new Error(
      res.ok
        ? "Admin Panel Company API returned non-JSON (check /app basePath)."
        : `Admin Panel Company API failed (${res.status}).`
    );
  }
  if (!res.ok) throw new Error(data.error || "Could not load Admin Panel Company");
  return data;
}

/**
 * Phase 1 home for the isolated accounting product.
 * It deliberately does not read `companies/` or normal company hooks.
 */
export function AdminPanelCompanyHome() {
  const { loading } = useAdminAccess(["SuperAdmin"]);
  const [state, setState] = useState<AdminCompanyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await adminCompanyRequest("GET"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Admin Panel Company");
    }
  }, []);

  useEffect(() => {
    if (!loading) void load();
  }, [load, loading]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await adminCompanyRequest("POST"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create Admin Panel Company");
    } finally {
      setBusy(false);
    }
  };

  if (loading || state == null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Admin Panel Company…
      </div>
    );
  }

  if (!state.exists) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Admin Panel Company unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Admin Panel Company</CardTitle>
                <CardDescription>
                  Pocket Ledger&apos;s own accounting company. It is isolated from all customer companies.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates one cloud tenant ledger with separate parties, vouchers, bank, staff, tax, expense, and
              system-ledger accounts. Subscription sales and agent commission will be auto-posted in the next phase.
            </p>
            <Button type="button" disabled={busy} onClick={() => void create()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
              Create Admin Panel Company
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-4 sm:p-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not refresh company</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-bold">{state.company?.name || "Admin Panel Company"}</h1>
          <p className="text-sm text-muted-foreground">
            Cloud tenant: {state.tenantId} · accounting data is separate from normal customer companies.
          </p>
        </div>
        <Button variant="outline" type="button" onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {EMPTY_COUNTS.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Company workspace</CardTitle>
          <CardDescription>
            Phase 1 has created the isolated ledger namespace and default accounting accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          <div>Parties: subscriber records</div>
          <div>Vouchers: system-locked sales + adjustments</div>
          <div>Accounts: bank, sales, tax, expense, commission</div>
          <div>Staff: Admin Panel Company roles</div>
          <div>Agents: commission payable ledger</div>
          <div>Reports: normal-company-style copies in later phases</div>
        </CardContent>
      </Card>
    </main>
  );
}
