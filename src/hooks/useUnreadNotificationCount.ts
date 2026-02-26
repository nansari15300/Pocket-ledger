"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

/** Returns unread alerts count (Messages → Alerts) for the current user. */
export function useUnreadAlertsCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setCount(0);
      return;
    }
    const q = query(
      collection(firestore, "admin_notifications"),
      where("recipientUserId", "==", user.uid),
      where("isRead", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => setCount(snap.size));
    return () => unsub();
  }, [user?.uid]);

  return count;
}

/** Returns total unread count (alerts + chat messages) for the current user. */
export function useUnreadNotificationCount(): number {
  const { user, customUser } = useAuth();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setTotal(0);
      return;
    }
    const myUserIds = Array.from(new Set([user.uid, customUser?.userDocId].filter(Boolean) as string[]));

    let unreadAlerts = 0;
    let unreadMessages = 0;
    const conversationUnreadCounts = new Map<string, number>();

    const unreadAlertsByRecipient: Record<string, Set<string>> = {};
    const alertUnsubscribers: (() => void)[] = [];
    const recomputeAlerts = () => {
      const merged = new Set<string>();
      Object.values(unreadAlertsByRecipient).forEach((set) => set.forEach((id) => merged.add(id)));
      unreadAlerts = merged.size;
      setTotal(unreadAlerts + unreadMessages);
    };
    myUserIds.forEach((id) => {
      const alertsQuery = query(
        collection(firestore, "admin_notifications"),
        where("recipientUserId", "==", id),
        where("isRead", "==", false)
      );
      const unsubAlerts = onSnapshot(alertsQuery, (snap) => {
        unreadAlertsByRecipient[id] = new Set(snap.docs.map((d) => d.id));
        recomputeAlerts();
      });
      alertUnsubscribers.push(unsubAlerts);
    });

    const messageUnsubscribers: (() => void)[] = [];
    const conversationUnsubscribers: (() => void)[] = [];
    const conversationsById = new Map<string, any>();

    const attachMessageListeners = () => {
      messageUnsubscribers.forEach((unsub) => unsub());
      messageUnsubscribers.length = 0;
      conversationUnreadCounts.clear();

      const convDocs = Array.from(conversationsById.values());
      if (convDocs.length === 0) {
        unreadMessages = 0;
        setTotal(unreadAlerts + unreadMessages);
        return;
      }

      convDocs.forEach((convDoc: any) => {
        const messagesQuery = query(collection(firestore, "conversations", convDoc.id, "messages"));
        const messageUnsub = onSnapshot(messagesQuery, (messageSnap) => {
          const unreadCount = messageSnap.docs.filter((d) => {
            const msg: any = d.data();
            return myUserIds.includes(msg?.receiverId) && msg?.status !== "read";
          }).length;
          conversationUnreadCounts.set(convDoc.id, unreadCount);
          unreadMessages = Array.from(conversationUnreadCounts.values()).reduce((a, b) => a + b, 0);
          setTotal(unreadAlerts + unreadMessages);
        });
        messageUnsubscribers.push(messageUnsub);
      });
    };

    myUserIds.forEach((id) => {
      const conversationsQuery = query(
        collection(firestore, "conversations"),
        where("participants", "array-contains", id)
      );
      const unsubConversations = onSnapshot(conversationsQuery, (convSnap) => {
        convSnap.docs.forEach((d) => {
          conversationsById.set(d.id, { id: d.id, ...d.data() });
        });
        attachMessageListeners();
      });
      conversationUnsubscribers.push(unsubConversations);
    });

    return () => {
      alertUnsubscribers.forEach((unsub) => unsub());
      conversationUnsubscribers.forEach((unsub) => unsub());
      messageUnsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.uid, customUser?.userDocId]);

  return total;
}
