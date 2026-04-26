
"use client";

import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { auth, firestore } from "@/lib/firebase";
import { slugify } from "@/lib/slugify";
import { getCountryByIP } from "@/lib/getCountryByIP";
import { doc, onSnapshot, setDoc, serverTimestamp, updateDoc, collection, query, where, getDocs, writeBatch, getDoc } from "firebase/firestore";
import { logFirestorePermissionDenied } from "@/lib/firestoreRuleDebug";
import type { Role } from "@/utils/rbac";
import { isLocalOnlyMode } from "@/lib/localMode";
import { getLocalAuthUser } from "@/lib/localApiClient";
import { restoreRememberedLocalCompanyForFastBoot } from "@/lib/postAuthCompanyRoute";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";


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
  /** Capacitor/static WebView: kabhi pehle `null` aata hai jabki IndexedDB session abhi restore ho raha ho — turant sign-out mat mano. */
  const pendingNullAuthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** APK/EXE fast-start: local remembered unlock se temporary user banta hai; Firebase aaye to replace ho jayega. */
  const fastLocalAuthRef = useRef(false);

  useEffect(() => {
    // Auth flow is strictly login-based now; local guest bootstrap path intentionally removed.
    const clearPendingNullAuthTimer = () => {
      if (pendingNullAuthTimerRef.current) {
        clearTimeout(pendingNullAuthTimerRef.current);
        pendingNullAuthTimerRef.current = null;
      }
    };

    const finalizeSignedOut = () => {
      clearPendingNullAuthTimer();
      if (unsubUserDocRef.current) {
        unsubUserDocRef.current();
        unsubUserDocRef.current = null;
      }
      setUser(null);
      setCustomUser(null);
      setLoading(false);
    };

    const bootstrapFastLocalSession = () => {
      if (!isLocalOnlyMode() || typeof window === "undefined") return false;
      // Fast local auth must use this tab's company on browser refresh; localStorage is only new-tab fallback.
      const selectedCompanyId = readSelectedCompanyId();
      if (!selectedCompanyId || !restoreRememberedLocalCompanyForFastBoot()) return false;
      const localUser = getLocalAuthUser(selectedCompanyId);
      if (!localUser?.id) return false;
      fastLocalAuthRef.current = true;
      const displayName = localUser.displayName || localUser.username || "Local User";
      const localEmail = `${localUser.username || localUser.id}@local.pocket-ledger`;
      const syntheticUser = {
        uid: `local:${localUser.id}`,
        email: localEmail,
        displayName,
        isAnonymous: false,
        providerId: "local",
        // Company/plan sync may ask for a Firebase token; local fast-start has none, so fail softly in background.
        getIdToken: async () => {
          throw new Error("LOCAL_FAST_START_NO_FIREBASE_TOKEN");
        },
      } as unknown as User;
      // Local fast-start user unlocks SQLite data immediately; real Firebase auth can still hydrate later for cloud sync.
      setUser(syntheticUser);
      setCustomUser({
        id: syntheticUser.uid,
        uid: syntheticUser.uid,
        userDocId: syntheticUser.uid,
        displayName,
        email: localEmail,
        role: (localUser.role || "User") as Role,
        companyId: selectedCompanyId,
        isActive: true,
      });
      setLoading(false);
      return true;
    };

    // Do this before Firebase IndexedDB finishes hydrating so static APK opens last company without waiting on network/auth.
    bootstrapFastLocalSession();

    const bootstrapUserSession = (firebaseUser: User) => {
      fastLocalAuthRef.current = false;
      if (isLocalOnlyMode()) {
        // Local-first mode: avoid Firestore user-doc listeners to prevent permission-denied snapshot noise.
        const displayName = firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User";
        setCustomUser({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          userDocId: firebaseUser.uid,
          displayName,
          email: firebaseUser.email || "",
          role: (firebaseUser.email === "nansari15300@gmail.com" ? "SuperAdmin" : "User") as Role,
          companyId: null,
          isActive: true,
        });
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
    };

    const NULL_AUTH_DEBOUNCE_MS = 500;
    // Teesra arg: token refresh / identity toolkit par network fail → kabhi-kabhi observer ke bagair error;
    // `auth/network-request-failed` pe session IndexedDB me ho to currentUser zinda rehta hai — logout mat karo.
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        clearPendingNullAuthTimer();
        if (!firebaseUser) {
          pendingNullAuthTimerRef.current = setTimeout(() => {
            pendingNullAuthTimerRef.current = null;
            const cu = auth.currentUser;
            if (cu) {
              setUser(cu);
              bootstrapUserSession(cu);
              return;
            }
            if (fastLocalAuthRef.current && bootstrapFastLocalSession()) {
              return;
            }
            finalizeSignedOut();
          }, NULL_AUTH_DEBOUNCE_MS);
          return;
        }
        setUser(firebaseUser);
        bootstrapUserSession(firebaseUser);
      },
      (err) => {
        const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
        if (code === "auth/network-request-failed") {
          const cu = auth.currentUser;
          if (cu) {
            setUser(cu);
            bootstrapUserSession(cu);
            return;
          }
        }
        console.warn("useAuth: onAuthStateChanged error", err);
        setLoading(false);
      }
    );

    return () => {
      clearPendingNullAuthTimer();
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
