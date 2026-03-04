
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  Users,
  Building2,
  Ticket,
  CreditCard,
  ShieldAlert,
  Activity,
  Database,
  RefreshCw,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Calendar as CalendarIcon,
  BarChart2,
  Trash2,
  FileClock,
  Globe,
} from "lucide-react";
import { collection, onSnapshot, query, where, Timestamp, orderBy, limit, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { ensureAdminSync } from "@/lib/adminSync";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useCalendarMonths } from "@/hooks/use-mobile";

import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, format } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { getDoc, doc } from "firebase/firestore";
import { Badge } from "@/components/ui/badge";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


// --- TYPES ---
type RangeKey = "today" | "7d" | "30d";

// --- HELPER FUNCTIONS ---
const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (date.toDate instanceof Function) return date.toDate();
  if (date.seconds) return new Timestamp(date.seconds, date.nanoseconds).toDate();
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// --- UI COMPONENTS ---
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col space-y-1">
            <span className="text-[0.70rem] uppercase text-muted-foreground">Type</span>
            <span className="font-bold text-muted-foreground">{label}</span>
          </div>
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex flex-col space-y-1">
              <span className="text-[0.70rem] uppercase text-muted-foreground">{p.name}</span>
              <span className="font-bold" style={{ color: p.color }}>{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

// --- DATA-FETCHING SUB-COMPONENTS ---

const UserStatsCard = ({ users, loading }: { users: any[], loading: boolean}) => {
    const stats = useMemo(() => {
        const total = users.length;
        const active = users.filter(u => u.isActive !== false).length;
        const inactive = total - active;
        const online = users.filter(u => {
            const lastSeen = safeToDate(u.lastSeen);
            return u.online && lastSeen && (new Date().getTime() - lastSeen.getTime() < 60000); // 1 minute threshold
        }).length;
        const offline = total - online;
        return { total, active, inactive, online, offline };
    }, [users]);
    
    if (loading) return <Skeleton className="h-44"/>;

    return (
        <Card>
            <CardHeader><CardTitle>Users Status</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
                <div className="text-center p-2 border rounded-lg"><p className="text-xs text-muted-foreground">Total Users</p><p className="text-2xl font-bold">{stats.total}</p></div>
                <div className="text-center p-2 border rounded-lg"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold text-green-600">{stats.active}</p></div>
                <div className="text-center p-2 border rounded-lg"><p className="text-xs text-muted-foreground">Inactive</p><p className="text-2xl font-bold text-red-600">{stats.inactive}</p></div>
                <div className="text-center p-2 border rounded-lg col-span-3 grid grid-cols-2 gap-4">
                    <div><p className="text-xs text-muted-foreground">Online</p><p className="text-2xl font-bold text-blue-600">{stats.online}</p></div>
                    <div><p className="text-xs text-muted-foreground">Offline</p><p className="text-2xl font-bold text-gray-500">{stats.offline}</p></div>
                </div>
            </CardContent>
        </Card>
    );
}

/** User by country: users categorized by country set from IP at signup */
const ActivityByCountryCard = ({ allUsers, allCompanies, allVouchers, loading, dateRange }: { allUsers: any[], allCompanies: any[], allVouchers: any[], loading: boolean, dateRange: DateRange | undefined }) => {
    const [selectedCountry, setSelectedCountry] = useState<string>('all');
    
    const countries = useMemo(() => {
        const countrySet = new Set<string>();
        allUsers.forEach(u => { if (u.country) countrySet.add(u.country) });
        return ['all', ...Array.from(countrySet).sort()];
    }, [allUsers]);

    const countryStats = useMemo(() => {
        const usersInCountry = selectedCountry === 'all' 
            ? allUsers 
            : allUsers.filter(u => u.country === selectedCountry);

        const userIdsInCountry = new Set(usersInCountry.map(u => u.id));
        
        const companiesInCountry = selectedCountry === 'all'
            ? allCompanies
            : allCompanies.filter(c => userIdsInCountry.has(c.ownerId));

        const from = dateRange?.from ? startOfDay(dateRange.from) : null;
        const to = dateRange?.to ? endOfDay(dateRange.to) : (from ? endOfDay(from) : null);

        const vouchersInRange = (from && to)
            ? allVouchers.filter(v => {
                const vDate = safeToDate(v.date);
                return vDate && vDate >= from && vDate <= to;
            })
            : allVouchers;
            
        const vouchersInCountry = selectedCountry === 'all'
            ? vouchersInRange
            : vouchersInRange.filter(v => v.userId && userIdsInCountry.has(v.userId));
            
        const now = new Date().getTime();
        const onlineUsers = usersInCountry.filter(u => {
            const lastSeen = safeToDate(u.lastSeen);
            return u.online && lastSeen && (now - lastSeen.getTime() < 60000);
        }).length;

        return {
            totalUsers: usersInCountry.length,
            onlineUsers,
            offlineUsers: usersInCountry.length - onlineUsers,
            activeUsers: usersInCountry.filter(u => u.isActive !== false).length,
            inactiveUsers: usersInCountry.filter(u => u.isActive === false).length,
            totalCompanies: companiesInCountry.length,
            totalVouchers: vouchersInCountry.length,
        };
    }, [selectedCountry, allUsers, allCompanies, allVouchers, dateRange]);
    
     if (loading) return <Skeleton className="h-44"/>;
    
    const StatItem = ({ label, value }: { label: string, value: number }) => (
        <div className="text-center p-2 border rounded-lg">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
        </div>
    );

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                    <CardTitle>User by Country {countries.length > 1 && <span className="text-muted-foreground font-normal">({countries.length - 1})</span>}</CardTitle>
                    <CardDescription className="text-xs">By user&apos;s country (from IP at signup)</CardDescription>
                </div>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select Country" />
                    </SelectTrigger>
                    <SelectContent>
                        {countries.map(c => <SelectItem key={c} value={c}>{c === 'all' ? 'All Countries' : c}</SelectItem>)}
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
                <StatItem label="Users" value={countryStats.totalUsers} />
                <StatItem label="Companies" value={countryStats.totalCompanies} />
                <StatItem label="Vouchers" value={countryStats.totalVouchers} />
                <StatItem label="Active" value={countryStats.activeUsers} />
                <StatItem label="Inactive" value={countryStats.inactiveUsers} />
                <div className="grid grid-cols-2 gap-2 col-span-3">
                    <StatItem label="Online" value={countryStats.onlineUsers} />
                    <StatItem label="Offline" value={countryStats.offlineUsers} />
                </div>
            </CardContent>
        </Card>
    );
};

/** Company by country: companies categorized by country selected in company profile */
const CompanyByCountryCard = ({ allUsers, allCompanies, allVouchers, loading, dateRange }: { allUsers: any[], allCompanies: any[], allVouchers: any[], loading: boolean, dateRange: DateRange | undefined }) => {
    const [selectedCountry, setSelectedCountry] = useState<string>('all');

    const countries = useMemo(() => {
        const set = new Set<string>();
        allCompanies.forEach((c: { country?: string }) => { if (c.country) set.add(c.country); });
        return ['all', ...Array.from(set).sort()];
    }, [allCompanies]);

    const stats = useMemo(() => {
        const companiesInCountry = selectedCountry === 'all'
            ? allCompanies
            : allCompanies.filter((c: { country?: string }) => c.country === selectedCountry);
        const ownerIds = new Set(companiesInCountry.map((c: { ownerId?: string }) => c.ownerId).filter(Boolean));
        const usersInCountry = allUsers.filter((u: { id: string }) => ownerIds.has(u.id));
        const companyIds = new Set(companiesInCountry.map((c: { id: string }) => c.id));
        const from = dateRange?.from ? startOfDay(dateRange.from) : null;
        const to = dateRange?.to ? endOfDay(dateRange.to) : (from ? endOfDay(from) : null);
        const vouchersInRange = (from && to)
            ? allVouchers.filter((v: { date?: unknown }) => {
                const vDate = safeToDate(v.date);
                return vDate && vDate >= from && vDate <= to;
            })
            : allVouchers;
        const vouchersInCountry = selectedCountry === 'all'
            ? vouchersInRange
            : vouchersInRange.filter((v: { companyId?: string }) => v.companyId && companyIds.has(v.companyId));
        const now = new Date().getTime();
        const onlineUsers = usersInCountry.filter((u: { online?: boolean; lastSeen?: unknown }) => {
            const lastSeen = safeToDate(u.lastSeen);
            return u.online && lastSeen && (now - lastSeen.getTime() < 60000);
        }).length;
        return {
            totalUsers: usersInCountry.length,
            companies: companiesInCountry.length,
            vouchers: vouchersInCountry.length,
            activeUsers: usersInCountry.filter((u: { isActive?: boolean }) => u.isActive !== false).length,
            inactiveUsers: usersInCountry.filter((u: { isActive?: boolean }) => u.isActive === false).length,
            onlineUsers,
            offlineUsers: usersInCountry.length - onlineUsers,
        };
    }, [selectedCountry, allUsers, allCompanies, allVouchers, dateRange]);

    if (loading) return <Skeleton className="h-44" />;

    const StatItem = ({ label, value }: { label: string; value: number }) => (
        <div className="text-center p-2 border rounded-lg">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
        </div>
    );

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                    <CardTitle>Company by Country {countries.length > 1 && <span className="text-muted-foreground font-normal">({countries.length - 1})</span>}</CardTitle>
                    <CardDescription className="text-xs">By company profile country</CardDescription>
                </div>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select Country" />
                    </SelectTrigger>
                    <SelectContent>
                        {countries.map(c => <SelectItem key={c} value={c}>{c === 'all' ? 'All Countries' : c}</SelectItem>)}
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
                <StatItem label="Users" value={stats.totalUsers} />
                <StatItem label="Companies" value={stats.companies} />
                <StatItem label="Vouchers" value={stats.vouchers} />
                <StatItem label="Active" value={stats.activeUsers} />
                <StatItem label="Inactive" value={stats.inactiveUsers} />
                <div className="grid grid-cols-2 gap-2 col-span-3">
                    <StatItem label="Online" value={stats.onlineUsers} />
                    <StatItem label="Offline" value={stats.offlineUsers} />
                </div>
            </CardContent>
        </Card>
    );
};

const ALL_VOUCHER_TYPES = ['sale', 'purchase', 'payment_in', 'payment_out', 'contra', 'journal', 'add_salary', 'note', 'direct_income', 'direct_expense'];

const EntitySummaryCard = ({ companies, vouchers, dateRange, loading, vouchersError, currentUserEmail }: { companies: any[], vouchers: any[], dateRange: DateRange | undefined, loading: boolean; vouchersError?: string | null; currentUserEmail?: string | null }) => {
    
    const filteredVouchers = useMemo(() => {
        if (!dateRange?.from) return vouchers;
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        return vouchers.filter(v => {
            const vDate = safeToDate(v.date);
            return vDate && vDate >= from && vDate <= to;
        });
    }, [vouchers, dateRange]);

    const voucherStats = useMemo(() => {
        const stats: Record<string, number> = {};
        ALL_VOUCHER_TYPES.forEach(type => stats[type] = 0); // Initialize all to 0
        filteredVouchers.forEach(voucher => {
            const type = voucher.subType || voucher.type;
            if (type && ALL_VOUCHER_TYPES.includes(type)) {
                stats[type] = (stats[type] || 0) + 1;
            }
        });
        stats.total = filteredVouchers.length;
        return stats;
    }, [filteredVouchers]);

    if (loading) return <Skeleton className="h-44"/>;

    return (
        <Card>
            <CardHeader><CardTitle>Entity &amp; Voucher Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 border rounded-lg bg-muted/30">
                        <p className="text-sm font-medium text-muted-foreground">Total Companies</p>
                        <p className="text-3xl font-bold">{companies.length}</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg bg-muted/30">
                        <p className="text-sm font-medium text-muted-foreground">Total Vouchers</p>
                        <p className="text-3xl font-bold">{voucherStats.total || 0}</p>
                        {vouchersError && (
                            <span className="block text-xs text-destructive mt-1 space-y-0.5">
                                <span className="block">{vouchersError}</span>
                                <span className="block text-muted-foreground font-mono text-[10px] mt-0.5">
                                    Query: companies/&#123;companyId&#125;/vouchers (per company, same as user dashboard)
                                </span>
                                {currentUserEmail && (
                                    <span className="block text-muted-foreground font-mono text-[10px] mt-0.5">
                                        Login: {currentUserEmail} — add in firestore.rules isSuperAdminEmail(), then: firebase deploy --only firestore:rules
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                </div>
                <div className="pt-4 border-t">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {ALL_VOUCHER_TYPES.map((type) => (
                            <div key={type} className="text-center p-2 rounded-lg bg-muted/50 border">
                                <p className="text-[10px] font-semibold text-muted-foreground capitalize truncate">{type.replace(/_/g, ' ')}</p>
                                <p className="text-lg font-bold">{voucherStats[type] || 0}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const VoucherChartCard = ({ vouchers, dateRange, loading }: { vouchers: any[], dateRange: DateRange | undefined, loading: boolean}) => {
    
    const filteredVouchers = useMemo(() => {
        if (!dateRange?.from) return vouchers;
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        return vouchers.filter(v => {
            const vDate = safeToDate(v.date);
            return vDate && vDate >= from && vDate <= to;
        });
    }, [vouchers, dateRange]);

    const chartData = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredVouchers.forEach(v => {
            const type = v.subType || v.type;
            if (type) counts[type] = (counts[type] || 0) + 1;
        });
        return Object.entries(counts).map(([name, count]) => ({ name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), count }));
    }, [filteredVouchers]);

    const BAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#a855f7"];

    return (
        <Card className="col-span-1 lg:col-span-3">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Voucher Activity</CardTitle>
                    <Badge variant="secondary">Total: {filteredVouchers.length} vouchers</Badge>
                </div>
            </CardHeader>
            <CardContent className="h-[36rem] min-h-[420px] flex flex-col p-4 pb-[4px]">
                 {loading ? <Skeleton className="h-full w-full flex-1 min-h-[340px]"/> : (
                 <div className="flex-1 min-h-[340px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap="10%">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" interval={0} height={1} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tick={(props: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
                          const { x = 0, y = 0, payload } = props;
                          const tx = Number(x) || 0;
                          const ty = (Number(y) || 0) - 88;
                          return payload?.value ? (
                            <text x={tx} y={ty} textAnchor="middle" fill="black" fontSize={24} fontWeight={500} transform={`rotate(-90, ${tx}, ${ty})`} style={{ overflow: 'visible' }}>{payload.value}</text>
                          ) : <text x={tx} y={ty} />;
                        }} />
                        <YAxis />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Count">
                            {chartData.map((_, index) => (
                                <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                 </div>
                 )}
            </CardContent>
        </Card>
    )
};

const DeletedCompaniesCard = ({ deletedCompanies, loading, dateRange, userMap }: { deletedCompanies: any[], loading: boolean, dateRange: DateRange | undefined, userMap: Map<string, any> }) => {
    
    const filteredCompanies = useMemo(() => {
        if (!dateRange?.from) return deletedCompanies.slice(0, 15);
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
        return deletedCompanies.filter(c => {
            const deletedAt = safeToDate(c.deletedAt);
            return deletedAt && deletedAt >= from && deletedAt <= to;
        });
    }, [deletedCompanies, dateRange]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Trash2 className="text-red-500"/> Deleted Companies</CardTitle>
                <CardDescription>Recently deleted companies in user recycle bins.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? <Skeleton className="h-24"/> : filteredCompanies.length > 0 ? (
                    <ul className="space-y-3 text-sm">
                        {filteredCompanies.map(c => {
                            const owner = userMap.get(c.ownerId);
                            return (
                                <li key={c.id} className="flex justify-between items-center p-2 border rounded-lg">
                                    <div className="flex items-center gap-3 flex-shrink min-w-0">
                                        <Avatar>
                                            <AvatarImage src={owner?.photoURL} />
                                            <AvatarFallback>{owner?.displayName?.[0] || 'U'}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="font-semibold truncate">{owner?.displayName || 'Unknown User'}</p>
                                            <p className="text-xs text-muted-foreground truncate">{owner?.email}</p>
                                        </div>
                                    </div>
                                    <p className="font-semibold text-sm px-4 truncate">{c.name}</p>
                                    <Badge variant="secondary" className="font-mono text-xs whitespace-nowrap">
                                        {safeToDate(c.deletedAt)?.toLocaleDateString()}
                                    </Badge>
                                </li>
                            )
                        })}
                    </ul>
                ) : <p className="text-sm text-center text-muted-foreground py-4">No companies deleted in this period.</p>}
            </CardContent>
        </Card>
    );
}

const RecentActivityCard = ({ activities, userMap, loading, dateRange }: { activities: any[], userMap: Map<string, any>, loading: boolean, dateRange: DateRange | undefined}) => {
    
    const filteredActivities = useMemo(() => {
        if (!dateRange?.from) return activities.slice(0, 15);
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(from);
        return activities.filter(a => {
            const activityAt = safeToDate(a.at);
            return activityAt && activityAt >= from && activityAt <= to;
        });
    }, [activities, dateRange]);
    
    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileClock/> Recent Admin Activity</CardTitle></CardHeader>
            <CardContent>
                {loading ? <Skeleton className="h-24"/> : filteredActivities.length > 0 ? (
                    <ul className="space-y-4">
                       {filteredActivities.map(a => {
                           const actor = userMap.get(a.byUserId);
                           const actorName = actor?.displayName || actor?.email || 'Unknown User';
                           const targetUser = a.meta?.targetUserId ? userMap.get(a.meta.targetUserId) : null;
                           const entitySubjectId = a.meta?.uid || a.meta?.targetUserId || a.companyId;
                           const entityUser = userMap.get(entitySubjectId);
                           const entityDisplay = entityUser?.email || entityUser?.displayName || entitySubjectId;

                           return (
                               <li key={a.id} className="text-sm">
                                   <div className="flex justify-between items-start">
                                       <p className="font-semibold">{a.action.replace(/_/g, ' ')}</p>
                                       <p className="text-xs text-muted-foreground whitespace-nowrap">{safeToDate(a.at)?.toLocaleTimeString()}</p>
                                   </div>
                                   <div className="text-xs text-muted-foreground mt-1 space-y-1">
                                       <p>By: {actorName} ({actor?.email || '...'})</p>
                                       {a.action === 'USER_ROLE_UPDATE' && targetUser ? (
                                           <div className="pl-2 border-l-2 ml-1 mt-1 pt-1 space-y-1">
                                               <p>Target User: {targetUser.displayName || 'Unknown'} ({targetUser.email || '...'})</p>
                                               <div className="mt-0.5">Role changed from <Badge variant="secondary">{a.meta.oldRole}</Badge> to <Badge>{a.meta.newRole}</Badge></div>
                                           </div>
                                       ) : (
                                            <p>On Entity: {entityDisplay}</p>
                                       )}
                                   </div>
                               </li>
                           )
                       })}
                    </ul>
                ) : <p className="text-sm text-center text-muted-foreground py-4">No recent activity in this period.</p>}
            </CardContent>
        </Card>
    )
}

const AlertsCard = () => {
    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="text-amber-500"/> System Alerts</CardTitle></CardHeader>
            <CardContent>
                 <p className="text-sm text-center text-muted-foreground py-4">No system alerts.</p>
            </CardContent>
        </Card>
    )
};


// --- MAIN DASHBOARD COMPONENT ---
export default function AdminDashboard() {
  const { user, customUser } = useAuth();
  useAdminAccess(['SuperAdmin', 'CompanyAdmin']);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const { dateSystem } = useDate();
                            selected={asCalendarRange(dateRange)}
                            onSelect={setDateRange}
                            numberOfMonths={calendarMonths}

                        />
                    </PopoverContent>
                </Popover>
            )}
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-[35fr_65fr]">
            <UserStatsCard users={allUsers} loading={loading} />
            <EntitySummaryCard companies={allCompanies} vouchers={allVouchers} dateRange={dateRange} loading={loading} vouchersError={vouchersError} currentUserEmail={user?.email ?? customUser?.email ?? null} />
        </div>
        <div className="grid gap-4">
            <VoucherChartCard vouchers={allVouchers} dateRange={dateRange} loading={loading}/>
        </div>
         <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
             <ActivityByCountryCard allUsers={allUsers} allCompanies={allCompanies} allVouchers={allVouchers} loading={loading} dateRange={dateRange} />
             <CompanyByCountryCard allUsers={allUsers} allCompanies={allCompanies} allVouchers={allVouchers} loading={loading} dateRange={dateRange} />
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <DeletedCompaniesCard deletedCompanies={deletedCompanies} loading={loading} dateRange={dateRange} userMap={userMap} />
            <RecentActivityCard activities={activities} userMap={userMap} loading={loading} dateRange={dateRange} />
        </div>
        <div className="grid gap-4">
            <AlertsCard />
        </div>
    </div>
  )
}
