"use client";

import { useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

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
  urlSelectedId?: string | null
) {
  const isMobile = useIsMobile();
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

          const urlWins = urlSelectedId != null && urlSelectedId !== "" && currentItems.some((i) => i.id === urlSelectedId);
          if (!urlWins && parsed.activeView && parsed.activeView !== activeView) {
            setActiveView(parsed.activeView);
          }
        } catch (e) {
          console.error("Failed to restore state", e);
        }
      }
      isInitialized.current = true;
    }
  }, [isLoading, storageKey, activeView, setActiveView, urlSelectedId, currentItems]);

  // 2. VIEW CHANGE RESTORE & AUTO-SELECT
  // यो इफेक्ट तब मात्र चल्नुपर्छ जब activeView (ट्याब) परिवर्तन हुन्छ वा डाटा लोड हुन्छ।
  // user ले क्लिक गर्दा (selected चेन्ज हुँदा) यो चल्नु हुँदैन।
  const previousActiveView = useRef<string>(activeView);
  
  useEffect(() => {
    if (isLoading) return;
    if (disableAutoSelect || isMobile) return;

    const viewChanged = previousActiveView.current !== activeView;
    previousActiveView.current = activeView;

    // यदि current list empty cha भने, selected item clear garne
    if (currentItems.length === 0) {
      if (selected) {
        setSelected(null);
      }
      return;
    }

    // URL has report param (e.g. on refresh) - use that instead of localStorage
    if (urlSelectedId) {
      const urlItem = currentItems.find((i) => i.id === urlSelectedId);
      if (urlItem && urlItem.id !== selected?.id) {
        setSelected(urlItem);
      }
      return;
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
      // 2. If no memory, open the item on top
      if (!targetItem) {
        targetItem = currentItems[0];
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
  }, [activeView, isLoading, currentItems, disableAutoSelect, isMobile, urlSelectedId]); 

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