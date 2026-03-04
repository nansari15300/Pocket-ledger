
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { collection, query, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Search, User, Filter, Calendar as CalendarIcon, Wallet, Edit } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { useCalendarMonths } from "@/hooks/use-mobile";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";

import { CommissionPayoutDialog } from "@/components/admin/CommissionPayoutDialog";
import { DistributorApplicationDialog } from "@/components/admin/DistributorApplicationDialog";
import { FilePreview } from "@/components/vouchers/FilePreview";


export type Application = {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    pan?: string;
    userId: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: any;
    profilePic?: string;
    commissionBalance?: number;
    documents?: string[];
};

// Placeholder data for commissions - replace with real data logic
const sampleCommissions = [
    { distributorName: 'Nabil Ansari', totalSales: 50000, commissionRate: '5%', totalEarnings: 2500 },
    { distributorName: 'Jane Doe', totalSales: 75000, commissionRate: '5%', totalEarnings: 3750 },
];

export default function AgentsPage() {
  useAdminAccess(['SuperAdmin']);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [activeTab, setActiveTab] = useState<'approved' | 'pending' | 'rejected'>('approved');
  const [searchTerm, setSearchTerm] = useState('');
  const { formatCurrency, dateSystem, formatDate, formatDateBS } = useDate();
                                                    selected={asCalendarRange(dateRange)}
                                                    onSelect={setDateRange}
                                                    numberOfMonths={calendarMonths}

                                                />
                                            </PopoverContent>
                                        </Popover>
                                    )}
                                </div>
                            </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {dateSystem === 'Both' ? (
                                                <>
                                                    <HeaderWithFilter label="Date (BS)" />
                                                    <HeaderWithFilter label="Date (AD)" />
                                                </>
                                            ) : (
                                                <HeaderWithFilter label="Date" />
                                            )}
                                            <HeaderWithFilter label="Type" />
                                            <HeaderWithFilter label="Voucher No." />
                                            <HeaderWithFilter label="User" />
                                            <HeaderWithFilter label="Taxable Amt" className="text-right" />
                                            <HeaderWithFilter label="Tax %" className="text-right" />
                                            <HeaderWithFilter label="Tax Amt" className="text-right" />
                                            <HeaderWithFilter label="Debit" className="text-right" />
                                            <HeaderWithFilter label="Credit" className="text-right" />
                                            <HeaderWithFilter label="Balance" className="text-right" />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {/* Placeholder for commission rows */}
                                        <TableRow>
                                            <TableCell colSpan={dateSystem === 'Both' ? 11 : 10} className="text-center py-8 text-muted-foreground">
                                                No commission data available for this period.
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                        </div>
                    )}
                </CardContent>
           </Card>
      )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-6 h-full">
        <div className="flex flex-col gap-4">
            <Card>
                  <CardHeader>
                      <CardTitle>Agents &amp; Distributor Management</CardTitle>
                      <CardDescription>Review and manage distributor applications and their commissions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
                          <TabsList className="w-full">
                          <TabsTrigger value="approved" className="flex-1">Approved</TabsTrigger>
                          <TabsTrigger value="pending" className="flex-1">Pending <Badge className="ml-2">{applications.filter(a => a.status === 'pending').length}</Badge></TabsTrigger>
                          <TabsTrigger value="rejected" className="flex-1">Rejected</TabsTrigger>
                          </TabsList>
                      </Tabs>
                      <div className="relative mt-4">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                              placeholder="Search by name or email..."
                              className="pl-9"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                          />
                      </div>
                  </CardContent>
              </Card>
            <ApplicantList data={filteredApplications} onSelect={setSelectedApplication} />
        </div>
        <div>
              <ApplicantDetails app={selectedApplication} />
        </div>
      </div>
      {selectedApplication && (
        <CommissionPayoutDialog
          agent={selectedApplication}
          isOpen={isPayoutOpen}
          onOpenChange={setIsPayoutOpen}
          onVoucherCreated={() => {}}
        />
      )}
      {selectedApplication && (
        <DistributorApplicationDialog
            application={selectedApplication}
            isOpen={isEditOpen}
            onOpenChange={setIsEditOpen}
            onApplicationUpdated={() => {
                const q = query(collection(firestore, "distributor_applications"));
                onSnapshot(q, (snapshot) => {
                    const apps = snapshot.docs.map(doc => ({ 
                        id: doc.id, 
                        ...doc.data(),
                        commissionBalance: (Math.random() * 5000) 
                    } as Application));
                    setApplications(apps);
                    const updatedSelected = apps.find(app => app.id === selectedApplication.id);
                    if (updatedSelected) {
                        setSelectedApplication(updatedSelected);
                    }
                });
            }}
        />
      )}
    </>
  );
}
