"use client";

/**
 * Data layer: Firestore vs Local API.
 * useCollectionFromSource – same shape as useCollection, works for both modes.
 * When local: fetch from local API, optional refetch interval. When firebase: use Firestore.
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useDataSource } from "@/contexts/DataSourceContext";
import { createLocalApiClient } from "@/lib/localApiClient";

export type UseCollectionFromSourceResult<T> = {
  data: (T & { id: string })[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

const REFETCH_INTERVAL_MS = 30_000;

/**
 * Fetch a company subcollection. When local mode uses local API; when firebase uses Firestore onSnapshot.
 * For local mode: optional updatedAfter for incremental sync (only docs updated after this timestamp).
 */
export function useCollectionFromSource<T = Record<string, unknown>>(
  companyId: string | null,
  collectionName: string,
  options?: { orderByField?: string; refetchIntervalMs?: number; updatedAfter?: number }
): UseCollectionFromSourceResult<T> {
  const { isLocalMode, localApiBaseUrl } = useDataSource();
  const [data, setData] = useState<(T & { id: string })[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refetchRef = useRef<() => void>(() => {});

  const fetchLocal = useMemo(() => {
    if (!companyId || !isLocalMode) return null;
    const client = createLocalApiClient(localApiBaseUrl);
    const orderByField = options?.orderByField;
    const updatedAfter = options?.updatedAfter;
    return async () => {
      try {
        const params: Record<string, string> = {};
        if (updatedAfter != null) params.updatedAfter = String(updatedAfter);
        const list = await client.getCollection(companyId, collectionName, Object.keys(params).length ? params : undefined);
        let arr = (list || []).map((d) => ({ ...d, id: (d.id as string) || "" } as T & { id: string }));
        arr = arr.filter((item: any) => item.isDeleted !== true);
        if (orderByField) {
          arr.sort((a: any, b: any) => {
            const aVal = a[orderByField];
            const bVal = b[orderByField];
            const dateA = aVal?.toDate ? aVal.toDate() : new Date(aVal);
            const dateB = bVal?.toDate ? bVal.toDate() : new Date(bVal);
            return dateA.getTime() - dateB.getTime();
          });
        }
        setData(arr);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };
  }, [companyId, collectionName, isLocalMode, localApiBaseUrl, options?.orderByField, options?.updatedAfter]);

  // Local mode: fetch and optional refetch interval
  useEffect(() => {
    if (!companyId || !isLocalMode) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (!fetchLocal) return;
    let cancelled = false;
    const doFetch = () => { fetchLocal().then(() => {}); };
    refetchRef.current = doFetch;
    setIsLoading(true);
    doFetch();
    const intervalMs = options?.refetchIntervalMs ?? REFETCH_INTERVAL_MS;
    const tid = intervalMs > 0 ? setInterval(doFetch, intervalMs) : 0;
    return () => {
      cancelled = true;
      if (tid) clearInterval(tid);
      refetchRef.current = () => {};
    };
  }, [companyId, isLocalMode, fetchLocal, options?.refetchIntervalMs]);

  // Firebase mode: onSnapshot
  useEffect(() => {
    if (!companyId || isLocalMode) return;
    setIsLoading(true);
    setError(null);
    const q = query(collection(firestore, `companies/${companyId}/${collectionName}`));
    const unsub = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const list = snapshot.docs
          .map((d) => ({ ...d.data(), id: d.id } as T & { id: string }))
          .filter((item: any) => item.isDeleted !== true);
        let arr = list;
        if (options?.orderByField) {
          arr = [...list].sort((a: any, b: any) => {
            const aVal = a[options!.orderByField!];
            const bVal = b[options!.orderByField!];
            const dateA = aVal?.toDate ? aVal.toDate() : new Date(aVal);
            const dateB = bVal?.toDate ? bVal.toDate() : new Date(bVal);
            return dateA.getTime() - dateB.getTime();
          });
        }
        setData(arr);
        setError(null);
        setIsLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [companyId, collectionName, isLocalMode, options?.orderByField]);

  const refetch = () => {
    if (refetchRef.current) refetchRef.current();
  };

  return { data, isLoading, error, refetch };
}
