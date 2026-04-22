
"use client";

import * as React from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  writeBatch,
  where,
  deleteDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { MailOpen, Trash2, Loader2, ShieldOff, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { isSuppressibleNewTransactionAlert } from "@/lib/transactionAlerts";

type Notification = {
  id: string;
  message: string;
  timestamp: any;
  isRead: boolean;
  type?: string;
  voucherId?: string;
  companyId?: string;
  voucherNumber?: string;
  attemptedBy?: {
    uid: string;
    email: string;
    name?: string;
  };
};

export function AlertsTab({
  onStartChat,
  onOpenVoucher,
  onOpenHistory,
}: {
  onStartChat?: (userId: string) => void;
  /** When provided, "Open Voucher" opens voucher in edit (same page or navigate). */
  onOpenVoucher?: (companyId: string, voucherId: string) => void;
  /** When provided, "View changes" opens voucher history instead of edit. */
  onOpenHistory?: (
    companyId: string,
    voucherId: string,
    notificationTimestamp?: any,
    changedByUid?: string,
    notificationId?: string
  ) => void;
}) {
  const { user, customUser, loading: authLoading } = useAuth();
  /** Alerts har company alag honi chahiye — warna dusri company ke "Transaction edited" yahan dikh jate hain. */
  const { company, companyId } = useCompany();
  const isMobile = useIsMobile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Notification | null>(null);
  const isCompanyOwner = company?.isOwned === true;
  const recipientIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (user?.uid) ids.add(user.uid);
    if (customUser?.userDocId) ids.add(customUser.userDocId);
    return Array.from(ids);
  }, [user?.uid, customUser?.userDocId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const securityAttemptCountMap = React.useMemo(() => {
    const grouped: Record<string, number> = {};
    notifications
      .filter((n: any) => n.type === "security_alert")
      .forEach((n: any) => {
        const key = `${n.companyId || "na"}::${n.attemptedBy?.uid || n.attemptedBy?.email || "na"}`;
        grouped[key] = (grouped[key] || 0) + 1;
      });
    return grouped;
  }, [notifications]);
  const getAlertTitle = (n: Notification) => {
    const kind = (n as any).kind;
    if (kind === "large_amount") return "Large amount added";
    if (kind === "edited") return "Transaction edited";
    if (kind === "deleted") return "Transaction deleted";
    return "Alert";
  };
  const getByLabel = (n: Notification) => {
    const by = (n as any).attemptedBy;
    if (by?.email) return by.email;
    if (by?.uid) return by.uid;
    return "Someone";
  };
  const getUserNameOnly = (n: Notification) => {
    const by = (n as any).attemptedBy;
    if (by?.name) return by.name;
    if (by?.email) {
      const beforeAt = by.email.split("@")[0];
      return beforeAt || by.email;
    }
    return "—";
  };
  const formatTs = (ts: any) => {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    return d ? format(d, "PPp") : "—";
  };

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setLoading(false);
      return;
    }

    if (!isCompanyOwner) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    if (!companyId?.trim()) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    if (!recipientIds.length) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const unsubscribers: Array<() => void> = [];
    const byRecipient: Record<string, Map<string, Notification>> = {};
    const recompute = () => {
      const mergedById = new Map<string, Notification>();
      Object.values(byRecipient).forEach((m) => m.forEach((v, k) => mergedById.set(k, v)));
      const sorted = Array.from(mergedById.values())
        // User request: normal "new transaction added" alerts hide; big amount alerts still visible.
        .filter((n) => !isSuppressibleNewTransactionAlert(n as any))
        .sort((a: any, b: any) => {
          const aTs = a?.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          const bTs = b?.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          return bTs - aTs;
        });
      setNotifications(sorted);
      setLoading(false);
    };

    recipientIds.forEach((id) => {
      const q = query(
        collection(firestore, "admin_notifications"),
        where("recipientUserId", "==", id),
        where("companyId", "==", companyId),
        orderBy("timestamp", "desc")
      );
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const nextMap = new Map<string, Notification>();
          snapshot.docs.forEach((d) => nextMap.set(d.id, { id: d.id, ...d.data() } as Notification));
          byRecipient[id] = nextMap;
          recompute();
        },
        (error) => {
          console.error("Failed to fetch notifications:", error);
          setLoading(false);
        }
      );
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [user, authLoading, recipientIds, isCompanyOwner, companyId]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(firestore, "admin_notifications", id), { isRead: true });
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    if(unread.length === 0) return;
    
    const batch = writeBatch(firestore);
    unread.forEach(n => {
        const docRef = doc(firestore, "admin_notifications", n.id);
        batch.update(docRef, { isRead: true });
    });
    await batch.commit();
  }
  
  const handleDelete = async (item: Notification) => {
    setIsProcessing(true);
    try {
        await deleteDoc(doc(firestore, "admin_notifications", item.id));
        toast.success("Notification deleted.");
    } catch (error) {
        toast.error("Failed to delete notification.");
    } finally {
        setIsProcessing(false);
        setItemToDelete(null);
    }
  }


  const handleDeleteAll = async () => {
      setIsProcessing(true);
      try {
          // Firestore batch limit is 500; chunk into batches
          const BATCH_SIZE = 500;
          const toDelete = notifications.filter(
            (n) => !user?.uid || (n as any).recipientUserId === user.uid
          );
          for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
            const chunk = toDelete.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(firestore);
            chunk.forEach((n) => {
              batch.delete(doc(firestore, "admin_notifications", n.id));
            });
            await batch.commit();
          }
          toast.success("All notifications deleted.");
      } catch (error) {
          console.error("Failed to delete all notifications:", error);
          toast.error("Failed to delete all notifications.");
      } finally {
          setIsProcessing(false);
      }
  }

  const LoadingSkeleton = () => (
    <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
    </div>
  )

  return (
    <Card className="h-full flex flex-col w-full">
      <CardHeader className={cn("space-y-3 px-[2px]", isMobile && "pb-2")}>
        <div className={cn("flex flex-col gap-3", isMobile ? "" : "flex-row justify-between items-start")}>
            <div>
                 <CardTitle className="text-base sm:text-lg">Alerts & Notifications</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                Important system alerts and scheduled alarms will appear here.
                </CardDescription>
            </div>
            <div className={cn("flex items-center gap-2", isMobile && "flex-wrap")}>
                <Button onClick={handleMarkAllAsRead} disabled={unreadCount === 0} size={isMobile ? "sm" : "default"}>
                    <MailOpen className={cn("h-4 w-4", !isMobile && "mr-2")} />
                    {!isMobile && "Mark All as Read"}
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={notifications.length === 0 || isProcessing} size={isMobile ? "sm" : "default"}>
                            <Trash2 className={cn("h-4 w-4", !isMobile && "mr-2")} />
                            {!isMobile && "Delete All"}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete all {notifications.length} notifications. This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAll}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
        {!loading && !authLoading && notifications.length > 0 && isMobile && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{notifications.length} alert{notifications.length !== 1 ? "s" : ""}</span>
            {unreadCount > 0 && (
              <>
                <span>•</span>
                <Badge variant="secondary" className="text-xs px-1.5 py-0">{unreadCount} unread</Badge>
              </>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 pt-0 px-[2px]">
        <ScrollArea className="flex-1 w-full">
            <div className="space-y-1 sm:space-y-2 pb-4 w-full">
            {loading || authLoading ? (
                <LoadingSkeleton />
            ) : !isCompanyOwner ? (
                <div className="text-center py-12 sm:py-16 text-muted-foreground text-sm">
                    Alerts are only visible to the company owner.
                </div>
            ) : notifications.length === 0 ? (
                <div className="text-center py-12 sm:py-16 text-muted-foreground text-sm">
                    You have no new messages.
                </div>
            ) : (
                notifications.map((n) => {
                    const isSecurityAlert = (n as any).type === "security_alert";
                    const securityKey = `${(n as any).companyId || "na"}::${(n as any).attemptedBy?.uid || (n as any).attemptedBy?.email || "na"}`;
                    const securityAttemptCount = securityAttemptCountMap[securityKey] || 1;
                    const canChat = onStartChat && isSecurityAlert && (n as any).attemptedBy?.uid && (n as any).attemptedBy.uid !== user?.uid;
                    const isTransactionAlert = (n as any).type === "transaction_alert";
                    const hasOpenEdit = isTransactionAlert && (n as any).voucherId && (n as any).companyId;
                    const timeAgo = n.timestamp?.toDate ? formatDistanceToNow(n.timestamp.toDate(), { addSuffix: true }) : "";
                    const voucherNo = (n as any).voucherNumber;
                    const amountFormatted = (n as any).amountFormatted;
                    const amount = (n as any).amount;
                    const amountStr = amountFormatted ?? (amount != null && typeof amount === "number" ? `Rs. ${amount.toLocaleString("en-IN")}` : null);

                    const rawChanges = (n as any).kind === "edited" && (n as any).changes?.length ? (n as any).changes as string[] : null;
                    const editedChanges = rawChanges?.map((c: string) => `${c} changed`) ?? null;
                    const isAlarm = (n as any).type === "alarm";
                    const alarmForUsers = (n as any).alarmForUsers as string[] | undefined;
                    const alarmCreatedByName = (n as any).alarmCreatedByName;
                    const alarmCreatedAt = (n as any).alarmCreatedAt;
                    const alarmDatetime = (n as any).alarmDatetime;
                    const alarmNotifyAt = (n as any).alarmNotifyAt;
                    const alarmMessage = (n as any).alarmTitle || (n as any).message;
                    const alarmDateDisplay = formatTs(alarmDatetime) !== "—" ? formatTs(alarmDatetime) : formatTs(alarmNotifyAt);

                    const rows: { label: string; right: React.ReactNode }[] = [
                      {
                        label: isTransactionAlert ? getAlertTitle(n) : "Alert",
                        right: (
                          <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs" onClick={() => setItemToDelete(n)}>
                            Delete
                          </Button>
                        ),
                      },
                      ...(isAlarm && alarmMessage ? [{
                        label: "Message",
                        right: <span className="text-sm">{alarmMessage}</span>,
                      }] : []),
                      ...(isAlarm && alarmForUsers?.length ? [{
                        label: "For user(s)",
                        right: <span className="text-sm">{alarmForUsers.join(", ")}</span>,
                      }] : []),
                      ...(isAlarm ? [{
                        label: "Created by",
                        right: <span className="text-sm">{alarmCreatedByName || "—"}</span>,
                      }] : []),
                      ...(isAlarm ? [{
                        label: "Created date",
                        right: <span className="text-sm">{formatTs(alarmCreatedAt)}</span>,
                      }] : []),
                      ...(isAlarm && alarmDateDisplay !== "—" ? [{
                        label: "Alarm date",
                        right: <span className="text-sm">{alarmDateDisplay}</span>,
                      }] : []),
                      ...(!isSecurityAlert && !isAlarm && (voucherNo || amountStr) ? [{
                        label: voucherNo ?? "—",
                        right: (
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {amountStr ? <span className="text-sm font-medium">{amountStr}</span> : null}
                            {hasOpenEdit && (onOpenVoucher
                              ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenVoucher((n as any).companyId, (n as any).voucherId)}
                                    className="text-primary font-medium text-xs sm:text-sm underline underline-offset-2 hover:no-underline"
                                  >
                                    Open Voucher
                                  </button>
                                )
                              : (
                                  <Link href={`/dashboard?editVoucher=${(n as any).voucherId}&companyId=${(n as any).companyId}`} className="text-primary font-medium text-xs sm:text-sm underline underline-offset-2 hover:no-underline">
                                    Open Voucher
                                  </Link>
                                ))}
                          </span>
                        ),
                      }] : []),
                      ...(editedChanges && editedChanges.length > 0 ? [{
                        label: "Changes",
                        right: <span className="text-sm text-muted-foreground">{editedChanges.join(", ")}</span>,
                      }] : []),
                      ...(!isAlarm ? [{
                        label: "User",
                        right: <span className="text-sm">{getUserNameOnly(n)}</span>,
                      }] : []),
                      ...(isSecurityAlert ? [{
                        label: "Attempts",
                        right: <span className="text-sm font-medium">{securityAttemptCount}</span>,
                      }] : []),
                      {
                        label: timeAgo || "—",
                        right: hasOpenEdit
                          ? onOpenHistory
                            ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenHistory(
                                      (n as any).companyId,
                                      (n as any).voucherId,
                                      (n as any).timestamp,
                                      (n as any).attemptedBy?.uid,
                                      n.id
                                    )
                                  }
                                  className="text-primary font-medium text-xs sm:text-sm underline underline-offset-2 hover:no-underline"
                                >
                                  View changes
                                </button>
                              )
                            : onOpenVoucher
                              ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenVoucher((n as any).companyId, (n as any).voucherId)}
                                    className="text-primary font-medium text-xs sm:text-sm underline underline-offset-2 hover:no-underline"
                                  >
                                    View changes
                                  </button>
                                )
                              : (
                                  <Link href={`/dashboard?editVoucher=${(n as any).voucherId}&companyId=${(n as any).companyId}`} className="text-primary font-medium text-xs sm:text-sm underline underline-offset-2 hover:no-underline">
                                    View changes
                                  </Link>
                                )
                          : null,
                      },
                    ];

                    return (
                        <Card
                            key={n.id}
                            className={cn(
                                "p-2.5 sm:p-3 min-w-0 overflow-hidden border border-border/80 shadow-sm transition-colors",
                                !n.isRead && "bg-blue-50/80 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
                                isSecurityAlert && "bg-red-50/80 border-red-200 dark:bg-red-900/30 border-l-4 border-l-red-600"
                            )}
                        >
                            {isSecurityAlert && (
                              <div className="flex items-center gap-2 mb-2">
                                <ShieldOff className="h-4 w-4 text-red-600 shrink-0" />
                              </div>
                            )}
                            <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 sm:gap-y-2 items-baseline text-sm">
                              {rows.map((row, i) => (
                                <React.Fragment key={i}>
                                  <span className={cn(
                                    "text-muted-foreground truncate",
                                    i === 0 && "font-bold text-foreground"
                                  )}>
                                    {row.label}
                                  </span>
                                  <div className="text-right shrink-0 min-w-0 flex justify-end items-center gap-2">
                                    {row.right}
                                  </div>
                                </React.Fragment>
                              ))}
                              <span className="col-span-1" />
                              <div className={cn(
                                "col-span-2 flex flex-wrap gap-2 items-center",
                                isSecurityAlert && n.message ? "justify-end sm:justify-between" : "justify-end"
                              )}>
                                {isSecurityAlert && n.message && (
                                  <p className="text-xs sm:text-sm text-foreground w-full min-w-0 max-w-full break-words flex-1 basis-full sm:basis-0 sm:min-w-[12rem] order-first sm:order-none mr-0 sm:mr-2">
                                    {n.message}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 shrink-0">
                                {!n.isRead && (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary shrink-0" onClick={() => handleMarkAsRead(n.id)}>
                                    Mark as Read
                                  </Button>
                                )}
                                {canChat && (
                                  <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => onStartChat((n as any).attemptedBy.uid)}>
                                    <MessageSquare className="h-3.5 w-3.5 mr-1" /> Chat
                                  </Button>
                                )}
                                </div>
                              </div>
                            </div>
                        </Card>
                    );
                })
            )}
            </div>
        </ScrollArea>
      </CardContent>
       <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification?</AlertDialogTitle>
            <AlertDialogDescription>This will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => itemToDelete && handleDelete(itemToDelete)} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90">
              {isProcessing && <Loader2 className="animate-spin mr-2 h-4 w-4"/>} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
