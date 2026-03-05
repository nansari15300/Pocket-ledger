
'use client';

import { useParams } from 'next/navigation';
import { GroupDetails as DesktopGroupDetails } from '@/components/party/GroupDetails';
import { useVouchers } from '@/hooks/useVouchers';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DateRange } from "@/components/ui/ad-calendar";
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import { doc, getDoc, collection, query, getDocs, where } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { useIsMobile } from '@/hooks/use-mobile';

export default function GroupDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { processedGroups, processedParties, vouchers, loading, userNames: vouchersUserNames } = useVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [localUserNames, setLocalUserNames] = useState<Record<string, string>>({});
  const isMobile = useIsMobile();
  
  // Merge vouchersUserNames with localUserNames - vouchersUserNames is primary source
  const userNames = useMemo(() => {
    return { ...vouchersUserNames, ...localUserNames };
  }, [vouchersUserNames, localUserNames]);


  const groupId = params.id as string;

  const group = processedGroups.find((g) => g.id === groupId);
  
  const partiesInGroup = processedParties.filter(p => p.groupId === groupId);
  
  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    // Check both vouchersUserNames and localUserNames
    const existingName = vouchersUserNames?.[userId] || localUserNames[userId];
    if (existingName && existingName !== "Unknown" && existingName !== "N/A") return existingName;
    try {
        // User doc ID may be name_uid format (e.g. manishshah46_AaCbiR708nhGe28Ltf2I7YZzpNv1), so query by uid field first
        const q = query(collection(firestore, "users"), where("uid", "==", userId));
        const snap = await getDocs(q);
        let data = snap.docs[0]?.data();
        
        if (!data) {
            // Fallback 1: doc ID might be uid (legacy)
            const userDoc = await getDoc(doc(firestore, 'users', userId));
            if (userDoc.exists()) {
                data = userDoc.data();
            } else {
                // Fallback 2: doc ID might be name_uid format - try to find by searching all docs ending with uid
                // This is expensive, so only do if needed
                const allUsersSnap = await getDocs(collection(firestore, "users"));
                const matchingDoc = allUsersSnap.docs.find(d => {
                    const docData = d.data();
                    return docData.uid === userId || d.id.endsWith(userId);
                });
                if (matchingDoc) {
                    data = matchingDoc.data();
                }
            }
        }
        
        if (data) {
            // Get displayName from user document - this is the primary field
            const displayName = data.displayName || data.name || data.email || null;
            if (displayName && displayName !== userId && displayName !== "Unknown" && displayName !== "N/A") {
                // Check if it's not a UID pattern (long alphanumeric string without spaces/email)
                const isUIDPattern = displayName.length > 15 && /^[a-zA-Z0-9_-]+$/.test(displayName) && !displayName.includes('@') && !displayName.includes(' ');
                if (!isUIDPattern) {
                    return displayName;
                }
            }
        }
    } catch (e) {
        console.error('[GroupDetailsPage] Error fetching userName for', userId, e);
    }
    return "N/A"; // Return N/A instead of Unknown
  }, [vouchersUserNames, localUserNames]);

  // Always fetch locally if not in vouchersUserNames or if vouchersUserNames is empty
  useEffect(() => {
    if (!vouchers || vouchers.length === 0) return;
    const uids = new Set(vouchers.map((t) => t.userId).filter(Boolean) as string[]);
    // Fetch if not in vouchersUserNames (including if vouchersUserNames is empty/undefined)
    const uidsToFetch = Array.from(uids).filter(uid => {
      const vouchersName = vouchersUserNames?.[uid];
      // Fetch if: not in vouchersUserNames, or it's "Unknown"/"N/A", or vouchersUserNames is empty
      return !vouchersName || vouchersName === "Unknown" || vouchersName === "N/A" || !vouchersUserNames || Object.keys(vouchersUserNames).length === 0;
    });
    
    if (uidsToFetch.length === 0) return;
    
    // Fetch all user names in parallel
    Promise.all(
      uidsToFetch.map(async (uid) => {
        const name = await fetchUserName(uid);
        return { uid, name };
      })
    ).then(results => {
      const newUserNames: Record<string, string> = {};
      results.forEach(({ uid, name }) => {
        // Only store valid names (not "Unknown", not "N/A", not UID)
        if (name && name !== "Unknown" && name !== "N/A" && name !== uid && !name.match(/^[a-zA-Z0-9_-]{20,}$/)) {
          newUserNames[uid] = name;
        }
      });
      if (Object.keys(newUserNames).length > 0) {
        setLocalUserNames((prev) => ({ ...prev, ...newUserNames }));
      }
    });
  }, [vouchers, fetchUserName, vouchersUserNames]);
  
  if (loading) {
    return <LoadingSpinner />;
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Group not found.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <DesktopGroupDetails
        group={group}
        allGroups={processedGroups}
        allParties={processedParties}
        onGroupUpdated={() => {}}
        onGroupDeleted={() => router.push('/party')}
        onPartyUpdated={() => {}}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onBack={() => router.push(`/party?view=groups&selected=${encodeURIComponent(groupId)}`)}
        userNames={userNames}
      />
    </div>
  );
}


