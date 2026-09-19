"use client";

import * as React from "react";
import { Trash2, UserPlus, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCompany } from "@/hooks/useCompany";
import {
  IC_CONNECT_MASTER_LABELS,
  IC_CONNECT_MASTER_ORDER,
  newInterCompanyConnectUserEntry,
  saveInterCompanyConnectUsers,
  subscribeInterCompanyConnectUsers,
  type InterCompanyConnectMasterVisibility,
  type InterCompanyConnectUserEntry,
} from "@/lib/interCompany/interCompanyConnectUsers";

function allMasterVisibility(checked: boolean): InterCompanyConnectMasterVisibility {
  return Object.fromEntries(
    IC_CONNECT_MASTER_ORDER.map((kind) => [kind, checked])
  ) as InterCompanyConnectMasterVisibility;
}

function isAllMastersVisible(visibility: InterCompanyConnectMasterVisibility): boolean {
  return IC_CONNECT_MASTER_ORDER.every((kind) => visibility[kind] !== false);
}

function isAnyMasterVisible(visibility: InterCompanyConnectMasterVisibility): boolean {
  return IC_CONNECT_MASTER_ORDER.some((kind) => visibility[kind] !== false);
}

type Props = {
  companyId: string;
};

export function InterCompanyConnectUserPanel({ companyId }: Props) {
  const { user, customUser } = useAuth();
  const { company } = useCompany();
  const { role } = usePermissions();
  const isAdmin =
    String(role) === "owner" ||
    customUser?.role === "CompanyAdmin" ||
    customUser?.role === "SuperAdmin";

  const [users, setUsers] = React.useState<InterCompanyConnectUserEntry[]>([]);
  const [draftEmail, setDraftEmail] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!companyId) return;
    return subscribeInterCompanyConnectUsers(companyId, setUsers);
  }, [companyId]);

  const workingUsers = dirty ? users : users;

  const updateUser = (id: string, patch: Partial<InterCompanyConnectUserEntry>) => {
    setDirty(true);
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch, updatedAt: new Date().toISOString() } : u))
    );
  };

  const addUser = () => {
    const email = draftEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    if (workingUsers.some((u) => u.email === email)) {
      toast.error("User already added");
      return;
    }
    const entry = newInterCompanyConnectUserEntry(email);
    setDirty(true);
    setUsers((prev) => [...prev, entry]);
    setDraftEmail("");
    setEditingId(entry.id);
  };

  const removeUser = (id: string) => {
    setDirty(true);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleSave = async () => {
    if (!user?.uid || !companyId) return;
    if (!isAdmin) {
      toast.error("Only company admin can manage Connect Users");
      return;
    }
    setSaving(true);
    try {
      await saveInterCompanyConnectUsers({
        companyId,
        users: workingUsers,
        updatedByUid: user.uid,
        hostCompanyName: String(company?.name || "").trim() || undefined,
      });
      setDirty(false);
      toast.success("Connect users saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Only company owner or admin can manage Connect Users.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Connect User</h3>
        <p className="text-xs text-muted-foreground">
          Add users by email. They see only what you allow on Inter Company vouchers — company name
          and selected master lists. Without master access, they type a suggested source account name;
          target admin maps the real account before approve.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="ic-connect-email" className="text-xs">
            Add user email
          </Label>
          <Input
            id="ic-connect-email"
            type="email"
            placeholder="gmail@example.com"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUser();
              }
            }}
            className="h-9"
          />
        </div>
        <Button type="button" variant="secondary" size="sm" className="h-9" onClick={addUser}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Add user
        </Button>
      </div>

      {workingUsers.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No connect users yet. Add an email above.
        </p>
      ) : (
        <ul className="space-y-3">
          {workingUsers.map((u) => {
            const expanded = editingId === u.id;
            return (
              <li
                key={u.id}
                className="rounded-lg border border-black/15 bg-card p-3 dark:border-white/15"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.email}</span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 px-2.5"
                    disabled={!dirty || saving}
                    onClick={() => void handleSave()}
                  >
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setEditingId(expanded ? null : u.id)}
                    aria-label={expanded ? "Collapse" : "Edit permissions"}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => removeUser(u.id)}
                    aria-label="Remove user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {expanded ? (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={u.showCompanyName}
                        onCheckedChange={(v) => updateUser(u.id, { showCompanyName: v === true })}
                      />
                      <span className="text-sm">Show company name</span>
                    </label>

                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={isAllMastersVisible(u.masterVisibility)}
                        onCheckedChange={(v) => {
                          const allOn = v === true;
                          updateUser(u.id, {
                            showMasters: allOn,
                            masterVisibility: allMasterVisibility(allOn),
                          });
                        }}
                      />
                      <span className="text-sm font-medium">
                        {isAllMastersVisible(u.masterVisibility)
                          ? "Hide all masters"
                          : "Show all masters"}
                      </span>
                    </label>

                    <div
                      className={cn(
                        "grid gap-2 pl-1",
                        "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
                      )}
                    >
                      {IC_CONNECT_MASTER_ORDER.map((kind) => (
                        <label
                          key={kind}
                          className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 px-2 py-1.5"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={u.masterVisibility[kind] !== false}
                            onCheckedChange={(v) => {
                              const nextVisibility = {
                                ...u.masterVisibility,
                                [kind]: v === true,
                              };
                              updateUser(u.id, {
                                masterVisibility: nextVisibility,
                                showMasters: isAnyMasterVisible(nextVisibility),
                              });
                            }}
                          />
                          <span className="text-xs leading-snug">{IC_CONNECT_MASTER_LABELS[kind]}</span>
                        </label>
                      ))}
                    </div>
                    {!isAnyMasterVisible(u.masterVisibility) ? (
                      <p className="text-xs text-muted-foreground">
                        With no masters selected, this user cannot pick accounts from the list — only type a
                        suggested account name on save.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
