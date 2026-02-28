
"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import DesktopPartyStatementPage from "@/components/reports/DesktopPartyStatementPage";
import { useSearchParams } from "next/navigation";
import GroupStatementPage from "@/app/(dashboard)/reports/group-statement/page";

export default function PartyStatementPage() {
    const isMobile = useIsMobile();
    const searchParams = useSearchParams();
    
    // The check for groupId was causing a circular dependency issue during build.
    // The routing logic should handle directing to the correct page.
    // if (searchParams.get('groupId')) {
    //   return <GroupStatementPage />;
    // }
    
    return <DesktopPartyStatementPage />;
}
