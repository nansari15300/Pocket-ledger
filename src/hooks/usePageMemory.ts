"use client";

import { useEffect, useRef } from "react";
import { useIsMobileLayoutResolved } from "@/hooks/use-mobile";

export function usePageMemory<T extends { id: string }>(
  storageKey: string,
  activeView: string,
  setActiveView: (view: string) => void,
  selected: T | null,
  setSelected: (item: T | null) => void,
  currentItems: T[],
  isLoading: boolean,
  /** When true, skip auto-select (e.g. for mobile reports where list is shown full page first) */
  disableAutoSelect?: boolean,
  /** When provided, use this ID for restore instead of localStorage (URL takes precedence on refresh) */
  urlSelectedId?: string | null,
  /** Settings page: kabhi LS se `activeView` restore mat karo — `?view=` / pehla allowed tab hi; warna purana sharing/voucher dabaa deta hai */
  skipRestoreActiveViewFromStorage?: boolean,
  /** List ke pehle virtual row (e.g. Party Overdue) — memory khali ho to default select mat karo */
  excludeFromAutoSelectIds?: string[]
) {
  // null = SSR/first client frame — never run desktop auto-select until we know real viewport
  const mobileLayoutResolved = useIsMobileLayoutResolved();
  const selectionsHistory = useRef<Record<string, string>>({});
  const isInitialized = useRef(false);

  // 1. INITIAL RESTORE (App Load हुँदा एकपटक मात्र)
  // When urlSelectedId is set (e.g. ?view= from URL), do not overwrite activeView from localStorage
  useEffect(() => {
    if (!isLoading && !isInitialized.current && currentItems.length > 0) {
      const savedState = localStorage.getItem(storageKey);
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          
          if (parsed.selections) {
            selectionsHistory.current = parsed.selections;
          }

          // URL wins whenever a view id is in the URL (e.g. ?view=devices); don't require it in currentItems
          // so that permission-loaded list doesn't cause localStorage to overwrite the URL tab
          // Next.js `useSearchParams` kabhi pehle frame par khali — window.location se `view` check (refresh pe tab galat)
          const loc =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search)
              : null;
          const hasViewInLocation = loc?.has("view") ?? false;
          // `?selected=` without `view=` still encodes master-detail row — don't let localStorage flip the tab
          const hasSelectedInLocation = loc?.has("selected") ?? false;
          const urlWins =
            (urlSelectedId != null && urlSelectedId !== "") ||
            hasViewInLocation ||
            hasSelectedInLocation;
          // disableAutoSelect: mobile settings list-first — localStorage se purana tab mat lao
          if (!urlWins && !disableAutoSelect && !skipRestoreActiveViewFromStorage && parsed.activeView && parsed.activeView !== activeView) {
            setActiveView(parsed.activeView);
          }
        } catch (e) {
          console.error("Failed to restore state", e);
        }
      }
      isInitialized.current = true;
    }
  }, [isLoading, storageKey, activeView, setActiveView, urlSelectedId, currentItems, disableAutoSelect, skipRestoreActiveViewFromStorage]);

  // 2. VIEW CHANGE RESTORE & AUTO-SELECT
  // यो इफेक्ट तब मात्र चल्नुपर्छ जब activeView (ट्याब) परिवर्तन हुन्छ वा डाटा लोड हुन्छ।
  // user ले क्लिक गर्दा (selected चेन्ज हुँदा) यो चल्नु हुँदैन।
  const previousActiveView = useRef<string>(activeView);
  
  useEffect(() => {
    if (isLoading) return;
    if (disableAutoSelect) return;
    if (mobileLayoutResolved === null) return;
    if (mobileLayoutResolved) return;

    const viewChanged = previousActiveView.current !== activeView;
    previousActiveView.current = activeView;

    // यदि current list empty cha भने, selected item clear garne
    if (currentItems.length === 0) {
      if (selected) {
        setSelected(null);
      }
      return;
    }

    // URL has selected param: valid ho to usi ko restore karo.
    // Invalid/stale id (e.g. deleted row / different company) ho to fallback auto-select chalao.
    if (urlSelectedId) {
      const urlItem = currentItems.find((i) => i.id === urlSelectedId);
      if (urlItem) {
        if (urlItem.id !== selected?.id) {
          setSelected(urlItem);
        }
        return;
      }
    }

    const lastSelectedIdForThisView = selectionsHistory.current[activeView];
    let targetItem: T | undefined = undefined;

    // क) Tab change bhako cha वा return from details (selected invalid/empty)
    const isCurrentSelectionValid = selected && currentItems.some(i => i.id === selected.id);
    const needsRestore = viewChanged || !isCurrentSelectionValid;

    if (needsRestore && currentItems.length > 0) {
      // 1. First try last selected from memory (same account/party/staff/tax on return)
      if (lastSelectedIdForThisView) {
        targetItem = currentItems.find((i) => i.id === lastSelectedIdForThisView);
      }
      // 2. If no memory, open first real row — virtual top rows (Overdue) skip
      if (!targetItem) {
        const skip = new Set(excludeFromAutoSelectIds ?? []);
        targetItem =
          currentItems.find((i) => !skip.has(i.id)) ?? currentItems[0];
      }
    } else if (!isCurrentSelectionValid && currentItems.length === 0 && selected) {
      setSelected(null);
    }

    // यदि नयाँ targetItem भेटियो र त्यो अहिलेको भन्दा फरक छ भने मात्र अपडेट गर्ने
    if (targetItem && targetItem.id !== selected?.id) {
      setSelected(targetItem);
    }

    // ⚠️ CRITICAL: Dependency Array बाट 'selected' र 'setSelected' हटाइएको छ।
    // यसले गर्दा User ले क्लिक गरेर selected चेन्ज हुँदा यो इफेक्ट फेरि चल्दैन र लूप लाग्दैन।
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, isLoading, currentItems, disableAutoSelect, mobileLayoutResolved, urlSelectedId, excludeFromAutoSelectIds]); 

  // 3. SAVE STATE (जहिले पनि selection चेन्ज हुँदा मेमोरी अपडेट गर्ने)
  useEffect(() => {
    if (!isLoading && selected) {
      // अहिलेको ट्याबको लागि ID अपडेट गर्ने
      if (selectionsHistory.current[activeView] !== selected.id) {
          selectionsHistory.current[activeView] = selected.id;
          
          const stateToSave = {
            activeView: activeView,
            selections: selectionsHistory.current
          };
          localStorage.setItem(storageKey, JSON.stringify(stateToSave));
      }
    }
  }, [selected, activeView, isLoading, storageKey]);
}