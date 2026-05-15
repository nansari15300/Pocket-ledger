"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { enterAdminFirestoreOnline, leaveAdminFirestoreOnline } from "@/lib/adminFirestoreNetwork";
import { LayoutDashboard, Users, FileClock, Settings, ArrowLeft, FileDigit, ListTree, Landmark, CreditCard, UserCog, Trash2, Database } from 'lucide-react'
import { Button } from '../ui/button'
import { AdminHeader } from './AdminHeader'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar
} from '../ui/sidebar'
import { cn } from '@/lib/utils'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isOpen, isMobile, setIsOpen } = useSidebar()

  // Local/static app me global Firestore network band hota hai — admin sirf online server data use kare.
  useEffect(() => {
    void enterAdminFirestoreOnline();
    return () => {
      void leaveAdminFirestoreOnline();
    };
  }, []);
  
  const navItems = [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/plans", label: "Plans", icon: FileDigit },
      { href: "/admin/features", label: "Add/Remove Features", icon: ListTree },
      { href: "/admin/bank-settings", label: "Payment Gateway", icon: Landmark },
      { href: "/admin/payments", label: "Subscription Payments", icon: CreditCard },
      { href: "/admin/agents", label: "Agents", icon: UserCog },
      { href: "/admin/backup", label: "Backup & Restore", icon: Database },
      { href: "/admin/logs", label: "Logs", icon: FileClock },
      { href: "/admin/recycle-bin", label: "Recycle Bin", icon: Trash2 },
      { href: "/admin/settings", label: "Global Settings", icon: Settings },
  ]
  
  const NavLink = ({ href, label, icon: Icon }: { href: string; label: string, icon: React.ElementType }) => (
    <Link
      href={href}
      onClick={() => {
        if (isMobile) setIsOpen(false);
      }}
    >
      <SidebarMenuButton
        isActive={pathname === href}
        tooltip={label}
      >
        <Icon className="h-5 w-5" />
        {isOpen && <span>{label}</span>}
      </SidebarMenuButton>
    </Link>
  )

  // Admin borders/tables: `AdminRouteChrome` → `html.pl-admin-route` (globals.css), yahan extra class zaroori nahi.
  return (
    <div className="flex h-screen bg-background">
      <Sidebar className="border-r">
        <SidebarHeader>
          <div className={cn("font-bold text-lg flex items-center gap-2", isOpen ? 'px-2' : 'justify-center')}>
            {isOpen && <span>Admin Panel</span>}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map(item => (
              <SidebarMenuItem key={item.href}>
                <NavLink {...item} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <Link href="/dashboard" onClick={() => { if (isMobile) setIsOpen(false); }}>
            <Button variant="outline" className="w-full">
              <ArrowLeft className={cn(isOpen && "mr-2", "h-4 w-4")} />
              {isOpen && <span>Back to App</span>}
            </Button>
          </Link>
        </SidebarFooter>
      </Sidebar>
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader />
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
