
'use client'
import { useAdminAccess } from '@/hooks/useAdminAccess'
import { listUsers } from '@/hooks/useFirestore'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, Users, UserCheck, UserX } from 'lucide-react'
import { UserList } from '@/components/admin/UserList'
import { UserDetails } from '@/components/admin/UserDetails'
import { collection, getDocs, onSnapshot, query, doc, DocumentData } from 'firebase/firestore'
import { firestore as db } from '@/lib/firebase'
import type { Company } from '@/app/(admin)/admin/types';
import type { Role } from "@/utils/rbac";


export type AppUser = {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  role: Role;
  companyId: string | null;
  isActive: boolean;
  online?: boolean;
  lastSeen?: any;
  [key: string]: any;
};


export default function UsersPage() {
  const { user } = useAdminAccess(['SuperAdmin', 'CompanyAdmin'])
  const [rows, setRows] = useState<AppUser[]>([])
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]); // For live stats
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  
  useEffect(() => {
    if (!user?.uid) return;

    // One-time fetch for the initial, stable list
    const doInitialFetch = async () => {
      setLoading(true);
      const usersQuery = query(collection(db, 'users'));
      const companiesQuery = query(collection(db, 'companies'));

      try {
        const [usersSnapshot, companiesSnapshot] = await Promise.all([
            getDocs(usersQuery),
            getDocs(companiesQuery)
        ]);
        
        const validUsers = usersSnapshot.docs
          .map(u => ({ id: u.id, uid: u.id, ...u.data() } as AppUser))
          .filter(u => u.id === u.uid);

        const companiesList = companiesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Company));

        let usersToList: AppUser[] = [];
        if (user.role === 'SuperAdmin') {
            usersToList = validUsers;
        } else if (user.companyId) {
            const currentCompany = companiesList.find(c => c.id === user.companyId);
            if (currentCompany) {
                const memberEmails = new Set([currentCompany.ownerEmail, ...(currentCompany.sharedWithEmails || [])].filter(Boolean));
                usersToList = validUsers.filter(u => u.email && memberEmails.has(u.email));
            }
        }
        
        const uniqueUsers = Array.from(new Map(usersToList.map(u => [u.id, u])).values());
        setRows(uniqueUsers);

        if (uniqueUsers.length > 0 && !selectedUser) {
            const savedUserId = localStorage.getItem('selectedAdminUserId');
            const userToSelect = savedUserId ? uniqueUsers.find(u => u.id === savedUserId) : null;
            setSelectedUser(userToSelect || uniqueUsers[0]);
        }

      } catch (error) {
        console.error("Error fetching initial user/company data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    doInitialFetch();

    // Live listener for companies and all users (for stats and details)
    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snapshot) => {
        setAllCompanies(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Company)));
    });
    
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAllUsers(snapshot.docs.map(u => ({ id: u.id, uid: u.id, ...u.data() } as AppUser)));
    });


    return () => {
      unsubUsers();
      unsubCompanies();
    };
  }, [user?.uid]);

  
  const handleSelectUser = useCallback((userToSelect: AppUser) => {
    setSelectedUser(userToSelect);
    localStorage.setItem('selectedAdminUserId', userToSelect.id);
  }, []);

  const handleUpdateUser = (updatedUser: AppUser) => {
    const updateUserInList = (list: AppUser[]) => list.map(u => u.id === updatedUser.id ? updatedUser : u);
    setRows(prev => updateUserInList(prev));
    setAllUsers(prev => updateUserInList(prev));

    if (selectedUser?.id === updatedUser.id) {
        setSelectedUser(updatedUser);
    }
  }

  const filteredUsers = useMemo(() => {
    return rows.filter(u => 
      (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      u.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [rows, searchTerm]);

  const { ownedCompanies, sharedCompanies } = useMemo(() => {
    if (!selectedUser || !selectedUser.email) return { ownedCompanies: [], sharedCompanies: [] };
    const owned = allCompanies.filter(c => c.ownerId === selectedUser.id);
    const shared = allCompanies.filter(c => c.sharedWithEmails?.includes(selectedUser.email!) && c.ownerId !== selectedUser.id);
    return { ownedCompanies: owned, sharedCompanies: shared };
  }, [selectedUser, allCompanies]);

  const userStats = useMemo(() => {
    const userList = user?.role === 'SuperAdmin' ? allUsers.filter(u => u.id === u.uid) : rows;
    const total = userList.length;
    const active = userList.filter(u => u.isActive !== false).length;
    const inactive = total - active;
    const now = Date.now();
    const online = userList.filter(u => u.lastSeen?.toDate && (now - u.lastSeen.toDate().getTime() < 90 * 1000)).length;
    const offline = total - online;

    return { total, active, inactive, online, offline };
  }, [allUsers, rows, user]);


  if (loading) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-6 h-full">
            <div>
                <Skeleton className="h-12 w-full mb-4" />
                <Skeleton className="h-24 w-full mb-4" />
                <Skeleton className="h-20 w-full mb-2" />
                <Skeleton className="h-20 w-full mb-2" />
                <Skeleton className="h-20 w-full mb-2" />
            </div>
            <div>
                 <Skeleton className="h-full w-full" />
            </div>
        </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-6 h-full">
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader className="p-4">
                    <CardTitle className="text-base font-semibold">Users Status</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="p-2 border rounded-lg text-center">
                            <p className="text-xs font-medium text-muted-foreground">Total Users</p>
                            <p className="text-lg font-bold">{userStats.total}</p>
                        </div>
                        <div className="p-2 border rounded-lg text-center">
                            <p className="text-xs font-medium text-muted-foreground">Active Users</p>
                            <p className="text-lg font-bold text-green-600">{userStats.active}</p>
                        </div>
                        <div className="p-2 border rounded-lg text-center">
                            <p className="text-xs font-medium text-muted-foreground">Inactive Users</p>
                            <p className="text-lg font-bold text-red-600">{userStats.inactive}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 border rounded-lg text-center">
                            <p className="text-xs font-medium text-muted-foreground">Online Users</p>
                            <p className="text-lg font-bold text-blue-600">{userStats.online}</p>
                        </div>
                        <div className="p-2 border rounded-lg text-center">
                            <p className="text-xs font-medium text-muted-foreground">Offline Users</p>
                            <p className="text-lg font-bold text-gray-500">{userStats.offline}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="p-4 pt-0">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, email, or ID..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardFooter>
            </Card>
            <UserList 
                users={filteredUsers}
                selectedUser={selectedUser}
                onSelectUser={handleSelectUser}
            />
        </div>
        <div>
            {selectedUser ? (
                <UserDetails 
                    user={selectedUser} 
                    allUsers={allUsers}
                    onUpdate={handleUpdateUser} 
                    currentUser={user as AppUser}
                    ownedCompanies={ownedCompanies}
                    sharedCompanies={sharedCompanies}
                    isOnline={selectedUser.lastSeen?.toDate && (Date.now() - selectedUser.lastSeen.toDate().getTime()) < 90 * 1000}
                />
            ): (
                <Card className="h-full flex items-center justify-center">
                    <CardContent className="text-center">
                        <p className="text-muted-foreground">No user selected.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    </div>
  )
}
