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
  const { user } = useAuth();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setTotal(0);
      return;
    }

    let unreadAlerts = 0;
    let unreadMessages = 0;
    const conversationUnreadCounts = new Map<string, number>();

    const alertsQuery = query(
      collection(firestore, "admin_notifications"),
      where("recipientUserId", "==", user.uid),
      where("isRead", "==", false)
    );
    const unsubAlerts = onSnapshot(alertsQuery, (snap) => {
      unreadAlerts = snap.size;
      setTotal(unreadAlerts + unreadMessages);
    });

    const conversationsQuery = query(
      collection(firestore, "conversations"),
      where("participants", "array-contains", user.uid)
    );
    const messageUnsubscribers: (() => void)[] = [];

    const unsubConversations = onSnapshot(conversationsQuery, (convSnap) => {
      messageUnsubscribers.forEach((unsub) => unsub());
      messageUnsubscribers.length = 0;

      if (convSnap.empty) {
        unreadMessages = 0;
        setTotal(unreadAlerts + unreadMessages);
        return;
      }

      convSnap.forEach((convDoc) => {
        const messagesQuery = query(
          collection(firestore, "conversations", convDoc.id, "messages"),
          where("receiverId", "==", user.uid),
          where("status", "!=", "read")
        );
        const messageUnsub = onSnapshot(messagesQuery, (messageSnap) => {
          conversationUnreadCounts.set(convDoc.id, messageSnap.size);
          unreadMessages = Array.from(conversationUnreadCounts.values()).reduce((a, b) => a + b, 0);
          setTotal(unreadAlerts + unreadMessages);
        });
        messageUnsubscribers.push(messageUnsub);
      });
    });

    return () => {
      unsubAlerts();
      unsubConversations();
      messageUnsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.uid]);

  return total;
}
