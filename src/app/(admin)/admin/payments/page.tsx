
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useAuth } from '@/hooks/useAuth';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDate } from '@/hooks/useDate';
import { formatBsFromAD } from '@/lib/bs-date';
import type { Company } from '@/app/(admin)/admin/types';
import type { AppUser } from '@/app/(admin)/admin/users/page';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import { startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

type Payment = {
    id: string;
    companyId: string;
    userId: string;
    planId: string;
    amount: number;
    currency: string;
    gateway: 'stripe' | 'khalti' | 'esewa' | 'internal';
    status: string;
    createdAt: { toDate: () => Date } | null;
    paymentId: string;
    /** Stripe subscription period end at checkout; older rows may rely on company.planExpiry fallback. */
    planExpiryMs: number | null;
    planChangeFrom: string | null;
    planChangeTo: string | null;
    planChangeHistory: Record<string, unknown> | null;
};

type GatewayFilter = 'all' | Payment['gateway'];

/** One payment row loaded from Firestore (before gap insertion). */
type HistoryPaymentEvent = {
    eventKey: string;
    atMs: number;
    paymentId: string;
    companyId: string;
    history: Record<string, unknown>;
};

/** One admin row per Firebase user: merged from all their payment docs (after filters). */
type UserPaymentAggregate = {
    /** Grouping key (empty only if legacy rows lack userId). */
    userId: string;
    payments: Payment[];
    latest: Payment;
    joinedAt: Date | null;
    expiryDate: Date | null;
    companyLabel: string;
    /** Every stored plan-change snapshot for this user, newest payment first. */
    historyEvents: HistoryPaymentEvent[];
};

/** Payment block or synthetic “lapsed days” between prior expiry and next payment. */
type AugmentedHistoryItem =
    | ({ kind: "payment" } & HistoryPaymentEvent)
    | {
          kind: "gap";
          gapKey: string;
          /** End of previous plan entitlement (`newExpiryMs` of prior record). */
          fromMs: number;
          /** Time of the next successful payment (re-subscribe). */
          toMs: number;
          daysLapsed: number;
      };

const MS_DAY_ADMIN_HIST = 86_400_000;
/** Only insert a gap record when payment is at least this long after prior `newExpiryMs` (avoid same-day renew noise). */
const GAP_MIN_AFTER_EXPIRY_MS = MS_DAY_ADMIN_HIST;

function paymentCreatedMs(p: Payment): number | null {
    const t = p.createdAt?.toDate?.()?.getTime();
    return t != null && !Number.isNaN(t) ? t : null;
}

/** Parse `<input type="date">` value as local midnight start (avoids UTC shift from `Date.parse`). */
function parseYmdLocal(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

type PlanHistoryTableRow = { subject: string; old: string; new: string };

/** NPR amounts and dates formatted; pairs (plan / days / expiry) use Old vs New columns. */
function formatHistoryNpr(v: unknown): string {
    if (typeof v === "number" && !Number.isNaN(v)) {
        return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return "—";
}

/**
 * Turn stored `planChangeHistory` into Subject | Old | New rows (admin dialog table).
 * Known keys get friendly labels and order; anything else falls through as extra subjects.
 */
function buildPlanChangeHistoryRows(
    h: Record<string, unknown>,
    formatExpiryMs: (v: unknown) => string
): PlanHistoryTableRow[] {
    const g = (k: string) => h[k];
    const rows: PlanHistoryTableRow[] = [];

    const cellStr = (v: unknown) => (v === undefined || v === null ? "—" : String(v));

    if ("oldPlanId" in h || "newPlanId" in h) {
        rows.push({ subject: "Plan ID", old: cellStr(g("oldPlanId")), new: cellStr(g("newPlanId")) });
    }
    if ("oldDaysLeft" in h || "newDaysLeft" in h) {
        rows.push({ subject: "Days left", old: cellStr(g("oldDaysLeft")), new: cellStr(g("newDaysLeft")) });
    }
    if ("oldExpiryMs" in h || "newExpiryMs" in h) {
        rows.push({
            subject: "Expiry date",
            old: formatExpiryMs(g("oldExpiryMs")),
            new: formatExpiryMs(g("newExpiryMs")),
        });
    }

    const changeKind = g("changeKind");
    if (changeKind !== undefined && changeKind !== null && String(changeKind) !== "") {
        rows.push({ subject: "Change kind", old: "—", new: String(changeKind) });
    }
    const termKey = g("termKey");
    if (termKey !== undefined && termKey !== null && String(termKey) !== "") {
        rows.push({ subject: "Term", old: "—", new: String(termKey) });
    }

    if (g("grossNpr") !== undefined && g("grossNpr") !== null) {
        rows.push({ subject: "Gross (NPR)", old: "—", new: formatHistoryNpr(g("grossNpr")) });
    }
    if (g("creditNpr") !== undefined && g("creditNpr") !== null) {
        rows.push({ subject: "Credit (NPR)", old: "—", new: formatHistoryNpr(g("creditNpr")) });
    }
    if (g("netNpr") !== undefined && g("netNpr") !== null) {
        rows.push({ subject: "Net (NPR)", old: "—", new: formatHistoryNpr(g("netNpr")) });
    }

    const consumed = new Set([
        "oldPlanId",
        "newPlanId",
        "oldDaysLeft",
        "newDaysLeft",
        "oldExpiryMs",
        "newExpiryMs",
        "changeKind",
        "termKey",
        "grossNpr",
        "creditNpr",
        "netNpr",
    ]);

    for (const [key, val] of Object.entries(h)) {
        if (consumed.has(key)) continue;
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
        rows.push({
            subject: label,
            old: "—",
            new: typeof val === "object" && val !== null ? JSON.stringify(val) : cellStr(val),
        });
    }

    return rows;
}

/**
 * Between two real payments: if user paid again after the previous record’s `newExpiryMs`, insert a “lapse” record
 * so admin sees the uncovered days (renew nahi kiya, phir subscribe kiya).
 */
function augmentHistoryWithGaps(events: HistoryPaymentEvent[]): AugmentedHistoryItem[] {
    if (events.length === 0) return [];
    const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
    const chronological: AugmentedHistoryItem[] = [];

    for (let i = 0; i < sorted.length; i++) {
        if (i > 0) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            const rawPrevEnd = prev.history.newExpiryMs;
            const prevEndNum =
                typeof rawPrevEnd === "number" && !Number.isNaN(rawPrevEnd) ? rawPrevEnd : null;
            if (prevEndNum != null && curr.atMs > prevEndNum + GAP_MIN_AFTER_EXPIRY_MS) {
                const daysLapsed = Math.floor((curr.atMs - prevEndNum) / MS_DAY_ADMIN_HIST);
                chronological.push({
                    kind: "gap",
                    gapKey: `gap:${prev.eventKey}:${curr.eventKey}`,
                    fromMs: prevEndNum,
                    toMs: curr.atMs,
                    daysLapsed: Math.max(1, daysLapsed),
                });
            }
        }
        chronological.push({ kind: "payment", ...sorted[i] });
    }

    // Newest-first for the dialog (latest payment at top; gaps sit under the payment that ended the lapse).
    return chronological.reverse();
}

/** Subject | Old | New rows for a synthetic lapse record (no gateway payment). */
function buildGapHistoryRows(formatExpiryMs: (v: unknown) => string, gap: Extract<AugmentedHistoryItem, { kind: "gap" }>): PlanHistoryTableRow[] {
    return [
        {
            subject: "Record type",
            old: "—",
            new: "Subscription lapse (no active plan between prior expiry and next payment)",
        },
        {
            subject: "Prior plan ended",
            old: formatExpiryMs(gap.fromMs),
            new: "—",
        },
        {
            subject: "Resubscribed / paid again",
            old: "—",
            new: formatExpiryMs(gap.toMs),
        },
        {
            subject: "Approx. days without renewal",
            old: "—",
            new: String(gap.daysLapsed),
        },
    ];
}

/** Total items in admin history dialog (payments + gap records). */
function countAugmentedHistory(events: HistoryPaymentEvent[]): number {
    return augmentHistoryWithGaps(events).length;
}

type PlanChangeHistoryDialogBodyProps = {
    historyEvents: HistoryPaymentEvent[];
    userLabel: string;
    userId: string;
    companyMap: Map<string, string | undefined>;
    formatPaymentDate: (d: Date) => string;
    formatHistoryMillis: (v: unknown) => string;
    copyPaymentId: (id: string) => void | Promise<void>;
};

/**
 * History list: each record is a clickable card; selected card gets a bold primary (blue) outline.
 * Copy buttons stopPropagation so they don’t change selection.
 */
function PlanChangeHistoryDialogBody({
    historyEvents,
    userLabel,
    userId,
    companyMap,
    formatPaymentDate,
    formatHistoryMillis,
    copyPaymentId,
}: PlanChangeHistoryDialogBodyProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const augmented = useMemo(() => augmentHistoryWithGaps(historyEvents), [historyEvents]);
    const gapCount = useMemo(() => augmented.filter((x) => x.kind === "gap").length, [augmented]);
    const payCount = useMemo(() => augmented.filter((x) => x.kind === "payment").length, [augmented]);

    return (
        <>
            <DialogHeader>
                <DialogTitle>
                    Plan change history
                    {userId ? ` · ${userLabel}` : ""}
                </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">
                <span className="font-medium text-foreground">
                    {augmented.length} record
                    {augmented.length !== 1 ? "s" : ""}
                </span>
                {gapCount > 0 ? (
                    <span className="ml-1">
                        ({payCount} payment{payCount !== 1 ? "s" : ""}, {gapCount} lapse gap{gapCount !== 1 ? "s" : ""})
                    </span>
                ) : null}
            </p>
            <div className="space-y-6 text-sm">
                {augmented.map((item) => {
                    const rowKey = item.kind === "payment" ? item.eventKey : item.gapKey;
                    const isSelected = selectedKey === rowKey;
                    return (
                        <div
                            key={rowKey}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedKey((prev) => (prev === rowKey ? null : rowKey))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedKey((prev) => (prev === rowKey ? null : rowKey));
                                }
                            }}
                            className={cn(
                                "rounded-lg border-2 bg-muted/30 p-4 space-y-3 shadow-sm cursor-pointer transition-[box-shadow,border-color,background-color] outline-none",
                                isSelected
                                    ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                                    : "border-border/70 hover:bg-muted/40"
                            )}
                            aria-pressed={isSelected}
                        >
                            {item.kind === "gap" ? (
                                <>
                                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 border-b border-amber-200/50 dark:border-amber-800/50 pb-2">
                                        Subscription lapse · {item.daysLapsed} day
                                        {item.daysLapsed !== 1 ? "s" : ""} without renewal
                                    </p>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[28%]">Subject</TableHead>
                                                <TableHead className="w-[36%]">Old</TableHead>
                                                <TableHead className="w-[36%]">New</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {buildGapHistoryRows(
                                                (v) => {
                                                    if (v === undefined || v === null || v === "") return "—";
                                                    if (typeof v === "number" && !Number.isNaN(v)) {
                                                        return formatHistoryMillis(v);
                                                    }
                                                    return String(v);
                                                },
                                                item
                                            ).map((row, idx) => (
                                                <TableRow key={`${item.gapKey}-${idx}`}>
                                                    <TableCell className="font-medium text-muted-foreground align-top">
                                                        {row.subject}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs break-words align-top">
                                                        {row.old}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs break-words align-top">
                                                        {row.new}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground border-b pb-2">
                                        <span className="shrink-0 whitespace-nowrap">
                                            {formatPaymentDate(new Date(item.atMs))}
                                        </span>
                                        <Tooltip delayDuration={250}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="min-w-0 max-w-[12rem] sm:max-w-[16rem] truncate font-mono text-left text-xs rounded px-0.5 hover:bg-muted/80 cursor-copy focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                    aria-label={`Copy transaction ID: ${item.paymentId}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void copyPaymentId(item.paymentId);
                                                    }}
                                                >
                                                    {item.paymentId}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                side="top"
                                                className="max-w-[min(90vw,36rem)] break-all font-mono text-xs"
                                            >
                                                {item.paymentId}
                                            </TooltipContent>
                                        </Tooltip>
                                        <span className="shrink-0">
                                            · {companyMap.get(item.companyId) || item.companyId}
                                        </span>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[28%]">Subject</TableHead>
                                                <TableHead className="w-[36%]">Old</TableHead>
                                                <TableHead className="w-[36%]">New</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {buildPlanChangeHistoryRows(item.history, (v) => {
                                                if (v === undefined || v === null || v === "") return "—";
                                                if (typeof v === "number" && !Number.isNaN(v)) {
                                                    return formatHistoryMillis(v);
                                                }
                                                return String(v);
                                            }).map((row, idx) => (
                                                <TableRow key={`${item.eventKey}-${idx}`}>
                                                    <TableCell className="font-medium text-muted-foreground align-top">
                                                        {row.subject}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs break-words align-top">
                                                        {row.old}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs break-words align-top">
                                                        {row.new}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}

export default function PaymentsPage() {
    const { loading: adminGateLoading } = useAdminAccess(['SuperAdmin']);
    const { user: firebaseUser, loading: authLoading } = useAuth();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [gatewayFilter, setGatewayFilter] = useState<GatewayFilter>("all");
    const [dateFromYmd, setDateFromYmd] = useState("");
    const [dateToYmd, setDateToYmd] = useState("");
    const [pageSize, setPageSize] = useState(20);
    const [page, setPage] = useState(1);

    // Respect header date system (AD / BS / Both) same as dashboard vouchers (e.g. LinkPaymentToTxnsDialog).
    const { dateSystem, formatDate, dateFormatBS } = useDate();

    /**
     * Admin table: same BS rules as billing — NepaliDate range + datex-bs extension; “(AD)” only when no BS exists.
     */
    const formatPaymentDate = useCallback(
        (d: Date | null | undefined) => {
            if (!d || !(d instanceof Date) || isNaN(d.getTime())) return 'N/A';
            const ad = formatDate(d) || 'N/A';
            if (dateSystem === 'AD') return ad;
            const bs = formatBsFromAD(d, dateFormatBS);
            if (dateSystem === 'BS') return bs || `${ad} (AD)`;
            return bs ? `${bs} (${ad})` : ad;
        },
        [dateSystem, formatDate, dateFormatBS]
    );

    // collectionGroup on client hits strict rules; Admin route reads with service account (see /api/admin/subscription-payments).
    useEffect(() => {
        if (adminGateLoading || authLoading || !firebaseUser) return;

        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const token = await firebaseUser.getIdToken();
                const res = await fetch("/api/admin/subscription-payments", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const list = (data.payments ?? []).map(
                    (p: {
                        id: string;
                        companyId: string;
                        userId: string;
                        planId: string;
                        amount: number;
                        currency: string;
                        gateway: string;
                        status: string;
                        paymentId: string;
                        createdAtMs: number | null;
                        planExpiryMs?: number | null;
                        planChangeFrom?: string | null;
                        planChangeTo?: string | null;
                        planChangeHistory?: Record<string, unknown> | null;
                    }) =>
                        ({
                            id: p.id,
                            companyId: p.companyId,
                            userId: p.userId,
                            planId: p.planId,
                            amount: p.amount,
                            currency: p.currency,
                            gateway: p.gateway as Payment["gateway"],
                            status: p.status,
                            paymentId: p.paymentId,
                            createdAt:
                                p.createdAtMs != null ? { toDate: () => new Date(p.createdAtMs) } : null,
                            planExpiryMs:
                                typeof p.planExpiryMs === "number" && !Number.isNaN(p.planExpiryMs)
                                    ? p.planExpiryMs
                                    : null,
                            planChangeFrom: p.planChangeFrom ?? null,
                            planChangeTo: p.planChangeTo ?? null,
                            planChangeHistory:
                                p.planChangeHistory != null && typeof p.planChangeHistory === "object"
                                    ? p.planChangeHistory
                                    : null,
                        }) as Payment
                );
                if (!cancelled) setPayments(list);
            } catch (e) {
                console.error("Error fetching payments:", e);
                if (!cancelled) setPayments([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [firebaseUser, adminGateLoading, authLoading]);

    useEffect(() => {
        if (adminGateLoading || authLoading || !firebaseUser) return;

        const companiesQuery = query(collection(firestore, 'companies'));
        const usersQuery = query(collection(firestore, 'users'));

        const unsubCompanies = onSnapshot(companiesQuery, (snapshot) => {
            setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
        }, (err) => console.error("Error fetching companies:", err));

        const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
        }, (err) => console.error("Error fetching users:", err));

        return () => {
            unsubCompanies();
            unsubUsers();
        };
    }, [firebaseUser, adminGateLoading, authLoading]);

    const companyMap = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u.displayName || u.email])), [users]);

    /** Latest company plan expiry (fallback when payment row has no planExpiryMs — e.g. legacy data). */
    const companyExpiryMap = useMemo(() => {
        const m = new Map<string, Date | null>();
        for (const c of companies) {
            const pe = c.planExpiry;
            let dt: Date | null = null;
            if (pe != null && typeof (pe as { toDate?: () => Date }).toDate === "function") {
                try {
                    const d = (pe as { toDate: () => Date }).toDate();
                    dt = isNaN(d.getTime()) ? null : d;
                } catch {
                    dt = null;
                }
            }
            m.set(c.id, dt);
        }
        return m;
    }, [companies]);

    const resolveExpiryDate = useCallback(
        (p: Payment): Date | null => {
            if (p.planExpiryMs != null) {
                const d = new Date(p.planExpiryMs);
                return isNaN(d.getTime()) ? null : d;
            }
            return companyExpiryMap.get(p.companyId) ?? null;
        },
        [companyExpiryMap]
    );

    const filteredPayments = useMemo(() => {
        let list = payments;

        if (gatewayFilter !== "all") {
            list = list.filter((p) => p.gateway === gatewayFilter);
        }

        if (dateFromYmd) {
            const from = startOfDay(parseYmdLocal(dateFromYmd)).getTime();
            list = list.filter((p) => {
                const t = p.createdAt?.toDate?.()?.getTime();
                return t != null && !Number.isNaN(t) && t >= from;
            });
        }
        if (dateToYmd) {
            const to = endOfDay(parseYmdLocal(dateToYmd)).getTime();
            list = list.filter((p) => {
                const t = p.createdAt?.toDate?.()?.getTime();
                return t != null && !Number.isNaN(t) && t <= to;
            });
        }

        if (!searchTerm) return list;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return list.filter(p =>
            p.paymentId.toLowerCase().includes(lowerCaseSearch) ||
            p.planId.toLowerCase().includes(lowerCaseSearch) ||
            p.gateway.toLowerCase().includes(lowerCaseSearch) ||
            (p.planChangeFrom?.toLowerCase().includes(lowerCaseSearch) ?? false) ||
            (p.planChangeTo?.toLowerCase().includes(lowerCaseSearch) ?? false) ||
            userMap.get(p.userId)?.toLowerCase().includes(lowerCaseSearch) ||
            companyMap.get(p.companyId)?.toLowerCase().includes(lowerCaseSearch)
        );
    }, [payments, gatewayFilter, dateFromYmd, dateToYmd, searchTerm, companyMap, userMap]);

    /** Collapse to one row per user; History merges every `planChangeHistory` on that user’s payment docs. */
    const aggregatedByUser = useMemo((): UserPaymentAggregate[] => {
        const groups = new Map<string, Payment[]>();
        for (const p of filteredPayments) {
            const uid = p.userId?.trim() || `__missing_uid__:${p.id}`;
            const arr = groups.get(uid) ?? [];
            arr.push(p);
            groups.set(uid, arr);
        }

        const out: UserPaymentAggregate[] = [];
        for (const [groupKey, list] of groups) {
            const sorted = [...list].sort((a, b) => {
                const ta = paymentCreatedMs(a) ?? 0;
                const tb = paymentCreatedMs(b) ?? 0;
                return tb - ta;
            });
            const latest = sorted[0];
            const times = sorted.map(paymentCreatedMs).filter((t): t is number => t != null);
            const joinedAt = times.length ? new Date(Math.min(...times)) : null;

            let maxExpiry = -Infinity;
            for (const p of sorted) {
                const d = resolveExpiryDate(p);
                const t = d?.getTime();
                if (t != null && !Number.isNaN(t)) maxExpiry = Math.max(maxExpiry, t);
            }
            const expiryDate = maxExpiry === -Infinity ? null : new Date(maxExpiry);

            const companyIds = [...new Set(sorted.map((x) => x.companyId).filter(Boolean))];
            const companyLabel =
                companyIds.length === 0
                    ? "N/A"
                    : companyIds.length === 1
                      ? companyMap.get(companyIds[0]) || companyIds[0]
                      : companyIds.map((id) => companyMap.get(id) || id).join(", ");

            const historyEvents = sorted
                .filter((p) => p.planChangeHistory != null)
                .map((p) => ({
                    eventKey: `${p.id}:${paymentCreatedMs(p) ?? 0}`,
                    atMs: paymentCreatedMs(p) ?? 0,
                    paymentId: p.paymentId,
                    companyId: p.companyId,
                    history: p.planChangeHistory as Record<string, unknown>,
                }))
                .sort((a, b) => b.atMs - a.atMs);

            const userId = groupKey.startsWith("__missing_uid__:") ? "" : groupKey;

            out.push({
                userId,
                payments: sorted,
                latest,
                joinedAt,
                expiryDate,
                companyLabel,
                historyEvents,
            });
        }

        out.sort((a, b) => (paymentCreatedMs(b.latest) ?? 0) - (paymentCreatedMs(a.latest) ?? 0));
        return out;
    }, [filteredPayments, companyMap, resolveExpiryDate]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, gatewayFilter, dateFromYmd, dateToYmd]);

    const totalFiltered = aggregatedByUser.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1);
    const safePage = Math.min(page, totalPages);
    const pageSlice = useMemo(() => {
        const p = Math.min(page, totalPages);
        const start = (p - 1) * pageSize;
        return aggregatedByUser.slice(start, start + pageSize);
    }, [aggregatedByUser, page, pageSize, totalPages]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const showFrom = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const showTo = Math.min(safePage * pageSize, totalFiltered);

    const renderLoadingRows = () => (
        Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={`loading-${i}`}>
                <TableCell colSpan={10}><Skeleton className="h-8 w-full" /></TableCell>
            </TableRow>
        ))
    );

    const formatHistoryMillis = useCallback(
        (v: unknown) => {
            if (typeof v !== "number" || Number.isNaN(v)) return "—";
            return formatPaymentDate(new Date(v));
        },
        [formatPaymentDate]
    );

    /** Click: copy full gateway/Stripe id; hover (Tooltip) shows full string in a fixed-width column. */
    const copyPaymentId = useCallback(async (id: string) => {
        try {
            await navigator.clipboard.writeText(id);
            toast({ title: "Copied", description: "Transaction ID copied to clipboard." });
        } catch {
            toast({
                variant: "destructive",
                title: "Copy failed",
                description: "Could not access the clipboard.",
            });
        }
    }, []);

    const tableLoading = adminGateLoading || authLoading || loading;
    const dateCellClass = dateSystem === 'Both' ? 'whitespace-nowrap' : undefined;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Subscription Payments</CardTitle>
                    <CardDescription>
                        One row per user (payments are grouped). Open History to see every plan change recorded for that
                        user.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                        <div className="relative min-w-[200px] flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search payments..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1 w-full sm:w-[200px]">
                            <span className="text-xs text-muted-foreground">Gateway</span>
                            <Select value={gatewayFilter} onValueChange={(v) => setGatewayFilter(v as GatewayFilter)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Gateway" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="stripe">Stripe</SelectItem>
                                    <SelectItem value="khalti">Khalti</SelectItem>
                                    <SelectItem value="esewa">eSewa</SelectItem>
                                    <SelectItem value="internal">Internal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1 w-full sm:w-[160px]">
                            <span className="text-xs text-muted-foreground">Date from</span>
                            <Input
                                type="date"
                                value={dateFromYmd}
                                onChange={(e) => setDateFromYmd(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1 w-full sm:w-[160px]">
                            <span className="text-xs text-muted-foreground">Date to</span>
                            <Input
                                type="date"
                                value={dateToYmd}
                                onChange={(e) => setDateToYmd(e.target.value)}
                            />
                        </div>
                        {(dateFromYmd || dateToYmd) ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="self-start sm:self-end"
                                onClick={() => { setDateFromYmd(""); setDateToYmd(""); }}
                            >
                                Clear dates
                            </Button>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <ScrollArea className="h-[70vh]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Joined date</TableHead>
                                    <TableHead>Expiry date</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Plan ID</TableHead>
                                    <TableHead>Changed plan</TableHead>
                                    <TableHead>History</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Gateway</TableHead>
                                    {/* Fixed width so long Stripe session ids don’t stretch the whole table; cell uses tooltip + copy. */}
                                    <TableHead className="w-40 min-w-[10rem] max-w-[10rem]">Transaction ID</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tableLoading ? renderLoadingRows() : (
                                    aggregatedByUser.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center py-16 text-muted-foreground">No payments found.</TableCell>
                                        </TableRow>
                                    ) : (
                                        pageSlice.map((agg) => {
                                            const p = agg.latest;
                                            const userLabel = agg.userId ? userMap.get(agg.userId) || agg.userId : "—";
                                            return (
                                            <TableRow key={agg.userId || agg.latest.id}>
                                                <TableCell className={dateCellClass}>
                                                    {agg.joinedAt ? formatPaymentDate(agg.joinedAt) : "N/A"}
                                                </TableCell>
                                                <TableCell className={dateCellClass}>
                                                    {formatPaymentDate(agg.expiryDate)}
                                                </TableCell>
                                                <TableCell className="max-w-[12rem] truncate" title={agg.companyLabel}>
                                                    {agg.companyLabel}
                                                </TableCell>
                                                <TableCell>{userLabel}</TableCell>
                                                <TableCell><Badge variant="secondary">{p.planId}</Badge></TableCell>
                                                <TableCell className="text-sm">
                                                    {p.planChangeFrom != null && p.planChangeFrom !== "" ? (
                                                        <span className="flex flex-col gap-0.5 items-start">
                                                            <span className="whitespace-nowrap">
                                                                {p.planChangeFrom} → {p.planChangeTo ?? p.planId}
                                                            </span>
                                                            {agg.historyEvents.length > 1 ? (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    +{agg.historyEvents.length - 1} older change
                                                                    {agg.historyEvents.length - 1 > 1 ? "s" : ""} in History
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                    ) : agg.historyEvents.length > 0 ? (
                                                        <span className="text-muted-foreground text-xs">
                                                            {agg.historyEvents.length} change{agg.historyEvents.length > 1 ? "s" : ""} — see History
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {agg.historyEvents.length > 0 ? (
                                                        <Dialog>
                                                            <DialogTrigger asChild>
                                                                <Button type="button" variant="outline" size="sm">
                                                                    View ({countAugmentedHistory(agg.historyEvents)})
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                                                                <PlanChangeHistoryDialogBody
                                                                    historyEvents={agg.historyEvents}
                                                                    userLabel={userLabel}
                                                                    userId={agg.userId}
                                                                    companyMap={companyMap}
                                                                    formatPaymentDate={(d) => formatPaymentDate(d)}
                                                                    formatHistoryMillis={formatHistoryMillis}
                                                                    copyPaymentId={copyPaymentId}
                                                                />
                                                            </DialogContent>
                                                        </Dialog>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{p.amount.toFixed(2)} {p.currency}</TableCell>
                                                <TableCell><Badge>{p.gateway}</Badge></TableCell>
                                                <TableCell className="min-w-0 max-w-[10rem] w-40 p-1 align-middle">
                                                    <Tooltip delayDuration={250}>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className="block w-full min-w-0 truncate text-left font-mono text-xs rounded px-0.5 py-0.5 hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-copy"
                                                                aria-label={`Copy transaction ID: ${p.paymentId}`}
                                                                onClick={() => void copyPaymentId(p.paymentId)}
                                                            >
                                                                {p.paymentId}
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent
                                                            side="top"
                                                            align="start"
                                                            className="max-w-[min(90vw,36rem)] break-all font-mono text-xs"
                                                        >
                                                            {p.paymentId}
                                                            {agg.payments.length > 1 ? (
                                                                <span className="block mt-1 text-muted-foreground">
                                                                    Latest of {agg.payments.length} payments — others in History
                                                                </span>
                                                            ) : null}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                            );
                                        })
                                    )
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                    {!tableLoading && totalFiltered > 0 ? (
                        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <span>Rows per page</span>
                                <Select
                                    value={String(pageSize)}
                                    onValueChange={(v) => {
                                        setPageSize(Number(v));
                                        setPage(1);
                                    }}
                                >
                                    <SelectTrigger className="w-[72px] h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="20">20</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                    </SelectContent>
                                </Select>
                                <span className="tabular-nums">
                                    {showFrom}–{showTo} of {totalFiltered}
                                </span>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((x) => Math.max(1, x - 1))}
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm tabular-nums px-1">
                                    Page {safePage} / {totalPages}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
