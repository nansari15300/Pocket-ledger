"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MasterListRow } from "@/components/ui/master-list-row";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { mlc } from "@/lib/mobileListChrome";
import type { AdminPanelEntityKind } from "@/lib/adminPanelCompany/constants";
import { adminPanelCompanyApiUrl } from "@/lib/adminPanelCompany/apiUrl";
import { getAdminPanelCompanyIdToken } from "@/lib/adminPanelCompany/authToken";
import { AdminPanelMasterDetail } from "@/adminPanelCompany/components/AdminPanelMasterDetail";
import {
  ADMIN_PANEL_COMPANY_ENTITY_CHANGED_EVENT,
  dispatchAdminPanelQuickAction,
} from "@/lib/adminPanelCompany/events";
import type { AdminPanelQuickAction } from "@/lib/adminPanelCompany/events";

type Row = Record<string, unknown> & { id: string; createdAtMs?: number | null };

const META: Record<
  AdminPanelEntityKind,
  { title: string; description: string; fields: Array<{ key: string; label: string; type?: "number" }> }
> = {
  parties: {
    title: "Subscribers",
    description: "Subscriber parties will be created automatically from payment fulfillment in the next phase.",
    fields: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
    ],
  },
  bank_accounts: {
    title: "Bank & Cash",
    description: "Gateway and bank accounts for the Admin Panel Company.",
    fields: [
      { key: "name", label: "Account name" },
      { key: "bankName", label: "Bank / gateway" },
      { key: "accountNumber", label: "Account number" },
    ],
  },
  staff: {
    title: "Staff",
    description: "Admin Panel Company staff and future ledger permissions.",
    fields: [
      { key: "name", label: "Staff name" },
      { key: "email", label: "Email" },
      { key: "role", label: "Company role" },
    ],
  },
  taxes: {
    title: "Tax",
    description: "Tax setup for future automatic subscription sales posting.",
    fields: [
      { key: "name", label: "Tax name" },
      { key: "rate", label: "Rate (%)", type: "number" },
    ],
  },
  expense_accounts: {
    title: "Income & Expense",
    description: "Expense heads, including additional operational and commission expenses.",
    fields: [{ key: "name", label: "Expense account name" }],
  },
  vouchers: {
    title: "Vouchers",
    description:
      "All Admin Panel Company transactions: auto subscription sales (system) plus manual Sale / Purchase / Payment / Journal / Salary adjustments.",
    fields: [
      { key: "voucherType", label: "Type" },
      { key: "narration", label: "Narration" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "debitAccount", label: "Debit account" },
      { key: "creditAccount", label: "Credit account" },
    ],
  },
};

async function entityRequest(
  method: "GET" | "POST",
  kind: AdminPanelEntityKind,
  body?: Record<string, string>
): Promise<{ rows?: Row[]; error?: string }> {
  const token = await getAdminPanelCompanyIdToken();
  const res = await fetch(
    adminPanelCompanyApiUrl(`/api/admin/company/entities?kind=${encodeURIComponent(kind)}`),
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
  );
  const raw = await res.text();
  let data: { rows?: Row[]; error?: string };
  try {
    data = JSON.parse(raw) as { rows?: Row[]; error?: string };
  } catch {
    throw new Error(
      res.ok
        ? "Admin Panel Company API returned non-JSON (check /app basePath)."
        : `Admin Panel Company API failed (${res.status}).`
    );
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function rowValue(row: Row, key: string) {
  const value = row[key];
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string" && value) return value;
  return "—";
}

export function AdminPanelEntityWorkspace({ kind }: { kind: AdminPanelEntityKind }) {
  const meta = META[kind];
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { loading: accessLoading } = useAdminAccess(["SuperAdmin"]);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await entityRequest("GET", kind);
      const nextRows = result.rows ?? [];
      setRows(nextRows);
      setSelectedId((current) =>
        current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id ?? null
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load records");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (accessLoading) return;
    void load();
  }, [accessLoading, load]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail;
      if (detail?.kind && detail.kind !== kind) return;
      void load();
    };
    window.addEventListener(ADMIN_PANEL_COMPANY_ENTITY_CHANGED_EVENT, onChanged as EventListener);
    return () => window.removeEventListener(ADMIN_PANEL_COMPANY_ENTITY_CHANGED_EVENT, onChanged as EventListener);
  }, [kind, load]);

  useEffect(() => {
    if (searchParams.get("create") !== "1") return;
    const type = searchParams.get("type")?.trim() || "";
    const action: AdminPanelQuickAction | null =
      kind === "parties"
        ? { kind: "party" }
        : kind === "bank_accounts"
          ? { kind: "bank" }
          : kind === "staff"
            ? { kind: "staff" }
            : kind === "vouchers"
              ? {
                  kind: "voucher",
                  tab:
                    type === "purchase" ||
                    type === "payment_in" ||
                    type === "payment_out" ||
                    type === "journal" ||
                    type === "add_salary"
                      ? type
                      : "sale",
                }
              : null;
    if (action) dispatchAdminPanelQuickAction(action);
    else setShowForm(true);
    router.replace(pathname);
  }, [kind, pathname, router, searchParams]);

  const openAddDialog = () => {
    if (kind === "parties") {
      dispatchAdminPanelQuickAction({ kind: "party" });
      return;
    }
    if (kind === "bank_accounts") {
      dispatchAdminPanelQuickAction({ kind: "bank" });
      return;
    }
    if (kind === "staff") {
      dispatchAdminPanelQuickAction({ kind: "staff" });
      return;
    }
    if (kind === "vouchers") {
      dispatchAdminPanelQuickAction({ kind: "voucher", tab: "sale" });
      return;
    }
    setShowForm((value) => !value);
  };

  const columns = useMemo(() => meta.fields.map((field) => field.key), [meta.fields]);
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => columns.some((key) => rowValue(row, key).toLowerCase().includes(needle)));
  }, [columns, rows, search]);
  const selectedRow = rows.find((row) => row.id === selectedId) ?? null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await entityRequest("POST", kind, draft);
      setDraft({});
      setShowForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save record");
    } finally {
      setSaving(false);
    }
  };

  const searchRow = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${meta.title.toLowerCase()}…`}
          listChrome
          listChromeSearch
        />
      </div>
      <Button type="button" variant="outline" size="list" onClick={() => void load()} disabled={loading || saving}>
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="list" onClick={openAddDialog} disabled={saving}>
        <Plus className="h-3.5 w-3.5" />
        <span className="ml-1">Add</span>
      </Button>
    </div>
  );

  const listBody = loading ? (
    <div className="flex min-h-48 flex-1 items-center justify-center">
      <LoadingSpinner />
    </div>
  ) : filteredRows.length === 0 ? (
    <p className="p-4 text-sm text-muted-foreground">
      {rows.length === 0 ? "No records yet." : "No matching records."}
    </p>
  ) : (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {filteredRows.map((row) => {
        const primary = rowValue(row, columns[0]);
        const secondary = columns
          .slice(1, 3)
          .map((key) => rowValue(row, key))
          .filter((value) => value !== "—")
          .join(" · ");
        return (
          <MasterListRow
            key={row.id}
            role="button"
            tabIndex={0}
            selected={selectedId === row.id}
            onClick={() => setSelectedId(row.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedId(row.id);
              }
            }}
            className="cursor-pointer px-3 py-2"
          >
            <p className="truncate text-sm font-medium">{primary}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{secondary || "No details"}</p>
          </MasterListRow>
        );
      })}
    </div>
  );

  const listView = (
    <MasterListViewShell
      isMobile={Boolean(isMobile)}
      searchRow={searchRow}
      sectionLabel={
        <div className={mlc.sectionLabelRow}>
          <Users className={mlc.sectionIcon} />
          <span>
            {meta.title} ({filteredRows.length})
          </span>
        </div>
      }
    >
      {listBody}
    </MasterListViewShell>
  );

  const detailView = (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 sm:p-6">
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Admin Panel Company error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {showForm ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Add {meta.title.replace(/s$/, "")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {meta.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`admin-company-${kind}-${field.key}`}>{field.label}</Label>
                <Input
                  id={`admin-company-${kind}-${field.key}`}
                  type={field.type ?? "text"}
                  min={field.type === "number" ? 0 : undefined}
                  value={draft[field.key] ?? ""}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selectedRow ? (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{meta.title}</p>
            <h2 className="mt-1 text-2xl font-semibold">{rowValue(selectedRow, columns[0])}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
          </div>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {meta.fields.map((field) => (
              <div key={field.key} className="border-b pb-3">
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="mt-1 font-medium">{rowValue(selectedRow, field.key)}</dd>
              </div>
            ))}
            <div className="border-b pb-3">
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd className="mt-1 font-medium">
                {typeof selectedRow.createdAtMs === "number"
                  ? new Date(selectedRow.createdAtMs).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Transaction ledger and edit history will appear here as automatic sales and manual adjustments are added.
          </p>
        </div>
      ) : (
        <div className="flex min-h-64 flex-1 items-center justify-center text-center text-sm text-muted-foreground">
          Select a record from the list to view its details.
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full min-h-0">
      <AdminPanelMasterDetail
        title={meta.title}
        balance={`${rows.length} records`}
        isMobile={Boolean(isMobile)}
        mobileListOnly={Boolean(isMobile)}
        hasSelectedItem={Boolean(selectedRow)}
        onBackToList={() => setSelectedId(null)}
        mobileSelectionLabel={selectedRow ? rowValue(selectedRow, columns[0]) : null}
        listView={listView}
        detailView={detailView}
      />
    </div>
  );
}
