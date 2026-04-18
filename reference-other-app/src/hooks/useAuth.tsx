
"use client";

import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth, firestore } from "@/lib/firebase";
import { slugify } from "@/lib/slugify";
import { getCountryByIP } from "@/lib/getCountryByIP";
import { doc, onSnapshot, setDoc, serverTimestamp, updateDoc, collection, query, where, getDocs, writeBatch, getDoc } from "firebase/firestore";
import { logFirestorePermissionDenied } from "@/lib/firestoreRuleDebug";
import type { Role } from "@/utils/rbac";


export type AppUser = {
  id: string
  uid: string
  /** Firestore document id in users collection (may be slug_uid, not uid); use for presence/updates */
  userDocId?: string
  displayName: string
  email: string
  role: Role
  companyId: string | null
  isActive: boolean
  /** Set at signup/login from IP (for User by country in admin) */
  country?: string
  online?: boolean
  lastSeen?: any
}

type AuthContextType = {
  user: User | null;
  customUser: AppUser | null;
  loading: boolean;
};

type AuthProviderProps = {
    children: React.ReactNode;
    skipRedirects?: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  customUser: null,
  loading: true,
});

export const AuthProvider = ({ children, skipRedirects = false }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [customUser, setCustomUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const unsubUserDocRef = useRef<(() => void) | null>(null);
  const countryFetchedForRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        if (unsubUserDocRef.current) {
          unsubUserDocRef.current();
          unsubUserDocRef.current = null;
        }
        setCustomUser(null);
        setLoading(false);
        return;
      }
      const email = (firebaseUser.email || "").trim();
      (async () => {
        try {
          const displayName = firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "user";
          const userDocIdByName = `${slugify(displayName)}_${firebaseUser.uid}`;
          let userDocRef = doc(firestore, "users", userDocIdByName);
          if (email) {
            // Prefer direct doc reads first (more rules-friendly than list query).
            let existingByEmail: any = null;
            try {
              const uidSnap = await getDoc(doc(firestore, "users", firebaseUser.uid));
              if (uidSnap.exists()) {
                existingByEmail = uidSnap;
              } else {
                try {
                  const slugSnap = await getDoc(doc(firestore, "users", userDocIdByName));
                  if (slugSnap.exists()) existingByEmail = slugSnap;
                } catch (error) {
                  logFirestorePermissionDenied({
                    page: "auth_bootstrap",
                    operation: "get",
                    path: `users/${userDocIdByName}`,
                    error,
                  });
                }
              }
            } catch (error) {
              logFirestorePermissionDenied({
                page: "auth_bootstrap",
                operation: "get",
                path: `users/${firebaseUser.uid}`,
                error,
              });
            }

            // Fallback: email query for legacy docs with random IDs. If denied, continue without failing auth.
            if (!existingByEmail) {
              try {
                const q = query(collection(firestore, "users"), where("email", "==", firebaseUser.email));
                const snapshot = await getDocs(q);
                existingByEmail =
                  snapshot.docs.find((d) => d.id === firebaseUser.uid || d.id === userDocIdByName) ??
                  snapshot.docs[0] ??
                  null;
              } catch (error) {
                logFirestorePermissionDenied({
                  page: "auth_bootstrap",
                  operation: "list",
                  path: "users?where=email",
                  error,
                });
              }
            }

            if (existingByEmail) {
              userDocRef = doc(firestore, "users", existingByEmail.id);
              if (existingByEmail.id !== firebaseUser.uid && existingByEmail.id !== userDocIdByName) {
                await updateDoc(userDocRef, {
                  uid: firebaseUser.uid,
                  id: firebaseUser.uid,
                  lastLogin: serverTimestamp(),
                });
                try {
                  const companiesSnap = await getDocs(
                    query(collection(firestore, "companies"), where("ownerId", "==", existingByEmail.id))
                  );
                  if (!companiesSnap.empty) {
                    const batch = writeBatch(firestore);
                    companiesSnap.docs.forEach((d) => {
                      batch.update(doc(firestore, "companies", d.id), { ownerId: firebaseUser.uid });
                    });
                    await batch.commit();
                  }
                } catch (error) {
                  logFirestorePermissionDenied({
                    page: "auth_bootstrap",
                    operation: "list",
                    path: "companies?where=ownerId(legacy-migration)",
                    error,
                  });
                }
              }
            } else {
              await setDoc(userDocRef, {
                id: firebaseUser.uid,
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0],
                photoURL: firebaseUser.photoURL,
                role: firebaseUser.email === "nansari15300@gmail.com" ? "SuperAdmin" : "User",
                companyId: null,
                isActive: true,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
              }, { merge: true });
            }
          } else {
            userDocRef = doc(firestore, "users", userDocIdByName);
            await setDoc(userDocRef, {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: null,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              role: "User",
              companyId: null,
              isActive: true,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
            }, { merge: true });
          }
          if (unsubUserDocRef.current) unsubUserDocRef.current();
          unsubUserDocRef.current = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            let userData = docSnap.data();
            const userDocRefForUpdate = doc(firestore, "users", docSnap.id);
            if (userData.email === "nansari15300@gmail.com" && userData.role !== "SuperAdmin") {
              updateDoc(userDocRefForUpdate, { role: "SuperAdmin" }).catch((error) => {
                logFirestorePermissionDenied({
                  page: "auth_bootstrap",
                  operation: "update",
                  path: `users/${docSnap.id}`,
                  error,
                });
              });
              userData = { ...userData, role: "SuperAdmin" };
            }
            // Sync admin role so Firestore rules (isAdmin()) allow companies/vouchers for admin dashboard
            const role = userData.role || "User";
            if (role === "SuperAdmin" || role === "CompanyAdmin") {
              const uidDocRef = doc(firestore, "users", firebaseUser.uid);
              const email = (firebaseUser.email ?? userData.email ?? "").trim();
              (async () => {
                try {
                  await setDoc(uidDocRef, { id: firebaseUser.uid, uid: firebaseUser.uid, role }, { merge: true });
                  if (email) {
                    const adminConfigRef = doc(firestore, "app_settings", "admin_config");
                    const adminSnap = await getDoc(adminConfigRef);
                    const existing = (adminSnap.exists() ? adminSnap.data()?.superAdminEmails : null) ?? [];
                    const list = Array.isArray(existing) ? [...existing] : [];
                    if (!list.includes(email)) {
                      list.push(email);
                      await setDoc(adminConfigRef, { superAdminEmails: list }, { merge: true });
                    }
                  }
                } catch (_) { /* ignore */ }
              })();
            }
            // Set user country from IP once per doc (for Admin "User by country" categorization)
            if (!userData.country && !countryFetchedForRef.current.has(docSnap.id)) {
              countryFetchedForRef.current.add(docSnap.id);
              getCountryByIP()
                .then((country) => {
                  if (country) {
                    updateDoc(userDocRefForUpdate, { country }).catch(() => {});
                  }
                })
                .catch(() => {});
            }

            const newCustomUser: AppUser = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              userDocId: docSnap.id,
              displayName: userData.displayName ?? firebaseUser.displayName ?? '',
              email: userData.email ?? firebaseUser.email ?? '',
              role: userData.role || 'User',
              companyId: userData.companyId ?? null,
              isActive: userData.isActive !== false,
              country: userData.country,
              online: userData.online,
              lastSeen: userData.lastSeen,
            };

            setCustomUser((prevUser) => {
              if (prevUser &&
                  prevUser.id === newCustomUser.id &&
                  prevUser.displayName === newCustomUser.displayName &&
                  prevUser.email === newCustomUser.email &&
                  prevUser.role === newCustomUser.role &&
                  prevUser.companyId === newCustomUser.companyId &&
                  prevUser.isActive === newCustomUser.isActive
                 ) {
                // CRITICAL FIX: Ignore online/lastSeen changes from usePresence heartbeat
                // These updates happen every 30 seconds and should NOT trigger re-renders
                // Only update if online status actually changed (not just lastSeen timestamp)
                const onlineStatusChanged = prevUser.online !== newCustomUser.online;
                
                if (onlineStatusChanged) {
                    // Only update if online status actually changed (user went offline/online)
                    return {
                        ...prevUser,
                        online: newCustomUser.online,
                        lastSeen: newCustomUser.lastSeen,
                    };
                }
                // If only lastSeen changed (heartbeat), return same reference to prevent re-render
                return prevUser;
              }
              return newCustomUser;
            });
          }
          setLoading(false);
        }, (err: any) => {
          logFirestorePermissionDenied({
            page: "auth_bootstrap",
            operation: "get",
            path: `users/${userDocRef.id}`,
            error: err,
          });
          setLoading(false);
        });
        } catch (e) {
          console.error("useAuth: user doc setup failed", e);
          setLoading(false);
        }
      })();
    });

    return () => {
      unsubscribe();
      if (unsubUserDocRef.current) {
        unsubUserDocRef.current();
        unsubUserDocRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (skipRedirects || loading) return;

    const isAuthPage = pathname === "/";
    const isPublicPage = isAuthPage;
    
    if (!user && !isPublicPage) {
      router.push("/");
    }
  }, [user, loading, pathname, router, skipRedirects]);


  return (
    <AuthContext.Provider value={{ user, customUser, loading }}>
      {/* Keep tree mounted during auth hydration to avoid full-app remount flicker that looks like double refresh. */}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
  return context;
};
