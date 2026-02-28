
"use client";

import * as React from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  writeBatch,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  getDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Bell, MessageSquare, AlarmPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { toast } from "sonner";
import { AlertsTab } from '@/components/messages/AlertsTab';
import { ChatTab } from '@/components/messages/ChatTab';
import { AlarmsTab } from '@/components/messages/AlarmsTab';
import { Badge } from "@/components/ui/badge";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";

type Notification = {
  id: string;
  message: string;
  timestamp: any;
  isRead: boolean;
};

type Message = {
    id: string;
    receiverId: string;
    status: 'sent' | 'delivered' | 'read';
    [key: string]: any;
};

type Alarm = {
  id: string;
  title: string;
  datetime: any;
  users: string[];
  notified?: boolean;
  context?: string;
  entityId?: string;
};


export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem('messagesActiveTab') || "chat";
    }
    return "chat";
  });

  const { company, companyId, setCompanyId, allCompanies: userCompanies } = useCompany();
  const { user } = useAuth();
  const { processedParties, processedStaff } = useVouchers();
  const [allAppUsers, setAllAppUsers] = useState<any[]>([]);
  const [voucherToEdit, setVoucherToEdit] = useState<any>(null);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  
  // States for notification counts
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [alarms, setAlarms] = React.useState<Alarm[]>([]);
  const [statuses, setStatuses] = React.useState<Record<string, { state: string, last_changed: number }>>({});


  useEffect(() => {
    localStorage.setItem('messagesActiveTab', activeTab);
  }, [activeTab]);
  
  useEffect(() => {
    if (!companyId || !user) return;

    const q = query(
      collection(firestore, `companies/${companyId}/alarms`),
      where('notified', '==', false),
      where('notifyAt', '<=', new Date())
    );
    const unsub = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) return;

        const batch = writeBatch(firestore);
        const usersToNotify: Record<string, any[]> = {};

        for (const alarmDoc of snapshot.docs) {
            const alarmData = alarmDoc.data() as any;
            
            let targetUserIds: string[] = [];
            if (alarmData.users && Array.isArray(alarmData.users) && alarmData.users.length > 0) {
              const qUsers = query(collection(firestore, "users"), where('email', 'in', alarmData.users));
              const userSnaps = await getDocs(qUsers);
              targetUserIds = userSnaps.docs.map(d => d.id);
            }
            
            if(targetUserIds.length === 0) {
              if (company?.ownerId) {
                targetUserIds.push(company.ownerId);
              }
            }

            for (const userId of targetUserIds) {
                if (!usersToNotify[userId]) usersToNotify[userId] = [];
                usersToNotify[userId].push({ ...alarmData, alarmId: alarmDoc.id });
            }
            
            const alarmRef = doc(firestore, `companies/${companyId}/alarms`, alarmDoc.id);
            batch.update(alarmRef, { notified: true });
        }
        
        const createdByName = (uid: string | null | undefined) => {
            if (!uid) return null;
            const u = allAppUsers.find((a: any) => a.id === uid);
            return u?.displayName || u?.email || uid;
        };
        for (const [userId, userAlarms] of Object.entries(usersToNotify)) {
            for (const alarm of userAlarms) {
                 const notificationRef = collection(firestore, "admin_notifications");
                 await addDoc(notificationRef, {
                    recipientUserId: userId,
                    type: "alarm",
                    alarmId: alarm.alarmId,
                    message: alarm.message || alarm.title || `ALARM: ${alarm.title}`,
                    alarmTitle: alarm.title,
                    timestamp: serverTimestamp(),
                    isRead: false,
                    companyId: companyId,
                    context: alarm.context || null,
                    entityId: alarm.entityId || null,
                    alarmForUsers: alarm.users && Array.isArray(alarm.users) ? alarm.users : [],
                    alarmCreatedBy: alarm.createdBy ?? null,
                    alarmCreatedByName: createdByName(alarm.createdBy) ?? null,
                    alarmCreatedAt: alarm.createdAt ?? null,
                    alarmDatetime: alarm.datetime ?? null,
                    alarmNotifyAt: alarm.notifyAt ?? null,
                });
            }
        }
        
        await batch.commit();
        const totalAlarms = snapshot.size;
        toast.info(`${totalAlarms} alarm(s) went off! Check your alerts.`);
    });
    return () => unsub();
}, [companyId, user, allAppUsers, company]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  useEffect(() => {
    if (!user) return;
    const q = query(collection(firestore, "users"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAllAppUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

   useEffect(() => {
    if (!allAppUsers.length) return;
    const unsubscribers = allAppUsers.map(u => {
        const userRef = doc(firestore, 'users', u.id);
        return onSnapshot(userRef, (docSnap) => {
            const data = docSnap.data();
            if (data?.lastSeen?.toDate) {
                 setStatuses(prev => ({
                    ...prev,
                    [u.id]: {
                        state: (data?.online && (Date.now() - data.lastSeen.toDate().getTime() < 30000)) ? 'online' : 'offline',
                        last_changed: data?.lastSeen?.toDate().getTime() || 0,
                    }
                }));
            }
        });
    });
    return () => unsubscribers.forEach(unsub => unsub());
  }, [allAppUsers]);

  useEffect(() => {
    if (!user || allAppUsers.length === 0) return;

    const conversationsQuery = query(
        collection(firestore, 'conversations'), 
        where('participants', 'array-contains', user.uid),
        orderBy('lastMessageTimestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(conversationsQuery, (snapshot) => {
      const convos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const filteredConvos = convos.filter(c => {
          const otherUserId = c.participants.find((pId: string) => pId !== user.uid);
          return allAppUsers.some(u => u.id === otherUserId);
      });

      setConversations(filteredConvos);

      if (!selectedConversation && filteredConvos.length > 0) {
        const lastSelectedId = localStorage.getItem('selectedConversationId');
        const conversationToSelect = filteredConvos.find(c => c.id === lastSelectedId) || filteredConvos[0];
        setSelectedConversation(conversationToSelect);
      }
    });

    return () => unsubscribe();
  }, [user, selectedConversation, allAppUsers]);

  useEffect(() => {
    if (!conversations.length || !user) return;
  
    const unsubs = conversations.map(conv => {
        const messagesQuery = query(
            collection(firestore, 'conversations', conv.id, 'messages'),
            orderBy('timestamp', 'asc')
        );
        return onSnapshot(messagesQuery, async (snapshot) => {
            const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
            setMessages(prev => ({ ...prev, [conv.id]: newMessages }));
  
            const unreadCount = newMessages.filter(m => m.receiverId === user.uid && m.status !== "read").length;
            setUnreadCounts(prev => ({...prev, [conv.id]: unreadCount}));

            const batch = writeBatch(firestore);
            let hasUpdates = false;
            snapshot.docs.forEach(docSnap => {
                const msg = docSnap.data();
                if (msg.receiverId === user.uid && msg.status === "sent") {
                    batch.update(docSnap.ref, { status: "delivered" });
                    hasUpdates = true;
                }
            });

            if (hasUpdates) {
                await batch.commit();
            }
        });
    });
  
    return () => unsubs.forEach(unsub => unsub());
  
  }, [conversations, user]);

  useEffect(() => {
    const totalUnreadMessages = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
    setUnreadMessages(totalUnreadMessages);
  }, [unreadCounts]);

   useEffect(() => {
    if (!user?.uid) return;
    const alertsQuery = query(
      collection(firestore, "admin_notifications"),
      where("recipientUserId", "==", user.uid),
      where("isRead", "==", false)
    );
    const unsubAlerts = onSnapshot(alertsQuery, (snapshot) => setUnreadAlerts(snapshot.size));

    return () => unsubAlerts();
  }, [user?.uid]);
  
  const handleConversationSelect = useCallback((conversation: any) => {
    if (!conversation || !user) return;
    setSelectedConversation(conversation);
    localStorage.setItem('selectedConversationId', conversation.id);
  }, [user]);

  useEffect(() => {
    const markAsRead = async () => {
      if (!selectedConversation || !user) return;
  
      const messagesForSelectedConvo = messages[selectedConversation.id] || [];
      const unread = messagesForSelectedConvo.filter(m => m.receiverId === user.uid && m.status !== 'read');
  
      if (unread.length > 0) {
        const batch = writeBatch(firestore);
        unread.forEach(msg => {
          const msgRef = doc(firestore, 'conversations', selectedConversation.id, 'messages', msg.id);
          batch.update(msgRef, { status: 'read' });
        });
        try {
          await batch.commit();
        } catch (error) {
          console.error("Failed to mark messages as read:", error);
        }
      }
    };
  
    markAsRead();
  }, [selectedConversation, messages, user]);
  
    const allPotentialContacts = useMemo(() => {
    if (!user || allAppUsers.length === 0 || userCompanies.length === 0) return [];

    const contactMap = new Map<string, { user: any, companies: Set<string>, sources: Set<string> }>();

    const processEntity = (entity: any, type: string, companyName: string) => {
        if (entity.email) {
            const appUser = allAppUsers.find(u => u.email === entity.email);
            if (appUser && appUser.id !== user.uid) {
                if (!contactMap.has(appUser.id)) {
                    contactMap.set(appUser.id, { user: appUser, companies: new Set(), sources: new Set() });
                }
                const contact = contactMap.get(appUser.id)!;
                contact.companies.add(companyName);
                contact.sources.add(type);
            }
        }
    };
    
    userCompanies.forEach(c => {
        // If the current user is not the owner of the company, add the owner as a potential contact.
        if (c.ownerId !== user.uid && c.ownerEmail) {
            processEntity({ email: c.ownerEmail }, 'Company Owner', c.name);
        }
        (c.sharedWith || []).forEach((sharedUser: any) => processEntity({email: sharedUser.email}, 'Shared User', c.name));
    });

    processedParties.forEach(p => processEntity(p, 'Party', company?.name || 'Current'));
    processedStaff.forEach(s => processEntity(s, 'Staff', company?.name || 'Current'));
    
    const finalContacts = new Map<string, any>();
    
    for (const contact of contactMap.values()) {
        const email = contact.user.email;
        if (!finalContacts.has(email)) {
            finalContacts.set(email, {
                ...contact.user,
                associatedCompanies: new Set(contact.companies),
                sources: new Set(contact.sources),
            });
        } else {
            const existing = finalContacts.get(email);
            contact.companies.forEach(c => existing.associatedCompanies.add(c));
            contact.sources.forEach(s => existing.sources.add(s));
        }
    }

    conversations.forEach(conv => {
        const otherUserId = conv.participants.find((pId: string) => pId !== user.uid);
        if (otherUserId) {
            const userInConv = allAppUsers.find(u => u.id === otherUserId);
            if (userInConv && !finalContacts.has(userInConv.email)) {
                finalContacts.set(userInConv.email, {
                    ...userInConv,
                    associatedCompanies: new Set(['Existing Chat']),
                    sources: new Set(['Chat']),
                });
            }
        }
    });

    return Array.from(finalContacts.values()).map(c => ({...c, associatedCompanies: Array.from(c.associatedCompanies)}));

  }, [user, allAppUsers, userCompanies, processedParties, processedStaff, conversations, company]);


  useEffect(() => {
    if (!user || allPotentialContacts.length === 0) return;

    allPotentialContacts.forEach(async contact => {
        const conversationId = [user.uid, contact.id].sort().join('_');
        const convRef = doc(firestore, 'conversations', conversationId);
        const convSnap = await getDoc(convRef);

        if (!convSnap.exists()) {
            const batch = writeBatch(firestore);
            batch.set(convRef, {
                participants: [user.uid, contact.id],
                lastMessageTimestamp: serverTimestamp()
            });

            const messagesCol = collection(convRef, 'messages');
            const welcomeMessage = `You are now connected because this user is in your ${Array.from(contact.sources as Set<string>).join(', ')} list.`;
            batch.set(doc(messagesCol), {
                text: welcomeMessage,
                senderId: 'system',
                receiverId: user.uid,
                timestamp: serverTimestamp(),
                status: "read",
            });
             batch.set(doc(messagesCol), {
                text: welcomeMessage,
                senderId: 'system',
                receiverId: contact.id,
                timestamp: serverTimestamp(),
                status: "sent",
            });

            await batch.commit();
        }
    });
  }, [user, allPotentialContacts]);

  const handleSendInvite = async (inviteEmail: string, inviteMessage: string, setIsInviteDialogOpen: (isOpen: boolean) => void) => {
    if (!inviteEmail || !user) return;
    const userToInviteQuery = query(collection(firestore, "users"), where("email", "==", inviteEmail));
    const userToInviteSnap = await getDocs(userToInviteQuery);
    
    if (!userToInviteSnap.empty) {
        const userToInviteDoc = userToInviteSnap.docs[0];
        const userToInvite = { id: userToInviteDoc.id, ...userToInviteDoc.data() };
        
        const conversationId = [user.uid, userToInvite.id].sort().join('_');
        const convRef = doc(firestore, 'conversations', conversationId);
        
        let convSnap = await getDoc(convRef);
        if (!convSnap.exists()) {
             await setDoc(convRef, {
                participants: [user.uid, userToInvite.id],
                lastMessageTimestamp: serverTimestamp()
            });
             convSnap = await getDoc(convRef);
        }

        if(inviteMessage) {
            const messagesCol = collection(firestore, 'conversations', conversationId, 'messages');
            await addDoc(messagesCol, {
                text: inviteMessage, senderId: user.uid, receiverId: userToInvite.id,
                timestamp: serverTimestamp(), company: company?.name || 'Personal', status: "sent"
            });
            await updateDoc(convRef, { lastMessageTimestamp: serverTimestamp() });
        }
        
        handleConversationSelect({id: convSnap.id, ...convSnap.data()});
        
        toast.success("Chat Started", { description: `You can now chat with ${inviteEmail}.` });
    } else {
        toast.error("User not found", { description: "No user with this email exists in the app." });
    }
    setIsInviteDialogOpen(false);
  };
  
  const handleStartChatFromAlert = async (otherUserId: string) => {
    if (!user || !otherUserId) {
        toast.error("Cannot start chat. User information is missing.");
        return;
    }

    const conversation = conversations.find(c => c.participants.includes(otherUserId));

    if (conversation) {
        await handleConversationSelect(conversation);
        setActiveTab('chat');
    } else {
        const userToChatWith = allAppUsers.find(u => u.id === otherUserId);
        
        if (userToChatWith) {
             const conversationId = [user.uid, userToChatWith.id].sort().join('_');
            const convRef = doc(firestore, 'conversations', conversationId);
            
            let convSnap = await getDoc(convRef);
            if (!convSnap.exists()) {
                 await setDoc(convRef, {
                    participants: [user.uid, userToChatWith.id],
                    lastMessageTimestamp: serverTimestamp()
                });
                 convSnap = await getDoc(convRef);
            }
            if (convSnap.exists()) {
                await handleConversationSelect({id: convSnap.id, ...convSnap.data()});
                setActiveTab('chat');
            }
        } else {
            toast.error("User not found", { description: "Cannot initiate chat with this user." });
        }
    }
  };

  const selectedMessages = selectedConversation ? messages[selectedConversation.id] || [] : [];

  const handleOpenVoucherFromAlert = useCallback(
    async (alertCompanyId: string, voucherId: string) => {
      setCompanyId(alertCompanyId);
      try {
        const snap = await getDoc(doc(firestore, `companies/${alertCompanyId}/vouchers`, voucherId));
        if (snap.exists()) {
          const d = snap.data();
          const dateVal = d.date;
          const voucher = {
            id: snap.id,
            ...d,
            date: dateVal?.toDate ? dateVal.toDate() : dateVal,
          };
          setVoucherToEdit(voucher);
          setVoucherDialogOpen(true);
        } else {
          toast.info("Voucher not found", { description: "It may have been deleted." });
        }
      } catch (e) {
        console.error("Failed to open voucher from alert", e);
        toast.error("Failed to open voucher");
      }
    },
    [setCompanyId]
  );

  return (
    <div className="px-[2px] py-4 sm:py-6 md:py-8 flex flex-col h-full w-full max-w-full">
        <div className="flex flex-col gap-2 w-full">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="mb-0 w-full sm:w-auto">
                    <TabsTrigger value="alerts" className="flex items-center gap-2">
                        <Bell className="h-4 w-4"/>Alerts 
                        {unreadAlerts > 0 && (company?.notificationSettings?.transactionAlerts?.onTabs !== false) && (
                          <Badge className="ml-2">{unreadAlerts}</Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4"/>Chat 
                        {unreadMessages > 0 && <Badge className="ml-2">{unreadMessages}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="alarms" className="flex items-center gap-2">
                        <AlarmPlus className="h-4 w-4"/>Alarms
                    </TabsTrigger>
                </TabsList>
            </Tabs>
            <CardDescription className="text-green-500 whitespace-nowrap text-right sm:text-left">Online from: <span className="font-semibold text-foreground">{company?.name || 'Personal Account'}</span></CardDescription>
        </div>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0 w-full">
            <TabsContent value="alerts" className="h-full flex-1 min-h-0 w-full data-[state=inactive]:hidden">
                <AlertsTab onStartChat={handleStartChatFromAlert} onOpenVoucher={handleOpenVoucherFromAlert} />
            </TabsContent>
            <TabsContent value="chat" className="h-full flex-1 min-h-0 w-full data-[state=inactive]:hidden">
                 <ChatTab 
                    conversations={conversations}
                    allPotentialContacts={allPotentialContacts}
                    onConversationSelect={handleConversationSelect}
                    selectedConversation={selectedConversation}
                    allAppUsers={allAppUsers}
                    messages={selectedMessages}
                    unreadCounts={unreadCounts}
                    handleSendInvite={handleSendInvite}
                    statuses={statuses}
                    unreadAlertsCount={unreadAlerts}
                    showAlertsOnList={company?.notificationSettings?.transactionAlerts?.on !== false && company?.notificationSettings?.transactionAlerts?.onList !== false}
                 />
            </TabsContent>
            <TabsContent value="alarms" className="h-full flex-1 min-h-0 w-full data-[state=inactive]:hidden">
                <AlarmsTab />
            </TabsContent>
        </Tabs>
        <AddVoucherDialog
          isOpen={voucherDialogOpen}
          onOpenChange={setVoucherDialogOpen}
          voucher={voucherToEdit}
          onVoucherAction={() => {
            setVoucherToEdit(null);
            setVoucherDialogOpen(false);
          }}
        />
    </div>
  );
}
