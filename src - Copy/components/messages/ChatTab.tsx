
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
import { useMemo, useRef, useEffect } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";
import { UserPlus, Send, Search, MoreVertical, Trash2, Loader2, Check, CheckCheck, MessageSquare, X, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useDate } from "@/hooks/useDate";
import { useIsMobile } from "@/hooks/use-mobile";

function MessageStatus({ status }: { status: string }) {
  if (status === "sent") {
    return <Check className="h-3 w-3 text-muted-foreground" />;
  }

  if (status === "delivered") {
    return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  }

  if (status === "read") {
    return <CheckCheck className="h-3 w-3 text-blue-500" />;
  }

  return null;
}

const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
};

export function ChatTab({ conversations, allPotentialContacts, onConversationSelect, selectedConversation, allAppUsers, messages, unreadCounts, handleSendInvite, statuses, unreadAlertsCount = 0, showAlertsOnList = false }: any) {
  const { user } = useAuth();
  const { company } = useCompany();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const showListNotifications =
    company?.notificationSettings?.message?.on === true &&
    company?.notificationSettings?.message?.onList === true;
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteMessage, setInviteMessage] = React.useState("");
  const messageEndRef = useRef<null | HTMLDivElement>(null);
  
  const [messageToDelete, setMessageToDelete] = React.useState<any | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedMessages, setSelectedMessages] = React.useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = React.useState<"list" | "chat">("list");
  const isMobile = useIsMobile();

  const selectedUser = useMemo(() => {
    if (!selectedConversation || !user) return null;
    const otherUserId = selectedConversation.participants.find((id: string) => id !== user.uid);
    return allAppUsers.find((u: any) => u.id === otherUserId);
  }, [selectedConversation, user, allAppUsers]);

  const isSelectedUserOnline = useMemo(() => {
    if (!selectedUser) return false;
    return statuses[selectedUser.id]?.state === 'online';
  }, [selectedUser, statuses]);


  useEffect(() => {
    // Reset selection when conversation changes
    setSelectionMode(false);
    setSelectedMessages(new Set());
  }, [selectedConversation]);

  const handleMessageClick = (msgId: string) => {
    if (selectionMode) {
      setSelectedMessages(prev => {
        const newSet = new Set(prev);
        if (newSet.has(msgId)) {
          newSet.delete(msgId);
        } else {
          newSet.add(msgId);
        }
        
        // If no messages are selected anymore, exit selection mode.
        if (newSet.size === 0) {
            setSelectionMode(false);
        }

        return newSet;
      });
    }
  };

  const handleMessageLongPress = (msgId: string) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([msgId]));
  };
  
  const handleSendMessage = async (text: string, targetUser?: any) => {
    const finalTarget = targetUser || selectedUser;
    if (!text.trim() || !user || !finalTarget) return;

    const conversationId = [user.uid, finalTarget.id].sort().join('_');
    const messagesCol = collection(firestore, 'conversations', conversationId, 'messages');
    const conversationDocRef = doc(firestore, 'conversations', conversationId);
    
    try {
        await addDoc(messagesCol, { 
            text: text.trim(), 
            senderId: user.uid, 
            receiverId: finalTarget.id, 
            timestamp: serverTimestamp(), 
            company: company?.name || 'Personal', 
            status: "sent" 
        });
        await updateDoc(conversationDocRef, { lastMessageTimestamp: serverTimestamp() });
    } catch (error) {
        toast.error("Failed to send message.");
    }
  };

  const handleDeleteMessage = async () => {
    if (!messageToDelete || !selectedConversation) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, "conversations", selectedConversation.id, "messages", messageToDelete.id));
    } catch(err) {
      toast.error("Failed to delete message.");
    } finally {
      setIsDeleting(false);
      setMessageToDelete(null);
      setIsDeleteConfirmOpen(false);
    }
  }

  const handleDeleteSelected = async () => {
      if (!selectedConversation || selectedMessages.size === 0) return;
      setIsDeleting(true);
      const batch = writeBatch(firestore);
      selectedMessages.forEach(msgId => {
          const msgRef = doc(firestore, "conversations", selectedConversation.id, "messages", msgId);
          batch.delete(msgRef);
      });
      try {
          await batch.commit();
          toast.success(`${selectedMessages.size} message(s) deleted.`);
      } catch (err) {
          toast.error("Failed to delete messages.");
      } finally {
          setIsDeleting(false);
          setSelectionMode(false);
          setSelectedMessages(new Set());
      }
  };
  
  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;
    setIsDeleting(true);
    try {
        const messagesQuery = collection(firestore, 'conversations', selectedConversation.id, 'messages');
        const messagesSnap = await getDocs(messagesQuery);
        const batch = writeBatch(firestore);
        messagesSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        toast.success("Conversation cleared");
    } catch(err) {
        toast.error("Failed to clear conversation.");
    } finally {
        setIsDeleting(false);
    }
  }
  
  const getMessageDateSeparator = (currentMsg: any, prevMsg: any) => {
    if (!prevMsg || !currentMsg.timestamp) return null; 
    const prevDate = prevMsg.timestamp?.toDate();
    const currentDate = currentMsg.timestamp?.toDate();
    if (!prevDate || !currentDate) return null; 

    if (!isSameDay(prevDate, currentDate)) {
        if (isToday(currentDate)) return 'Today';
        if (isYesterday(currentDate)) return 'Yesterday';
        if (dateSystem === 'Both') return `${formatDate(currentDate)} (${formatDateBS(currentDate)})`;
        return dateSystem === 'AD' ? formatDate(currentDate) : formatDateBS(currentDate);
    }
    return null;
  };
  
  useEffect(() => {
    if(!selectionMode) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, selectionMode]);

  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations.filter((conv: any) => {
        const otherUserId = conv.participants.find((pId: string) => pId !== user?.uid);
        const otherUser = allAppUsers.find((u: any) => u.id === otherUserId);
        if (!otherUser) return false;
        
        if (!searchTerm) return true;

        return (
            otherUser.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            otherUser.email?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });
  }, [conversations, searchTerm, user, allAppUsers]);

  const showList = !isMobile || mobileView === "list";
  const showChat = !isMobile || mobileView === "chat";

  const handleConversationClick = (conv: any) => {
    onConversationSelect(conv);
    if (isMobile) setMobileView("chat");
  };

  return (
    <div className={cn("h-full gap-0 chat-bg", isMobile ? "flex flex-col" : "grid grid-cols-[300px_1fr]")}>
      {showList && (
      <div className={cn("flex flex-col border-r bg-background h-full", isMobile && "border-r-0")}>
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
             <h3 className="text-lg font-semibold flex items-center gap-2">
               Conversations
               {showAlertsOnList && unreadAlertsCount > 0 && (
                 <Badge variant="secondary" className="text-xs px-1.5 py-0">{unreadAlertsCount} alert{unreadAlertsCount !== 1 ? "s" : ""}</Badge>
               )}
             </h3>
              <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon"><UserPlus className="h-5 w-5"/></Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader><DialogTitle>Invite User to Chat</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <Input placeholder="Enter user's email..." value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                      <Textarea placeholder="Initial message (optional)..." value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancel</Button>
                      <Button onClick={() => handleSendInvite(inviteEmail, inviteMessage, setIsInviteDialogOpen)}>Search & Start Chat</Button>
                    </DialogFooter>
                </DialogContent>
              </Dialog>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search existing contacts..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredConversations.map((conv: any) => {
                  const otherUserId = conv.participants.find((pId: string) => pId !== user?.uid);
                  const otherUser = allAppUsers.find((u: any) => u.id === otherUserId);
                  if (!otherUser) return null;

                  const unreadCount = unreadCounts[conv.id] || 0;
                  const isOnline = statuses[otherUser.id]?.state === 'online';

                  return (
                    <div key={conv.id} className={cn("flex flex-col gap-1 p-2 rounded-lg cursor-pointer group", selectedConversation?.id === conv.id ? "bg-muted" : "hover:bg-muted/50")} onClick={() => handleConversationClick(conv)}>
                      <div className="flex items-center gap-3">
                      <Avatar className={cn(
                          "h-10 w-10 p-0.5 border-2 transition-all duration-500", 
                          isOnline ? "border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "border-black"
                      )}>
                        <AvatarImage src={otherUser.photoURL} className="rounded-full" />
                        <AvatarFallback>{getInitials(otherUser.displayName)}</AvatarFallback>
                      </Avatar>
                        <div className="flex-1">
                          <p className="font-semibold text-sm">{otherUser.displayName || 'Unknown User'}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{otherUser.email}</p>
                        </div>
                        {showListNotifications && unreadCount > 0 && <Badge className="bg-blue-500 hover:bg-blue-600 h-5 min-w-5 flex items-center justify-center p-0">{unreadCount}</Badge>}
                      </div>
                    </div>
                  )
                })}
            </div>
          </ScrollArea>
      </div>
      )}
      
      {showChat && (
      <div className="flex flex-col h-full overflow-hidden min-h-0 flex-1">
        {selectionMode ? (
             <div className="p-3 border-b flex flex-row items-center justify-between bg-blue-500 text-white">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" className="text-white hover:text-white hover:bg-white/20" onClick={() => { setSelectionMode(false); setSelectedMessages(new Set())}}>
                        <X className="h-5 w-5"/>
                    </Button>
                    <h3 className="font-semibold text-sm">{selectedMessages.size} selected</h3>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:text-white hover:bg-white/20" onClick={handleDeleteSelected} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5"/>}
                </Button>
            </div>
        ) : (
             <div className="p-3 border-b flex flex-row items-center justify-between bg-muted/30">
                <div className="flex items-center gap-4 min-w-0">
                    {isMobile && (
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setMobileView("list")} aria-label="Back to conversations">
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                    )}
                    {selectedUser && (
                      <Avatar className={cn(
                          "h-9 w-9 p-0.5 border-2 transition-all duration-500", 
                          isSelectedUserOnline ? "border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "border-black"
                      )}>
                        <AvatarImage src={selectedUser.photoURL} className="rounded-full" />
                        <AvatarFallback>{getInitials(selectedUser.displayName)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div>
                    <h3 className="font-semibold text-sm">{selectedUser ? selectedUser.displayName : 'Chat'}</h3>
                    {selectedUser && (
                        <p className={cn("text-xs", isSelectedUserOnline ? "text-green-500" : "text-muted-foreground")}>
                            {isSelectedUserOnline ? 'Online' : 'Offline'}
                        </p> 
                    )}
                    </div>
                </div>
                {selectedUser && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4"/></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                       <DropdownMenuItem onClick={() => setSelectionMode(true)}>Select Messages</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeleteConversation} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Clear All Messages</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                )}
            </div>
        )}

        {selectedUser ? (
        <>
            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
                <ScrollArea className="flex-1 -mx-4 px-4">
                    <div className="space-y-3">
                        {messages.map((msg: any, index: number) => {
                          const separator = getMessageDateSeparator(msg, index > 0 ? messages[index - 1] : null);
                          const currentStatus = msg.status || (msg.read ? "read" : "delivered");

                          return (
                            <React.Fragment key={msg.id}>
                              {separator && <div className="text-center my-6"><Badge variant="outline" className="bg-background/80 backdrop-blur-sm">{separator}</Badge></div>}
                                <div 
                                  className={cn("flex flex-col gap-1 w-full animate-in fade-in slide-in-from-bottom-1 cursor-pointer", msg.senderId === user?.uid ? "items-end" : "items-start", selectedMessages.has(msg.id) && "bg-blue-500/10 rounded-lg")}
                                  onClick={() => handleMessageClick(msg.id)}
                                  onContextMenu={(e) => { e.preventDefault(); handleMessageLongPress(msg.id)}}
                                >
                                  <div className={cn("p-2.5 px-4 rounded-2xl max-w-[85%] sm:max-w-md shadow-sm relative", 
                                    msg.senderId === user?.uid 
                                      ? "bg-[#dcf8c6] dark:bg-green-900/40 text-foreground rounded-tr-none" 
                                      : "bg-background dark:bg-muted text-foreground rounded-tl-none")}>
                                      
                                      {msg.senderId === 'system' ? (
                                        <p className="text-[11px] italic text-muted-foreground text-center px-4">{msg.text}</p>
                                      ) : (
                                        <p className="text-[13px] leading-relaxed break-words">{msg.text}</p>
                                      )}
                                      
                                      <div className="flex items-center justify-end gap-1.5 mt-1">
                                          <p className="text-[9px] opacity-60 font-medium">
                                            {format(msg.timestamp?.toDate() || new Date(), 'p')}
                                          </p>
                                          {msg.senderId === user?.uid && msg.senderId !== 'system' && (
                                            <MessageStatus status={currentStatus} />
                                          )}
                                      </div>
                                  </div>
                                </div>
                            </React.Fragment>
                          )
                        })}
                        <div ref={messageEndRef} />
                    </div>
                </ScrollArea>

            </div>
             <div className="p-4 pt-2 flex items-center gap-2 bg-transparent border-t">
                    <Textarea 
                        placeholder="Type a message..." 
                        className="flex-1 min-h-[40px] max-h-[120px] bg-muted/50 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 py-2 resize-none text-[13px] rounded-full px-4"
                        rows={1}
                        onKeyDown={(e) => { 
                          if (e.key === 'Enter' && !e.shiftKey) { 
                            e.preventDefault(); 
                            if(e.currentTarget.value.trim()){
                              handleSendMessage(e.currentTarget.value); 
                              e.currentTarget.value = ""; 
                            }
                          } 
                        }}
                    />
                    <Button 
                      className="rounded-full h-10 w-10 p-0 shrink-0" 
                      onClick={(e) => {
                        const textarea = (e.currentTarget.previousElementSibling as HTMLTextAreaElement);
                        if(textarea.value.trim()){
                          handleSendMessage(textarea.value);
                          textarea.value = "";
                        }
                      }}
                    >
                      <Send className="h-4 w-4"/>
                    </Button>
                </div>
        </>
        ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground gap-2">
                <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                   <MessageSquare className="h-10 w-10 opacity-20" />
                </div>
                <p className="text-sm font-medium">Select a contact to start messaging</p>
                {isMobile && (
                  <Button variant="outline" onClick={() => setMobileView("list")} className="mt-2">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to list
                  </Button>
                )}
            </div>
        )}
      </div>
      )}
      
      {/* Delete Confirmation Alert */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message?</AlertDialogTitle>
            <AlertDialogDescription>This message will be permanently removed from your chat history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMessage} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="animate-spin h-4 w-4"/> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

    