
"use client"

import * as React from "react"

// Check if device is actually a mobile device (phones + tablets)
export function isRealMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         ('ontouchstart' in window) ||
         (navigator.maxTouchPoints > 0);
}

// Check if device is a tablet (iPad, Android tablet). Tablets get PC mode in the header.
export function isTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPad: explicit iPad UA, or iPadOS 13+ reports as Mac with touch
  if (/iPad/.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  // Android tablet: often no "Mobile" in UA, or width suggests tablet
  if (/Android/i.test(ua) && !/Mobile/.test(ua)) return true;
  if (/Android/i.test(ua) && window.innerWidth >= 768) return true;
  return false;
}

// Real mobile phone only (excludes tablets). Used to hide PC icons in header.
export function isRealMobilePhone(): boolean {
  return isRealMobileDevice() && !isTabletDevice();
}

// Portrait = height >= width. Used to hide PC icon on mobile in portrait only.
function getIsPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight >= window.innerWidth;
}

// Context for mobile view state
const MobileViewContext = React.createContext<{
  isMobile: boolean;
  isRealMobile: boolean;
  isPortrait: boolean;
  /** Hide PC/Mobile toggle: true on real mobile (portrait + landscape). Show toggle only on PC. */
  hidePcIcon: boolean;
  forcedViewMode: 'mobile' | 'pc' | null;
  setForcedMode: (mode: 'mobile' | 'pc' | null) => void;
} | null>(null);

// Provider component
export function MobileViewProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(false)
  const [isPortrait, setIsPortrait] = React.useState(false)
  const [forcedViewMode, setForcedViewModeState] = React.useState<'mobile' | 'pc' | null>(null)
  const [isClient, setIsClient] = React.useState(false)

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // Debounce delay for resize/orientation to avoid "Page Unresponsive" when toggling mobile view on PC (e.g. items page)
  const RESIZE_DEBOUNCE_MS = 150;

  React.useEffect(() => {
    if (!isClient) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleCheck = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        setIsPortrait(getIsPortrait());
      }, RESIZE_DEBOUNCE_MS);
    };
    scheduleCheck(); // run once on mount
    window.addEventListener('resize', scheduleCheck);
    window.addEventListener('orientationchange', scheduleCheck);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', scheduleCheck);
      window.removeEventListener('orientationchange', scheduleCheck);
    };
  }, [isClient]);

  React.useEffect(() => {
    if (!isClient) return;
    // Only clear forced view when mobile in portrait; in landscape allow saved mode (full PC view)
    if (isRealMobileDevice() && getIsPortrait()) {
      if (isRealMobilePhone()) {
        localStorage.removeItem('forcedViewMode');
        setForcedViewModeState(null);
      }
      return;
    }
    // Mobile landscape + desktop: load forced view mode
    const savedMode = localStorage.getItem('forcedViewMode') as 'mobile' | 'pc' | null;
    if (savedMode) {
      setForcedViewModeState(savedMode);
    }
  }, [isClient])

  React.useEffect(() => {
    if (!isClient) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkIsMobile = () => {
      const portrait = getIsPortrait();
      const realMobile = isRealMobileDevice();

      // Real mobile in portrait: always mobile view (sidebar overlay, header simplified)
      if (realMobile && portrait) {
        setIsMobile(true);
        if (isRealMobilePhone() && forcedViewMode) {
          setForcedViewModeState(null);
          localStorage.removeItem('forcedViewMode');
        }
        return;
      }

      // Real mobile in landscape: full PC view (sidebar like PC, not overlay)
      if (realMobile && !portrait) {
        if (forcedViewMode === 'mobile') {
          setIsMobile(true);
        } else {
          setIsMobile(false);
        }
        return;
      }

      // Desktop (not real mobile): tablet/PC – use width and forced view mode
      const isTablet = isTabletDevice();
      if (isTablet) {
        if (forcedViewMode === 'mobile') {
          setIsMobile(true);
        } else if (forcedViewMode === 'pc') {
          setIsMobile(false);
        } else {
          setIsMobile(window.innerWidth < 768);
        }
        return;
      }

      if (forcedViewMode === 'mobile') {
        setIsMobile(true);
      } else if (forcedViewMode === 'pc') {
        setIsMobile(false);
      } else {
        setIsMobile(window.innerWidth < 768);
      }
    };

    const scheduleCheck = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        checkIsMobile();
      }, RESIZE_DEBOUNCE_MS);
    };

    checkIsMobile(); // run once on mount / when deps change
    window.addEventListener("resize", scheduleCheck);
    window.addEventListener("orientationchange", scheduleCheck);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("resize", scheduleCheck);
      window.removeEventListener("orientationchange", scheduleCheck);
    };
  }, [isClient, forcedViewMode, isPortrait])

  const setForcedMode = React.useCallback((mode: 'mobile' | 'pc' | null) => {
    setForcedViewModeState(mode);
    if (mode) {
      localStorage.setItem('forcedViewMode', mode);
    } else {
      localStorage.removeItem('forcedViewMode');
    }
    // Only block forced mode when mobile in portrait; allow on mobile landscape and desktop
    if (isRealMobileDevice() && getIsPortrait()) return;
    if (mode === 'mobile') {
      setIsMobile(true);
    } else if (mode === 'pc') {
      setIsMobile(false);
    } else {
      setIsMobile(window.innerWidth < 768);
    }
  }, []);

  const value = React.useMemo(() => ({
    isMobile,
    // Keep SSR and first client render consistent; compute UA-dependent flags only after mount.
    isRealMobile: isClient ? isRealMobilePhone() : false,
    isPortrait,
    hidePcIcon: isClient ? isRealMobileDevice() : false, // hide PC/Mobile toggle on real mobile (never show in portrait or landscape)
    forcedViewMode,
    setForcedMode
  }), [isMobile, isPortrait, forcedViewMode, setForcedMode, isClient]);

  return (
    <MobileViewContext.Provider value={value}>
      {children}
    </MobileViewContext.Provider>
  );
}

// Shared logic for mobile detection (uses context)
function useMobileDetection() {
  const context = React.useContext(MobileViewContext);
  if (!context) {
    // Fallback for components outside provider (shouldn't happen in normal use)
    const [isMobile, setIsMobile] = React.useState(false)
    const [isPortrait, setIsPortrait] = React.useState(false)
    const [forcedViewMode, setForcedViewMode] = React.useState<'mobile' | 'pc' | null>(null)

    React.useEffect(() => {
      const isTablet = isTabletDevice();
      const isPhone = isRealMobilePhone();
      if (isPhone) {
        setIsMobile(true);
        return;
      }
      if (isTablet) {
        const savedMode = localStorage.getItem('forcedViewMode') as 'mobile' | 'pc' | null;
        if (savedMode) {
          setForcedViewMode(savedMode);
          setIsMobile(savedMode === 'mobile');
        } else {
          setIsMobile(window.innerWidth < 768);
        }
        return;
      }
      const savedMode = localStorage.getItem('forcedViewMode') as 'mobile' | 'pc' | null;
      if (savedMode) {
        setForcedViewMode(savedMode);
        setIsMobile(savedMode === 'mobile');
      } else {
        setIsMobile(window.innerWidth < 768);
      }
    }, []);

    React.useEffect(() => {
      const check = () => setIsPortrait(getIsPortrait());
      check();
      window.addEventListener('resize', check);
      window.addEventListener('orientationchange', check);
      return () => {
        window.removeEventListener('resize', check);
        window.removeEventListener('orientationchange', check);
      };
    }, []);

    const setForcedMode = React.useCallback((mode: 'mobile' | 'pc' | null) => {
      setForcedViewMode(mode);
      if (mode) {
        localStorage.setItem('forcedViewMode', mode);
      } else {
        localStorage.removeItem('forcedViewMode');
      }
    }, []);

    return {
      isMobile,
      isRealMobile: isRealMobilePhone(),
      isPortrait,
      hidePcIcon: isRealMobileDevice(),
      forcedViewMode,
      setForcedMode
    };
  }
  return context;
}

/**
 * Mobile flag for layout / Radix branching. Until the client has mounted, always `false` so SSR and the
 * first client pass match — avoids hydration mismatches when `isMobile` swaps whole subtrees (e.g. Tabs vs
 * Select in AddVoucherDialog, Sheet vs aside in Sidebar). After mount, returns the real detection value.
 */
export function useIsMobile(): boolean {
  const { isMobile } = useMobileDetection();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return false;
  return isMobile;
}

// New hook - returns full object with view control
export function useMobileView() {
  return useMobileDetection();
}

/**
 * Date range calendar ke liye: mobile = 1 month, PC = 2 months.
 * Saari date range picker jaga par isko use karo taaki mobile/PC dono par consistent UX rahe.
 */
export function useCalendarMonths(): number {
  const { isMobile } = useMobileDetection();
  return isMobile ? 1 : 2;
}
