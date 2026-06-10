"use client";

/**
 * Centralized system card — View com popup: owned + other linked companies table.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Company } from "@/hooks/useCompany";
import type { InterCompanyGroupDoc } from "@/lib/interCompany/interCompanyGroups";
import {
  assignCompanyToInterCompanyGroup,
  addCompanyToPublicInterCompanySystem,
  interCompanyGroupCreateErrorMessage,
  removeCompanyFromInterCompanySystem,
  updateInterCompanyGroup,
} from "@/lib/interCompany/interCompanyGroups";
import { collectInterCompanyMemberUsers } from "@/lib/interCompany/interCompanyGroupMembers";
import { resolveOwnedCompaniesForUser } from "@/lib/interCompany/interCompanyOwnedCompanies";
import { fetchInterCompanyGroupById } from "@/lib/interCompany/interCompanyPublicSystemLinks";
import {
  sendInterCompanySystemJoinRequest,
  subscribeIncomingSystemJoinRequests,
  subscribePendingSystemJoinRequests,
  acceptInterCompanySystemJoinRequest,
  declineInterCompanySystemJoinRequest,
  subscribeAcceptedSystemJoinsForSystem,
  subscribeAcceptedSystemJoinLinksForRequester,
  type PendingSystemJoinRequest,
  type IncomingSystemJoinRequest,
  type AcceptedSystemJoinPair,
} from "@/lib/interCompany/interCompanySystemJoinRequest";
import { loadInterCompanyJoinSettings, saveInterCompanyJoinSettings, subscribeInterCompanyJoinSettings } from "@/lib/interCompany/interCompanyJoinSettingsSync";
import { addPermanentInterCompanyJoin } from "@/lib/interCompany/interCompanyPermanentJoin";
import {
  loadInterCompanySystemCompaniesView,
  appendJoinedPartnersToSystemView,
  userHasOwnCompanyInSystem,
  resolveUserOwnedCompanyIds,
  type InterCompanySystemCompanyRow,
} from "@/lib/interCompany/interCompanySystemCompaniesView";
import { isUserCompanyOwner, readCompanyInterCompanyCode } from "@/lib/interCompany/interCompanyCompanyCode";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import {
  buildCompanySummaryForPublicSystem,
  syncUserPublicProfilesForSystem,
  upsertInterCompanyPublicCompanyProfile,
  backfillInterCompanyGroupCompanyOwners,
} from "@/lib/interCompany/interCompanyPublicCompanyProfile";
import { interCompanySettingsCardClass } from "@/lib/interCompany/interCompanyVoucherChrome";
import { cn } from "@/lib/utils";
import {
  isLocalDeviceInterCompanySystem,
  isPureLocalInterCompanyCompanyFromShape,
} from "@/lib/interCompany/localInterCompanyPolicy";
import type { InterCompanyGroupCompanySummary } from "@/lib/interCompany/interCompanyGroups";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  system: InterCompanyGroupDoc | null;
  allCompanies: Company[];
  /** User-owned companies for the Add my company dropdown */
  ownedCompanies: { id: string; name: string }[];
  /** Currently open company — shared login users can add this company */
  currentCompanyId?: string;
  groups: InterCompanyGroupDoc[];
  groupOwnerUid: string;
  userEmail?: string;
  requesterName?: string;
  /** View Inter Company settings — public system Add my company + Join */
  canRead?: boolean;
  /** Manage own systems — owner delete, Save, etc. */
  canWrite?: boolean;
  /** Sync parent groups state after assign on owned system */
  onSystemCompaniesChanged?: (nextGroups: InterCompanyGroupDoc[]) => void;
  /** Refresh linked/public system after add on someone else's system */
  onSystemUpdated?: (system: InterCompanyGroupDoc) => void;
};

/** View com — Other tables par naam / code / PAN / phone se filter */
function filterInterCompanySystemCompanyRows(
  rows: InterCompanySystemCompanyRow[],
  query: string
): InterCompanySystemCompanyRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const haystack = [row.name, row.companyCode, row.pan, row.phone, row.id]
      .map((v) => String(v || "").toLowerCase())
      .join(" ");
    return haystack.includes(q);
  });
}

/** Sync memberUsers on target system — assign only patches companyIds */
async function syncSystemMemberUsers(args: {
  system: InterCompanyGroupDoc;
  companyIds: string[];
  allCompanies: Company[];
  groupOwnerUid: string;
}): Promise<void> {
  const groupCompanies = args.companyIds
    .map((id) => args.allCompanies.find((c) => c.id === id))
    .filter(Boolean);
  const memberUsers = collectInterCompanyMemberUsers(
    groupCompanies as Parameters<typeof collectInterCompanyMemberUsers>[0]
  );
  await updateInterCompanyGroup(
    args.system.id,
    { memberUsers },
    args.groupOwnerUid
  );
}

/** System me abhi add nahi — har row par add action */
function NotInSystemCompaniesTable({
  rows,
  emptyText,
  canAdd,
  addingCompanyId,
  onAdd,
}: {
  rows: InterCompanySystemCompanyRow[];
  emptyText: string;
  canAdd: boolean;
  addingCompanyId: string | null;
  onAdd: (companyId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Company name</TableHead>
            <TableHead className="text-xs">Company code</TableHead>
            <TableHead className="text-xs">PAN no.</TableHead>
            <TableHead className="text-xs">Phone no.</TableHead>
            <TableHead className="text-xs w-[11rem] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-xs font-medium">{row.name}</TableCell>
              <TableCell className="text-xs font-mono">{row.companyCode}</TableCell>
              <TableCell className="text-xs font-mono uppercase">{row.pan}</TableCell>
              <TableCell className="text-xs tabular-nums">{row.phone}</TableCell>
              <TableCell className="text-xs text-right">
                {canAdd ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] px-2 whitespace-normal text-right max-w-[10.5rem] ml-auto"
                    disabled={addingCompanyId === row.id}
                    onClick={() => onAdd(row.id)}
                  >
                    {addingCompanyId === row.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Add company in this system"
                    )}
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OwnedCompaniesTable({
  rows,
  emptyText,
  selectedId,
  onSelect,
  incomingRequestCountByCompanyId,
  incomingRequestNamesByCompanyId,
  /** Target company id → pending requests — owned row par Accept/Decline */
  incomingRequestsByTargetCompanyId,
  busyRequestId,
  onAcceptIncoming,
  onDeclineIncoming,
  canLeave,
  leavingCompanyId,
  onLeave,
}: {
  rows: InterCompanySystemCompanyRow[];
  emptyText: string;
  selectedId?: string;
  onSelect?: (row: InterCompanySystemCompanyRow) => void;
  /** Target company par pending join requests — company row badge */
  incomingRequestCountByCompanyId?: Map<string, number>;
  /** Kis company ne request bheji — owned row par naam */
  incomingRequestNamesByCompanyId?: Map<string, string[]>;
  incomingRequestsByTargetCompanyId?: Map<string, IncomingSystemJoinRequest[]>;
  busyRequestId?: string | null;
  onAcceptIncoming?: (req: IncomingSystemJoinRequest) => void;
  onDeclineIncoming?: (req: IncomingSystemJoinRequest) => void;
  /** Apni company is system se hata sakte ho */
  canLeave?: (companyId: string) => boolean;
  leavingCompanyId?: string | null;
  onLeave?: (companyId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Company name</TableHead>
            <TableHead className="text-xs">Company code</TableHead>
            <TableHead className="text-xs">PAN no.</TableHead>
            <TableHead className="text-xs">Phone no.</TableHead>
            <TableHead className="text-xs w-[10rem] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const selected = selectedId === row.id;
            const showLeave = canLeave?.(row.id) ?? false;
            const incomingForRow = incomingRequestsByTargetCompanyId?.get(row.id) || [];
            return (
              <TableRow
                key={row.id}
                className={cn(
                  onSelect && "cursor-pointer hover:bg-muted/50",
                  selected && "bg-primary/10 hover:bg-primary/15"
                )}
                onClick={() => onSelect?.(row)}
              >
                <TableCell className="text-xs font-medium">
                  {row.name}
                  {selected ? (
                    <span className="ml-1.5 text-[10px] text-primary font-normal">(selected)</span>
                  ) : null}
                  {(incomingRequestCountByCompanyId?.get(row.id) || 0) > 0 ? (
                    <span className="ml-1.5 text-[10px] font-medium text-amber-800">
                      · {(incomingRequestCountByCompanyId?.get(row.id) || 0)} request
                      {(incomingRequestCountByCompanyId?.get(row.id) || 0) === 1 ? "" : "s"}
                      {(incomingRequestNamesByCompanyId?.get(row.id) || []).length > 0 ? (
                        <span className="font-normal text-amber-900/90">
                          {" "}
                          ({incomingRequestNamesByCompanyId!.get(row.id)!.join(", ")})
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs font-mono">{row.companyCode}</TableCell>
                <TableCell className="text-xs font-mono uppercase">{row.pan}</TableCell>
                <TableCell className="text-xs tabular-nums">{row.phone}</TableCell>
                <TableCell className="text-xs text-right">
                  <div
                    className="flex flex-col items-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {incomingForRow.map((req) => (
                      <div key={req.id} className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] font-medium text-amber-800">
                          {req.requesterCompanyName || "Join request"}
                        </span>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700"
                            disabled={busyRequestId === req.id}
                            onClick={() => onAcceptIncoming?.(req)}
                          >
                            {busyRequestId === req.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Accept"
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            disabled={busyRequestId === req.id}
                            onClick={() => onDeclineIncoming?.(req)}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                    {showLeave && onLeave ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] px-2"
                        disabled={leavingCompanyId === row.id}
                        onClick={() => onLeave(row.id)}
                      >
                        {leavingCompanyId === row.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Leave"
                        )}
                      </Button>
                    ) : incomingForRow.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function OtherCompaniesTable({
  rows,
  emptyText,
  selectedOwnedCompanyId,
  selectedOwnedCompanyName,
  linkedCompanyIds,
  /** Accepted join — kisi bhi meri owned company ka partner (requester side sync delay) */
  acceptedJoinPartnerIds,
  pendingJoinIds,
  incomingByRequesterCompanyId,
  joiningId,
  busyRequestId,
  onJoin,
  onAcceptIncoming,
  onDeclineIncoming,
}: {
  rows: InterCompanySystemCompanyRow[];
  emptyText: string;
  selectedOwnedCompanyId?: string;
  selectedOwnedCompanyName?: string;
  linkedCompanyIds: Set<string>;
  acceptedJoinPartnerIds: Set<string>;
  pendingJoinIds: Set<string>;
  /** Other row company id → incoming request (aapki selected company target hai) */
  incomingByRequesterCompanyId: Map<string, IncomingSystemJoinRequest>;
  joiningId: string | null;
  busyRequestId: string | null;
  onJoin: (row: InterCompanySystemCompanyRow) => void;
  onAcceptIncoming: (req: IncomingSystemJoinRequest) => void;
  onDeclineIncoming: (req: IncomingSystemJoinRequest) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">{emptyText}</p>;
  }
  const hasIncomingRows = rows.some((row) => incomingByRequesterCompanyId.has(row.id));
  if (!selectedOwnedCompanyId && !hasIncomingRows) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Select your company above to see linked partners and join options.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Company name</TableHead>
            <TableHead className="text-xs">Company code</TableHead>
            <TableHead className="text-xs">PAN no.</TableHead>
            <TableHead className="text-xs">Phone no.</TableHead>
            <TableHead className="text-xs w-[8.5rem] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const incoming = incomingByRequesterCompanyId.get(row.id);
            const isPendingOutgoing = pendingJoinIds.has(row.id);
            // Joined — settings + accepted join (requester side accept ke baad sync delay)
            const isJoined =
              (linkedCompanyIds.has(row.id) || acceptedJoinPartnerIds.has(row.id)) &&
              !isPendingOutgoing &&
              !incoming;
            return (
              <TableRow key={row.id}>
                <TableCell className="text-xs font-medium">
                  <div>{row.name}</div>
                  {incoming ? (
                    <p className="mt-0.5 text-[10px] font-normal text-amber-800">
                      Wants to link with{" "}
                      <strong>
                        {incoming.targetCompanyName || selectedOwnedCompanyName || "your company"}
                      </strong>
                    </p>
                  ) : isPendingOutgoing ? (
                    <p className="mt-0.5 text-[10px] font-normal text-amber-800">
                      You requested · waiting for {row.name} owner
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs font-mono">{row.companyCode}</TableCell>
                <TableCell className="text-xs font-mono uppercase">{row.pan}</TableCell>
                <TableCell className="text-xs tabular-nums">{row.phone}</TableCell>
                <TableCell className="text-xs text-right">
                  {incoming ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-medium text-amber-800">Request received</span>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700"
                          disabled={busyRequestId === incoming.id}
                          onClick={() => onAcceptIncoming(incoming)}
                        >
                          {busyRequestId === incoming.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Accept"
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          disabled={busyRequestId === incoming.id}
                          onClick={() => onDeclineIncoming(incoming)}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ) : isPendingOutgoing ? (
                    <span className="text-[10px] font-medium text-amber-800">Requested</span>
                  ) : isJoined ? (
                    <span className="text-[10px] font-medium text-emerald-700">Joined</span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={joiningId === row.id}
                      onClick={() => onJoin(row)}
                    >
                      {joiningId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Join"
                      )}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function InterCompanySystemViewCompaniesDialog({
  open,
  onOpenChange,
  system,
  allCompanies,
  ownedCompanies,
  currentCompanyId,
  groups,
  groupOwnerUid,
  userEmail,
  requesterName,
  canRead = false,
  canWrite = false,
  onSystemCompaniesChanged,
  onSystemUpdated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [addingCompanyId, setAddingCompanyId] = useState<string | null>(null);
  const [leavingCompanyId, setLeavingCompanyId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [owned, setOwned] = useState<InterCompanySystemCompanyRow[]>([]);
  const [linkedOther, setLinkedOther] = useState<InterCompanySystemCompanyRow[]>([]);
  /** system.companyIds se base load — joined merge alag effect */
  const [baseOwned, setBaseOwned] = useState<InterCompanySystemCompanyRow[]>([]);
  const [baseLinkedOther, setBaseLinkedOther] = useState<InterCompanySystemCompanyRow[]>([]);
  const [systemAcceptedJoins, setSystemAcceptedJoins] = useState<AcceptedSystemJoinPair[]>([]);
  const [selectedOwnedCompanyId, setSelectedOwnedCompanyId] = useState("");
  const [linkedCompanyIds, setLinkedCompanyIds] = useState<Set<string>>(new Set());
  const [pendingJoinRequests, setPendingJoinRequests] = useState<PendingSystemJoinRequest[]>([]);
  const [incomingJoinRequests, setIncomingJoinRequests] = useState<IncomingSystemJoinRequest[]>([]);
  /** Email login — parent list kabhi khali; Firestore se owned companies */
  const [myOwnedCompanies, setMyOwnedCompanies] = useState<{ id: string; name: string }[]>([]);
  /** Other linked / not-linked cards — heading ke right search */
  const [otherLinkedSearchQuery, setOtherLinkedSearchQuery] = useState("");
  const [otherNotLinkedSearchQuery, setOtherNotLinkedSearchQuery] = useState("");

  const loadSeqRef = useRef(0);
  const prevOpenRef = useRef(false);
  const prevSystemIdRef = useRef<string | null>(null);
  const allCompaniesRef = useRef(allCompanies);
  allCompaniesRef.current = allCompanies;

  const systemCompanyIdsKey = system?.companyIds?.join(",") ?? "";
  const allCompaniesKey = useMemo(
    () =>
      allCompanies
        .map((c) => c.id)
        .filter(Boolean)
        .sort()
        .join(","),
    [allCompanies]
  );

  /** Firestore owner query se aayi ids — Owned/Other split ke liye */
  const firestoreOwnedIds = useMemo(
    () => myOwnedCompanies.map((c) => c.id).filter(Boolean),
    [myOwnedCompanies]
  );
  const firestoreOwnedIdsKey = firestoreOwnedIds.join(",");

  /** Join / sync helpers — strict owned list */
  const userOwnedCompanyIds = useMemo(
    () =>
      resolveUserOwnedCompanyIds({
        allCompanies,
        userUid: groupOwnerUid,
        userEmail,
        extraOwnedIds: firestoreOwnedIds,
      }),
    [allCompanies, groupOwnerUid, userEmail, firestoreOwnedIds]
  );
  const userOwnedCompanyIdsKey = userOwnedCompanyIds.join(",");

  const isSystemOwner = !!system && system.ownerUserId === groupOwnerUid;
  // Public system: koi bhi signed-in user apni company add kar sake (email login included)
  const canAddToSystem =
    !!system &&
    !!groupOwnerUid &&
    ((isSystemOwner && canWrite) || (!isSystemOwner && system.visibility === "public"));

  const groupsForAssign = useMemo(() => {
    if (!system) return groups;
    if (groups.some((g) => g.id === system.id)) return groups;
    return [...groups, system];
  }, [groups, system]);

  const localDeviceSystem = useMemo(
    () => isLocalDeviceInterCompanySystem(system),
    [system]
  );

  const companiesAvailableToAdd = useMemo(() => {
    let rows = myOwnedCompanies.filter((c) => !(system?.companyIds ?? []).includes(c.id));
    if (localDeviceSystem) {
      rows = rows.filter((c) => {
        const full = allCompanies.find((x) => x.id === c.id);
        return full && isPureLocalInterCompanyCompanyFromShape(full);
      });
    }
    return rows;
  }, [myOwnedCompanies, systemCompanyIdsKey, localDeviceSystem, allCompanies]);

  /** Top card — meri companies jo is system me add nahi */
  const notInSystemRows = useMemo((): InterCompanySystemCompanyRow[] => {
    return companiesAvailableToAdd.map((c) => {
      const full = allCompanies.find((x) => x.id === c.id);
      if (full?.id) {
        return {
          id: full.id,
          name: String(full.name || c.name).trim(),
          companyCode: readCompanyInterCompanyCode(full) || "—",
          pan:
            String(full.pan || "")
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "") || "—",
          phone: normalizeInterCompanyPhone(full.phone) || "—",
        };
      }
      return {
        id: c.id,
        name: c.name,
        companyCode: "—",
        pan: "—",
        phone: "—",
      };
    });
  }, [companiesAvailableToAdd, allCompanies]);

  const hasOwnCompanyInSystem = useMemo(
    () =>
      !!system &&
      userHasOwnCompanyInSystem({
        systemCompanyIds: system.companyIds,
        userOwnedCompanyIds,
        allCompanies,
        userUid: groupOwnerUid,
        userEmail,
      }),
    [system, userOwnedCompanyIds, systemCompanyIdsKey, allCompanies, groupOwnerUid, userEmail]
  );

  const requesterCompanyInSystem = useMemo(() => {
    if (selectedOwnedCompanyId) {
      const hit = owned.find((r) => r.id === selectedOwnedCompanyId);
      if (hit) return { id: hit.id, name: hit.name };
    }
    if (!system) return myOwnedCompanies[0];
    const inSystem = myOwnedCompanies.find((c) => system.companyIds.includes(c.id));
    return inSystem ?? myOwnedCompanies[0];
  }, [selectedOwnedCompanyId, owned, system, myOwnedCompanies, systemCompanyIdsKey]);

  const pendingJoinIdsForSelected = useMemo(() => {
    if (!selectedOwnedCompanyId) return new Set<string>();
    return new Set(
      pendingJoinRequests
        .filter((r) => r.requesterCompanyId === selectedOwnedCompanyId)
        .map((r) => r.targetCompanyId)
    );
  }, [pendingJoinRequests, selectedOwnedCompanyId]);

  const incomingRequestCountByCompanyId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of incomingJoinRequests) {
      if (!r.targetCompanyId) continue;
      map.set(r.targetCompanyId, (map.get(r.targetCompanyId) || 0) + 1);
    }
    return map;
  }, [incomingJoinRequests]);

  const incomingRequestNamesByCompanyId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of incomingJoinRequests) {
      if (!r.targetCompanyId) continue;
      const name = r.requesterCompanyName?.trim() || r.requesterCompanyId;
      if (!name) continue;
      const prev = map.get(r.targetCompanyId) || [];
      if (!prev.includes(name)) prev.push(name);
      map.set(r.targetCompanyId, prev);
    }
    return map;
  }, [incomingJoinRequests]);

  /** Owned row par Accept/Decline — target company id se group */
  const incomingRequestsByTargetCompanyId = useMemo(() => {
    const map = new Map<string, IncomingSystemJoinRequest[]>();
    for (const r of incomingJoinRequests) {
      if (!r.targetCompanyId) continue;
      const prev = map.get(r.targetCompanyId) || [];
      prev.push(r);
      map.set(r.targetCompanyId, prev);
    }
    return map;
  }, [incomingJoinRequests]);

  /** Other tables — requester company system me na ho to bhi row dikhao */
  const linkedOtherWithRequesters = useMemo(() => {
    const byId = new Map(linkedOther.map((r) => [r.id, r]));
    for (const r of incomingJoinRequests) {
      const id = r.requesterCompanyId?.trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name: r.requesterCompanyName?.trim() || id,
        companyCode: "—",
        pan: "—",
        phone: "—",
      });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [linkedOther, incomingJoinRequests]);

  /** Other row = requester — meri kisi bhi owned company target ho to Accept/Decline */
  const incomingByRequesterCompanyId = useMemo(() => {
    const map = new Map<string, IncomingSystemJoinRequest>();
    const ownedIds = new Set(owned.map((r) => r.id));
    for (const r of incomingJoinRequests) {
      if (!r.requesterCompanyId || !r.targetCompanyId) continue;
      if (!ownedIds.has(r.targetCompanyId)) continue;
      map.set(r.requesterCompanyId, r);
    }
    return map;
  }, [incomingJoinRequests, owned]);

  /** Kisi bhi meri owned company ka accepted partner — Other me Joined */
  const acceptedJoinPartnersForAnyOwned = useMemo(() => {
    const ids = new Set<string>();
    const ownedIds = new Set(owned.map((r) => r.id));
    for (const j of systemAcceptedJoins) {
      if (ownedIds.has(j.requesterCompanyId)) ids.add(j.targetCompanyId);
      if (ownedIds.has(j.targetCompanyId)) ids.add(j.requesterCompanyId);
    }
    return ids;
  }, [systemAcceptedJoins, owned]);

  /** Outgoing pending — meri kisi owned company se bheja gaya */
  const pendingJoinIdsForAnyOwned = useMemo(() => {
    const ownedIds = new Set(owned.map((r) => r.id));
    return new Set(
      pendingJoinRequests
        .filter((r) => ownedIds.has(r.requesterCompanyId))
        .map((r) => r.targetCompanyId)
    );
  }, [pendingJoinRequests, owned]);

  /** Meri kisi bhi owned company ka accepted partner — requester side Joined badge */
  const acceptedJoinPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const j of systemAcceptedJoins) {
      if (userOwnedCompanyIds.includes(j.requesterCompanyId)) ids.add(j.targetCompanyId);
      if (userOwnedCompanyIds.includes(j.targetCompanyId)) ids.add(j.requesterCompanyId);
    }
    return ids;
  }, [systemAcceptedJoins, userOwnedCompanyIds]);

  /** Selected owned company ke accepted partners — Joined / split ke liye */
  const acceptedJoinPartnersForSelected = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedOwnedCompanyId) return ids;
    for (const j of systemAcceptedJoins) {
      if (j.requesterCompanyId === selectedOwnedCompanyId) ids.add(j.targetCompanyId);
      if (j.targetCompanyId === selectedOwnedCompanyId) ids.add(j.requesterCompanyId);
    }
    return ids;
  }, [systemAcceptedJoins, selectedOwnedCompanyId]);

  /** Other tables — joined / pending badge ke liye kisi bhi owned company se match */
  const acceptedJoinPartnersForOtherTables = useMemo(() => {
    const ids = new Set(acceptedJoinPartnersForAnyOwned);
    acceptedJoinPartnersForSelected.forEach((id) => ids.add(id));
    return ids;
  }, [acceptedJoinPartnersForAnyOwned, acceptedJoinPartnersForSelected]);

  const pendingJoinIdsForOtherTables = useMemo(() => {
    const ids = new Set(pendingJoinIdsForAnyOwned);
    pendingJoinIdsForSelected.forEach((id) => ids.add(id));
    return ids;
  }, [pendingJoinIdsForAnyOwned, pendingJoinIdsForSelected]);

  /** Other list — selected company se linked vs not linked */
  const { otherLinkedRows, otherNotLinkedRows } = useMemo(() => {
    const linked: InterCompanySystemCompanyRow[] = [];
    const notLinked: InterCompanySystemCompanyRow[] = [];
    if (!selectedOwnedCompanyId) {
      return { otherLinkedRows: linked, otherNotLinkedRows: linkedOtherWithRequesters };
    }
    for (const row of linkedOtherWithRequesters) {
      const incoming = incomingByRequesterCompanyId.has(row.id);
      const isPending =
        pendingJoinIdsForSelected.has(row.id) || pendingJoinIdsForAnyOwned.has(row.id);
      const isJoined =
        !incoming &&
        !isPending &&
        (linkedCompanyIds.has(row.id) ||
          acceptedJoinPartnersForSelected.has(row.id) ||
          acceptedJoinPartnersForAnyOwned.has(row.id));
      if (isJoined) linked.push(row);
      else notLinked.push(row);
    }
    return { otherLinkedRows: linked, otherNotLinkedRows: notLinked };
  }, [
    linkedOtherWithRequesters,
    selectedOwnedCompanyId,
    linkedCompanyIds,
    acceptedJoinPartnersForSelected,
    acceptedJoinPartnersForAnyOwned,
    pendingJoinIdsForSelected,
    pendingJoinIdsForAnyOwned,
    incomingByRequesterCompanyId,
  ]);

  const filteredOtherLinkedRows = useMemo(
    () => filterInterCompanySystemCompanyRows(otherLinkedRows, otherLinkedSearchQuery),
    [otherLinkedRows, otherLinkedSearchQuery]
  );

  const filteredOtherNotLinkedRows = useMemo(
    () => filterInterCompanySystemCompanyRows(otherNotLinkedRows, otherNotLinkedSearchQuery),
    [otherNotLinkedRows, otherNotLinkedSearchQuery]
  );

  // Owned list load — accepted join wali requester company prefer karo
  useEffect(() => {
    if (!open) {
      setSelectedOwnedCompanyId("");
      setOtherLinkedSearchQuery("");
      setOtherNotLinkedSearchQuery("");
      return;
    }
    setSelectedOwnedCompanyId((prev) => {
      if (prev && (owned.some((r) => r.id === prev) || myOwnedCompanies.some((c) => c.id === prev))) {
        return prev;
      }
      // Incoming request jis owned company par hai — auto select (Accept/Decline ke liye)
      const targetWithIncoming = owned.find(
        (r) => (incomingRequestCountByCompanyId.get(r.id) || 0) > 0
      );
      if (targetWithIncoming?.id) return targetWithIncoming.id;
      const asRequester = systemAcceptedJoins.find((j) =>
        myOwnedCompanies.some((c) => c.id === j.requesterCompanyId)
      );
      if (asRequester?.requesterCompanyId) return asRequester.requesterCompanyId;
      return owned[0]?.id ?? myOwnedCompanies[0]?.id ?? "";
    });
  }, [open, owned, myOwnedCompanies, systemAcceptedJoins, incomingRequestCountByCompanyId]);

  const joinedPartnerIdsForView = useMemo(() => {
    const ids = new Set<string>([...linkedCompanyIds]);
    if (selectedOwnedCompanyId) {
      for (const j of systemAcceptedJoins) {
        if (j.requesterCompanyId === selectedOwnedCompanyId) ids.add(j.targetCompanyId);
        if (j.targetCompanyId === selectedOwnedCompanyId) ids.add(j.requesterCompanyId);
      }
    }
    ids.delete(selectedOwnedCompanyId);
    return [...ids].filter(Boolean);
  }, [linkedCompanyIds, selectedOwnedCompanyId, systemAcceptedJoins]);

  const joinedPartnerIdsKey = joinedPartnerIdsForView.join(",");

  // Joined partners merge — accept ke baad requester/accepter dono Other/Owned me
  useEffect(() => {
    if (!open || !system) {
      setOwned([]);
      setLinkedOther([]);
      return;
    }
    let cancelled = false;
    void appendJoinedPartnersToSystemView({
      owned: baseOwned,
      linkedOther: baseLinkedOther,
      joinedPartnerIds: joinedPartnerIdsForView,
      allCompanies: allCompaniesRef.current,
      userUid: groupOwnerUid,
      userEmail,
      companyOwners: system.companyOwners,
    }).then((merged) => {
      if (!cancelled) {
        setOwned(merged.owned);
        setLinkedOther(merged.linkedOther);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    system?.id,
    baseOwned,
    baseLinkedOther,
    joinedPartnerIdsKey,
    groupOwnerUid,
    userEmail,
    system?.companyOwners,
  ]);

  // Selected owned company ke linked partners — realtime (requester accept sync ke baad)
  useEffect(() => {
    if (!open || !selectedOwnedCompanyId) {
      setLinkedCompanyIds(new Set());
      return;
    }
    return subscribeInterCompanyJoinSettings(selectedOwnedCompanyId, ({ settings }) => {
      setLinkedCompanyIds(
        new Set([
          ...settings.joinedCompanyIds.filter(Boolean),
          ...settings.permanentJoinedCompanyIds.filter(Boolean),
        ])
      );
    });
  }, [open, selectedOwnedCompanyId]);

  // Requester — accept ke baad apni company me link apply + linked refresh
  useEffect(() => {
    if (!open || !groupOwnerUid) return;
    return subscribeAcceptedSystemJoinLinksForRequester(groupOwnerUid, () => {
      if (!selectedOwnedCompanyId) return;
      void loadInterCompanyJoinSettings(selectedOwnedCompanyId).then(({ settings }) => {
        setLinkedCompanyIds(
          new Set([
            ...settings.joinedCompanyIds.filter(Boolean),
            ...settings.permanentJoinedCompanyIds.filter(Boolean),
          ])
        );
      });
    });
  }, [open, groupOwnerUid, selectedOwnedCompanyId]);

  // Merge parent list + Firestore (ownerId + ownerEmail) for email login users
  useEffect(() => {
    if (!open) {
      setMyOwnedCompanies([]);
      return;
    }
    const merged = new Map<string, { id: string; name: string }>();
    for (const c of ownedCompanies) merged.set(c.id, c);
    // Shared company — sirf owned ho to dropdown me dikhao
    if (currentCompanyId) {
      const cur = allCompanies.find((c) => c.id === currentCompanyId);
      if (
        cur?.id &&
        isUserCompanyOwner({
          company: cur,
          userUid: groupOwnerUid,
          userEmail,
        })
      ) {
        merged.set(cur.id, { id: cur.id, name: String(cur.name || cur.id) });
      }
    }
    setMyOwnedCompanies(Array.from(merged.values()));
    if (!groupOwnerUid) return;
    void resolveOwnedCompaniesForUser(groupOwnerUid, userEmail).then((rows) => {
      for (const c of ownedCompanies) merged.set(c.id, c);
      if (currentCompanyId) {
        const cur = allCompanies.find((c) => c.id === currentCompanyId);
        if (
          cur?.id &&
          isUserCompanyOwner({
            company: cur,
            userUid: groupOwnerUid,
            userEmail,
          })
        ) {
          merged.set(cur.id, { id: cur.id, name: String(cur.name || cur.id) });
        }
      }
      for (const c of rows) merged.set(c.id, c);
      setMyOwnedCompanies(Array.from(merged.values()));
    });
  }, [open, groupOwnerUid, userEmail, ownedCompanies, currentCompanyId, allCompanies]);

  useEffect(() => {
    if (!open || !system || !groupOwnerUid) {
      setPendingJoinRequests([]);
      return;
    }
    return subscribePendingSystemJoinRequests(
      { systemId: system.id, requesterUserId: groupOwnerUid },
      setPendingJoinRequests
    );
  }, [open, system?.id, groupOwnerUid, systemCompanyIdsKey]);

  // Target owner — is system ke liye incoming join requests (company row badge)
  useEffect(() => {
    if (!open || !groupOwnerUid || !system?.id) {
      setIncomingJoinRequests([]);
      return;
    }
    return subscribeIncomingSystemJoinRequests(
      { targetOwnerUserId: groupOwnerUid, systemId: system.id },
      setIncomingJoinRequests
    );
  }, [open, groupOwnerUid, system?.id]);

  // Is system ke accepted joins — merge list + refresh trigger
  useEffect(() => {
    if (!open || !system?.id) {
      setSystemAcceptedJoins([]);
      return;
    }
    return subscribeAcceptedSystemJoinsForSystem(system.id, setSystemAcceptedJoins);
  }, [open, system?.id]);

  useEffect(() => {
    if (!open || !system) {
      loadSeqRef.current += 1;
      prevOpenRef.current = false;
      prevSystemIdRef.current = null;
      setOwned([]);
      setLinkedOther([]);
      setBaseOwned([]);
      setBaseLinkedOther([]);
      setLoading(false);
      return;
    }

    const openedFresh =
      !prevOpenRef.current || prevSystemIdRef.current !== system.id;
    prevOpenRef.current = true;
    prevSystemIdRef.current = system.id;

    const seq = ++loadSeqRef.current;
    if (openedFresh) setLoading(true);

    void (async () => {
      // System owner — legacy rows par public profile se companyOwners backfill
      let companyOwners = system.companyOwners ?? {};
      if (system.ownerUserId === groupOwnerUid && system.companyIds.length > 0) {
        try {
          companyOwners = await backfillInterCompanyGroupCompanyOwners({
            systemId: system.id,
            companyIds: system.companyIds,
            existing: companyOwners,
          });
        } catch {
          /* offline */
        }
      }

      const data = await loadInterCompanySystemCompaniesView({
        systemCompanyIds: system.companyIds,
        firestoreOwnedIds,
        allCompanies: allCompaniesRef.current,
        userUid: groupOwnerUid,
        userEmail,
        companySummaries: system.companySummaries,
        companyOwners,
      });
      if (seq !== loadSeqRef.current) return;
      setBaseOwned(data.owned);
      setBaseLinkedOther(data.linkedOther);

      // Background — public profile publish (code/PAN/phone Other users ke liye)
      if (system.visibility !== "public" || firestoreOwnedIds.length === 0) return;
      try {
        const synced = await syncUserPublicProfilesForSystem({
          systemCompanyIds: system.companyIds,
          userOwnedCompanyIds: firestoreOwnedIds,
          allCompanies: allCompaniesRef.current,
          userUid: groupOwnerUid,
          userEmail,
          allowEnsureCode: false,
        });
        if (seq !== loadSeqRef.current) return;
        const refreshed = await loadInterCompanySystemCompaniesView({
          systemCompanyIds: system.companyIds,
          firestoreOwnedIds,
          allCompanies: allCompaniesRef.current,
          userUid: groupOwnerUid,
          userEmail,
          companySummaries: { ...(system.companySummaries ?? {}), ...synced },
          companyOwners,
        });
        if (seq !== loadSeqRef.current) return;
        setBaseOwned(refreshed.owned);
        setBaseLinkedOther(refreshed.linkedOther);
      } catch {
        /* offline / permission */
      }
    })()
      .finally(() => {
        // Har successful/cancelled load par spinner band — openedFresh par mat roko
        if (seq === loadSeqRef.current) setLoading(false);
      });
  }, [open, system?.id, systemCompanyIdsKey, firestoreOwnedIdsKey, allCompaniesKey, groupOwnerUid, userEmail]);

  const systemName = system?.name?.trim() || "System";

  /** Owned row — Leave sirf apni company par (system owner ya public par row owner) */
  const canLeaveOwnedCompany = useCallback(
    (companyId: string) => {
      if (!system || !groupOwnerUid || !companyId) return false;
      if (!userOwnedCompanyIds.includes(companyId)) return false;
      if (isSystemOwner && canWrite) return true;
      if (isLocalDeviceInterCompanySystem(system) && isSystemOwner) return true;
      if (system.visibility === "public") return true;
      return false;
    },
    [system, groupOwnerUid, userOwnedCompanyIds, isSystemOwner, canWrite]
  );

  const handleLeaveCompany = async (companyId: string) => {
    if (!system || !groupOwnerUid || !companyId || !canLeaveOwnedCompany(companyId)) return;
    setLeavingCompanyId(companyId);
    try {
      await removeCompanyFromInterCompanySystem({
        systemId: system.id,
        companyId,
        actingUserId: groupOwnerUid,
      });
      if (isLocalDeviceInterCompanySystem(system)) {
        const nextSummaries = { ...(system.companySummaries ?? {}) };
        delete nextSummaries[companyId];
        const nextOwners = { ...(system.companyOwners ?? {}) };
        delete nextOwners[companyId];
        onSystemUpdated?.({
          ...system,
          companyIds: system.companyIds.filter((id) => id !== companyId),
          companySummaries: nextSummaries,
          companyOwners: nextOwners,
        });
      } else {
        const refreshed = await fetchInterCompanyGroupById(system.id);
        if (refreshed) onSystemUpdated?.(refreshed);
      }
      if (selectedOwnedCompanyId === companyId) {
        setSelectedOwnedCompanyId("");
      }
      toast.success("Company removed from this system");
    } catch (err) {
      console.error("[InterCom] leave system failed", err);
      toast.error(interCompanyGroupCreateErrorMessage(err));
    } finally {
      setLeavingCompanyId(null);
    }
  };

  const buildLocalDeviceCompanySummary = (
    company: Company | undefined,
    companyId: string
  ): InterCompanyGroupCompanySummary => {
    const name =
      String(company?.name || myOwnedCompanies.find((c) => c.id === companyId)?.name || companyId).trim();
    const pan =
      String(company?.pan || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "") || "—";
    const phone = normalizeInterCompanyPhone(company?.phone) || "—";
    const companyCode = company ? readCompanyInterCompanyCode(company) || "—" : "—";
    return { name, companyCode, pan, phone };
  };

  const handleAddMyCompany = async (companyIdToAddRaw?: string) => {
    const companyIdToAdd = String(companyIdToAddRaw || "").trim();
    if (!system || !companyIdToAdd || !canAddToSystem) return;
    setAddingCompanyId(companyIdToAdd);
    try {
      const firestoreOwnerUid = system.ownerUserId;
      const companyForSummary =
        allCompanies.find((c) => c.id === companyIdToAdd) ??
        (currentCompanyId === companyIdToAdd
          ? allCompanies.find((c) => c.id === currentCompanyId)
          : undefined);

      if (localDeviceSystem) {
        if (!isPureLocalInterCompanyCompanyFromShape(companyForSummary)) {
          toast.error("Only local-storage companies can join a local IC system.");
          return;
        }
        const companySummary = buildLocalDeviceCompanySummary(companyForSummary, companyIdToAdd);
        await assignCompanyToInterCompanyGroup({
          groups: groupsForAssign,
          companyId: companyIdToAdd,
          groupId: system.id,
          ownerUserId: firestoreOwnerUid,
          companySummary,
          companyOwner: {
            ownerUserId: companyForSummary?.ownerId || groupOwnerUid,
            ownerEmail: companyForSummary?.ownerEmail || userEmail,
          },
        });
        const updated = {
          ...system,
          companyIds: system.companyIds.includes(companyIdToAdd)
            ? system.companyIds
            : [...system.companyIds, companyIdToAdd],
          companySummaries: {
            ...(system.companySummaries ?? {}),
            [companyIdToAdd]: companySummary,
          },
          companyOwners: {
            ...(system.companyOwners ?? {}),
            [companyIdToAdd]: {
              ownerUserId: companyForSummary?.ownerId || groupOwnerUid,
              ownerEmail: companyForSummary?.ownerEmail || userEmail,
            },
          },
        };
        onSystemUpdated?.(updated);
        if (isSystemOwner) {
          onSystemCompaniesChanged?.(
            groups.map((g) => (g.id === system.id ? updated : g))
          );
        }
        setSelectedOwnedCompanyId(companyIdToAdd);
        toast.success(`Company added to ${systemName}`);
        return;
      }

      // Firestore se poora code/PAN/phone — empty fallback mat bhejo
      const companySummary = await buildCompanySummaryForPublicSystem({
        companyId: companyIdToAdd,
        companyName: myOwnedCompanies.find((c) => c.id === companyIdToAdd)?.name,
        source: companyForSummary ?? null,
        userUid: groupOwnerUid,
        userEmail,
        allowEnsureCode: true,
      });
      await upsertInterCompanyPublicCompanyProfile({
        companyId: companyIdToAdd,
        summary: companySummary,
        ownerUserId: companyForSummary?.ownerId || groupOwnerUid,
        ownerEmail: companyForSummary?.ownerEmail || userEmail,
      });
      if (!isSystemOwner && system.visibility === "public") {
        // Public system — visitor add; multi-system: apni doosri groups se mat hatao
        await addCompanyToPublicInterCompanySystem({
          systemId: system.id,
          companyId: companyIdToAdd,
          companySummary,
          ownerUserId: companyForSummary?.ownerId || groupOwnerUid,
          ownerEmail: companyForSummary?.ownerEmail || userEmail,
        });
      } else {
        await assignCompanyToInterCompanyGroup({
          groups: groupsForAssign,
          companyId: companyIdToAdd,
          groupId: system.id,
          ownerUserId: firestoreOwnerUid,
          companySummary,
          companyOwner: {
            ownerUserId: companyForSummary?.ownerId || groupOwnerUid,
            ownerEmail: companyForSummary?.ownerEmail || userEmail,
          },
        });
        const nextGroups = groupsForAssign.map((g) => {
          if (g.id !== system.id) return g;
          if (g.companyIds.includes(companyIdToAdd)) return g;
          return {
            ...g,
            companyIds: [...g.companyIds, companyIdToAdd],
            companySummaries: {
              ...(g.companySummaries ?? {}),
              [companyIdToAdd]: companySummary,
            },
            companyOwners: {
              ...(g.companyOwners ?? {}),
              [companyIdToAdd]: {
                ownerUserId: companyForSummary?.ownerId || groupOwnerUid,
                ownerEmail: companyForSummary?.ownerEmail || userEmail,
              },
            },
          };
        });
        const updated = nextGroups.find((g) => g.id === system.id)!;
        await syncSystemMemberUsers({
          system: updated,
          companyIds: updated.companyIds,
          allCompanies,
          groupOwnerUid: firestoreOwnerUid,
        });
        if (isSystemOwner) {
          onSystemCompaniesChanged?.(
            groups.map((g) => (g.id === system.id ? updated : g))
          );
        }
      }

      const refreshed =
        (await fetchInterCompanyGroupById(system.id)) ??
        ({
          ...system,
          companyIds: system.companyIds.includes(companyIdToAdd)
            ? system.companyIds
            : [...system.companyIds, companyIdToAdd],
          companySummaries: {
            ...(system.companySummaries ?? {}),
            [companyIdToAdd]: companySummary,
          },
          companyOwners: {
            ...(system.companyOwners ?? {}),
            [companyIdToAdd]: {
              ownerUserId: companyForSummary?.ownerId || groupOwnerUid,
              ownerEmail: companyForSummary?.ownerEmail || userEmail,
            },
          },
        } as typeof system);
      onSystemUpdated?.(refreshed);
      setSelectedOwnedCompanyId(companyIdToAdd);
      toast.success(`Company added to ${systemName}`);
    } catch (err) {
      console.error("[InterCom] add company failed", err);
      toast.error(interCompanyGroupCreateErrorMessage(err));
    } finally {
      setAddingCompanyId(null);
    }
  };

  const handleJoinOtherCompany = async (row: InterCompanySystemCompanyRow) => {
    if (!system || !groupOwnerUid || !selectedOwnedCompanyId) return;
    if (linkedCompanyIds.has(row.id)) return;

    const requesterCo = requesterCompanyInSystem;
    if (!requesterCo?.id) {
      toast.error("Select your company in Owned companies first.");
      return;
    }

    // Target company kiska hai — sirf apni+apni ho to direct link
    const targetOwnedByViewer =
      row.ownerUserId === groupOwnerUid ||
      isUserCompanyOwner({
        company: allCompanies.find((c) => c.id === row.id),
        userUid: groupOwnerUid,
        userEmail,
      }) ||
      system.companyOwners?.[row.id]?.ownerUserId === groupOwnerUid;

    const ownsSelected = userOwnedCompanyIds.includes(selectedOwnedCompanyId);

    setJoiningId(row.id);
    try {
      // Dono companies viewer ki — direct link (Joined)
      if (ownsSelected && targetOwnedByViewer) {
        const { settings, companyGroupId } = await loadInterCompanyJoinSettings(selectedOwnedCompanyId);
        if (
          settings.joinedCompanyIds.includes(row.id) ||
          settings.permanentJoinedCompanyIds.includes(row.id)
        ) {
          setLinkedCompanyIds((prev) => new Set([...prev, row.id]));
          return;
        }
        await saveInterCompanyJoinSettings({
          companyId: selectedOwnedCompanyId,
          settings: {
            ...settings,
            joinedCompanyIds: [...settings.joinedCompanyIds, row.id],
          },
          companyGroupId,
          updatedByUid: groupOwnerUid,
        });
        addPermanentInterCompanyJoin(selectedOwnedCompanyId, row.id);
        setLinkedCompanyIds((prev) => new Set([...prev, row.id]));
        toast.success(`Linked with ${row.name}`);
        return;
      }

      if (!hasOwnCompanyInSystem) {
        toast.error("Add your company to this system first", {
          description: "Use Add my company above, then you can request to join other companies.",
        });
        return;
      }

      const result = await sendInterCompanySystemJoinRequest({
        systemId: system.id,
        systemName,
        systemOwnerUserId: system.ownerUserId,
        targetCompanyId: row.id,
        targetCompanyName: row.name,
        requesterUserId: groupOwnerUid,
        requesterCompanyId: requesterCo.id,
        requesterCompanyName: requesterCo.name,
        requesterName,
        targetOwnerUserIdHint: row.ownerUserId,
        companyOwners: system.companyOwners,
      });
      if (!result.ok) {
        toast.error("error" in result ? result.error : "Could not send join request.");
        return;
      }
      setPendingJoinRequests((prev) => {
        if (prev.some((p) => p.targetCompanyId === row.id && p.requesterCompanyId === requesterCo.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            targetCompanyId: row.id,
            requesterCompanyId: requesterCo.id,
            targetCompanyName: row.name,
            requesterCompanyName: requesterCo.name,
          },
        ];
      });
      toast.success("Join request sent — waiting for approval");
    } finally {
      setJoiningId(null);
    }
  };

  const refreshLinkedForSelected = async () => {
    if (!selectedOwnedCompanyId) return;
    const { settings } = await loadInterCompanyJoinSettings(selectedOwnedCompanyId);
    setLinkedCompanyIds(
      new Set([
        ...settings.joinedCompanyIds.filter(Boolean),
        ...settings.permanentJoinedCompanyIds.filter(Boolean),
      ])
    );
  };

  const handleAcceptIncoming = async (req: IncomingSystemJoinRequest) => {
    if (!groupOwnerUid) return;
    setBusyRequestId(req.id);
    try {
      const result = await acceptInterCompanySystemJoinRequest({
        requestId: req.id,
        acceptedByUid: groupOwnerUid,
      });
      if (!result.ok) {
        toast.error("error" in result ? result.error : "Could not accept request.");
        return;
      }
      // Target company select + link refresh — Other section me Joined dikhe
      if (req.targetCompanyId) {
        setSelectedOwnedCompanyId(req.targetCompanyId);
        const { settings } = await loadInterCompanyJoinSettings(req.targetCompanyId);
        setLinkedCompanyIds(
          new Set([
            ...settings.joinedCompanyIds.filter(Boolean),
            ...settings.permanentJoinedCompanyIds.filter(Boolean),
            req.requesterCompanyId,
          ])
        );
      } else {
        await refreshLinkedForSelected();
      }
      if (system?.id) {
        const refreshedSystem = await fetchInterCompanyGroupById(system.id);
        if (refreshedSystem) onSystemUpdated?.(refreshedSystem);
      }
      toast.success(`Linked with ${req.requesterCompanyName}`);
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleDeclineIncoming = async (req: IncomingSystemJoinRequest) => {
    if (!groupOwnerUid) return;
    setBusyRequestId(req.id);
    try {
      const result = await declineInterCompanySystemJoinRequest({
        requestId: req.id,
        declinedByUid: groupOwnerUid,
      });
      if (!result.ok) {
        toast.error("error" in result ? result.error : "Could not decline request.");
        return;
      }
      toast.success("Join request declined");
    } finally {
      setBusyRequestId(null);
    }
  };

  const selectedOwnedName =
    owned.find((r) => r.id === selectedOwnedCompanyId)?.name?.trim() ||
    myOwnedCompanies.find((c) => c.id === selectedOwnedCompanyId)?.name?.trim() ||
    "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden",
          // Mobile — viewport se sirf 2px gap; andar cards full width
          "max-sm:left-[2px] max-sm:translate-x-0 max-sm:w-[calc(100dvw-4px)] max-sm:max-w-[calc(100dvw-4px)]",
          "max-sm:p-1 max-sm:gap-2 max-sm:rounded-md"
        )}
      >
        <DialogHeader className="max-sm:pr-8">
          <DialogTitle className="max-sm:text-base max-sm:leading-snug">
            Inter company system name —&gt; {systemName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading companies…
          </div>
        ) : (
          <div className="space-y-4 max-sm:space-y-2 w-full min-w-0">
            {incomingJoinRequests.length > 0 ? (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 rounded-md px-2.5 py-2">
                Pending join requests — use <strong>Accept</strong> or <strong>Decline</strong> on
                your owned company row below. You can also open{" "}
                <strong>Inter Company → Join → Notifications</strong>.
              </p>
            ) : null}
            {/* Top — meri companies jo is system me add nahi */}
            <div
              className={cn(
                interCompanySettingsCardClass,
                "space-y-2 p-3 w-full min-w-0 max-sm:p-2 max-sm:rounded-sm"
              )}
            >
              <p className="text-sm font-medium">My companies not in this system</p>
              <NotInSystemCompaniesTable
                rows={notInSystemRows}
                emptyText="All your companies are already in this system."
                canAdd={canAddToSystem}
                addingCompanyId={addingCompanyId}
                onAdd={(id) => void handleAddMyCompany(id)}
              />
            </div>

            <div
              className={cn(
                interCompanySettingsCardClass,
                "space-y-2 p-3 w-full min-w-0 max-sm:p-2 max-sm:rounded-sm"
              )}
            >
              <p className="text-sm font-medium">Owned companies in this system</p>
              {owned.length > 0 ? (
                <OwnedCompaniesTable
                  rows={owned}
                  emptyText="No companies in this system yet."
                  selectedId={selectedOwnedCompanyId}
                  onSelect={(row) => setSelectedOwnedCompanyId(row.id)}
                  incomingRequestCountByCompanyId={incomingRequestCountByCompanyId}
                  incomingRequestNamesByCompanyId={incomingRequestNamesByCompanyId}
                  incomingRequestsByTargetCompanyId={incomingRequestsByTargetCompanyId}
                  busyRequestId={busyRequestId}
                  onAcceptIncoming={(req) => void handleAcceptIncoming(req)}
                  onDeclineIncoming={(req) => void handleDeclineIncoming(req)}
                  canLeave={canLeaveOwnedCompany}
                  leavingCompanyId={leavingCompanyId}
                  onLeave={(id) => void handleLeaveCompany(id)}
                />
              ) : myOwnedCompanies.some((c) => (system?.companyIds ?? []).includes(c.id)) ? (
                <Select
                  value={selectedOwnedCompanyId || undefined}
                  onValueChange={setSelectedOwnedCompanyId}
                >
                  <SelectTrigger className="h-8 w-full max-w-md text-xs">
                    <SelectValue placeholder="Select your company" />
                  </SelectTrigger>
                  <SelectContent>
                    {myOwnedCompanies
                      .filter((c) => (system?.companyIds ?? []).includes(c.id))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <OwnedCompaniesTable
                  rows={owned}
                  emptyText="No companies in this system yet."
                  selectedId={selectedOwnedCompanyId}
                  onSelect={(row) => setSelectedOwnedCompanyId(row.id)}
                  incomingRequestCountByCompanyId={incomingRequestCountByCompanyId}
                  incomingRequestNamesByCompanyId={incomingRequestNamesByCompanyId}
                  incomingRequestsByTargetCompanyId={incomingRequestsByTargetCompanyId}
                  busyRequestId={busyRequestId}
                  onAcceptIncoming={(req) => void handleAcceptIncoming(req)}
                  onDeclineIncoming={(req) => void handleDeclineIncoming(req)}
                  canLeave={canLeaveOwnedCompany}
                  leavingCompanyId={leavingCompanyId}
                  onLeave={(id) => void handleLeaveCompany(id)}
                />
              )}
            </div>

            <div
              className={cn(
                interCompanySettingsCardClass,
                "space-y-2 p-3 w-full min-w-0 max-sm:p-2 max-sm:rounded-sm"
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <p className="text-sm font-medium shrink-0">
                  Other companies (public / link linked)
                </p>
                <div className="relative w-full min-w-0 sm:max-w-[14rem] sm:ml-auto">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={otherLinkedSearchQuery}
                    onChange={(e) => setOtherLinkedSearchQuery(e.target.value)}
                    placeholder="Search linked…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <OtherCompaniesTable
                rows={filteredOtherLinkedRows}
                emptyText={
                  otherLinkedSearchQuery.trim()
                    ? "No linked companies match this search."
                    : "No linked partners for the selected company yet."
                }
                selectedOwnedCompanyId={selectedOwnedCompanyId}
                selectedOwnedCompanyName={selectedOwnedName}
                linkedCompanyIds={linkedCompanyIds}
                acceptedJoinPartnerIds={acceptedJoinPartnersForOtherTables}
                pendingJoinIds={pendingJoinIdsForOtherTables}
                incomingByRequesterCompanyId={incomingByRequesterCompanyId}
                joiningId={joiningId}
                busyRequestId={busyRequestId}
                onJoin={(row) => void handleJoinOtherCompany(row)}
                onAcceptIncoming={(req) => void handleAcceptIncoming(req)}
                onDeclineIncoming={(req) => void handleDeclineIncoming(req)}
              />
            </div>

            <div
              className={cn(
                interCompanySettingsCardClass,
                "space-y-2 p-3 w-full min-w-0 max-sm:p-2 max-sm:rounded-sm"
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <p className="text-sm font-medium shrink-0">
                  Other companies (public / Not linked) on my selected company
                </p>
                <div className="relative w-full min-w-0 sm:max-w-[14rem] sm:ml-auto">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={otherNotLinkedSearchQuery}
                    onChange={(e) => setOtherNotLinkedSearchQuery(e.target.value)}
                    placeholder="Search not linked…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <OtherCompaniesTable
                rows={filteredOtherNotLinkedRows}
                emptyText={
                  otherNotLinkedSearchQuery.trim()
                    ? "No companies match this search."
                    : "No other companies available to link."
                }
                selectedOwnedCompanyId={selectedOwnedCompanyId}
                selectedOwnedCompanyName={selectedOwnedName}
                linkedCompanyIds={linkedCompanyIds}
                acceptedJoinPartnerIds={acceptedJoinPartnersForOtherTables}
                pendingJoinIds={pendingJoinIdsForOtherTables}
                incomingByRequesterCompanyId={incomingByRequesterCompanyId}
                joiningId={joiningId}
                busyRequestId={busyRequestId}
                onJoin={(row) => void handleJoinOtherCompany(row)}
                onAcceptIncoming={(req) => void handleAcceptIncoming(req)}
                onDeclineIncoming={(req) => void handleDeclineIncoming(req)}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
