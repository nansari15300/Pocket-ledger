
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { collection, collectionGroup, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useDate } from '@/hooks/useDate';
import type { Company } from '@/app/(admin)/admin/types';
import type { AppUser } from '@/app/(admin)/admin/users/page';

type Payment = {
    id: string;
    companyId: string;
    userId: string;
    planId: string;
    amount: number;
    currency: string;
    gateway: 'stripe' | 'khalti' | 'esewa';
    status: string;
    createdAt: any;
    paymentId: string;
};

export default function PaymentsPage() {
    useAdminAccess(['SuperAdmin']);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { formatDate } = useDate();

    useEffect(() => {
        const paymentsQuery = query(collectionGroup(firestore, 'payments'), orderBy('createdAt', 'desc'));
        const companiesQuery = query(collection(firestore, 'companies'));
        const usersQuery = query(collection(firestore, 'users'));
        
        const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
            const paymentsData = snapshot.docs.map(doc => ({ id: doc.id, companyId: doc.ref.parent.parent?.id, ...doc.data() } as Payment));
            setPayments(paymentsData);
        }, (err) => console.error("Error fetching payments:", err));
        
        const unsubCompanies = onSnapshot(companiesQuery, (snapshot) => {
            setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
        }, (err) => console.error("Error fetching companies:", err));

        const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
        }, (err) => console.error("Error fetching users:", err));

        const initialFetches = Promise.all([
             new Promise(res => onSnapshot(paymentsQuery, () => res(true), () => res(true))),
             new Promise(res => onSnapshot(companiesQuery, () => res(true), () => res(true))),
             new Promise(res => onSnapshot(usersQuery, () => res(true), () => res(true))),
        ]);

        initialFetches.then(() => setLoading(false));

        return () => {
            unsubPayments();
            unsubCompanies();
            unsubUsers();
        };

    }, []);

    const companyMap = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u.displayName || u.email])), [users]);
    
    const filteredPayments = useMemo(() => {
        if (!searchTerm) return payments;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return payments.filter(p => 
            p.paymentId.toLowerCase().includes(lowerCaseSearch) ||
            p.planId.toLowerCase().includes(lowerCaseSearch) ||
            p.gateway.toLowerCase().includes(lowerCaseSearch) ||
            userMap.get(p.userId)?.toLowerCase().includes(lowerCaseSearch) ||
            companyMap.get(p.companyId)?.toLowerCase().includes(lowerCaseSearch)
        );
    }, [payments, searchTerm, companyMap, userMap]);

    const renderLoadingRows = () => (
        Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={`loading-${i}`}>
                <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
            </TableRow>
        ))
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Subscription Payments</CardTitle>
                    <CardDescription>A log of all successful subscription payments from users.</CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search payments..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <ScrollArea className="h-[70vh]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Plan ID</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Gateway</TableHead>
                                    <TableHead>Transaction ID</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? renderLoadingRows() : (
                                    filteredPayments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">No payments found.</TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredPayments.map(p => (
                                            <TableRow key={p.id}>
                                                <TableCell>{p.createdAt?.toDate ? formatDate(p.createdAt.toDate()) : 'N/A'}</TableCell>
                                                <TableCell>{companyMap.get(p.companyId) || p.companyId || 'N/A'}</TableCell>
                                                <TableCell>{userMap.get(p.userId) || p.userId}</TableCell>
                                                <TableCell><Badge variant="secondary">{p.planId}</Badge></TableCell>
                                                <TableCell>{p.amount.toFixed(2)} {p.currency}</TableCell>
                                                <TableCell><Badge>{p.gateway}</Badge></TableCell>
                                                <TableCell className="font-mono text-xs">{p.paymentId}</TableCell>
                                            </TableRow>
                                        ))
                                    )
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
