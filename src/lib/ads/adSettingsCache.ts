import { DEFAULT_AD_SETTINGS, normalizeAdSettings, type AdSettings } from "@/lib/adSettings";

export const AD_SETTINGS_CACHE_KEY = "app_settings:ad_settings";

export function readCachedAdSettings(): AdSettings {
  if (typeof window === "undefined") return DEFAULT_AD_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AD_SETTINGS_CACHE_KEY);
    if (!raw) return DEFAULT_AD_SETTINGS;
    return normalizeAdSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_AD_SETTINGS;
  }
}

export function writeCachedAdSettings(value: AdSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AD_SETTINGS_CACHE_KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}
