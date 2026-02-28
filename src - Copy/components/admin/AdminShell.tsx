

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, FileClock, Settings, ArrowLeft, FileDigit, ListTree, Landmark, CreditCard, UserCog, Trash2, Database, Mail } from 'lucide-react'
import { Button } from '../ui/button'
import { AdminHeader } from './AdminHeader'
import { useSidebar } from '../ui/sidebar'
import { cn } from '@/lib/utils'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'
import { Badge } from '../ui/badge'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isOpen } = useSidebar()
  
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
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${pathname === href ? 'bg-muted' : 'hover:bg-muted/60'}`}
    >
        <Icon className="h-5 w-5" />
        {isOpen && <span>{label}</span>}
    </Link>
  )

  return (
    <div className="flex h-screen bg-background">
      <aside className={cn("border-r p-2 flex flex-col transition-all duration-300 ease-in-out", isOpen ? "w-60" : "w-16")}>
        <div className={cn("font-bold text-lg mb-4 flex items-center gap-2 h-12 border-b", isOpen ? 'px-2' : 'justify-center')}>
             {isOpen && <span>Admin Panel</span>}
        </div>
        <nav className="flex flex-col gap-1 mt-4">
          {navItems.map(item => <NavLink key={item.href} {...item} />)}
        </nav>
        <div className="mt-auto">
            <Link href="/dashboard">
                <Button variant="outline" className="w-full">
                    <ArrowLeft className={cn(isOpen && "mr-2", "h-4 w-4")} />
                    {isOpen && <span>Back to App</span>}
                </Button>
            </Link>
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader />
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
